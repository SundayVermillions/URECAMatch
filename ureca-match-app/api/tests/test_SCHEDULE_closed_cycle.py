"""A cycle that has closed is left alone, and no offer is made that has already lapsed. REQ-EXEC-4, REQ-PUB-1,
REQ-OUTCOME-3. A new server must not repeat old work on a cycle whose closing date has passed."""

from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.errors import ApiError
from app.main import app
from app.models import MatchStatus
from app.routers.matching import execute, publish
from app.services import windows
from app.settings import get_settings

DAY = timedelta(days=1)


def _tick(monkeypatch, when: datetime) -> None:
    monkeypatch.setattr(get_settings(), "demo_now", when)
    assert TestClient(app).post("/internal/tick").status_code == 200


def test_REQ_OUTCOME_3_cycle_closed_by_date_or_status_or_missing(fresh_store):
    c = fresh_store.cycle
    assert not windows.cycle_closed(c, c.closing_date)
    assert windows.cycle_closed(c, c.closing_date + timedelta(seconds=1))
    assert windows.cycle_closed(None, c.opening_date)
    c.status = type(c.status)("closed")
    assert windows.cycle_closed(c, c.opening_date)


def _an_offer(store):
    """Turn a seeded match into an open offer."""
    offer = store.matches[0]
    offer.status = MatchStatus.published
    return offer


def test_REQ_EXEC_4_tick_changes_nothing_once_the_cycle_has_closed(fresh_store, monkeypatch):
    c = fresh_store.cycle
    offer = _an_offer(fresh_store)
    offer.offer_expires_at = c.closing_date - DAY  # lapsed, but the cycle it belongs to is over
    notes = len(fresh_store.notifications)
    statuses = [r.status for r in c.rounds]
    _tick(monkeypatch, c.closing_date + DAY)
    assert offer.status == MatchStatus.published  # not timed out by a tick on a closed cycle
    assert len(fresh_store.notifications) == notes
    assert [r.status for r in fresh_store.cycle.rounds] == statuses


def test_REQ_EXEC_4_tick_still_times_out_lapsed_offers_while_the_cycle_is_open(fresh_store, monkeypatch):
    c = fresh_store.cycle
    offer = _an_offer(fresh_store)
    offer.offer_expires_at = c.opening_date + DAY
    _tick(monkeypatch, c.opening_date + 2 * DAY)
    assert offer.status == MatchStatus.timed_out


def _admin_call(fn, store, when):
    return fn("rnd-2", store.user("adm-1"), store, SimpleNamespace(now=lambda: when))


def test_REQ_PUB_1_no_offer_is_made_once_its_deadline_has_passed(fresh_store):
    r2 = next(r for r in fresh_store.cycle.rounds if r.number == 2)
    r3 = next(r for r in fresh_store.cycle.rounds if r.number == 3)
    _admin_call(execute, fresh_store, r2.review_end + timedelta(hours=1))
    for m in fresh_store.matches:
        if m.round_id == "rnd-2" and m.status == MatchStatus.proposed:
            m.status = MatchStatus.approved
    late = r3.review_start + timedelta(seconds=1)  # the offers would lapse the moment they were made
    with pytest.raises(ApiError) as err:
        _admin_call(publish, fresh_store, late)
    assert err.value.detail["code"] == "cycle_closed"
    assert r2.published_at is None  # nothing was claimed or published
    assert not [m for m in fresh_store.matches if m.status == MatchStatus.published and m.round_id == "rnd-2"]
