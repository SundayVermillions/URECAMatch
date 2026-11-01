"""Slice C: student applications and preference ranking.  REQ-APPLY-1..3, REQ-SRANK-1..2."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import SettingsDep, StoreDep, StudentUser
from app.errors import conflict, invalid, not_found
from app.models import (
    Application,
    ApplicationCreate,
    ApplicationStatus,
    ApplicationTips,
    ApplicationTipsRequest,
    ListingStatus,
    MatchStatus,
    Ok,
    PreferenceRankingUpdate,
)
from app.services import application_tips, cycle_scope, placement, windows

router = APIRouter(tags=["applications"])


def _require_window(store, settings):
    if not windows.in_application_window(store.cycle, settings.now()):  # REQ-APPLY-1
        raise invalid("window_closed", "Applications can only be changed during an application window.")


@router.get("/me/applications", response_model=list[Application])
def mine(user: StudentUser, store: StoreDep, settings: SettingsDep) -> list[Application]:
    """Only this cycle's applications: when it ends, the list is empty and the next cycle starts clean."""
    cycle = cycle_scope.running_cycle(store, settings.now())
    rows = cycle_scope.applications_in(cycle, store.applications_for(student_id=user.id))
    covers = {lst.id: lst.cover_url for lst in store.all_listings()}  # read once, not once per application
    mine = [a.model_copy(update={"cover_url": covers.get(a.listing_id)}) for a in rows]
    return sorted(mine, key=lambda a: a.preference_rank or 99)


def _active(store, student_id: str, round_id: str | None) -> list[Application]:
    """The student's applications still under review in this round."""
    apps = store.applications_for(student_id=student_id, round_id=round_id)
    return [a for a in apps if a.status == ApplicationStatus.submitted]


@router.post("/me/applications/tips", response_model=ApplicationTips)
def tips(body: ApplicationTipsRequest, user: StudentUser, store: StoreDep, settings: SettingsDep) -> ApplicationTips:
    """Tips on a draft application before it is submitted (REQ-APPLY-6). Saves nothing and never shows a score."""
    lst = store.listing(body.listing_id)
    if lst is None or lst.status != ListingStatus.published:
        raise not_found("Project")
    sp = store.student(user.id)
    if sp is None:
        raise not_found("Profile")
    own = {d.id: d for d in sp.documents}
    if any(d not in own for d in body.document_ids):
        raise invalid("unknown_document", "Attach documents from your own profile only.", "document_ids")
    docs = [own[d] for d in body.document_ids]
    return application_tips.application_tips(settings, lst, sp, body.statement, docs)


@router.post("/applications", response_model=Application, status_code=201)
def apply(body: ApplicationCreate, user: StudentUser, store: StoreDep, settings: SettingsDep) -> Application:
    _require_window(store, settings)
    lst = store.listing(body.listing_id)
    if lst is None or lst.status != ListingStatus.published:
        raise not_found("Project")
    sp = store.student(user.id)
    if sp and not sp.profile_complete:  # REQ-APPLY-1 (use case 2-2 precondition 4)
        raise conflict("profile_incomplete", "Complete your profile before applying. Go to My Profile to finish it.")
    if placement.is_placed(store, user.id):  # one project per cycle, whether from an offer or a proposal
        raise conflict("already_placed", "You have already accepted a project this cycle, so you cannot apply to another.")
    if sp and not sp.eligible_for_matching:
        raise conflict("not_eligible", "You declined or did not answer an earlier offer, so you cannot apply again this cycle.")
    if any(m.status == MatchStatus.published for m in placement.open_matches(store, user.id)):  # REQ-APPLY-5, this cycle only
        raise conflict("offer_open", "You have a project offer to answer, so you cannot apply this round. See My Applications.")
    if lst.filled_slots >= lst.available_slots:
        raise conflict("fully_allocated", "All slots on this project are filled.")
    own = {d.id for d in (sp.documents if sp else [])}
    if any(d not in own for d in body.document_ids):  # REQ-APPLY-2: own documents only
        raise invalid("unknown_document", "Attach documents from your own profile only.", "document_ids")
    phase = windows.phase(store.cycle, settings.now())
    active = _active(store, user.id, phase.round_id)
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
    store.save_applications(app)
    return app


@router.delete("/applications/{application_id}", response_model=Ok)
def withdraw(application_id: str, user: StudentUser, store: StoreDep, settings: SettingsDep) -> Ok:
    _require_window(store, settings)
    app = store.application(application_id)
    if app is None or app.student_id != user.id:
        raise not_found("Application")
    if app.status != ApplicationStatus.submitted:  # matched or decided applications belong to matching (slice D)
        raise conflict("not_withdrawable", "Only applications still under review can be withdrawn.")
    app.status = ApplicationStatus.withdrawn
    app.preference_rank = None
    # re-sequence remaining ranks (REQ-SRANK-2)
    remaining = sorted(
        (a for a in _active(store, user.id, app.round_id) if a.id != app.id), key=lambda a: a.preference_rank or 99
    )
    for i, a in enumerate(remaining, start=1):
        a.preference_rank = i
    store.save_applications(app, *remaining)
    return Ok()


@router.put("/me/ranking", response_model=list[Application])
def rank(body: PreferenceRankingUpdate, user: StudentUser, store: StoreDep, settings: SettingsDep) -> list[Application]:
    _require_window(store, settings)
    phase = windows.phase(store.cycle, settings.now())
    active = {a.id: a for a in _active(store, user.id, phase.round_id)}
    if sorted(body.application_ids) != sorted(active):  # REQ-SRANK-2: every active application, each exactly once
        raise invalid("ranking_incomplete", "Rank every active application exactly once.", "application_ids")
    for i, aid in enumerate(body.application_ids, start=1):
        active[aid].preference_rank = i
    store.save_applications(*active.values())
    return mine(user, store, settings)
