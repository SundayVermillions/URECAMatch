"""Slice A: REQ-USER-1..3 tests."""



def test_REQ_USER_1_admin_creates_supervisor(as_admin):
    """Admin can create a new supervisor account (REQ-USER-1)."""
    resp = as_admin.post(
        "/admin/users",
        json={
            "name": "Prof Test Supervisor",
            "email": "prof.test@ntu.edu.sg",
            "role": "supervisor",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "prof.test@ntu.edu.sg"
    assert data["role"] == "supervisor"
    assert data["status"] == "active"


def test_REQ_USER_2_register_cannot_choose_admin(anon):
    """Public registration cannot create an admin account (REQ-USER-2)."""
    resp = anon.post(
        "/auth/register",
        json={
            "name": "Sneaky Admin",
            "email": "sneaky@e.ntu.edu.sg",
            "password": "Password123!",
            "role": "admin",
        },
    )
    assert resp.status_code in (400, 403, 422)


def test_REQ_USER_3_deactivated_user_gets_403(as_admin, client_for):
    """Deactivating a user blocks them from acting (REQ-USER-3)."""
    resp = as_admin.post("/admin/users/stu-1/deactivate")
    assert resp.status_code == 200

    stu_client = client_for("stu-1")
    me_resp = stu_client.get("/me")
    assert me_resp.status_code == 403
