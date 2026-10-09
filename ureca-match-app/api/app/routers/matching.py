"""Slice D: execute, review, reassign, publish, approvals, offers, audit, cron.
REQ-EXEC-1..3, REQ-REV-1, REQ-PUB-1..2, REQ-ASSIGN-1..3, REQ-APPRV-1..3, REQ-OUTCOME-1..4, REQ-AUDIT-1..2.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header

from app.deps import AdminUser, SettingsDep, StoreDep, StudentUser, SupervisorUser
from app.errors import ApiError, conflict, forbidden, invalid, not_found
from app.models import (
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


# ------------------------------------------------------------------ admin


@router.post("/admin/rounds/{round_id}/execute", response_model=RoundSummary)
def execute(round_id: str, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> RoundSummary:
    r = _round(store, round_id)
    now = settings.now()
    if now <= r.review_end:  # REQ-EXEC-1
        raise conflict("review_open", f"Matching can run after the review window closes on {r.review_end:%d %b}.")
    if r.executed_at is not None:  # REQ-EXEC-2
        raise conflict("already_executed", "Matching has already been run for this round.")
    apps = [a for a in store.applications if a.round_id == round_id and a.status == ApplicationStatus.submitted]
    students: dict[str, list[tuple[int, str]]] = {}
    for a in apps:
        sp = store.student(a.student_id)
        if sp and not sp.eligible_for_matching:
            continue  # excluded: declined or timed out earlier (REQ-OUTCOME-2, 4)
        students.setdefault(a.student_id, []).append((a.preference_rank or 99, a.listing_id))
    s_prefs = [StudentPrefs(sid, [lid for _, lid in sorted(v)]) for sid, v in students.items()]
    l_prefs = []
    for lst in store.listings:
        if lst.status != ListingStatus.published:
            continue
        ranked_apps = store.applicant_rankings.get(f"{lst.id}:{round_id}", [])
        app_by_id = {a.id: a for a in apps}
        ranked_students = [app_by_id[aid].student_id for aid in ranked_apps if aid in app_by_id]
        l_prefs.append(ListingPrefs(lst.id, max(lst.available_slots - lst.filled_slots, 0), ranked_students))
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
        sorted({m.supervisor_id for m in store.matches if m.round_id == round_id}),
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
    applied = {a.student_id for a in store.applications if a.round_id == round_id and a.status == ApplicationStatus.submitted}
    excluded = sum(1 for sid in applied if (sp := store.student(sid)) and not sp.eligible_for_matching)
    prefs = [m.preference_rank for m in ms if m.preference_rank]
    decided = [
        m
        for m in ms
        if m.status
        in (
            MatchStatus.approved,
            MatchStatus.reassigned,
            MatchStatus.published,
            MatchStatus.accepted,
            MatchStatus.declined,
            MatchStatus.timed_out,
        )
    ]
    return RoundSummary(
        round=r,
        matched=len(ms),
        unmatched=max(len(applied) - excluded - len(ms), 0),
        excluded=excluded,
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
    lst = store.listing(body.listing_id)
    if lst is None or lst.filled_slots >= lst.available_slots:
        raise invalid("no_slot", "That project has no open slot.", "listing_id")
    m.original_listing_id = m.original_listing_id or m.listing_id
    m.listing_id, m.listing_title, m.supervisor_id, m.supervisor_name = lst.id, lst.title, lst.supervisor_id, lst.supervisor_name
    m.status, m.justification = MatchStatus.reassigned, body.justification  # REQ-ASSIGN-1, 2
    audit(store, admin, AuditOperation.manual_reassignment, [m.id], settings.now(), body.justification)
    return m


@router.post("/admin/rounds/{round_id}/assign", response_model=Match, status_code=201)
def manual_assign(round_id: str, body: ManualAssignRequest, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Match:
    _round(store, round_id)
    if any(
        m.student_id == body.student_id and m.status not in (MatchStatus.rejected, MatchStatus.declined, MatchStatus.timed_out)
        for m in store.matches
    ):  # REQ-ASSIGN-3
        raise conflict("already_assigned", "This student already has a project. Unassign it first.")
    lst = store.listing(body.listing_id)
    if lst is None:
        raise not_found("Project")
    m = Match(
        id=store.next_id("mt"),
        round_id=round_id,
        student_id=body.student_id,
        student_name=store.user(body.student_id).name,
        listing_id=lst.id,
        listing_title=lst.title,
        supervisor_id=lst.supervisor_id,
        supervisor_name=lst.supervisor_name,
        status=MatchStatus.reassigned,
        justification=body.justification,
    )
    store.matches.append(m)
    audit(store, admin, AuditOperation.manual_reassignment, [m.id], settings.now(), body.justification)
    return m


@router.post("/admin/rounds/{round_id}/publish", response_model=RoundSummary)
def publish(round_id: str, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> RoundSummary:
    r = _round(store, round_id)
    ms = [m for m in store.matches if m.round_id == round_id]
    if any(m.status == MatchStatus.proposed for m in ms):  # REQ-PUB-1
        raise conflict("approvals_pending", "Some matches are still awaiting supervisor approval.")
    now = settings.now()
    nxt = next((x for x in store.cycle.rounds if x.number == r.number + 1), None)
    expires = nxt.review_start if nxt else store.cycle.closing_date  # REQ-OUTCOME-3 deadline
    for m in ms:
        if m.status in (MatchStatus.approved, MatchStatus.reassigned):
            m.status, m.published_at, m.offer_expires_at = MatchStatus.published, now, expires
            for a in store.applications:
                if a.student_id == m.student_id and a.round_id == round_id:
                    a.status = ApplicationStatus.matched if a.listing_id == m.listing_id else ApplicationStatus.unmatched
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
    m.status = MatchStatus.approved if approve else MatchStatus.rejected  # REQ-APPRV-2: rejection frees the slot
    m.supervisor_decided_at = settings.now()
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
    lst = store.listing(m.listing_id)
    if lst:
        lst.filled_slots += 1
    sp = store.student(user.id)
    if sp:
        sp.eligible_for_matching = False  # placed: exclude from later rounds (REQ-OUTCOME-1)
    return m


@router.post("/me/match/decline", response_model=Match)
def decline_offer(user: StudentUser, store: StoreDep, settings: SettingsDep) -> Match:
    m = my_match(user, store)
    if m is None or m.status != MatchStatus.published:
        raise conflict("no_offer", "There is no open offer to respond to.")
    m.status, m.student_responded_at = MatchStatus.declined, settings.now()  # REQ-OUTCOME-2
    sp = store.student(user.id)
    if sp:
        sp.eligible_for_matching = False
    return m


# ------------------------------------------------------------------ cron


@router.post("/internal/tick", response_model=Ok)
def tick(store: StoreDep, settings: SettingsDep, authorization: Annotated[str | None, Header()] = None) -> Ok:
    """Called daily by Vercel Cron and whenever an admin opens Matching Rounds.
    Advances round statuses and times out unanswered offers (REQ-OUTCOME-3, 4)."""
    if settings.api_mode != "mock" and authorization != f"Bearer {settings.cron_secret}":
        raise ApiError(401, "unauthenticated", "Cron secret missing.")
    now = settings.now()
    if store.cycle:
        for r in store.cycle.rounds:
            if r.published_at:
                continue
            if r.application_start <= now <= r.application_end:
                r.status = RoundStatus.application_window
            elif r.review_start <= now <= r.review_end:
                r.status = RoundStatus.review_window
    for m in store.matches:
        if m.status == MatchStatus.published and m.offer_expires_at and now > m.offer_expires_at:
            m.status = MatchStatus.timed_out
            sp = store.student(m.student_id)
            if sp:
                sp.eligible_for_matching = False
    return Ok()
