"""Slice D: matching, approval window, review, reassign, publish, offers, audit, scheduler.
REQ-EXEC-1..4, REQ-REV-1, REQ-PUB-1..3, REQ-ASSIGN-1..3, REQ-APPRV-1..4, REQ-OUTCOME-1..4, REQ-AUDIT-1..3.

Nobody clicks "run matching" or "publish". advance() runs before every request and from the daily cron: the first
request after a review window closes runs matching, and the first after an approval window closes publishes.
"""

from __future__ import annotations

import logging
import threading
from typing import Annotated

from fastapi import APIRouter, Header

from app.deps import AdminUser, SettingsDep, StoreDep, StudentUser, SupervisorUser, current_user
from app.errors import conflict, forbidden, invalid, not_found
from app.models import (
    AccountStatus,
    Applicant,
    ApplicantStudent,
    ApplicationStatus,
    AuditEntry,
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
    RoundStatus,
    RoundSummary,
    UserListItem,
)
from app.services import windows
from app.services.audit import SYSTEM, audit
from app.services.matching.algorithm import ListingPrefs, StudentPrefs, match
from app.services.notify import notify
from app.services.windows import when

router = APIRouter(tags=["matching"])
log = logging.getLogger(__name__)

# Requests run on a thread pool. advance() and every handler that changes a round's matches before it is published
# hold this lock, so a match cannot change between a handler's checks and its write, and no step runs twice.
# Re-entrant, so a handler holding it can still call advance().
_schedule_lock = threading.RLock()

# notify() arguments queued by a scheduled step and sent once the lock is released, so other requests do not wait on
# e-mail: (user ids, event, title, message, link).
Outbox = list[tuple[list[str], NotificationEvent, str, str, str]]


def _round(store, round_id: str):
    r = next((r for r in (store.cycle.rounds if store.cycle else []) if r.id == round_id), None)
    if r is None:
        raise not_found("Round")
    return r


# A match in one of these states holds a slot until the student accepts (then it is in filled_slots) or it ends.
HOLDS_SLOT = (MatchStatus.proposed, MatchStatus.approved, MatchStatus.reassigned, MatchStatus.published)


def _open_slots(store, lst) -> int:
    """Slots nobody holds: accepted students are counted in filled_slots, pending matches and open offers hold one each."""
    held = sum(1 for m in store.matches if m.listing_id == lst.id and m.status in HOLDS_SLOT)
    return max(lst.available_slots - lst.filled_slots - held, 0)


def _ruled_out(store, before=None) -> set[str]:
    """Students this cycle's matching must skip: anyone with a match in the cycle that is not a supervisor rejection,
    i.e. placed, holding an offer, or declined or timed out (REQ-OUTCOME-2, 4). With `before` (a round), only
    matches from earlier rounds count, for that round's summary."""
    rounds = {x.id for x in (store.cycle.rounds if store.cycle else []) if before is None or x.number < before.number}
    return {m.student_id for m in store.matches if m.round_id in rounds and m.status != MatchStatus.rejected}


# ------------------------------------------------------------------ matching (run by the scheduler)


def _run_matching(store, r, now, outbox: Outbox) -> None:
    """REQ-EXEC-1..4: run the stable-matching algorithm for round `r` once its review window has closed. The matches
    start the approval window: each is offered when it ends unless the supervisor declines it (REQ-APPRV-4).
    The round is claimed first with one atomic update, so when several servers reach this point only the one that
    wins the claim runs matching. If it fails before the matches are saved, the claim is given back for a retry."""
    if now <= r.review_end or r.executed_at is not None:  # REQ-EXEC-1, REQ-EXEC-2
        return
    if not store.claim_round(r, "executed_at", now):
        return  # another server is running it, or has
    committed: list[bool] = []
    try:
        _match_round(store, r, now, outbox, committed)
    except Exception:
        if not committed:
            store.release_round(r, "executed_at")
        raise
    r.status = RoundStatus.approval_window
    store.save_round(r)


