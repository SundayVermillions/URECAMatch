"""Slice C: student applications and preference ranking.  REQ-APPLY-1..3, REQ-SRANK-1..2.

Read and saved through applications_for() / save_applications(), never store.applications, so in Supabase mode
every change reaches the database before the response is sent (NFR 5.2).
"""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import SettingsDep, StoreDep, StudentUser
from app.errors import conflict, invalid, not_found
from app.models import (
    Application,
    ApplicationCreate,
    ApplicationStatus,
    ListingStatus,
    MatchStatus,
    Ok,
    PreferenceRankingUpdate,
    Window,
)
from app.services import placement, windows

router = APIRouter(tags=["applications"])


def _require_window(store, settings) -> str:
    """REQ-APPLY-1: submitting, modifying (ranking) and withdrawing only inside a round's application window.
    Returns the round being applied to."""
    phase = windows.phase(store.cycle, settings.now())
    if phase.window != Window.application or phase.round_id is None:
        raise invalid("window_closed", "Applications can only be changed while an application window is open.")
    return phase.round_id


def _active(store, student_id: str, round_id: str) -> list[Application]:
    """The student's applications still under review this round, most preferred first."""
    rows = store.applications_for(student_id=student_id, round_id=round_id)
    mine = [a for a in rows if a.status == ApplicationStatus.submitted]
    return sorted(mine, key=lambda a: a.preference_rank or 99)


def _mine(store, student_id: str) -> list[Application]:
    return sorted(store.applications_for(student_id=student_id), key=lambda a: a.preference_rank or 99)


@router.get("/me/applications", response_model=list[Application])
def mine(user: StudentUser, store: StoreDep) -> list[Application]:
    return _mine(store, user.id)


@router.post("/applications", response_model=Application, status_code=201)
def apply(body: ApplicationCreate, user: StudentUser, store: StoreDep, settings: SettingsDep) -> Application:
    round_id = _require_window(store, settings)
    lst = store.listing(body.listing_id)
    if lst is None or lst.status != ListingStatus.published:
        raise not_found("Project")
    sp = store.student(user.id)
    if sp is None or not sp.profile_complete:
        raise conflict("profile_incomplete", "Complete your profile before applying. Go to My Profile to finish it.")
    if placement.is_placed(store, user.id):  # one project per cycle (REQ-OUTCOME-1)
        raise conflict("already_placed", "You have already accepted a project this cycle, so you cannot apply to another.")
    if not sp.eligible_for_matching:  # declined or missed an offer (REQ-OUTCOME-2, 4)
        raise conflict("not_eligible", "You declined or did not answer an earlier offer, so you cannot apply again this cycle.")
    if any(m.status == MatchStatus.published for m in placement.open_matches(store, user.id)):  # REQ-APPLY-3
        raise conflict("offer_open", "You have a project offer to answer, so you cannot apply this round. See My Applications.")
    if lst.filled_slots >= lst.available_slots:
        raise conflict("fully_allocated", "All slots on this project are filled.")
    # REQ-APPLY-2: attach only your own documents, so nobody can share another student's file (SRS 5.3.3).
    own = {d.id for d in sp.documents}
    if any(d not in own for d in body.document_ids):
        raise invalid("unknown_document", "Attach documents from your own profile only.", "document_ids")
    if len(body.statement.strip()) < 50:  # the model counts spaces, so check the trimmed text too
        raise invalid("statement_too_short", "Write a statement of at least 50 characters.", "statement")
    active = _active(store, user.id, round_id)
    if any(a.listing_id == lst.id for a in active):
        raise conflict("already_applied", "You have already applied to this project. See My Applications.")
    app = Application(
        id=store.next_id("app"),
        student_id=user.id,
        listing_id=lst.id,
        listing_title=lst.title,
        supervisor_name=lst.supervisor_name,
        round_id=round_id,
        statement=body.statement.strip(),
        submitted_at=settings.now(),
        preference_rank=len(active) + 1,  # new applications go to the bottom of the student's preferences
        status=ApplicationStatus.submitted,
        document_ids=body.document_ids,
    )
    store.save_applications(app)
    return app


@router.delete("/applications/{application_id}", response_model=Ok)
def withdraw(application_id: str, user: StudentUser, store: StoreDep, settings: SettingsDep) -> Ok:
    _require_window(store, settings)  # REQ-APPLY-1
    a = store.application(application_id)
    if a is None or a.student_id != user.id:
        raise not_found("Application")
    if a.status != ApplicationStatus.submitted:
        raise conflict("not_withdrawable", "Only applications still under review can be withdrawn.")
    a.status, a.preference_rank = ApplicationStatus.withdrawn, None
    # The student's remaining preferences move up, so ranks stay 1..n (REQ-SRANK-2).
    left = _active(store, user.id, a.round_id)
    left = [x for x in left if x.id != a.id]
    for i, x in enumerate(left, start=1):
        x.preference_rank = i
    store.save_applications(a, *left)
    return Ok()


@router.put("/me/ranking", response_model=list[Application])
def rank(body: PreferenceRankingUpdate, user: StudentUser, store: StoreDep, settings: SettingsDep) -> list[Application]:
    round_id = _require_window(store, settings)  # REQ-APPLY-1: ranking is modifying the application
    active = {a.id: a for a in _active(store, user.id, round_id)}
    ids = body.application_ids
    if len(set(ids)) != len(ids) or set(ids) != set(active):  # REQ-SRANK-2: every active application, each once
        raise invalid("ranking_incomplete", "Rank every active application exactly once.", "application_ids")
    for i, aid in enumerate(ids, start=1):
        active[aid].preference_rank = i
    store.save_applications(*(active[aid] for aid in ids))
    return _mine(store, user.id)
