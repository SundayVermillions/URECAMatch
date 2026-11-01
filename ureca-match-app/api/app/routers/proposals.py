"""Slice B: self-proposed projects.  REQ-PROPOSE-1..3, REQ-REVPROP-1..3."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import SettingsDep, StoreDep, StudentUser, SupervisorUser
from app.errors import conflict, forbidden, invalid, not_found
from app.models import (
    AccountStatus,
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
    Role,
    Window,
)
from app.services import catalog, cycle_scope, placement, windows
from app.services.notify import notify

MIN_DECLINE_REASON = 10  # same length the admin's justification needs

router = APIRouter(tags=["proposals"])


DESCRIPTION_MAX_WORDS = 500  # use case 2-4 special requirements
STATEMENT_MAX_WORDS = 300


def _words(text: str) -> int:
    return len(text.split())


@router.post("/proposals", response_model=Proposal, status_code=201)
def propose(body: ProposalCreate, user: StudentUser, store: StoreDep, settings: SettingsDep) -> Proposal:
    if not windows.in_application_window(store.cycle, settings.now()):  # REQ-PROPOSE-3
        raise invalid("window_closed", "Proposals can only be submitted during an application window.")
    if placement.is_placed(store, user.id):  # one project per cycle (REQ-OUTCOME-1)
        raise conflict("already_placed", "You have already accepted a project this cycle, so you cannot propose another.")
    sp = store.student(user.id)
    if (
        sp and not sp.eligible_for_matching
    ):  # declined or missed an offer, or placed (the flag outlives a restart in Supabase mode)
        raise conflict(
            "not_eligible",
            "You declined or did not answer an earlier offer, or already have a project, so you cannot propose this cycle.",
        )
    # REQ-PROPOSE-2: the recipient must be an active project supervisor.
    sup = store.user(body.supervisor_id)
    if (
        sup is None
        or sup.role != Role.supervisor
        or store.supervisor(body.supervisor_id) is None
        or sup.status != AccountStatus.active
    ):
        raise invalid("unknown_supervisor", "Choose a project supervisor from the list.", "supervisor_id")
    if any(q.supervisor_id == sup.id and q.status == ProposalStatus.submitted for q in store.proposals_for(student_id=user.id)):
        raise conflict(
            "already_proposed",
            f"You already have a proposal waiting with {sup.name}. Withdraw it first, or wait for their reply.",
        )
    # REQ-PROPOSE-1: title, description and at least one research interest.
    interests = catalog.clean_topics([t for t in body.research_interests if t.strip()], "research_interests")  # standard topics
    if not interests:
        raise invalid("interests_required", "Add at least one research interest.", "research_interests")
    for field, text, minimum, message in (  # the model counts spaces, so check the trimmed text too
        ("title", body.title, 5, "Give the proposal a title of at least 5 characters."),
        ("description", body.description, 50, "Describe the project in at least 50 characters."),
        ("statement", body.statement, 50, "Write a statement of at least 50 characters."),
    ):
        if len(text.strip()) < minimum:
            raise invalid(f"{field}_too_short", message, field)
    if _words(body.description) > DESCRIPTION_MAX_WORDS:
        raise invalid("too_long", f"Keep the description to {DESCRIPTION_MAX_WORDS} words or fewer.", "description")
    if _words(body.statement) > STATEMENT_MAX_WORDS:
        raise invalid("too_long", f"Keep this to {STATEMENT_MAX_WORDS} words or fewer.", "statement")
    # Attach only your own documents, so nobody can share another student's file.
    own = {d.id for d in (store.student(user.id).documents if store.student(user.id) else [])}
    if any(d not in own for d in body.document_ids):
        raise invalid("unknown_document", "Attach documents from your own profile only.", "document_ids")
    p = Proposal(
        id=store.next_id("prp"),
        student_id=user.id,
        student_name=user.name,
        supervisor_id=sup.id,
        supervisor_name=sup.name,
        title=body.title.strip(),
        description=body.description.strip(),
        research_interests=interests,
        statement=body.statement.strip(),
        status=ProposalStatus.submitted,
        submitted_at=settings.now(),
        document_ids=body.document_ids,
    )
    store.save_proposal(p)
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
def my_proposals(user: StudentUser, store: StoreDep, settings: SettingsDep) -> list[Proposal]:
    """Only this cycle's proposals: when the cycle ends, the list is empty and the next cycle starts clean."""
    return cycle_scope.proposals_in(cycle_scope.running_cycle(store, settings.now()), store.proposals_for(student_id=user.id))


