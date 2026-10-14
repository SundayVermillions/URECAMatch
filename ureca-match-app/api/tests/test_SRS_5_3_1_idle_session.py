from datetime import timedelta

from app.settings import get_settings, set_clock_override


def test_SRS_5_3_1_token_idle_session_expiry(anon, fresh_store, monkeypatch):
    """SRS 5.3.1: Session expires after 30 minutes of inactivity, refreshed on activity."""
    settings = get_settings()
    monkeypatch.setattr(settings, "debug_clock", True)
    start = settings.now()

    # 1. Sign in to obtain session token
    res = anon.post("/auth/sign-in", json={"email": "weiling001@e.ntu.edu.sg", "password": "password"})
    assert res.status_code == 200
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Activity within 25 minutes keeps session valid
    set_clock_override(start + timedelta(minutes=25))
    r_active = anon.get("/me", headers=headers)
    assert r_active.status_code == 200

    # 3. 20 minutes later (45 min total, but only 20 min idle): session remains active
    set_clock_override(start + timedelta(minutes=45))
    r_still_active = anon.get("/me", headers=headers)
    assert r_still_active.status_code == 200

    # 4. Inactivity exceeding 30 minutes expires session (SRS 5.3.1)
    set_clock_override(start + timedelta(minutes=76))
    r_expired = anon.get("/me", headers=headers)
    assert r_expired.status_code == 401
    assert r_expired.json()["code"] == "session_expired"
