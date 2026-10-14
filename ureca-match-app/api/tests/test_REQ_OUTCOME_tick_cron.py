"""Slice E. /internal/tick in live mode (REQ-OUTCOME-3, 4): Vercel Cron calls it with GET and the
cron secret; the admin Matching Rounds page calls it with POST and the admin's session token."""

import jwt
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.settings import get_settings

CRON = "cron-test-secret"
JWT_SECRET = "jwt-test-secret-at-least-32-bytes-long"


@pytest.fixture
def live(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "api_mode", "supabase")  # the store stays the seeded MockStore from conftest
    monkeypatch.setattr(s, "cron_secret", CRON)
    monkeypatch.setattr(s, "supabase_jwt_secret", JWT_SECRET)
    return TestClient(app)


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def session(user_id: str) -> dict:
    claims = {"sub": user_id, "aud": "authenticated", "exp": 4_102_444_800}
    return bearer(jwt.encode(claims, JWT_SECRET, algorithm="HS256"))


@pytest.mark.parametrize("method", ["GET", "POST"])
def test_REQ_OUTCOME_tick_accepts_cron_secret(live, method):
    assert live.request(method, "/internal/tick", headers=bearer(CRON)).status_code == 200


@pytest.mark.parametrize("method", ["GET", "POST"])
def test_REQ_OUTCOME_tick_refuses_no_or_wrong_secret(live, method):
    assert live.request(method, "/internal/tick").status_code == 401
    assert live.request(method, "/internal/tick", headers=bearer("wrong")).status_code == 401


def test_REQ_OUTCOME_tick_admin_session_allowed(live):
    # The admin Matching Rounds page calls tick on load; a 401 here would sign the admin out.
    assert live.post("/internal/tick", headers=session("adm-1")).status_code == 200


@pytest.mark.parametrize("user_id", ["stu-1", "sup-1"])
def test_REQ_OUTCOME_tick_other_roles_forbidden(live, user_id):
    assert live.post("/internal/tick", headers=session(user_id)).status_code == 403