def _match_round(store, r, now, outbox: Outbox, committed: list[bool]) -> None:
    _expire_offers(store, now)  # a lapsed offer frees its slot for this run
    apps = [a for a in store.applications_for(round_id=r.id) if a.status == ApplicationStatus.submitted]
    ruled_out = _ruled_out(store)
    students: dict[str, list[tuple[int, str]]] = {}
    for a in apps:
        if a.student_id in ruled_out:
            continue  # already placed, holding an offer, or declined / timed out this cycle
        sp = store.student(a.student_id)
        if sp and not sp.eligible_for_matching:
            continue  # excluded: declined or timed out earlier (REQ-OUTCOME-2, 4)
        students.setdefault(a.student_id, []).append((a.preference_rank or 99, a.listing_id))
    s_prefs = [StudentPrefs(sid, [lid for _, lid in sorted(v)]) for sid, v in students.items()]
    l_prefs = []
    app_by_id = {a.id: a for a in apps}
    for lst in store.all_listings():
        if lst.status != ListingStatus.published:
            continue
        ranked_students = [app_by_id[aid].student_id for aid in store.ranking(lst.id, r.id) if aid in app_by_id]
        l_prefs.append(ListingPrefs(lst.id, _open_slots(store, lst), ranked_students))
    result = match(s_prefs, l_prefs)
    new = []
    for sid, lid in result.pairs.items():
        lst = store.listing(lid)
        pref = next((a.preference_rank for a in apps if a.student_id == sid and a.listing_id == lid), None)
        new.append(
            Match(
                id=store.next_id("mt"),
                round_id=r.id,
                student_id=sid,
                student_name=store.user(sid).name,
                listing_id=lid,
                listing_title=lst.title,
                supervisor_id=lst.supervisor_id,
                supervisor_name=lst.supervisor_name,
                status=MatchStatus.proposed,
                preference_rank=pref,
            )
        )
    # Every read that can fail is done. The matches go in with one insert; once it succeeds the claim stays.
    store.add_matches(*new)
    committed.append(True)
    audit(store, SYSTEM, AuditOperation.matching_executed, [r.id], now, f"{len(new)} matched")  # REQ-AUDIT-1, 3
    for sup_id in sorted({m.supervisor_id for m in new}):
        n = sum(1 for m in new if m.supervisor_id == sup_id)
        outbox.append(
            (
                [sup_id],
                NotificationEvent.matches_proposed,
                f"Round {r.number}: {'1 student' if n == 1 else f'{n} students'} matched to your projects",
                f"They are offered a place unless you decline them by {when(r.approval_end)}.",
                "/approvals",
            )
        )
    outbox.append(
        (
            _active_admins(store),
            NotificationEvent.matches_proposed,
            f"Round {r.number} matching ran",
            f"{len(new)} students matched. Supervisors can decline until {when(r.approval_end)}, then results publish.",
            f"/rounds/{r.id}/matches",
        )
    )


def _active_admins(store) -> list[str]:
    return [u.id for u in store.users if u.role == Role.admin and u.status == AccountStatus.active]


# ------------------------------------------------------------------ admin


@router.get("/admin/rounds/{round_id}/summary", response_model=RoundSummary)
def summary(round_id: str, admin: AdminUser, store: StoreDep) -> RoundSummary:
    r = _round(store, round_id)
    ms = [m for m in store.matches if m.round_id == round_id]
    applied, placed, excluded = _round_sets(store, r, ms)
    prefs = [m.preference_rank for m in ms if m.preference_rank]
    return RoundSummary(
        round=r,
        matched=len(placed),  # a student a supervisor declined is not matched until they are placed again
        unmatched=len(applied - placed - excluded),
        excluded=len(excluded),
        avg_preference=round(sum(prefs) / len(prefs), 2) if prefs else None,
        declined=sum(1 for m in ms if m.status == MatchStatus.rejected),  # REQ-APPRV-2
    )


def _round_sets(store, r, ms) -> tuple[set[str], set[str], set[str]]:
    """Students who applied in the round, those it placed (any match but a rejection), and those excluded because an
    earlier round placed them or they declined or timed out. Applications already decided by publish still count."""
    applied = {
        a.student_id
        for a in store.applications_for(round_id=r.id)
        if a.status in (ApplicationStatus.submitted, ApplicationStatus.matched, ApplicationStatus.unmatched)
    }
    placed = {m.student_id for m in ms if m.status != MatchStatus.rejected}
    earlier = _ruled_out(store, before=r)
    excluded = {
        sid for sid in applied - placed if sid in earlier or ((sp := store.student(sid)) and not sp.eligible_for_matching)
    }
    return applied, placed, excluded


