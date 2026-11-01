"""The schedule must not run again for a cycle that has closed, and must not run on every request in production.
REQ-EXEC-6, REQ-PUB-4, REQ-OUTCOME-3.

The bug: a new server loaded a cycle whose closing date had passed (the seeded one closed on 2 Oct) but whose status
was still in progress. The first request after start looked "due", so it ran matching, published, decided
applications and wrote notifications, and every further new server did it again."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.db import store as store_module
from app.main import app
from app.models import Match, MatchStatus
from app.routers.matching import _publish
from app.services import windows
from app.settings import Settings, get_settings, set_clock_override
from tests.conftest import REVIEW_CLOSED
from tests.test_PERSISTENCE_supabase import make_store

CLOSED_AFTER = datetime(2026, 10, 23, 9, tzinfo=UTC)  # three weeks after the seeded cycle closed on 2 Oct


def snapshot(s) -> dict:
    return {
        "notifications": len(s.notifications),
        "audit": len(s.audit),
        "matches": sorted((m.id, m.status.value) for m in s.matches),
        "applications": sorted((a.id, a.status.value) for a in s.applications),
        "rounds": sorted((r.id, r.status.value, r.executed_at, r.published_at) for c in s.cycles for r in c.rounds),
    }


def new_server(monkeypatch, now):
    monkeypatch.setattr(get_settings(), "debug_clock", True)
    set_clock_override(now)
    store_module.reset_store()  # a fresh process: the store is built again
    return store_module.get_store()


def test_REQ_PUB_4_first_request_on_a_new_server_does_nothing_once_the_cycle_has_closed(monkeypatch, anon):
    s = new_server(monkeypatch, CLOSED_AFTER)
    assert s.cycle is not None and s.cycle.status.value != "closed"  # closed by date only, as the seed is
    before = snapshot(s)
    assert anon.get("/health").status_code == 200
    assert snapshot(s) == before  # no matching, no publishing, no application decided, no notification


def test_REQ_PUB_4_the_daily_tick_does_nothing_either_once_the_cycle_has_closed(monkeypatch, as_admin):
    s = new_server(monkeypatch, CLOSED_AFTER)
    before = snapshot(s)
    assert as_admin.post("/internal/tick").status_code == 200
    assert snapshot(s) == before


def test_REQ_PUB_4_a_second_new_server_does_not_write_the_admin_notifications_again(monkeypatch, anon, db):
    """Two servers in turn over one shared database. Neither may add a row."""
    monkeypatch.setattr(get_settings(), "debug_clock", True)
    set_clock_override(CLOSED_AFTER)
    first = make_store(db)
    before = {t: len(rows) for t, rows in db.tables.items()}
    for server in (first, make_store(db)):
        store_module._store = server
        assert anon.get("/health").status_code == 200
    assert {t: len(rows) for t, rows in db.tables.items()} == before
    assert not [n for n in db.rows("notifications") if n["created_at"].startswith("2026-10-23")]


def test_REQ_OUTCOME_3_an_offer_is_never_created_already_expired(fresh_store):
    cycle = fresh_store.cycle
    last = max(cycle.rounds, key=lambda r: r.number)
    last.executed_at = last.review_end + timedelta(minutes=1)  # matching has run
    template = next(m for m in fresh_store.matches if m.status != MatchStatus.rejected)
    pending = Match.model_validate(
        {**template.model_dump(), "id": "mt-late", "round_id": last.id, "status": MatchStatus.proposed, "offer_expires_at": None}
    )
    fresh_store.matches.append(pending)
    _publish(fresh_store, cycle, last, cycle.closing_date + timedelta(hours=1), [])  # the cycle has closed: no offer can be made
    assert pending.status == MatchStatus.proposed and pending.offer_expires_at is None
    assert last.published_at is None


# ------------------------------------------------------------------ SCHEDULER_ON_REQUEST


def test_scheduler_on_request_is_on_in_mock_mode_and_off_in_supabase_mode():
    assert Settings(api_mode="mock", _env_file=None).runs_scheduler_on_request() is True
    assert Settings(api_mode="supabase", _env_file=None).runs_scheduler_on_request() is False
    assert Settings(api_mode="supabase", scheduler_on_request=True, _env_file=None).runs_scheduler_on_request() is True
    assert Settings(api_mode="mock", scheduler_on_request=False, _env_file=None).runs_scheduler_on_request() is False


def test_in_supabase_mode_only_the_tick_runs_the_schedule(monkeypatch, fresh_store):
    monkeypatch.setattr(get_settings(), "api_mode", "supabase")  # the store stays in memory; only the settings change
    monkeypatch.setattr(get_settings(), "debug_clock", True)
    set_clock_override(REVIEW_CLOSED)  # Round 2's matching is due
    r = next(x for x in fresh_store.cycle.rounds if x.id == "rnd-2")
    anon = TestClient(app)
    assert anon.get("/health").status_code == 200
    assert r.executed_at is None  # an ordinary request does not run it
    tick = anon.post("/internal/tick", headers={"Authorization": f"Bearer {get_settings().cron_secret}"})
    assert tick.status_code == 200
    assert r.executed_at is not None  # the tick does


@pytest.fixture(autouse=True)
def _reset_clock():
    yield
    set_clock_override(None)


@pytest.fixture
def db():
    from app.db.seed_db import seed_database
    from tests.fake_supabase import FakeDB

    d = FakeDB()
    seed_database(d.client())
    return d


# ------------------------------------------------------------------ from main's version (#55), still true here


def test_REQ_OUTCOME_3_cycle_closed_by_date_or_status_or_missing(fresh_store):
    c = fresh_store.cycle
    assert not windows.cycle_closed(c, c.closing_date)
    assert windows.cycle_closed(c, c.closing_date + timedelta(seconds=1))
    assert windows.cycle_closed(None, c.opening_date)
    c.status = type(c.status)("closed")
    assert windows.cycle_closed(c, c.opening_date)


def _tick(monkeypatch, when: datetime) -> None:
    monkeypatch.setattr(get_settings(), "demo_now", when)
    assert TestClient(app).post("/internal/tick").status_code == 200


def _an_offer(store):
    """Turn a seeded match into an open offer."""
    offer = store.matches[0]
    offer.status = MatchStatus.published
    return offer


def test_REQ_EXEC_6_tick_changes_nothing_once_the_cycle_has_closed(fresh_store, monkeypatch):
    c = fresh_store.cycle
    offer = _an_offer(fresh_store)
    offer.offer_expires_at = c.closing_date - timedelta(days=1)  # lapsed, but the cycle it belongs to is over
    notes = len(fresh_store.notifications)
    statuses = [r.status for r in c.rounds]
    _tick(monkeypatch, c.closing_date + timedelta(days=1))
    assert offer.status == MatchStatus.published  # not timed out by a tick on a closed cycle
    assert len(fresh_store.notifications) == notes
    assert [r.status for r in fresh_store.cycle.rounds] == statuses


def test_REQ_EXEC_6_tick_still_times_out_lapsed_offers_while_the_cycle_is_open(fresh_store, monkeypatch):
    c = fresh_store.cycle
    offer = _an_offer(fresh_store)
    offer.offer_expires_at = c.opening_date + timedelta(days=1)
    _tick(monkeypatch, c.opening_date + timedelta(days=2))
    assert offer.status == MatchStatus.timed_out
