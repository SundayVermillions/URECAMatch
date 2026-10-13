"""Debug clock: a developer tool, off by default, that replaces the API's notion of "now"."""

from __future__ import annotations

import pytest

from app.settings import get_settings


@pytest.fixture
def clock_on(monkeypatch):
    monkeypatch.setenv("DEBUG_CLOCK", "true")
    get_settings.cache_clear()
    yield
    monkeypatch.delenv("DEBUG_CLOCK")
    get_settings.cache_clear()


def test_DEBUG_CLOCK_1_off_by_default_and_refuses_changes(as_admin):
    assert as_admin.get("/debug/clock").json()["enabled"] is False
    r = as_admin.put("/debug/clock", json={"now": "2026-10-01T00:00:00Z"})
    assert r.status_code == 404


def test_DEBUG_CLOCK_2_moves_the_phase_for_everyone(clock_on, as_admin, as_student):
    before = as_student.get("/me").json()["phase"]["window"]
    r = as_admin.put("/debug/clock", json={"now": "2027-06-01T00:00:00Z"})
    assert r.status_code == 200 and r.json()["overridden"] is True
    after = as_student.get("/me").json()["phase"]["window"]
    assert before != after  # the seeded cycle is long over by mid-2027


def test_DEBUG_CLOCK_3_reset_returns_to_the_normal_clock(clock_on, as_admin, as_student):
    before = as_student.get("/me").json()["phase"]
    as_admin.put("/debug/clock", json={"now": "2027-06-01T00:00:00Z"})
    r = as_admin.delete("/debug/clock")
    assert r.json()["overridden"] is False
    assert as_student.get("/me").json()["phase"] == before


def test_DEBUG_CLOCK_4_changing_it_needs_a_signed_in_user(clock_on, anon):
    assert anon.put("/debug/clock", json={"now": "2026-10-01T00:00:00Z"}).status_code == 401
