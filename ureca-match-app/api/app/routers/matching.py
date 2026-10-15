"""Slice D: execute, review, reassign, publish, approvals, offers, audit, cron.
REQ-EXEC-1..3, REQ-REV-1, REQ-PUB-1..2, REQ-ASSIGN-1..3, REQ-APPRV-1..3, REQ-OUTCOME-1..4, REQ-AUDIT-1..2.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header

from app.deps import AdminUser, SettingsDep, StoreDep, StudentUser, SupervisorUser, current_user
from app.errors import conflict, forbidden, invalid, not_found
from app.models import (
    AccountStatus,
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
)
from app.services.audit import audit
from app.services.matching.algorithm import ListingPrefs, StudentPrefs, match
from app.services.notify import notify

router = APIRouter(tags=["matching"])


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


# ------------------------------------------------------------------ admin


@router.post("/admin/rounds/{round_id}/execute", response_model=RoundSummary)
def execute(round_id: str, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> RoundSummary:
    r = _round(store, round_id)
    now = settings.now()
    if now <= r.review_end:  # REQ-EXEC-1
        raise conflict("review_open", f"Matching can run after the review window closes on {r.review_end:%d %b}.")
    if r.executed_at is not None:  # REQ-EXEC-2
        raise conflict("already_executed", "Matching has already been run for this round.")
    _expire_offers(store, now)  # do not wait for the daily cron: a lapsed offer frees its slot for this run
    apps = [a for a in store.applications_for(round_id=round_id) if a.status == ApplicationStatus.submitted]
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
        ranked_students = [app_by_id[aid].student_id for aid in store.ranking(lst.id, round_id) if aid in app_by_id]
        l_prefs.append(ListingPrefs(lst.id, _open_slots(store, lst), ranked_students))
    result = match(s_prefs, l_prefs)
    for sid, lid in result.pairs.items():
        lst = store.listing(lid)
        pref = next((a.preference_rank for a in apps if a.student_id == sid and a.listing_id == lid), None)
        store.matches.append(
            Match(
                id=store.next_id("mt"),
                round_id=round_id,
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
    r.executed_at, r.status = now, RoundStatus.awaiting_publication
    audit(store, admin, AuditOperation.matching_executed, [round_id], now, f"{len(result.pairs)} matched")  # REQ-AUDIT-1
    notify(
        store,
        sorted({m.supervisor_id for m in store.matches if m.round_id == round_id and m.status == MatchStatus.proposed}),
        NotificationEvent.matches_proposed,
        "Proposed matches ready for approval",
        f"Round {r.number} matches await your decision.",
        now,
        "/approvals",
    )
    return summary(round_id, admin, store)


@router.get("/admin/rounds/{round_id}/summary", response_model=RoundSummary)
def summary(round_id: str, admin: AdminUser, store: StoreDep) -> RoundSummary:
    r = _round(store, round_id)
    ms = [m for m in store.matches if m.round_id == round_id]
    # Applications already decided by publish count too, so the numbers stay the same after results are out.
    applied = {
        a.student_id
        for a in store.applications_for(round_id=round_id)
        if a.status in (ApplicationStatus.submitted, ApplicationStatus.matched, ApplicationStatus.unmatched)
    }
    placed = {m.student_id for m in ms if m.status != MatchStatus.rejected}
    earlier = _ruled_out(store, before=r)
    excluded_ids = {
        sid for sid in applied - placed if sid in earlier or ((sp := store.student(sid)) and not sp.eligible_for_matching)
    }
    prefs = [m.preference_rank for m in ms if m.preference_rank]
    decided = [m for m in ms if m.status != MatchStatus.proposed]  # a rejection is a decision too (REQ-APPRV-2)
    return RoundSummary(
        round=r,
        matched=len(ms),
        unmatched=len(applied - placed - excluded_ids),
        excluded=len(excluded_ids),
        avg_preference=round(sum(prefs) / len(prefs), 2) if prefs else None,
        approvals_done=len(decided),
        approvals_total=len(ms),
    )


@router.get("/admin/rounds/{round_id}/matches", response_model=list[Match])
def matches(round_id: str, admin: AdminUser, store: StoreDep, status: MatchStatus | None = None) -> list[Match]:  # REQ-REV-1
    return [m for m in store.matches if m.round_id == round_id and (status is None or m.status == status)]


@router.post("/admin/matches/{match_id}/reassign", response_model=Match)
def reassign(match_id: str, body: ReassignRequest, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Match:
    m = next((m for m in store.matches if m.id == match_id), None)
    if m is None:
        raise not_found("Match")
    if m.status in (MatchStatus.published, MatchStatus.accepted, MatchStatus.declined, MatchStatus.timed_out):
        raise conflict("already_published", "Published matches cannot be reassigned.")
    r, now = _round(store, m.round_id), settings.now()
    _expire_offers(store, now)  # a lapsed offer must not hold the slot
    lst = _assignable_listing(store, body.listing_id)
    if lst.id == m.listing_id:
        raise invalid("same_project", "The student is already matched to this project. Choose a different one.", "listing_id")
    deadline = _late_offer_deadline(store, r, now)
    m.original_listing_id = m.original_listing_id or m.listing_id
    m.listing_id, m.listing_title, m.supervisor_id, m.supervisor_name = lst.id, lst.title, lst.supervisor_id, lst.supervisor_name
    m.status, m.justification = MatchStatus.reassigned, body.justification  # REQ-ASSIGN-1, 2
    audit(store, admin, AuditOperation.manual_reassignment, [m.id], now, body.justification)
    _offer_now(store, m, deadline, now)
    return m


def _offer_deadline(store, r):
    """REQ-OUTCOME-3: an offer lapses when the next round's review window starts, or when the cycle closes."""
    nxt = next((x for x in store.cycle.rounds if x.number == r.number + 1), None)
    return nxt.review_start if nxt else store.cycle.closing_date


