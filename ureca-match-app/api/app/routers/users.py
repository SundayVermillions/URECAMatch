"""Slice A: admin user management.  REQ-USER-1..3."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import AdminUser, SettingsDep, StoreDep
from app.errors import conflict, not_found
from app.models import (
    AccountStatus,
    AuditOperation,
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
from app.services.audit import audit
from app.services.notify import notify

router = APIRouter(prefix="/admin/users", tags=["admin: users"])


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
    store.save_user(user)
    if body.role == Role.student:
        store.save_student(StudentProfile(user_id=user.id, school=""))
    elif body.role == Role.supervisor:
        store.save_supervisor(SupervisorProfile(user_id=user.id, faculty=""))
    audit(store, admin, AuditOperation.user_updated, [user.id], settings.now(), "created")
    return user


@router.patch("/{user_id}", response_model=User)
def update_user(user_id: str, body: UserUpdate, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> User:
    u = store.user(user_id)
    if u is None:
        raise not_found("User")
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
    now = settings.now()
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


@router.post("/{user_id}/deactivate", response_model=Ok)
def deactivate(user_id: str, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Ok:
    u = store.user(user_id)
    if u is None:
        raise not_found("User")
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