@router.get("/admin/rounds/{round_id}/unmatched", response_model=list[UserListItem])
def unmatched_students(round_id: str, admin: AdminUser, store: StoreDep) -> list[UserListItem]:
    """REQ-REV-1 "Unmatched": students who applied in this round and hold no match, so an admin can assign them
    (REQ-ASSIGN-1). The same set as the summary's unmatched count."""
    r = _round(store, round_id)
    applied, placed, excluded = _round_sets(store, r, [m for m in store.matches if m.round_id == round_id])
    out = []
    for sid in applied - placed - excluded:
        if (u := store.user(sid)) is not None:
            sp = store.student(sid)
            out.append(UserListItem(user=u, school=sp.school if sp else None))
    return sorted(out, key=lambda x: x.user.name)


@router.get("/admin/rounds/{round_id}/matches", response_model=list[Match])
def matches(round_id: str, admin: AdminUser, store: StoreDep, status: MatchStatus | None = None) -> list[Match]:  # REQ-REV-1
    return [m for m in store.matches if m.round_id == round_id and (status is None or m.status == status)]


@router.post("/admin/matches/{match_id}/reassign", response_model=Match)
def reassign(match_id: str, body: ReassignRequest, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Match:
    m = next((m for m in store.matches if m.id == match_id), None)
    if m is None:
        raise not_found("Match")
    with _schedule_lock:  # the round must not publish between these checks and the change
        if m.status in (MatchStatus.published, MatchStatus.accepted, MatchStatus.declined, MatchStatus.timed_out):
            raise conflict("already_published", "Published matches cannot be reassigned.")
        r, now = _round(store, m.round_id), settings.now()
        _expire_offers(store, now)  # a lapsed offer must not hold the slot
        lst = _assignable_listing(store, body.listing_id)
        if lst.id == m.listing_id:
            raise invalid("same_project", "The student is already matched to this project. Choose a different one.", "listing_id")
        deadline = _late_offer_deadline(store, r, now)
        m.original_listing_id = m.original_listing_id or m.listing_id
        m.listing_id, m.listing_title = lst.id, lst.title
        m.supervisor_id, m.supervisor_name = lst.supervisor_id, lst.supervisor_name
        m.preference_rank = _preference(store, m.student_id, m.round_id, lst.id)  # for the new project, not the old one
        m.status, m.justification = MatchStatus.reassigned, body.justification  # REQ-ASSIGN-1, 2
        store.save_match(m)
        audit(store, admin, AuditOperation.manual_reassignment, [m.id], now, body.justification)
        _offer_now(store, m, deadline, now)
    return m


def _late_offer_deadline(store, r, now):
    """For an admin assignment in a round that is already published: there is no later publish step, so the match
    becomes an offer straight away. Returns its deadline, or None if the round is not published yet."""
    if r.published_at is None:
        return None
    deadline = windows.offer_deadline(store.cycle, r, now)  # REQ-OUTCOME-3
    if deadline is None:
        raise conflict("cycle_closed", "The cycle has closed, so no new offers can be made.")
    return deadline


def _offer_now(store, m: Match, deadline, now) -> None:
    if deadline is None:
        return  # published with the rest of the round
    m.status, m.published_at, m.offer_expires_at = MatchStatus.published, now, deadline
    store.save_match(m)
    notify(
        store,
        [m.student_id],
        NotificationEvent.offer_received,
        "You have a match offer",
        f"Respond by {when(deadline)}.",
        now,
        "/my-applications",
    )


def _expire_offers(store, now) -> None:
    """REQ-OUTCOME-3, 4: offers past their deadline time out. Run by the cron and before anything that counts slots."""
    for m in store.matches:
        if m.status == MatchStatus.published and m.offer_expires_at and now > m.offer_expires_at:
            m.status = MatchStatus.timed_out
            store.save_match(m)
            _mark_ineligible(store, m.student_id)


def _preference(store, student_id: str, round_id: str, listing_id: str) -> int | None:
    """Where the student ranked this project among their applications in the round, or None if they never applied."""
    own = next((a for a in store.applications_for(student_id=student_id, round_id=round_id) if a.listing_id == listing_id), None)
    return own.preference_rank if own else None


def _assignable_listing(store, listing_id: str):
    """A published project with a slot nobody holds (use case 1-4: reassignment must never over-allocate)."""
    lst = store.listing(listing_id)
    if lst is None or lst.status != ListingStatus.published:
        raise invalid("listing_unavailable", "Choose a published project.", "listing_id")
    if _open_slots(store, lst) == 0:
        raise invalid("no_slot", "That project has no open slot.", "listing_id")
    return lst


@router.post("/admin/rounds/{round_id}/assign", response_model=Match, status_code=201)
def manual_assign(round_id: str, body: ManualAssignRequest, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Match:
    r, now = _round(store, round_id), settings.now()
    with _schedule_lock:  # the round must not publish between these checks and the change
        _expire_offers(store, now)  # a lapsed offer must not hold the slot or count as the student's project
        student = store.user(body.student_id)
        if student is None or student.role != Role.student:
            raise invalid("unknown_student", "Choose a student account.", "student_id")
        if any(
            m.student_id == body.student_id
            and m.status not in (MatchStatus.rejected, MatchStatus.declined, MatchStatus.timed_out)
            for m in store.matches
        ):  # REQ-ASSIGN-3
            raise conflict("already_assigned", "This student already has a project. Unassign it first.")
        lst = _assignable_listing(store, body.listing_id)
        deadline = _late_offer_deadline(store, r, now)
        placement = {
            "listing_id": lst.id,
            "listing_title": lst.title,
            "supervisor_id": lst.supervisor_id,
            "supervisor_name": lst.supervisor_name,
            "status": MatchStatus.reassigned,
            "justification": body.justification,
            "preference_rank": _preference(store, body.student_id, round_id, lst.id),
        }
        # match_results keeps one row per student per round, so an earlier rejected or declined row is reused.
        m = next((m for m in store.matches if m.round_id == round_id and m.student_id == body.student_id), None)
        if m is not None:
            m.original_listing_id = m.original_listing_id or m.listing_id
            for k, v in placement.items():
                setattr(m, k, v)
            m.supervisor_decided_at = m.published_at = m.offer_expires_at = m.student_responded_at = None
            store.save_match(m)
        else:
            m = Match(
                id=store.next_id("mt"), round_id=round_id, student_id=body.student_id, student_name=student.name, **placement
            )
            store.add_matches(m)
        audit(store, admin, AuditOperation.manual_reassignment, [m.id], now, body.justification)
        _offer_now(store, m, deadline, now)
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
    with _schedule_lock:  # the round must not publish between these checks and the change
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
        if was == MatchStatus.accepted and m.student_id not in _ruled_out(store):  # back in the pool
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


# ------------------------------------------------------------------ publishing (run by the scheduler)


def _publish(store, r, now, outbox: Outbox) -> None:
    """REQ-PUB-1..3: when the approval window closes, every match nobody declined becomes an offer (REQ-APPRV-4).
    Runs once per round, and only after matching has run. The writes that can fail come first, while nothing in
    memory has changed, so if one fails the next request starts again cleanly: the rollover copies (which skip copies
    that already exist), then the offers and the applications' outcomes together. Like matching, the round is claimed
    first with one atomic update, and the claim is given back if the step fails before the offers are saved."""
    if r.executed_at is None or r.published_at is not None or now <= r.approval_end:  # REQ-PUB-1, REQ-PUB-3
        return
    expires = windows.offer_deadline(store.cycle, r, now) if store.cycle else None  # REQ-OUTCOME-3
    if expires is None:
        return  # the cycle has closed: an offer would already be expired, so none is made and nothing is published
    if not store.claim_round(r, "published_at", now):
        return  # another server is publishing it, or has
    committed: list[bool] = []
    try:
        _publish_round(store, r, now, expires, outbox, committed)
    except Exception:
        if not committed:
            store.release_round(r, "published_at")
        raise
    r.status = RoundStatus.published
    store.save_round(r)


def _publish_round(store, r, now, expires, outbox: Outbox, committed: list[bool]) -> None:
    ms = [m for m in store.matches if m.round_id == r.id]
    nxt = next((x for x in store.cycle.rounds if x.number == r.number + 1), None)
    offers = [m for m in ms if m.status in (MatchStatus.proposed, MatchStatus.approved, MatchStatus.reassigned)]
    offered = {m.student_id: m.listing_id for m in offers}  # accepted by default; student id -> listing id
    # Every application still under review in this round gets its outcome, offer or not, so none carries
    # into the next round as if it were still live.
    apps = [a for a in store.applications_for(round_id=r.id) if a.status == ApplicationStatus.submitted]
    unmatched = sorted({a.student_id for a in apps if a.student_id not in offered})
    # REQ-PUB-2 "all affected users": students who applied and got no offer, and supervisors with matches.
    # Only students who may still take part are told they can apply again (REQ-OUTCOME-2, 4).
    ruled_out = _ruled_out(store)
    can_retry = [s for s in unmatched if s not in ruled_out and ((sp := store.student(s)) is None or sp.eligible_for_matching)]
    carried = _roll_over(store, apps, can_retry, nxt, now) if nxt and store.cycle.rollover_unmatched else set()
    for a in apps:
        a.status = ApplicationStatus.matched if offered.get(a.student_id) == a.listing_id else ApplicationStatus.unmatched
    # One operation: an application is only "matched" if its match row is saved with it (REQ-PUB-1).
    published = [
        m.model_copy(update={"status": MatchStatus.published, "published_at": now, "offer_expires_at": expires}) for m in offers
    ]
    store.publish_outcomes(published, apps)
    committed.append(True)
    audit(store, SYSTEM, AuditOperation.results_published, [r.id], now, f"{len(offers)} offers")  # REQ-AUDIT-3
    outbox.append(
        (
            [m.student_id for m in offers],
            NotificationEvent.offer_received,
            "You have a match offer",
            f"Respond by {when(expires)}. You cannot apply to other projects while this offer is open.",
            "/my-applications",
        )
    )  # REQ-PUB-2, REQ-APPLY-3
    later = f"Round {nxt.number}" if nxt else ""
    for group, next_step in (
        (
            [s for s in can_retry if s in carried],
            f" Your applications carry over to {later}, where you can reorder or withdraw them.",
        ),
        ([s for s in can_retry if s not in carried], f" You can apply again in {later}." if nxt else ""),
        ([s for s in unmatched if s not in can_retry], ""),
    ):
        outbox.append(
            (
                group,
                NotificationEvent.results_published,
                f"Round {r.number} results are out",
                f"You were not matched to a project in Round {r.number}.{next_step}",
                "/my-applications",
            )
        )
    for sup_id in sorted({m.supervisor_id for m in ms}):
        n_offered = sum(1 for m in offers if m.supervisor_id == sup_id)
        students = "1 student on your listings was" if n_offered == 1 else f"{n_offered} students on your listings were"
        outbox.append(
            (
                [sup_id],
                NotificationEvent.results_published,
                f"Round {r.number} results are out",
                f"{students} offered a place. They have until {when(expires)} to respond."
                if n_offered
                else f"No students on your listings were offered a place in Round {r.number}.",
                "/approvals",
            )
        )
    # REQ-APPRV-2: admins hear about declines once, here, rather than one notice per decline
    declined = sum(1 for m in ms if m.status == MatchStatus.rejected)
    sent = "1 offer sent." if len(offers) == 1 else f"{len(offers)} offers sent."
    unplaced = (
        ""
        if not declined
        else " 1 student declined by a supervisor is now unmatched."
        if declined == 1
        else f" {declined} students declined by supervisors are now unmatched."
    )
    outbox.append(
        (
            _active_admins(store),
            NotificationEvent.results_published,
            f"Round {r.number} results published",
            f"{sent}{unplaced} Students have until {when(expires)} to respond.",
            f"/rounds/{r.id}/matches",
        )
    )


def _roll_over(store, apps, students: list[str], nxt, now) -> set[str]:
    """REQ-EXEC-3: copy each unmatched, eligible student's applications into the next round in their order, skipping
    projects that are no longer published, that are fully allocated (as apply() refuses them), or that the student
    already applied to there. Open projects and slots freed by declines carry over on their own.
    Returns the students whose applications were carried."""
    already = {
        (a.student_id, a.listing_id): a
        for a in store.applications_for(round_id=nxt.id)
        if a.status == ApplicationStatus.submitted
    }
    copies = []
    for sid in students:
        rank = sum(1 for s, _ in already if s == sid)
        for a in sorted((a for a in apps if a.student_id == sid), key=lambda a: a.preference_rank or 99):
            lst = store.listing(a.listing_id)
            full = lst is not None and lst.filled_slots >= lst.available_slots
            if lst is None or lst.status != ListingStatus.published or full or (sid, a.listing_id) in already:
                continue
            rank += 1
            copies.append(
                a.model_copy(
                    update={
                        "id": store.next_id("app"),
                        "round_id": nxt.id,
                        "status": ApplicationStatus.submitted,
                        "preference_rank": rank,
                        "submitted_at": now,
                    }
                )
            )
    store.save_applications(*copies)
    return {a.student_id for a in copies}


@router.get("/admin/audit", response_model=list[AuditEntry])
def audit_log(admin: AdminUser, store: StoreDep, operation: AuditOperation | None = None) -> list[AuditEntry]:
    """REQ-AUDIT-1, newest first. Entries are never changed (REQ-AUDIT-2); readable names for the records they
    affect are added to the copies sent out."""
    entries = sorted(
        (e for e in store.audit if operation is None or e.operation == operation), key=lambda e: e.timestamp, reverse=True
    )
    return [e.model_copy(update={"affected_labels": [_describe(store, rid) for rid in e.affected_records]}) for e in entries]


def _describe(store, record_id: str) -> str:
    """What an admin reads for a record id: "student → project" for a match, a round, a cycle, a person or a project."""
    if (m := next((m for m in store.matches if m.id == record_id), None)) is not None:
        return f"{m.student_name} → {m.listing_title}"
    for c in store.cycles:
        if c.id == record_id:
            return c.academic_year
        if (r := next((r for r in c.rounds if r.id == record_id), None)) is not None:
            return f"Round {r.number}, {c.academic_year}"
    if (u := store.user(record_id)) is not None:
        return u.name
    if (lst := store.listing(record_id)) is not None:
        return lst.title
    return record_id  # removed since (an unassigned match): the note says what it was


# ------------------------------------------------------------------ supervisor


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
            id=u.id,
            name=u.name,
            school=sp.school,
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
    r = _round(store, m.round_id)
    if r.executed_at is None:  # REQ-APPRV-1
        raise conflict("not_executed", "Matching has not run for this round yet.")
    now = settings.now()
    with _schedule_lock:  # the round must not publish between these checks and the change
        if r.published_at is not None or now > r.approval_end:  # REQ-APPRV-3, 4
            raise conflict(
                "approval_closed",
                f"The approval window for Round {r.number} closed on {when(r.approval_end)}. "
                "Contact the URECA office to change this match.",
            )
        if m.status != MatchStatus.proposed:
            raise conflict("not_declinable", "Only students the matching proposed for your project can be declined.")
        m.status = MatchStatus.rejected  # REQ-APPRV-2: frees the slot
        m.supervisor_decided_at = now
        # REQ-APPRV-2: the reason stays on the match for admin review. Admins are not notified of each decline: the
        # student is simply unmatched when results publish, and the admins' results notice gives the count.
        m.supervisor_note = (body.note or "").strip() or None
        store.save_match(m)
    return m


# ------------------------------------------------------------------ student


@router.get("/me/match", response_model=Match | None)
def my_match(user: StudentUser, store: StoreDep) -> Match | None:
    visible = [
        m
        for m in store.matches
        if m.student_id == user.id
        and m.status in (MatchStatus.published, MatchStatus.accepted, MatchStatus.declined, MatchStatus.timed_out)
    ]
    return visible[-1] if visible else None


@router.post("/me/match/accept", response_model=Match)
def accept_offer(user: StudentUser, store: StoreDep, settings: SettingsDep) -> Match:
    m = my_match(user, store)
    if m is None or m.status != MatchStatus.published:
        raise conflict("no_offer", "There is no open offer to respond to.")
    m.status, m.student_responded_at = MatchStatus.accepted, settings.now()  # REQ-OUTCOME-1
    store.save_match(m)
    # In Supabase mode the store returns copies, so every change below is saved explicitly.
    lst = store.listing(m.listing_id)
    if lst:
        lst.filled_slots += 1
        store.save_listing(lst)
    _mark_ineligible(store, user.id)  # placed: exclude from later rounds (REQ-OUTCOME-1)
    # Use case 2-5: accepting closes the student's other open applications.
    others = [a for a in store.applications_for(student_id=user.id) if a.status == ApplicationStatus.submitted]
    for a in others:
        a.status, a.preference_rank = ApplicationStatus.withdrawn, None
    store.save_applications(*others)
    return m


def _mark_ineligible(store, student_id: str) -> None:
    sp = store.student(student_id)
    if sp and sp.eligible_for_matching:
        sp.eligible_for_matching = False
        store.save_student(sp)


@router.post("/me/match/decline", response_model=Match)
def decline_offer(user: StudentUser, store: StoreDep, settings: SettingsDep) -> Match:
    m = my_match(user, store)
    if m is None or m.status != MatchStatus.published:
        raise conflict("no_offer", "There is no open offer to respond to.")
    m.status, m.student_responded_at = MatchStatus.declined, settings.now()  # REQ-OUTCOME-2
    store.save_match(m)
    _mark_ineligible(store, user.id)
    return m


# ------------------------------------------------------------------ scheduler


def _status_for(r, now) -> RoundStatus | None:
    """The status a round that is not published yet should show at `now`, or None to leave it as it is."""
    if r.application_start <= now <= r.application_end:
        return RoundStatus.application_window
    if r.review_start <= now <= r.review_end:
        return RoundStatus.review_window
    if r.executed_at is not None:
        return RoundStatus.approval_window
    return None


def _due(store, now) -> bool:
    """Whether advance() has anything to change: a review or approval window has closed, a round's status is out of
    date, or an offer has lapsed. Checked without the lock, so a request with nothing to do never waits on it."""
    for r in store.cycle.rounds if store.cycle else []:
        if r.published_at is not None:
            continue
        if now > r.review_end and (r.executed_at is None or now > r.approval_end):
            return True  # matching or publishing is due
        if (status := _status_for(r, now)) is not None and status != r.status:
            return True
    return any(m.status == MatchStatus.published and m.offer_expires_at and now > m.offer_expires_at for m in store.matches)


def advance(store, now) -> None:
    """Bring the active cycle up to `now`, round by round in order (REQ-EXEC-4, REQ-PUB-3, REQ-OUTCOME-3):
    run matching once a review window has closed, publish once an approval window has closed, keep round statuses
    current, and time out unanswered offers. Each step runs once, so calling this again changes nothing.
    Notifications go out after the lock is released, even if a later step fails, since the earlier steps are done."""
    outbox: Outbox = []
    try:
        if windows.cycle_closed(store.cycle, now):
            return  # nothing is matched, published or expired for a cycle that has closed
        if not _due(store, now):
            return
        with _schedule_lock:
            for r in sorted(store.cycle.rounds if store.cycle else [], key=lambda x: x.number):
                if r.published_at is not None:
                    continue
                _run_matching(store, r, now, outbox)
                _publish(store, r, now, outbox)
                if r.published_at is None and (status := _status_for(r, now)) is not None and status != r.status:
                    r.status = status
                    store.save_round(r)
            _expire_offers(store, now)
    finally:
        for user_ids, event, title, message, link in outbox:
            notify(store, user_ids, event, title, message, now, link)


def keep_schedule(store: StoreDep, settings: SettingsDep) -> None:
    """Runs before every request (main.py), so the first request after a window closes acts on it. A failing step
    must not fail an unrelated request: it is logged, and the next request tries it again.
    Off by default in Supabase mode (SCHEDULER_ON_REQUEST), where /internal/tick drives the schedule and the round
    claim keeps each step to one run."""
    if not settings.runs_scheduler_on_request():
        return
    try:
        advance(store, settings.now())
    except Exception:
        log.exception("A scheduled step failed; the next request tries it again")


@router.get("/internal/tick", response_model=Ok, include_in_schema=False)  # Vercel Cron only sends GET
@router.post("/internal/tick", response_model=Ok)
def tick(store: StoreDep, settings: SettingsDep, authorization: Annotated[str | None, Header()] = None) -> Ok:
    """Called daily by Vercel Cron and whenever an admin opens Matching Rounds, so the schedule also moves on a
    quiet day. Unlike keep_schedule, a failing step fails this call, so the cron log shows it."""
    # Cron sends `Bearer <CRON_SECRET>`. The admin page sends the admin's own session token.
    if settings.api_mode != "mock" and authorization != f"Bearer {settings.cron_secret}":
        if current_user(store, settings, authorization=authorization).role != Role.admin:  # 401 if no valid session
            raise forbidden("Only the scheduler or an admin can advance rounds.")
    advance(store, settings.now())
    return Ok()
