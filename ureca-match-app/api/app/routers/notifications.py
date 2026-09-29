"""Slice E: notifications and dashboards.  REQ-NOTIF-1..2."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import AdminUser, CurrentUser, SettingsDep, StoreDep, SupervisorUser
from app.errors import not_found
from app.models import (
    AdminDashboard,
    ApplicationStatus,
    ListingStatus,
    MatchStatus,
    Notification,
    Ok,
    ProposalStatus,
    Role,
    SupervisorDashboard,
)
from app.services import windows

router = APIRouter(tags=["notifications", "dashboards"])


@router.get("/me/notifications", response_model=list[Notification])
def mine(user: CurrentUser, store: StoreDep) -> list[Notification]:  # REQ-NOTIF-1: own only, newest first
    """List the signed-in user's own notifications, newest first (REQ-NOTIF-1)."""
    return sorted((n for n in store.notifications if n.user_id == user.id), key=lambda n: n.created_at, reverse=True)


@router.post("/me/notifications/{notification_id}/read", response_model=Ok)
def mark_read(notification_id: str, user: CurrentUser, store: StoreDep) -> Ok:  # REQ-NOTIF-2
    n = next((n for n in store.notifications if n.id == notification_id and n.user_id == user.id), None)
    if n is None:
        raise not_found("Notification")
    n.read = True
    return Ok()


@router.get("/admin/dashboard", response_model=AdminDashboard)
def admin_dashboard(admin: AdminUser, store: StoreDep, settings: SettingsDep) -> AdminDashboard:
    phase = windows.phase(store.cycle, settings.now())
    pending = sum(1 for m in store.matches if m.status == MatchStatus.proposed)
    alerts = []
    if pending:
        alerts.append(f"{pending} proposed matches await supervisor approval")
    incomplete = sum(1 for s in store.students if not s.profile_complete)
    if incomplete:
        alerts.append(f"{incomplete} students have not completed their profile")
    return AdminDashboard(
        cycle=store.cycle,
        students=sum(1 for u in store.users if u.role == Role.student),
        supervisors=sum(1 for u in store.users if u.role == Role.supervisor),
        listings_published=sum(1 for lst in store.listings if lst.status == ListingStatus.published),
        applications_this_round=sum(
            1 for a in store.applications if a.round_id == phase.round_id and a.status == ApplicationStatus.submitted
        ),
        pending_approvals=pending,
        alerts=alerts,
    )


@router.get("/supervisor/dashboard", response_model=SupervisorDashboard)
def supervisor_dashboard(user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> SupervisorDashboard:
    return SupervisorDashboard(
        listings=[lst for lst in store.listings if lst.supervisor_id == user.id],
        pending_proposals=sum(1 for p in store.proposals if p.supervisor_id == user.id and p.status == ProposalStatus.submitted),
        pending_approvals=sum(1 for m in store.matches if m.supervisor_id == user.id and m.status == MatchStatus.proposed),
        phase=windows.phase(store.cycle, settings.now()),
    )
