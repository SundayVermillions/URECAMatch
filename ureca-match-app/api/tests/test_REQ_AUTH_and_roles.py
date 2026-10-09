"""Slice A. Sign-in and registration rules. The role guard matrix (SRS 5.3.2) is in test_NFR_5_3_roles.py."""


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

