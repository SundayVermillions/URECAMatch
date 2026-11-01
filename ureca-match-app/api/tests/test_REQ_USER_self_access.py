"""REQ-USER-3: self-access protections apply even when other administrators exist."""

import pytest

from app.models import AccountStatus, Role


@pytest.mark.parametrize("confirm", [False, True])
@pytest.mark.parametrize(
    ("method", "body", "code"),
    [
        ("post", None, "self_deactivation"),
        ("patch", {"status": "inactive"}, "self_deactivation"),
        ("patch", {"status": "pending_verification"}, "self_deactivation"),
        ("patch", {"role": "student"}, "self_role_change"),
        ("patch", {"role": "supervisor"}, "self_role_change"),
        ("patch", {"role": "student", "status": "inactive", "name": "Changed"}, "self_deactivation"),
    ],
)
def test_REQ_USER_3_self_access_changes_cannot_be_confirmed(as_admin, fresh_store, method, body, code, confirm):
    assert sum(u.role == Role.admin and u.status == AccountStatus.active for u in fresh_store.users) > 1
    admin = fresh_store.user("adm-1")
    before = admin.model_dump()
    audit_count, notice_count = len(fresh_store.audit), len(fresh_store.notifications)
    url = "/admin/users/adm-1" + ("/deactivate" if method == "post" else "")
    response = as_admin.request(method, url, params={"confirm_cleanup": str(confirm).lower()}, json=body)
    assert response.status_code == 409
    assert response.json()["code"] == code
    assert fresh_store.user("adm-1").model_dump() == before
    assert len(fresh_store.audit) == audit_count
    assert len(fresh_store.notifications) == notice_count
    assert as_admin.get("/me").status_code == 200


def test_REQ_USER_3_admin_can_still_edit_own_name(as_admin, fresh_store):
    response = as_admin.patch("/admin/users/adm-1", json={"name": "Jonathan Updated", "role": "admin", "status": "active"})
    assert response.status_code == 200
    assert fresh_store.user("adm-1").name == "Jonathan Updated"


def test_REQ_USER_3_another_admin_can_change_role_and_deactivate(as_admin, client_for, fresh_store):
    assert as_admin.patch("/admin/users/adm-2", json={"role": "student"}).status_code == 200
    assert fresh_store.user("adm-2").role == Role.student
    assert client_for("adm-3").post("/admin/users/adm-1/deactivate").status_code == 200
    assert fresh_store.user("adm-1").status == AccountStatus.inactive
    assert as_admin.get("/me").status_code == 403
