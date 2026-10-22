"""Slice A: admin user management.  REQ-USER-1..3."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import AdminUser, SettingsDep, StoreDep
from app.errors import ApiError, conflict, not_found
from app.models import (
    AccountStatus,
    AuditOperation,
    CleanupWarning,
    NotificationEvent,
    Ok,
    Role,
    StudentProfile,
    SupervisorProfile,
    User,
    UserCreate,
    UserListItem,
    UserUpdate,
)
from app.services.account_cleanup import clean_up, find_active_items, is_last_admin, summarise
from app.services.audit import audit
from app.services.notify import notify

router = APIRouter(prefix="/admin/users", tags=["admin: users"])

# Nothing is changed when this comes back. Send the same request again with confirm_cleanup=true to go ahead.
ConfirmCleanup = Annotated[
    bool, Query(description="Close the user's open items first. Without it, a user with open items gets a 409 preview.")
]
WARNING = {409: {"model": CleanupWarning, "description": "Last active admin, or the user has open items to clean up first."}}


def _guard_account_change(store, u: User, leaving_admin: bool, deactivating: bool, role_changing: bool, confirm: bool) -> list:
    """Run before anything is changed. The last-admin rule is a hard block that `confirm_cleanup` cannot override
    (there must always be one active admin). Otherwise a user with open items gets a preview until the admin
    confirms. Returns the open items to clean up once confirmed."""
    if (leaving_admin or deactivating) and is_last_admin(store, u):
        raise conflict("last_admin", "This is the only active administrator. Make another user an active admin first.")
    if not (deactivating or role_changing):
        return []
    items = find_active_items(store, u)
    if items and not confirm:
        raise ApiError(
            409,
            "has_active_items",
            f"{u.name} still has {summarise(items)}. Confirm to close them and notify the people involved.",
            extra={"items": [i.model_dump(mode="json") for i in items]},
        )
    return items


@router.get("", response_model=list[UserListItem])
def list_users(
    admin: AdminUser, store: StoreDep, role: Role | None = None, status: AccountStatus | None = None, q: str | None = None
) -> list[UserListItem]:
    out = []
    for u in store.users:
        if role and u.role != role:
            continue
        if status and u.status != status:
            continue
        if q and q.lower() not in (u.name + u.email).lower():
            continue
        s = store.student(u.id)
        out.append(
            UserListItem(user=u, school=s.school if s else (store.supervisor(u.id).faculty if store.supervisor(u.id) else None))
        )
    return out


@router.post("", response_model=User, status_code=201)
def create_user(body: UserCreate, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> User:
    if store.user_by_email(body.email):
        raise conflict("email_taken", "An account with this e-mail already exists.")
    user = User(
        id=store.next_id(body.role.value[:3]),
        email=body.email,
        name=body.name,
        role=body.role,
        status=AccountStatus.active,
        created_at=settings.now(),
    )  # REQ-USER-1, REQ-USER-2 (admin-only route)
    store.users.append(user)
    if body.role == Role.student:
        store.students.append(StudentProfile(user_id=user.id, school=""))
    elif body.role == Role.supervisor:
        store.supervisors.append(SupervisorProfile(user_id=user.id, faculty=""))
    audit(store, admin, AuditOperation.user_updated, [user.id], settings.now(), "created")
    return user


@router.patch("/{user_id}", response_model=User, responses=WARNING)
def update_user(
    user_id: str,
    body: UserUpdate,
    admin: AdminUser,
    store: StoreDep,
    settings: SettingsDep,
    confirm_cleanup: ConfirmCleanup = False,
) -> User:
    u = store.user(user_id)
    if u is None:
        raise not_found("User")
    role_changing = body.role is not None and body.role != u.role
    deactivating = body.status == AccountStatus.inactive and u.status != AccountStatus.inactive
    leaving_admin = role_changing or (body.status is not None and body.status != AccountStatus.active)
    now = settings.now()
    if _guard_account_change(store, u, leaving_admin, deactivating, role_changing, confirm_cleanup):  # REQ-USER-3
        clean_up(store, admin, u, now, "deactivated" if deactivating else f"changed to {body.role.value}")
    changes = []
    if body.name is not None and body.name != u.name:
        u.name = body.name
        changes.append(f"name is now {body.name}")
    if body.role is not None and body.role != u.role:
        u.role = body.role
        changes.append(f"role is now {body.role.value}")
    if body.status is not None and body.status != u.status:
        u.status = body.status
        changes.append(f"status is now {body.status.value.replace('_', ' ')}")
    store.save_user(u)  # in Supabase mode store.user() returns a copy, so the change must be saved
    audit(store, admin, AuditOperation.user_updated, [u.id], now)
    if changes:
        notify(
            store,
            [u.id],
            NotificationEvent.account_changed,
            "Your account was updated",
            f"An administrator changed your account: {'; '.join(changes)}.",
            now,
        )
    return u


@router.post("/{user_id}/deactivate", response_model=Ok, responses=WARNING)
def deactivate(
    user_id: str, admin: AdminUser, store: StoreDep, settings: SettingsDep, confirm_cleanup: ConfirmCleanup = False
) -> Ok:
    u = store.user(user_id)
    if u is None:
        raise not_found("User")
    if _guard_account_change(store, u, False, True, False, confirm_cleanup):  # REQ-USER-3
        clean_up(store, admin, u, settings.now(), "deactivated")
    was_active = u.status != AccountStatus.inactive
    u.status = AccountStatus.inactive
    if settings.api_mode == "supabase" and hasattr(store, "client") and store.client:
        try:
            store.client.auth.admin.update_user_by_id(u.id, {"ban_duration": "876600h"})
        except Exception:
            pass
    store.save_user(u)
    now = settings.now()
    audit(store, admin, AuditOperation.user_deactivated, [u.id], now)
    if was_active:  # sign-in is blocked now, so in practice the user learns this from the e-mail
        notify(
            store,
            [u.id],
            NotificationEvent.account_changed,
            "Your account was deactivated",
            "An administrator deactivated your URECAMatch account, so you can no longer sign in.",
            now,
        )
    return Ok()
