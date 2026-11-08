"""Slice D: placing a student by hand. REQ-ASSIGN-1..3, use cases 1-4 and 1-6.

Reassigning a match, assigning a student to a round, unassigning, and the Assignments page that shows where every
student stands. Each change holds the schedule lock, so a round cannot publish between its checks and its write.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import AdminUser, SettingsDep, StoreDep
from app.errors import conflict, invalid, not_found
from app.models import (
    AccountStatus,
    ApplicationStatus,
    AssignmentStatus,
    AssignmentsView,
    AuditOperation,
    ListingStatus,
    ManualAssignRequest,
    Match,
    MatchDecision,
    MatchStatus,
    NotificationEvent,
    Ok,
    ReassignRequest,
    Role,
    StudentAssignment,
)
from app.routers.matching.rounds import find_round
from app.services import placement, windows
from app.services.audit import audit
from app.services.notify import notify
from app.services.offers import expire_offers, late_offer_deadline, offer_now
from app.services.schedule import schedule_lock

router = APIRouter(tags=["matching"])


@router.post("/admin/matches/{match_id}/reassign", response_model=Match)
def reassign(match_id: str, body: ReassignRequest, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Match:
    with schedule_lock:  # the round must not publish between these checks and the change
        cycle, matches, now = store.cycle, store.matches, settings.now()  # read once, under the lock
        m = next((m for m in matches if m.id == match_id), None)
        if m is None:
            raise not_found("Match")
        if m.status in (MatchStatus.published, MatchStatus.accepted, MatchStatus.declined, MatchStatus.timed_out):
            raise conflict("already_published", "Published matches cannot be reassigned.")
        r = find_round(cycle, m.round_id)
        expire_offers(store, now, cycle, matches)  # a lapsed offer must not hold the slot
        lst = _assignable_listing(store, body.listing_id, placement.held_by_listing(cycle, matches))
        if lst.id == m.listing_id:
            raise invalid("same_project", "The student is already matched to this project. Choose a different one.", "listing_id")
        deadline = late_offer_deadline(cycle, r, now)
        was = m.listing_title
        m.original_listing_id = m.original_listing_id or m.listing_id
        m.listing_id, m.listing_title = lst.id, lst.title
        m.supervisor_id, m.supervisor_name = lst.supervisor_id, lst.supervisor_name
        m.preference_rank = _preference(store, m.student_id, m.round_id, lst.id)  # for the new project, not the old one
        m.status, m.justification = MatchStatus.reassigned, body.justification  # REQ-ASSIGN-1, 2
        store.save_match(m)
        note = f"Moved from {was} to {lst.title}: {body.justification}"  # use case 1-4 AF-S3: both allocations are logged
        audit(store, admin, AuditOperation.manual_reassignment, [m.id], now, note)
        offer_now(store, m, deadline, now)
    return m


def _preference(store, student_id: str, round_id: str, listing_id: str) -> int | None:
    """Where the student ranked this project among their applications in the round, or None if they never applied."""
    own = next((a for a in store.applications_for(student_id=student_id, round_id=round_id) if a.listing_id == listing_id), None)
    return own.preference_rank if own else None


def _assignable_listing(store, listing_id: str, held: dict[str, int]):
    """A published project with a slot nobody holds (use case 1-4: reassignment must never over-allocate). `held` is
    placement.held_by_listing from the caller's reads."""
    lst = store.listing(listing_id)
    if lst is None or lst.status != ListingStatus.published:
        raise invalid("listing_unavailable", "Choose a published project.", "listing_id")
    if placement.open_slots(store, lst, held) == 0:
        raise invalid("no_slot", "That project has no open slot.", "listing_id")
    return lst


