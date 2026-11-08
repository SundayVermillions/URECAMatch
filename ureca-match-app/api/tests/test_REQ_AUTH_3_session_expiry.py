"""REQ-AUTH-3, SRS 5.3.1. The server checks a token's expiry and slides the session: every successful request
authenticated by a token gets a fresh one in X-Session-Token. The check is skipped while the debug clock is on."""

from __future__ import annotations

from datetime import datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth as auth_router
from app.settings import get_settings, set_clock_override

SECRET = "test-secret-that-is-at-least-32-bytes-long"


@pytest.fixture(autouse=True)
def _supabase_tokens(monkeypatch, fresh_store):
    """JWT sessions as in Supabase mode, over the seeded in-memory store. DEBUG_CLOCK is off unless a test turns it on."""
    s = get_settings()
    monkeypatch.setattr(s, "api_mode", "supabase")
    monkeypatch.setattr(s, "supabase_jwt_secret", SECRET)
    monkeypatch.setattr(s, "debug_clock", False)


def _token(exp: datetime | None, sub: str = "stu-1") -> str:
    now = get_settings().now()
    claims = {"sub": sub, "aud": "authenticated", "iat": int((now - timedelta(minutes=10)).timestamp())}
    if exp is not None:
        claims["exp"] = int(exp.timestamp())
    return jwt.encode(claims, SECRET, algorithm="HS256")


def _me(token: str, **headers):
    return TestClient(app).get("/me", headers={"Authorization": f"Bearer {token}", **headers})


def test_REQ_AUTH_3_expired_token_is_rejected():
    r = _me(_token(get_settings().now() - timedelta(minutes=1)))
    assert r.status_code == 401 and r.json()["code"] == "session_expired"
    assert "X-Session-Token" not in r.headers


def test_REQ_AUTH_3_token_without_exp_is_rejected():
    r = _me(_token(None))
    assert r.status_code == 401 and r.json()["code"] == "session_expired"


def test_REQ_AUTH_3_valid_token_gets_a_fresh_token_with_a_later_expiry():
    old_exp = get_settings().now() + timedelta(minutes=5)
    r = _me(_token(old_exp))
    assert r.status_code == 200
    fresh = jwt.decode(r.headers["X-Session-Token"], SECRET, algorithms=["HS256"], audience="authenticated")
    assert fresh["sub"] == "stu-1" and fresh["exp"] > int(old_exp.timestamp())
    assert int(datetime.fromisoformat(r.headers["X-Session-Expires"]).timestamp()) == fresh["exp"]
    assert _me(r.headers["X-Session-Token"]).status_code == 200  # the fresh token works on the next request


def test_REQ_AUTH_3_sign_in_token_lasts_session_minutes(monkeypatch):
    monkeypatch.setattr(auth_router, "_check_supabase_password", lambda *a: None)  # no Supabase Auth in tests
    r = TestClient(app).post("/auth/sign-in", json={"email": "weiling001@e.ntu.edu.sg", "password": "password"})
    claims = jwt.decode(r.json()["access_token"], SECRET, algorithms=["HS256"], audience="authenticated")
    assert claims["exp"] - claims["iat"] == get_settings().session_minutes * 60


def test_REQ_AUTH_3_debug_clock_past_exp_is_still_accepted(monkeypatch):
    monkeypatch.setattr(get_settings(), "debug_clock", True)
    token = _token(get_settings().now() + timedelta(minutes=5))
    set_clock_override(get_settings().now() + timedelta(days=3))  # the fake clock jumps days ahead
    assert _me(token).status_code == 200


def test_REQ_AUTH_3_mock_demo_user_gets_no_session_token(monkeypatch):
    monkeypatch.setattr(get_settings(), "api_mode", "mock")
    r = TestClient(app).get("/me", headers={"X-Demo-User": "stu-1"})
    assert r.status_code == 200 and "X-Session-Token" not in r.headers


def test_REQ_AUTH_3_browser_can_read_the_session_headers():
    r = _me(_token(get_settings().now() + timedelta(minutes=5)), Origin="http://localhost:3000")
    exposed = r.headers["access-control-expose-headers"].lower()
    assert "x-session-token" in exposed and "x-session-expires" in exposed