def _late_offer_deadline(store, r, now):
    """For an admin assignment in a round that is already published: there is no later publish step, so the match
    becomes an offer straight away. Returns its deadline, or None if the round is not published yet."""
    if r.published_at is None:
        return None
    for deadline in (_offer_deadline(store, r), store.cycle.closing_date):
        if deadline > now:
            return deadline
    raise conflict("cycle_closed", "The cycle has closed, so no new offers can be made.")


def _offer_now(store, m: Match, deadline, now) -> None:
    if deadline is None:
        return  # published with the rest of the round
    m.status, m.published_at, m.offer_expires_at = MatchStatus.published, now, deadline
    notify(
        store,
        [m.student_id],
        NotificationEvent.offer_received,
        "You have a match offer",
        f"Respond by {deadline:%d %b}.",
        now,
        "/my-applications",
    )


def _expire_offers(store, now) -> None:
    """REQ-OUTCOME-3, 4: offers past their deadline time out. Run by the cron and before anything that counts slots."""
    for m in store.matches:
        if m.status == MatchStatus.published and m.offer_expires_at and now > m.offer_expires_at:
            m.status = MatchStatus.timed_out
            _mark_ineligible(store, m.student_id)


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
    _expire_offers(store, now)  # a lapsed offer must not hold the slot or count as the student's project
    student = store.user(body.student_id)
    if student is None or student.role != Role.student:
        raise invalid("unknown_student", "Choose a student account.", "student_id")
    if any(
        m.student_id == body.student_id and m.status not in (MatchStatus.rejected, MatchStatus.declined, MatchStatus.timed_out)
        for m in store.matches
    ):  # REQ-ASSIGN-3
        raise conflict("already_assigned", "This student already has a project. Unassign it first.")
    lst = _assignable_listing(store, body.listing_id)
    deadline = _late_offer_deadline(store, r, now)
    m = Match(
        id=store.next_id("mt"),
        round_id=round_id,
        student_id=body.student_id,
        student_name=student.name,
        listing_id=lst.id,
        listing_title=lst.title,
        supervisor_id=lst.supervisor_id,
        supervisor_name=lst.supervisor_name,
        status=MatchStatus.reassigned,
        justification=body.justification,
    )
    store.matches.append(m)
    audit(store, admin, AuditOperation.manual_reassignment, [m.id], now, body.justification)
    _offer_now(store, m, deadline, now)
    return m


