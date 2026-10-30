"""Debug clock shared through the database: two API processes follow one fake "now", and either can go back to real time."""

from datetime import UTC, datetime

import pytest

from app.routers import debug
from app.settings import get_settings, set_clock_override
from tests.fake_supabase import FakeDB
from tests.test_PERSISTENCE_supabase import make_store

MOVED = datetime(2026, 9, 12, 10, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _on(monkeypatch):
    monkeypatch.setattr(get_settings(), "debug_clock", True)
    monkeypatch.setattr(get_settings(), "api_mode", "supabase")
    monkeypatch.setattr(debug, "SYNC_SECONDS", 0.0)  # read on every request, so the test needs no waiting
    monkeypatch.setattr(debug, "_seen", "unset")
    yield
    set_clock_override(None)


def test_REQ_DEBUGCLOCK_the_store_keeps_one_shared_value():
    db = FakeDB()
    a, b = make_store(db), make_store(db)
    assert b.get_clock() is None
    a.set_clock(MOVED)
    assert b.get_clock() == MOVED  # another process reads what the first one saved
    a.set_clock(None)
    assert b.get_clock() is None


def test_REQ_DEBUGCLOCK_another_process_follows_the_moved_clock():
    db = FakeDB()
    a, b = make_store(db), make_store(db)
    a.set_clock(MOVED)
    debug.sync_clock(b, get_settings())
    assert get_settings().now() == MOVED


def test_REQ_DEBUGCLOCK_going_back_to_real_time_applies_to_everyone():
    db = FakeDB()
    a, b = make_store(db), make_store(db)
    a.set_clock(MOVED)
    debug.sync_clock(b, get_settings())
    a.set_clock(None)
    debug.sync_clock(b, get_settings())
    assert get_settings().now() != MOVED and abs((get_settings().now() - datetime.now(UTC)).total_seconds()) < 5


def test_REQ_DEBUGCLOCK_moving_the_clock_does_not_sign_anyone_out():
    db = FakeDB()
    a, b = make_store(db), make_store(db)
    b.last_activity["stu-1"] = datetime(2026, 9, 12, 8, tzinfo=UTC)
    debug.sync_clock(b, get_settings())  # first look at the clock
    a.set_clock(MOVED)
    debug.sync_clock(b, get_settings())  # it moved: idle timers restart
    assert b.last_activity == {}


def test_REQ_DEBUGCLOCK_a_token_issued_by_a_clock_ahead_of_real_time_still_works(monkeypatch, fresh_store):
    """The debug clock set to a future date signed everyone out: the token's "issued at" was ahead of real time."""
    import jwt
    from fastapi.testclient import TestClient

    from app.main import app

    monkeypatch.setattr(get_settings(), "supabase_jwt_secret", "test-secret")
    monkeypatch.setattr(get_settings(), "api_mode", "mock")  # the in-memory store; only the token path is under test
    token = jwt.encode({"sub": "stu-1", "aud": "authenticated", "iat": 4102444800}, "test-secret", algorithm="HS256")  # year 2100
    monkeypatch.setattr(get_settings(), "api_mode", "supabase")
    monkeypatch.setattr(debug, "SYNC_SECONDS", 10_000.0)
    r = TestClient(app).get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
