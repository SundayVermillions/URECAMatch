"""Slice A: keep the reserved audit actor out of account management (REQ-USER-1..3)."""

import pytest

from app.models import AccountStatus, AuditOperation, Role, User
from app.services.audit import SYSTEM, audit
from app.settings import get_settings


@pytest.fixture
def system_account(fresh_store):
    """The live schema contains this account; the in-memory demo does not."""
    user = User(
        id=SYSTEM.id,
        name=SYSTEM.name,
        email="system@urecamatch.app",
        role=Role.admin,
        status=AccountStatus.inactive,
        created_at=get_settings().now(),
    )
    fresh_store.save_user(user)
    return user


@pytest.mark.parametrize("query", ["", "?status=inactive", "?role=admin", "?q=system"])
def test_REQ_USER_1_system_actor_is_hidden(as_admin, system_account, query):
    response = as_admin.get("/admin/users" + query)
    assert response.status_code == 200
    assert all(row["user"]["id"] != system_account.id for row in response.json())


def test_REQ_USER_1_inactive_human_accounts_remain_visible(as_admin, fresh_store, system_account):
    student = fresh_store.user("stu-7")
    student.status = AccountStatus.inactive
    fresh_store.save_user(student)
    ids = {row["user"]["id"] for row in as_admin.get("/admin/users?status=inactive").json()}
    assert student.id in ids
    assert system_account.id not in ids


def test_REQ_USER_2_3_system_actor_cannot_be_edited_or_deactivated(as_admin, fresh_store, system_account):
    before = system_account.model_dump()
    entry = audit(fresh_store, SYSTEM, AuditOperation.cycle_updated, ["cyc-2627s1"], get_settings().now())
    assert as_admin.patch("/admin/users/system", json={"status": "active", "name": "Changed"}).status_code == 404
    assert as_admin.post("/admin/users/system/deactivate?confirm_cleanup=true").status_code == 404
    assert fresh_store.user(SYSTEM.id).model_dump() == before
    assert entry.actor_id == SYSTEM.id
    assert entry in fresh_store.audit
