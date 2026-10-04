"""Tests for REQ-REG-2: 6-digit verification code with 10-minute expiry and resend."""

from datetime import timedelta

from app.models import AccountStatus


def _error_code(res) -> str:
    body = res.json()
    if isinstance(body.get("detail"), dict):
        return body["detail"].get("code") or body["detail"].get("error")
    return body.get("code") or body.get("error") or str(body.get("detail"))


def test_REQ_REG_2_wrong_code_rejected(anon, fresh_store):
    email = "newstudent@e.ntu.edu.sg"
    reg = anon.post(
        "/auth/register",
        json={"name": "Alice", "email": email, "role": "student", "password": "password"},
    )
    assert reg.status_code == 201, f"Register failed: {reg.text}"
    correct_code, _ = fresh_store.verification_codes[email]
    wrong_code = "111111" if correct_code != "111111" else "222222"

    res = anon.post("/auth/verify", json={"email": email, "code": wrong_code})
    assert res.status_code in (400, 422)
    assert _error_code(res) == "bad_code"


def test_REQ_REG_2_expired_code_rejected(anon, fresh_store):
    email = "newstudent@e.ntu.edu.sg"
    reg = anon.post(
        "/auth/register",
        json={"name": "Alice", "email": email, "role": "student", "password": "password"},
    )
    assert reg.status_code == 201, f"Register failed: {reg.text}"
    code, expiry = fresh_store.verification_codes[email]

    # Force the expiry timestamp to 15 minutes in the past
    fresh_store.verification_codes[email] = (code, expiry - timedelta(minutes=15))

    res = anon.post("/auth/verify", json={"email": email, "code": code})
    assert res.status_code in (400, 422)
    assert _error_code(res) == "code_expired"


def test_REQ_REG_2_correct_code_activates(anon, fresh_store):
    email = "newstudent@e.ntu.edu.sg"
    reg = anon.post(
        "/auth/register",
        json={"name": "Alice", "email": email, "role": "student", "password": "password"},
    )
    assert reg.status_code == 201, f"Register failed: {reg.text}"
    code, _ = fresh_store.verification_codes[email]

    res = anon.post("/auth/verify", json={"email": email, "code": code})
    assert res.status_code == 200

    user = fresh_store.user_by_email(email)
    assert user is not None
    assert user.status == AccountStatus.active
    assert email not in fresh_store.verification_codes


def test_REQ_REG_2_resend_issues_new_code(anon, fresh_store):
    email = "newstudent@e.ntu.edu.sg"
    reg = anon.post(
        "/auth/register",
        json={"name": "Alice", "email": email, "role": "student", "password": "password"},
    )
    assert reg.status_code == 201, f"Register failed: {reg.text}"
    first_code, first_expiry = fresh_store.verification_codes[email]

    res = anon.post("/auth/resend", json={"email": email})
    assert res.status_code == 200

    new_code, new_expiry = fresh_store.verification_codes[email]
    assert len(new_code) == 6
    assert new_expiry >= first_expiry
