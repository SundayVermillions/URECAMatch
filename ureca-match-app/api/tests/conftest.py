"""Shared fixtures. Every test gets a fresh seeded in-memory store.

Use `as_student`, `as_supervisor`, `as_admin` (TestClient instances that already carry the
X-Demo-User header) or `client_for("stu-7")` for a specific seeded user.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.db import store as store_module
from app.main import app
from app.settings import get_settings


@pytest.fixture(autouse=True)
def fresh_store(monkeypatch):
    monkeypatch.setenv("API_MODE", "mock")
    monkeypatch.setattr(get_settings(), "email_mode", "off")  # tests never send e-mail, whatever .env says
    store_module.reset_store()
    yield store_module.get_store()
    store_module.reset_store()


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