@router.post("/admin/rounds/{round_id}/assign", response_model=Match, status_code=201)
def manual_assign(round_id: str, body: ManualAssignRequest, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Match:
    return _assign(store, admin, settings.now(), body, round_id)


def _assign(store, admin, now, body: ManualAssignRequest, round_id: str | None) -> Match:
    """REQ-ASSIGN-1..3: put a student on a project in round `round_id`, or, from the Assignments page (None), in the
    round the API picks (_assignment_round). The cycle and the matches are read once, under the lock."""
    with schedule_lock:  # the round must not publish between these checks and the change
        cycle, matches = store.cycle, store.matches
        if round_id is not None:
            r = find_round(cycle, round_id)
        elif windows.cycle_closed(cycle, now):
            raise conflict("cycle_closed", "No application cycle is open, so students cannot be assigned.")
        elif (r := _assignment_round(cycle, now)) is None:
            raise conflict("no_rounds", "Set up the cycle's rounds before assigning students.")
        expire_offers(store, now, cycle, matches)  # a lapsed offer must not hold the slot or count as the student's project
        student = store.user(body.student_id)
        if student is None or student.role != Role.student:
            raise invalid("unknown_student", "Choose a student account.", "student_id")
        if placement.holds_project(cycle, matches, body.student_id):
            # REQ-ASSIGN-3, in this cycle only: a project from an earlier cycle does not stop a new one
            raise conflict("already_assigned", "This student already has a project. Unassign it first.")
        lst = _assignable_listing(store, body.listing_id, placement.held_by_listing(cycle, matches))
        deadline = late_offer_deadline(cycle, r, now)
        fields = {
            "listing_id": lst.id,
            "listing_title": lst.title,
            "supervisor_id": lst.supervisor_id,
            "supervisor_name": lst.supervisor_name,
            "status": MatchStatus.reassigned,
            "justification": body.justification,
            "preference_rank": _preference(store, body.student_id, r.id, lst.id),
        }
        # match_results keeps one row per student per round, so an earlier rejected or declined row is reused.
        m = next((m for m in matches if m.round_id == r.id and m.student_id == body.student_id), None)
        if m is not None:
            m.original_listing_id = m.original_listing_id or m.listing_id
            for k, v in fields.items():
                setattr(m, k, v)
            m.supervisor_decided_at = m.published_at = m.offer_expires_at = m.student_responded_at = None
            store.save_match(m)
        else:
            m = Match(id=store.next_id("mt"), round_id=r.id, student_id=body.student_id, student_name=student.name, **fields)
            store.add_matches(m)
        audit(store, admin, AuditOperation.manual_reassignment, [m.id], now, body.justification)
        offer_now(store, m, deadline, now)
    return m


@router.post("/admin/matches/{match_id}/unassign", response_model=Ok)
def unassign(match_id: str, body: MatchDecision, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Ok:
    """REQ-ASSIGN-3, use case 1-6 E1: take a student off a project so they can be assigned elsewhere.
    The match is removed; the audit entry keeps who did it, when, and why (REQ-AUDIT-1)."""
    m = next((m for m in store.matches if m.id == match_id), None)
    if m is None:
        raise not_found("Match")
    reason = (body.note or "").strip()
    if len(reason) < 10:
        raise invalid("justification_required", "Give a reason of at least 10 characters.", "note")
    with schedule_lock:  # the round must not publish between these checks and the change
        if m.status in (MatchStatus.rejected, MatchStatus.declined, MatchStatus.timed_out):
            raise conflict("not_assigned", "This match no longer places the student, so there is nothing to unassign.")
        now, was = settings.now(), m.status
        if was == MatchStatus.accepted:  # the student was registered: free the slot
            lst = store.listing(m.listing_id)
            if lst and lst.filled_slots > 0:
                lst.filled_slots -= 1
                store.save_listing(lst)
        if was in (MatchStatus.published, MatchStatus.accepted):  # publish marked the offered application "matched"
            won = [
                a
                for a in store.applications_for(student_id=m.student_id, round_id=m.round_id)
                if a.listing_id == m.listing_id and a.status == ApplicationStatus.matched
            ]
            for a in won:
                a.status = ApplicationStatus.unmatched
            store.save_applications(*won)
        store.remove_match(m)
        # back in the pool
        if was == MatchStatus.accepted and m.student_id not in placement.ruled_out(store.cycle, store.matches):
            sp = store.student(m.student_id)
            if sp and not sp.eligible_for_matching:
                sp.eligible_for_matching = True
                store.save_student(sp)
        note = f"Unassigned from {m.listing_title}: {reason}"
        audit(store, admin, AuditOperation.manual_reassignment, [m.id, m.student_id], now, note)
    if was in (MatchStatus.published, MatchStatus.accepted):
        notify(
            store,
            [m.student_id],
            NotificationEvent.match_rejected,
            "Your project placement was withdrawn",
            f"The URECA office removed your match to {m.listing_title}. Reason: {reason}",
            now,
            "/my-applications",
        )
    notify(
        store,
        [m.supervisor_id],
        NotificationEvent.match_rejected,
        "A match on your project was removed",
        f"The URECA office removed {m.student_name} from {m.listing_title}.",
        now,
        "/approvals",
    )
    return Ok()


# ------------------------------------------------------------------ assignments page (REQ-ASSIGN-1..3, use case 1-6)


def _assignment_round(cycle, now):
    """The round a new assignment joins: the one whose window is open, or the latest that has started (before Round 1,
    the first). The student hears with that round's results, or at once if they are out. None once the cycle has
    closed, or if it has no rounds. Takes the cycle already read, since in Supabase mode every read is a query."""
    return None if windows.cycle_closed(cycle, now) else windows.current_round(cycle, now)


def _standing(
    ms: list[Match], applied: set[int], unrun: set[int], profile, now
) -> tuple[AssignmentStatus, Match | None, str | None]:
    """Where one student stands, from their matches (newest round first) and the rounds they applied in: the match
    that places them, or why they have none. An offer past its deadline counts as lapsed even if the scheduler has not
    timed it out yet (in Supabase mode it runs on the daily cron)."""
    lapsed = {m.id for m in ms if m.status == MatchStatus.published and m.offer_expires_at and now > m.offer_expires_at}
    for status, held in (
        (AssignmentStatus.accepted, (MatchStatus.accepted,)),
        (AssignmentStatus.offered, (MatchStatus.published,)),
        (AssignmentStatus.matched, tuple(s for s in placement.OPEN if s != MatchStatus.published)),
    ):
        if m := next((m for m in ms if m.status in held and m.id not in lapsed), None):
            return status, m, None
    if lapsed or any(m.status == MatchStatus.timed_out for m in ms):
        reason = "Did not answer an offer in time"
    elif any(m.status == MatchStatus.declined for m in ms):
        reason = "Declined an offer"
    elif waiting := sorted(applied & unrun):
        reason = f"Waiting for Round {waiting[0]} matching"
    elif any(m.status == MatchStatus.rejected for m in ms):
        reason = "Rejected by the supervisor"
    elif applied:
        reason = "Not matched"
    elif profile is not None and not profile.profile_complete:
        reason = "Profile not complete"
    else:
        reason = "Has not applied"
    return AssignmentStatus.unassigned, None, reason


@router.get("/admin/assignments", response_model=AssignmentsView)
def assignments(admin: AdminUser, store: StoreDep, settings: SettingsDep) -> AssignmentsView:
    """Every active student and where they stand in the active cycle, and the round a new assignment would join.
    Each table is read once: in Supabase mode every read is a query."""
    now, cycle = settings.now(), store.cycle
    rounds = {r.id: r.number for r in cycle.rounds} if cycle else {}
    unrun = {r.number for r in cycle.rounds if r.executed_at is None} if cycle else set()
    by_student: dict[str, list[Match]] = {}
    for m in sorted((m for m in store.matches if m.round_id in rounds), key=lambda m: rounds[m.round_id], reverse=True):
        by_student.setdefault(m.student_id, []).append(m)
    applied: dict[str, set[int]] = {}
    for a in store.applications:
        if a.round_id in rounds and a.status != ApplicationStatus.withdrawn:
            applied.setdefault(a.student_id, set()).add(rounds[a.round_id])
    profiles = {p.user_id: p for p in store.students}
    students = []
    for u in store.users:
        if u.role != Role.student or u.status != AccountStatus.active:
            continue
        p = profiles.get(u.id)
        status, m, reason = _standing(by_student.get(u.id, []), applied.get(u.id, set()), unrun, p, now)
        students.append(
            StudentAssignment(
                user=u,
                school=p.school if p else None,
                status=status,
                match=m,
                round_number=rounds[m.round_id] if m else None,
                reason=reason,
                eligible=p.eligible_for_matching if p else True,
            )
        )
    r = _assignment_round(cycle, now)
    deadline = windows.offer_deadline(cycle, r, now) if r is not None and r.published_at is not None else None
    return AssignmentsView(round=r, offer_deadline=deadline, students=sorted(students, key=lambda s: s.user.name))


@router.get("/admin/listings/{listing_id}/assignments", response_model=list[StudentAssignment])
def listing_assignments(listing_id: str, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> list[StudentAssignment]:
    """The students one project holds in the active cycle (matched, offered or accepted), for the admin's project page.
    Reads that project's matches and only their students, not the whole roster as GET /admin/assignments does."""
    if store.listing(listing_id) is None:
        raise not_found("Project")
    now, cycle = settings.now(), store.cycle
    rounds = {r.id: r.number for r in cycle.rounds} if cycle else {}
    out = []
    for m in store.matches:
        if m.listing_id != listing_id or m.round_id not in rounds:
            continue
        status, held, _ = _standing([m], set(), set(), None, now)
        if held is None or (u := store.user(m.student_id)) is None:
            continue  # rejected, declined, timed out or lapsed: the match no longer holds the project
        sp = store.student(m.student_id)
        out.append(
            StudentAssignment(
                user=u,
                school=sp.school if sp else None,
                status=status,
                match=m,
                round_number=rounds[m.round_id],
                eligible=sp.eligible_for_matching if sp else True,
            )
        )
    return sorted(out, key=lambda s: s.user.name)


@router.post("/admin/assignments", response_model=Match, status_code=201)
def assign_student(body: ManualAssignRequest, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Match:
    """REQ-ASSIGN-1..3 from the Assignments page. The API picks the round (_assignment_round), so the page cannot put
    a student in the wrong one; the checks are _assign's."""
    return _assign(store, admin, settings.now(), body, None)
