"""Slice B: self-proposed projects.  REQ-PROPOSE-1..3, REQ-REVPROP-1..3."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import SettingsDep, StoreDep, StudentUser, SupervisorUser
from app.errors import conflict, forbidden, invalid, not_found
from app.models import (
    ApplicantStudent,
    ApplicationStatus,
    Listing,
    ListingStatus,
    Match,
    MatchDecision,
    MatchStatus,
    NotificationEvent,
    Proposal,
    ProposalCreate,
    ProposalStatus,
    Window,
)
from app.services import windows
from app.services.notify import notify

router = APIRouter(tags=["proposals"])


@router.post("/proposals", response_model=Proposal, status_code=201)
def propose(body: ProposalCreate, user: StudentUser, store: StoreDep, settings: SettingsDep) -> Proposal:
    if not windows.in_application_window(store.cycle, settings.now()):  # REQ-PROPOSE-3
        raise invalid("window_closed", "Proposals can only be submitted during an application window.")
    sup = store.user(body.supervisor_id)
    if sup is None or store.supervisor(body.supervisor_id) is None:
        raise invalid("unknown_supervisor", "Choose a project supervisor from the list.", "supervisor_id")
    p = Proposal(
        id=store.next_id("prp"),
        student_id=user.id,
        student_name=user.name,
        supervisor_id=sup.id,
        supervisor_name=sup.name,
        title=body.title,
        description=body.description,
        research_interests=body.research_interests,
        statement=body.statement,
        status=ProposalStatus.submitted,
        submitted_at=settings.now(),
        document_ids=body.document_ids,
    )
    store.proposals.append(p)
    notify(
        store,
        [sup.id],
        NotificationEvent.proposal_decided,
        f"New proposal from {user.name}",
        p.title,
        settings.now(),
        "/proposals",
    )
    return p


@router.get("/me/proposals", response_model=list[Proposal])
def my_proposals(user: StudentUser, store: StoreDep) -> list[Proposal]:
    return [p for p in store.proposals if p.student_id == user.id]


def _with_student(store, p: Proposal) -> Proposal:
    """REQ-REVPROP-1: attach the proposing student's profile and the documents they attached.

    Read live from the store on every request, so the supervisor always sees the current profile.
    Returns a copy; the stored proposal is not changed.
    """
    u, sp = store.user(p.student_id), store.student(p.student_id)
    if u is None or sp is None:
        return p
    student = ApplicantStudent(
        id=u.id,
        name=u.name,
        school=sp.school,
        year_of_study=sp.year_of_study,
        cgpa=sp.cgpa,
        completed_modules=sp.completed_modules,
        research_interests=sp.research_interests,
    )
    documents = [d for d in sp.documents if d.id in p.document_ids]
    return p.model_copy(update={"student": student, "documents": documents})


@router.get("/supervisor/proposals", response_model=list[Proposal])
def incoming(user: SupervisorUser, store: StoreDep) -> list[Proposal]:  # REQ-REVPROP-1
    return [_with_student(store, p) for p in store.proposals if p.supervisor_id == user.id]


def _get(store, proposal_id: str, user) -> Proposal:
    p = next((p for p in store.proposals if p.id == proposal_id), None)
    if p is None:
        raise not_found("Proposal")
    if p.supervisor_id != user.id:
        raise forbidden()
    if p.status != ProposalStatus.submitted:
        raise conflict("already_decided", "This proposal has already been decided.")
    return p


def _require_cycle_open(store, settings) -> None:
    """REQ-REVPROP-3: a student may only be registered while the application cycle is running.

    Declining stays open outside the cycle: SRS 4.18.3 restricts accepting only.
    """
    if windows.phase(store.cycle, settings.now()).window in (Window.before_cycle, Window.closed):
        raise invalid("cycle_closed", "The application cycle is not open, so this proposal can no longer be accepted.")


@router.post("/supervisor/proposals/{proposal_id}/accept", response_model=Proposal)
def accept(proposal_id: str, body: MatchDecision, user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> Proposal:
    p = _get(store, proposal_id, user)
    _require_cycle_open(store, settings)  # REQ-REVPROP-3
    now = settings.now()
    p.status, p.decided_at = ProposalStatus.accepted, now
    # REQ-REVPROP-2: register the student. A one-slot listing plus an accepted match makes the
    # student ineligible for later rounds and withdraws their open applications.
    lst = Listing(
        id=store.next_id("lst"),
        supervisor_id=user.id,
        supervisor_name=user.name,
        title=p.title,
        description=p.description,
        topic_tags=p.research_interests,
        available_slots=1,
        filled_slots=1,
        offering_faculty=store.supervisor(user.id).faculty,
        research_location="",
        status=ListingStatus.closed,
        created_at=now,
    )
    store.listings.append(lst)
    phase = windows.phase(store.cycle, now)
    store.matches.append(
        Match(
            id=store.next_id("mt"),
            round_id=phase.round_id or "",
            student_id=p.student_id,
            student_name=p.student_name,
            listing_id=lst.id,
            listing_title=lst.title,
            supervisor_id=user.id,
            supervisor_name=user.name,
            status=MatchStatus.accepted,
            supervisor_decided_at=now,
            published_at=now,
            student_responded_at=now,
        )
    )
    for a in store.applications:
        if a.student_id == p.student_id and a.status == ApplicationStatus.submitted:
            a.status = ApplicationStatus.withdrawn
    sp = store.student(p.student_id)
    if sp:
        sp.eligible_for_matching = False
    notify(
        store,
        [p.student_id],
        NotificationEvent.proposal_decided,
        "Your proposal was accepted",
        f"{user.name} accepted {p.title}. You are registered to the project.",
        now,
        "/my-applications",
    )
    return p


@router.post("/supervisor/proposals/{proposal_id}/decline", response_model=Proposal)
def decline(proposal_id: str, body: MatchDecision, user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> Proposal:
    p = _get(store, proposal_id, user)
    p.status, p.decided_at = ProposalStatus.declined, settings.now()
    notify(
        store,
        [p.student_id],
        NotificationEvent.proposal_decided,
        "Your proposal was declined",
        f"{user.name} declined {p.title}." + (f" Note: {body.note}" if body.note else ""),
        settings.now(),
        "/my-applications",
    )
    return p
