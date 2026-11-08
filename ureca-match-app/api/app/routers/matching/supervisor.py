"""Slice D: the supervisor's side of matching: their matches, the profile of a student matched to them, and declining
that student during the approval window. REQ-APPRV-1..4, use case 3-3.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import SettingsDep, StoreDep, SupervisorUser
from app.errors import conflict, forbidden, not_found
from app.models import Applicant, ApplicantStudent, Match, MatchDecision, MatchStatus
from app.routers.matching.rounds import find_round
from app.services.schedule import schedule_lock
from app.services.windows import when

router = APIRouter(tags=["matching"])


@router.get("/supervisor/matches", response_model=list[Match])
def supervisor_matches(user: SupervisorUser, store: StoreDep) -> list[Match]:
    return [m for m in store.matches if m.supervisor_id == user.id]


@router.get("/supervisor/matches/{match_id}/student", response_model=Applicant)
def match_student(match_id: str, user: SupervisorUser, store: StoreDep) -> Applicant:
    """Use case 3-3 step 3: the profile and application of the student proposed for the supervisor's project.
    `application_id` is empty when the URECA office assigned the student without an application."""
    m = next((m for m in store.matches if m.id == match_id), None)
    if m is None:
        raise not_found("Match")
    if m.supervisor_id != user.id:
        raise forbidden()
    u, sp = store.user(m.student_id), store.student(m.student_id)
    if u is None or sp is None:
        raise not_found("Student")
    mine = store.applications_for(student_id=m.student_id, round_id=m.round_id)
    own = next((a for a in mine if a.listing_id == m.listing_id), None)
    lst = store.listing(m.listing_id)
    ranking = store.ranking(m.listing_id, m.round_id)
    return Applicant(
        application_id=own.id if own else "",
        student=ApplicantStudent(
            email=u.email,
            id=u.id,
            name=u.name,
            school=sp.school,
            degree=sp.degree,
            year_of_study=sp.year_of_study,
            cgpa=sp.cgpa,
            completed_modules=sp.completed_modules,
            research_interests=sp.research_interests,
        ),
        statement=own.statement if own else "",
        submitted_at=own.submitted_at if own else (m.published_at or u.created_at),
        documents=[d for d in sp.documents if own and d.id in own.document_ids],
        meets_prerequisites=all(p in sp.completed_modules for p in lst.prerequisites) if lst else True,
        rank=ranking.index(own.id) + 1 if own and own.id in ranking else None,
    )


@router.post("/supervisor/matches/{match_id}/decline", response_model=Match)
def decline_match(match_id: str, body: MatchDecision, user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> Match:
    """REQ-APPRV-2, 4: during the approval window a supervisor may decline a student matched to their project.
    Matches they leave alone are offered when the window closes; there is nothing to approve."""
    m = next((m for m in store.matches if m.id == match_id), None)
    if m is None:
        raise not_found("Match")
    if m.supervisor_id != user.id:
        raise forbidden()
    r = find_round(store.cycle, m.round_id)
    if r.executed_at is None:  # REQ-APPRV-1
        raise conflict("not_executed", "Matching has not run for this round yet.")
    now = settings.now()
    with schedule_lock:  # the round must not publish between these checks and the change
        if r.published_at is not None or now > r.approval_end:  # REQ-APPRV-3, 4
            raise conflict(
                "approval_closed",
                f"The approval window for Round {r.number} closed on {when(r.approval_end)}. "
                "Contact the URECA office to change this match.",
            )
        if m.status != MatchStatus.proposed:
            raise conflict("not_declinable", "Only students the matching proposed for your project can be declined.")
        m.status = MatchStatus.rejected  # REQ-APPRV-6: frees the slot
        m.supervisor_decided_at = now
        # REQ-APPRV-2: the reason stays on the match for admin review. Admins are not notified of each decline: the
        # student is simply unmatched when results publish, and the admins' results notice gives the count.
        m.supervisor_note = (body.note or "").strip() or None
        store.save_match(m)
    return m
