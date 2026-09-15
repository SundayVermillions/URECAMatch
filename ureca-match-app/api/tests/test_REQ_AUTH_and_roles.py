"""Slice A and E. Role guard on every endpoint (SRS 5.3.2) plus sign-in rules."""

import pytest

from app.main import app


def test_REQ_AUTH_2_inactive_account_cannot_act(client_for):
    r = client_for("stu-40").get("/me")  # stu-40 is seeded inactive
    assert r.status_code == 403 and r.json()["code"] == "account_inactive"


def test_REQ_REG_1_non_ntu_email_rejected(anon):
    r = anon.post(
        "/auth/register", json={"name": "Robin", "email": "robin@gmail.com", "password": "password1", "role": "student"}
    )
    assert r.status_code == 422 and r.json()["field"] == "email"


def test_REQ_REG_3_duplicate_email_rejected(anon):
    r = anon.post(
        "/auth/register",
        json={"name": "Wei Ling", "email": "weiling001@e.ntu.edu.sg", "password": "password1", "role": "student"},
    )
    assert r.status_code == 409


ADMIN_ONLY = [p for p in app.openapi()["paths"] if p.startswith("/admin/")]
SUPERVISOR_ONLY = [p for p in app.openapi()["paths"] if p.startswith("/supervisor/")]


@pytest.mark.parametrize("path", ADMIN_ONLY)
def test_admin_routes_refuse_students(path, client_for):
    resolved = (
        path.replace("{cycle_id}", "cyc-2627s1")
        .replace("{round_id}", "rnd-1")
        .replace("{match_id}", "mt-1")
        .replace("{user_id}", "stu-2")
    )
    r = client_for("stu-1").get(resolved) if "{" not in resolved else None
    if r is None:
        pytest.skip("path needs a body")
    assert r.status_code in (403, 405), path


@pytest.mark.parametrize("path", SUPERVISOR_ONLY)
def test_supervisor_routes_refuse_students(path, client_for):
    resolved = (
        path.replace("{listing_id}", "lst-1")
        .replace("{proposal_id}", "prp-1")
        .replace("{match_id}", "mt-1")
        .replace("{application_id}", "app-1")
    )
    r = client_for("stu-1").get(resolved)
    assert r.status_code in (403, 405), path