@router.post("/admin/rounds/{round_id}/publish", response_model=RoundSummary)
def publish(round_id: str, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> RoundSummary:
    r = _round(store, round_id)
    if r.executed_at is None:  # REQ-PUB-1: there is nothing approved to publish before matching runs
        raise conflict("not_executed", f"Run matching for Round {r.number} before publishing its results.")
    if r.published_at is not None:  # publish once, or every student and supervisor is notified again
        raise conflict("already_published", f"Round {r.number} results are already published.")
    ms = [m for m in store.matches if m.round_id == round_id]
    if any(m.status == MatchStatus.proposed for m in ms):  # REQ-PUB-1
        raise conflict("approvals_pending", "Some matches are still awaiting supervisor approval.")
    now = settings.now()
    nxt = next((x for x in store.cycle.rounds if x.number == r.number + 1), None)
    expires = _offer_deadline(store, r)  # REQ-OUTCOME-3
    offered: dict[str, str] = {}  # student id -> listing id
    for m in ms:
        if m.status in (MatchStatus.approved, MatchStatus.reassigned):
            m.status, m.published_at, m.offer_expires_at = MatchStatus.published, now, expires
            offered[m.student_id] = m.listing_id
    # Every application still under review in this round gets its outcome, offer or not, so none carries
    # into the next round as if it were still live.
    apps = [a for a in store.applications_for(round_id=round_id) if a.status == ApplicationStatus.submitted]
    unmatched = sorted({a.student_id for a in apps if a.student_id not in offered})
    for a in apps:
        a.status = ApplicationStatus.matched if offered.get(a.student_id) == a.listing_id else ApplicationStatus.unmatched
    store.save_applications(*apps)
    r.published_at, r.status = now, RoundStatus.published
    audit(store, admin, AuditOperation.results_published, [round_id], now)
    notify(
        store,
        [m.student_id for m in ms if m.status == MatchStatus.published],
        NotificationEvent.offer_received,
        "You have a match offer",
        f"Respond by {expires:%d %b}.",
        now,
        "/my-applications",
    )  # REQ-PUB-2
    # REQ-PUB-2 "all affected users": students who applied and got no offer, and supervisors with matches.
    # Only students who may still take part are told they can apply again (REQ-OUTCOME-2, 4).
    ruled_out = _ruled_out(store)
    can_retry = [s for s in unmatched if s not in ruled_out and ((sp := store.student(s)) is None or sp.eligible_for_matching)]
    for group, next_step in (
        (can_retry, f" You can apply again in Round {nxt.number}." if nxt else ""),
        ([s for s in unmatched if s not in can_retry], ""),
    ):
        notify(
            store,
            group,
            NotificationEvent.results_published,
            f"Round {r.number} results are out",
            f"You were not matched to a project in Round {r.number}.{next_step}",
            now,
            "/my-applications",
        )
    for sup_id in sorted({m.supervisor_id for m in ms}):
        n_offered = sum(1 for m in ms if m.supervisor_id == sup_id and m.status == MatchStatus.published)
        students = "1 student on your listings was" if n_offered == 1 else f"{n_offered} students on your listings were"
        notify(
            store,
            [sup_id],
            NotificationEvent.results_published,
            f"Round {r.number} results are out",
            f"{students} offered a place. They have until {expires:%d %b} to respond."
            if n_offered
            else f"No students on your listings were offered a place in Round {r.number}.",
            now,
            "/approvals",
        )
    return summary(round_id, admin, store)


@router.get("/admin/audit", response_model=list[AuditEntry])
def audit_log(admin: AdminUser, store: StoreDep, operation: AuditOperation | None = None) -> list[AuditEntry]:
    return sorted(
        (e for e in store.audit if operation is None or e.operation == operation), key=lambda e: e.timestamp, reverse=True
    )


# ------------------------------------------------------------------ supervisor


@router.get("/supervisor/matches", response_model=list[Match])
def supervisor_matches(user: SupervisorUser, store: StoreDep) -> list[Match]:
    return [m for m in store.matches if m.supervisor_id == user.id]


def _decide(match_id: str, user, store, settings, approve: bool, note: str | None) -> Match:
    m = next((m for m in store.matches if m.id == match_id), None)
    if m is None:
        raise not_found("Match")
    if m.supervisor_id != user.id:
        raise forbidden()
    r = _round(store, m.round_id)
    if r.executed_at is None:  # REQ-APPRV-1
        raise conflict("not_executed", "Matching has not been run for this round yet.")
    if r.published_at is not None:  # REQ-APPRV-3
        raise conflict("already_published", "Results are published; this match can no longer be changed.")
    now = settings.now()
    m.status = MatchStatus.approved if approve else MatchStatus.rejected  # REQ-APPRV-2: rejection frees the slot
    m.supervisor_decided_at = now
    m.supervisor_note = (note or "").strip() or None
    if not approve:  # REQ-APPRV-2: recorded for admin review, and admins are told so they can reassign
        reason = f' Reason: "{m.supervisor_note}"' if m.supervisor_note else ""
        notify(
            store,
            [u.id for u in store.users if u.role == Role.admin and u.status == AccountStatus.active],
            NotificationEvent.match_rejected,
            "A supervisor rejected a match",
            f"{user.name} rejected {m.student_name} for {m.listing_title}.{reason}",
            now,
            f"/rounds/{m.round_id}/matches",
        )
    return m


@router.post("/supervisor/matches/{match_id}/approve", response_model=Match)
def approve(match_id: str, body: MatchDecision, user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> Match:
    return _decide(match_id, user, store, settings, True, body.note)


@router.post("/supervisor/matches/{match_id}/reject", response_model=Match)
def reject(match_id: str, body: MatchDecision, user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> Match:
    return _decide(match_id, user, store, settings, False, body.note)


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
    _mark_ineligible(store, user.id)
    return m


# ------------------------------------------------------------------ cron


@router.get("/internal/tick", response_model=Ok, include_in_schema=False)  # Vercel Cron only sends GET
@router.post("/internal/tick", response_model=Ok)
def tick(store: StoreDep, settings: SettingsDep, authorization: Annotated[str | None, Header()] = None) -> Ok:
    """Called daily by Vercel Cron and whenever an admin opens Matching Rounds.
    Advances round statuses and times out unanswered offers (REQ-OUTCOME-3, 4)."""
    # Cron sends `Bearer <CRON_SECRET>`. The admin page sends the admin's own session token.
    if settings.api_mode != "mock" and authorization != f"Bearer {settings.cron_secret}":
        if current_user(store, settings, authorization=authorization).role != Role.admin:  # 401 if no valid session
            raise forbidden("Only the scheduler or an admin can advance rounds.")
    now = settings.now()
    if store.cycle:
        for r in store.cycle.rounds:
            if r.published_at:
                continue
            if r.application_start <= now <= r.application_end:
                r.status = RoundStatus.application_window
            elif r.review_start <= now <= r.review_end:
                r.status = RoundStatus.review_window
    _expire_offers(store, now)
    return Ok()
