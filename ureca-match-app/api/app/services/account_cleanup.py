"""Admin account changes that would leave work behind (REQ-USER-3, SRS 4.8.2).

Deactivating a user or changing their role must not leave open listings, proposals, applications or matches that
nobody can act on. `find_active_items` lists them for the warning preview; `clean_up` closes them and tells the
other people involved. Both are called from routers/users.py, which owns the confirmation flag.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from app.db.store import Store
from app.models import (
    AccountStatus,
    ActiveItem,
    ActiveItemKind,
    ApplicationStatus,
    AuditOperation,
    ListingStatus,
    MatchStatus,
    NotificationEvent,
    ProposalStatus,
    Role,
    User,
)
from app.services.audit import audit
from app.services.notify import notify
from app.services.placement import OPEN

IN_PLAY = (*OPEN, MatchStatus.accepted)  # matches that still place or hold a slot for a student


def active_admins(store: Store) -> list[User]:
    return [u for u in store.users if u.role == Role.admin and u.status == AccountStatus.active]


def is_last_admin(store: Store, user: User) -> bool:
    """True if `user` is an active administrator and nobody else is, so they can be neither demoted nor deactivated."""
    return user.role == Role.admin and user.status == AccountStatus.active and [a.id for a in active_admins(store)] == [user.id]


def _listings(store: Store, user: User):
    return [lst for lst in store.all_listings() if lst.supervisor_id == user.id and lst.status == ListingStatus.published]


def _proposals(store: Store, user: User):
    mine = store.proposals_for(student_id=user.id) + store.proposals_for(supervisor_id=user.id)
    return [p for p in mine if p.status == ProposalStatus.submitted]


def _applications(store: Store, user: User):
    return [a for a in store.applications_for(student_id=user.id) if a.status == ApplicationStatus.submitted]


def _matches_as_student(store: Store, user: User):
    return [m for m in store.matches if m.student_id == user.id and m.status in IN_PLAY]


def _matches_on_listings(store: Store, user: User):
    """Every match on a supervisor's projects that still holds a slot or a placement, including students already
    registered (accepted offers and accepted self-proposals), so nobody stays placed under an inactive supervisor."""
    return [m for m in store.matches if m.supervisor_id == user.id and m.status in IN_PLAY]


def find_active_items(store: Store, user: User) -> list[ActiveItem]:
    items: list[ActiveItem] = []
    for lst in _listings(store, user):
        n = sum(1 for a in store.applications_for(listing_id=lst.id) if a.status == ApplicationStatus.submitted)
        items.append(ActiveItem(kind=ActiveItemKind.listing, id=lst.id, title=lst.title, detail=f"{n} open applications"))
    for p in _proposals(store, user):
        other = f"Supervisor: {p.supervisor_name}" if p.student_id == user.id else f"Student: {p.student_name}"
        items.append(ActiveItem(kind=ActiveItemKind.proposal, id=p.id, title=p.title, detail=other))
    for a in _applications(store, user):
        items.append(
            ActiveItem(kind=ActiveItemKind.application, id=a.id, title=a.listing_title, detail=f"Supervisor: {a.supervisor_name}")
        )
    for m in _matches_as_student(store, user):
        items.append(
            ActiveItem(kind=ActiveItemKind.match, id=m.id, title=m.listing_title, detail=f"Supervisor: {m.supervisor_name}")
        )
    for m in _matches_on_listings(store, user):
        items.append(ActiveItem(kind=ActiveItemKind.match, id=m.id, title=m.listing_title, detail=f"Student: {m.student_name}"))
    return items


def summarise(items: list[ActiveItem]) -> str:
    """e.g. "2 listings, 1 application" for the audit note and the warning message."""
    parts = []
    for kind in ActiveItemKind:
        n = sum(1 for i in items if i.kind == kind)
        if n:
            parts.append(f"{n} {kind.value}" + ("" if n == 1 else "s"))
    return ", ".join(parts)


def clean_up(store: Store, admin: User, user: User, now: datetime, reason: str) -> list[ActiveItem]:
    """Close or withdraw everything `find_active_items` lists, tell the people on the other side, and audit it.

    `reason` is the admin action in words, e.g. "deactivated" or "changed to supervisor". Returns what was closed."""
    items = find_active_items(store, user)
    if not items:
        return []
    told: dict[str, list[str]] = defaultdict(list)  # recipient -> lines, so each person gets one notification

    # Matches first: a student's own matches end, and the matches on a supervisor's projects are rejected.
    for m in _matches_as_student(store, user):
        if m.status == MatchStatus.accepted:  # the student was registered, so free the slot
            lst = store.listing(m.listing_id)
            if lst and lst.filled_slots > 0:
                lst.filled_slots -= 1
                store.save_listing(lst)
        m.status, m.student_responded_at = MatchStatus.declined, now
        store.save_match(m)
        told[m.supervisor_id].append(f"{m.student_name}'s match to {m.listing_title} was cancelled.")
    for m in _matches_on_listings(store, user):
        won = [
            a
            for a in store.applications_for(student_id=m.student_id, round_id=m.round_id)
            if a.listing_id == m.listing_id and a.status == ApplicationStatus.matched
        ]
        for a in won:
            a.status = ApplicationStatus.unmatched
        store.save_applications(*won)
        was = m.status
        if was == MatchStatus.accepted:  # registered: free the slot and put the student back in the pool
            lst = store.listing(m.listing_id)
            if lst and lst.filled_slots > 0:
                lst.filled_slots -= 1
                store.save_listing(lst)
        m.status, m.supervisor_decided_at = MatchStatus.rejected, now
        store.save_match(m)
        if was == MatchStatus.accepted:
            _back_in_pool(store, m.student_id)
        if was in (MatchStatus.published, MatchStatus.accepted):  # the student never saw a match that was not yet offered
            told[m.student_id].append(f"Your match to {m.listing_title} was cancelled.")

    for lst in _listings(store, user):
        lst.status = ListingStatus.closed
        store.save_listing(lst)
        waiting = [a for a in store.applications_for(listing_id=lst.id) if a.status == ApplicationStatus.submitted]
        for a in waiting:
            a.status, a.preference_rank = ApplicationStatus.withdrawn, None
            told[a.student_id].append(f"{lst.title} was closed, so your application was withdrawn.")
        store.save_applications(*waiting)
        _resequence(store, {(a.student_id, a.round_id) for a in waiting})

    for a in _applications(store, user):
        a.status, a.preference_rank = ApplicationStatus.withdrawn, None
        store.save_applications(a)
        told[_supervisor_of(store, a.listing_id)].append(f"{user.name} withdrew their application to {a.listing_title}.")

    for p in _proposals(store, user):
        p.status, p.decided_at = ProposalStatus.declined, now
        if p.student_id != user.id:
            p.decision_note = f"{user.name}'s account was closed, so the proposal could not be answered."
        store.save_proposal(p)
        if p.student_id == user.id:
            told[p.supervisor_id].append(f"{p.student_name}'s proposal {p.title} was withdrawn.")
        else:
            told[p.student_id].append(f"Your proposal {p.title} to {p.supervisor_name} was declined.")

    for uid, lines in told.items():
        if not uid or uid == user.id:
            continue
        notify(
            store,
            [uid],
            NotificationEvent.account_changed,
            "Your items were updated by an administrator",
            f"{user.name}'s account was {reason}. " + " ".join(lines),
            now,
        )
    audit(
        store, admin, AuditOperation.user_updated, [user.id], now, f"Cleanup before account {reason}: closed {summarise(items)}"
    )
    return items


def _back_in_pool(store: Store, student_id: str) -> None:
    """Make a student eligible for matching again unless another match this cycle still rules them out."""
    rounds = {r.id for r in store.cycle.rounds} if store.cycle else set()
    if any(m.student_id == student_id and m.round_id in rounds and m.status != MatchStatus.rejected for m in store.matches):
        return
    sp = store.student(student_id)
    if sp and not sp.eligible_for_matching:
        sp.eligible_for_matching = True
        store.save_student(sp)


def _supervisor_of(store: Store, listing_id: str) -> str:
    lst = store.listing(listing_id)
    return lst.supervisor_id if lst else ""


def _resequence(store: Store, keys: set[tuple[str, str]]) -> None:
    """Keep each student's remaining preference ranks 1..n after some of their applications were withdrawn (REQ-SRANK-2)."""
    for student_id, round_id in keys:
        left = sorted(
            (
                a
                for a in store.applications_for(student_id=student_id, round_id=round_id)
                if a.status == ApplicationStatus.submitted
            ),
            key=lambda a: a.preference_rank or 99,
        )
        for i, a in enumerate(left, start=1):
            a.preference_rank = i
        store.save_applications(*left)