@router.post("/me/proposals/{proposal_id}/withdraw", response_model=Proposal)
def withdraw(proposal_id: str, user: StudentUser, store: StoreDep, settings: SettingsDep) -> Proposal:
    """The student takes back a proposal the supervisor has not answered yet. Once it is accepted or declined it is final."""
    p = store.proposal(proposal_id)
    if p is None or p.student_id != user.id:
        raise not_found("Proposal")
    if p.status != ProposalStatus.submitted:
        raise conflict("already_decided", f"This proposal was already {p.status.value}, so it can no longer be withdrawn.")
    now = settings.now()
    p.status, p.decided_at = ProposalStatus.withdrawn, now
    store.save_proposal(p)
    notify(
        store,
        [p.supervisor_id],
        NotificationEvent.proposal_decided,
        "A proposal was withdrawn",
        f"{user.name} withdrew their proposal {p.title}.",
        now,
        "/proposals",
    )
    return p


def _with_student(store, p: Proposal) -> Proposal:
    """REQ-REVPROP-1: attach the proposing student's profile and the documents they attached.

    Read live from the store on every request, so the supervisor always sees the current profile.
    Returns a copy; the stored proposal is not changed.
    """
    u, sp = store.user(p.student_id), store.student(p.student_id)
    if u is None or sp is None:
        return p
    student = ApplicantStudent(
        email=u.email,
        id=u.id,
        name=u.name,
        school=sp.school,
        degree=sp.degree,
        year_of_study=sp.year_of_study,
        cgpa=sp.cgpa,
        completed_modules=sp.completed_modules,
        research_interests=sp.research_interests,
    )
    documents = [d for d in sp.documents if d.id in p.document_ids]
    return p.model_copy(update={"student": student, "documents": documents})


@router.get("/supervisor/proposals", response_model=list[Proposal])
def incoming(user: SupervisorUser, store: StoreDep) -> list[Proposal]:  # REQ-REVPROP-1
    return [_with_student(store, p) for p in store.proposals_for(supervisor_id=user.id)]


def _get(store, proposal_id: str, user) -> Proposal:
    p = store.proposal(proposal_id)
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
    if placement.is_placed(store, p.student_id):  # the student accepted another project after proposing
        raise conflict(
            "already_placed", "This student has already accepted another project, so this proposal can only be declined."
        )
    student = store.student(p.student_id)
    if student and not student.eligible_for_matching:  # the student declined or missed an offer after proposing
        raise conflict("not_eligible", "This student declined or did not answer an offer, so this proposal can only be declined.")
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
    store.save_listing(lst)
    phase = windows.phase(store.cycle, now)
    # Slice D's matches are keyed by round. Before Round 1 opens there is no active round, so fall
    # back to the next scheduled one rather than leaving round_id empty (a match with no round
    # would be missing from every round summary and match list).
    upcoming = windows.current_round(store.cycle, now) if store.cycle else None
    round_id = phase.round_id or (upcoming.id if upcoming else "")
    # The student is placed now, so any other match still holding a slot for them is withdrawn: an open offer
    # (they can no longer accept it) and any match not yet published. Its slot is released for other students.
    for m in placement.open_matches(store, p.student_id):
        m.status, m.student_responded_at = MatchStatus.declined, now
        store.save_match(m)
        notify(
            store,
            [m.supervisor_id],
            NotificationEvent.match_rejected,
            "A match on your project was withdrawn",
            f"{p.student_name} accepted a self-proposed project, so their match to {m.listing_title} was withdrawn.",
            now,
            "/approvals",
        )
    store.add_matches(
        Match(
            id=store.next_id("mt"),
            round_id=round_id,
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
    # Read and saved through the store, so in Supabase mode these are the student's real applications, not the seed list.
    open_applications = [a for a in store.applications_for(student_id=p.student_id) if a.status == ApplicationStatus.submitted]
    for a in open_applications:
        a.status, a.preference_rank = ApplicationStatus.withdrawn, None
    store.save_applications(*open_applications)
    sp = store.student(p.student_id)
    if sp:
        sp.eligible_for_matching = False
        store.save_student(sp)  # in Supabase mode store.student() returns a copy, so the flag must be saved
    store.save_proposal(p)
    # The student is placed, so their other proposals still waiting for a supervisor are withdrawn.
    placement.withdraw_pending_proposals(store, p.student_id, now, "was registered to another project")
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
    # REQ-REVPROP-2: a decline needs a reason, and the student reads it. Checked here, whatever the screen does.
    reason = (body.note or "").strip()
    if len(reason) < MIN_DECLINE_REASON:
        raise invalid("reason_required", f"Give the student a reason of at least {MIN_DECLINE_REASON} characters.", "note")
    p.status, p.decided_at, p.decision_note = ProposalStatus.declined, settings.now(), reason
    store.save_proposal(p)
    notify(
        store,
        [p.student_id],
        NotificationEvent.proposal_decided,
        "Your proposal was declined",
        f"{user.name} declined {p.title}. Reason: {reason}",
        settings.now(),
        "/my-applications",
    )
    return p
