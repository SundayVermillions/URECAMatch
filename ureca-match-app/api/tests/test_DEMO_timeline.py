"""REQ-CYCLE-1, REQ-ROUND-1: the default mock demo opens Round 2 on 3 November."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.db import seed_data
from app.db import store as stores
from app.db.seed_data import build as build_default_seed
from app.demo import DEMO_NOW
from app.settings import Settings, get_settings


@pytest.fixture
def november_store(monkeypatch):
    """Opt out of the September scenario pinned by the existing requirement-test fixtures."""
    monkeypatch.setattr(seed_data, "build", build_default_seed)
    monkeypatch.setattr(get_settings(), "demo_now", DEMO_NOW)
    monkeypatch.setenv("DEMO_NOW", DEMO_NOW.isoformat())
    stores.reset_store()
    return stores.get_store()


def test_DEMO_round_two_opens_at_the_default_clock(november_store):
    second = november_store.cycle.rounds[1]
    assert DEMO_NOW == datetime(2026, 11, 3, 9, tzinfo=UTC)
    assert second.application_start == DEMO_NOW
    assert Settings.model_fields["demo_now"].default == DEMO_NOW
    assert second.application_end == DEMO_NOW + timedelta(days=5) - timedelta(seconds=1)


def test_DEMO_round_lengths_and_spacing_are_preserved(november_store):
    cycle = november_store.cycle
    assert cycle.opening_date == datetime(2026, 10, 16, 9, tzinfo=UTC)
    for index, round_ in enumerate(cycle.rounds):
        assert round_.review_start - round_.application_start == timedelta(days=5)
        assert round_.review_end - round_.review_start + timedelta(seconds=1) == timedelta(days=2)
        assert round_.approval_end - round_.review_end == timedelta(days=2)
        if index:
            assert round_.application_start - cycle.rounds[index - 1].approval_end == timedelta(days=2, seconds=1)
    assert cycle.closing_date == datetime(2026, 11, 30, 9, tzinfo=UTC)


def test_DEMO_historical_cycle_keeps_its_dates(november_store):
    past = november_store.cycle_by_id("cyc-2526s2")
    assert past.opening_date == datetime(2026, 1, 5, 9, tzinfo=UTC)
    assert past.closing_date == datetime(2026, 3, 20, 9, tzinfo=UTC)


def test_DEMO_activity_is_not_in_the_future_and_offer_deadlines_match(november_store):
    store = november_store
    rows = [*store.applications, *store.proposals, *store.notifications, *store.audit]
    for row in rows:
        for field in ["submitted_at", "decided_at", "created_at", "timestamp"]:
            value = getattr(row, field, None)
            if value is not None:
                assert value <= DEMO_NOW
    for match in store.matches:
        assert match.offer_expires_at == store.cycle.rounds[1].application_end
        assert match.student_responded_at <= DEMO_NOW
    text = " ".join(n.title + " " + n.message for n in store.notifications)
    assert "8 Nov" in text and "10 Nov" in text
    assert "Sep" not in text


def test_DEMO_api_reports_round_two_and_accepts_an_application(as_student, november_store):
    phase = as_student.get("/me").json()["phase"]
    assert phase["now"] == DEMO_NOW.isoformat().replace("+00:00", "Z")
    assert phase["round_number"] == 2 and phase["window"] == "application"
    response = as_student.post("/applications", json={"listing_id": "lst-8", "statement": "x" * 100})
    assert response.status_code == 201
    assert response.json()["round_id"] == "rnd-2"
    assert response.json()["preference_rank"] == 3


def test_DEMO_browser_seed_matches_the_api(november_store):
    root = Path(__file__).resolve().parents[2]
    seed = json.loads((root / "web/lib/mock/seed.json").read_text())
    second = seed["cycle"]["rounds"][1]
    assert datetime.fromisoformat(second["application_start"]) == DEMO_NOW
    assert seed["cycle"] == november_store.cycle.model_dump(mode="json")
    assert len(seed["applications"]) == len(november_store.applications)


def test_DEMO_admin_cycle_settings_use_the_november_schedule(as_admin, november_store):
    response = as_admin.get("/cycle")
    assert response.status_code == 200
    cycle = response.json()
    assert cycle == november_store.cycle.model_dump(mode="json")
    assert datetime.fromisoformat(cycle["opening_date"]) == datetime(2026, 10, 16, 9, tzinfo=UTC)
    assert datetime.fromisoformat(cycle["closing_date"]) == datetime(2026, 11, 30, 9, tzinfo=UTC)
    assert datetime.fromisoformat(cycle["rounds"][1]["application_start"]) == DEMO_NOW
    history = as_admin.get("/admin/cycles")
    assert history.status_code == 200
    assert next(item for item in history.json() if item["id"] == cycle["id"]) == cycle
