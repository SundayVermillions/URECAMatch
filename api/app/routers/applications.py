"""Slice C: student applications and preference ranking.  REQ-APPLY-1..2, REQ-SRANK-1..2."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import SettingsDep, StoreDep, StudentUser
from app.errors import conflict, invalid, not_found
from app.models import Application, ApplicationCreate, ApplicationStatus, ListingStatus, Ok, PreferenceRankingUpdate
from app.services import windows

router = APIRouter(tags=["applications"])


def _require_window(store, settings):
    if not windows.in_application_window(store.cycle, settings.now()):  # REQ-APPLY-1
        raise invalid("window_closed", "Applications can only be changed during an application window.")


@router.get("/me/applications", response_model=list[Application])
def mine(user: StudentUser, store: StoreDep) -> list[Application]:
    return sorted((a for a in store.applications if a.student_id == user.id), key=lambda a: a.preference_rank or 99)


@router.post("/applications", response_model=Application, status_code=201)
def apply(body: ApplicationCreate, user: StudentUser, store: StoreDep, settings: SettingsDep) -> Application:
    _require_window(store, settings)
    lst = store.listing(body.listing_id)
    if lst is None or lst.status != ListingStatus.published:
        raise not_found("Project")
    sp = store.student(user.id)
    if sp and not sp.eligible_for_matching:
        raise conflict("not_eligible", "You declined an earlier offer, so you cannot apply again this cycle.")
    if lst.filled_slots >= lst.available_slots:
        raise conflict("fully_allocated", "All slots on this project are filled.")
    phase = windows.phase(store.cycle, settings.now())
    active = [
        a
        for a in store.applications
        if a.student_id == user.id and a.round_id == phase.round_id and a.status == ApplicationStatus.submitted
    ]
    if any(a.listing_id == lst.id for a in active):
        raise conflict("already_applied", "You have already applied to this project. See My Applications.")
    app = Application(
        id=store.next_id("app"),
        student_id=user.id,
        listing_id=lst.id,
        listing_title=lst.title,
        supervisor_name=lst.supervisor_name,
        round_id=phase.round_id or "",
        statement=body.statement,
        submitted_at=settings.now(),
        preference_rank=len(active) + 1,
        status=ApplicationStatus.submitted,
        document_ids=body.document_ids,
    )  # REQ-APPLY-2 (statement required by the model)
    store.applications.append(app)
    return app


@router.delete("/applications/{application_id}", response_model=Ok)
def withdraw(application_id: str, user: StudentUser, store: StoreDep, settings: SettingsDep) -> Ok:
    _require_window(store, settings)
    app = next((a for a in store.applications if a.id == application_id and a.student_id == user.id), None)
    if app is None:
        raise not_found("Application")
    app.status = ApplicationStatus.withdrawn
    app.preference_rank = None
    # re-sequence remaining ranks (REQ-SRANK-2)
    remaining = sorted(
        (
            a
            for a in store.applications
            if a.student_id == user.id and a.status == ApplicationStatus.submitted and a.round_id == app.round_id
        ),
        key=lambda a: a.preference_rank or 99,
    )
    for i, a in enumerate(remaining, start=1):
        a.preference_rank = i
    return Ok()


@router.put("/me/ranking", response_model=list[Application])
def rank(body: PreferenceRankingUpdate, user: StudentUser, store: StoreDep, settings: SettingsDep) -> list[Application]:
    _require_window(store, settings)
    phase = windows.phase(store.cycle, settings.now())
    active = {
        a.id: a
        for a in store.applications
        if a.student_id == user.id and a.round_id == phase.round_id and a.status == ApplicationStatus.submitted
    }
    if sorted(body.application_ids) != sorted(active):  # REQ-SRANK-2: every active application, each exactly once
        raise invalid("ranking_incomplete", "Rank every active application exactly once.", "application_ids")
    for i, aid in enumerate(body.application_ids, start=1):
        active[aid].preference_rank = i
    return mine(user, store)
