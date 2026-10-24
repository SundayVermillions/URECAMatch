"""Shared fixtures. Every test gets a fresh seeded in-memory store.

Use `as_student`, `as_supervisor`, `as_admin` (TestClient instances that already carry the
X-Demo-User header) or `client_for("stu-7")` for a specific seeded user.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.db import store as store_module
from app.main import app
from app.settings import get_settings, set_clock_override

# Seeded Round 2 (all at 5:00 pm SGT): review closes 12 Sep, the approval window 14 Sep, Round 3 applications 21 Sep.
REVIEW_CLOSED = datetime(2026, 9, 12, 9, tzinfo=UTC)  # matching has run; Round 2's approval window is open
APPROVAL_CLOSED = datetime(2026, 9, 14, 9, tzinfo=UTC)  # Round 2's results are published


@pytest.fixture(autouse=True)
def fresh_store(monkeypatch):
    monkeypatch.setenv("API_MODE", "mock")
    monkeypatch.setattr(get_settings(), "email_mode", "off")  # tests never send e-mail, whatever .env says
    monkeypatch.setattr(get_settings(), "gemini_api_key", "")  # nor call Gemini with a real key from .env
    store_module.reset_store()
    yield store_module.get_store()
    store_module.reset_store()
    set_clock_override(None)  # a test that moved the debug clock must not leak into the next one


@pytest.fixture
def client_for():
    def _make(user_id: str) -> TestClient:
        c = TestClient(app)
        c.headers.update({"X-Demo-User": user_id})
        return c

    return _make


@pytest.fixture
def as_student(client_for):
    return client_for("stu-1")


@pytest.fixture
def as_supervisor(client_for):
    return client_for("sup-1")


@pytest.fixture
def as_admin(client_for):
    return client_for("adm-1")


@pytest.fixture
def anon():
    return TestClient(app)


@pytest.fixture
def at(monkeypatch):
    """Move the demo clock and call the daily tick, so the scheduler does whatever is now due (REQ-EXEC-4, REQ-PUB-3).
    The tick, unlike other requests, lets a failing step raise, so a scheduler bug fails the test where it happens."""

    def _move(when: datetime) -> None:
        monkeypatch.setattr(get_settings(), "demo_now", when)
        assert TestClient(app).post("/internal/tick").status_code == 200

    return _move
