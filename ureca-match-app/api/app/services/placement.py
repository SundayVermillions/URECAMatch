"""One student, one project per cycle (REQ-OUTCOME-1, REQ-REVPROP-2).

A student is placed once they hold an accepted match in the active cycle, whether it came from a match offer or
from an accepted self-proposal. Both paths ask the same question here, so neither can place a student twice.
"""

from __future__ import annotations

from datetime import datetime

from app.models import ApplicationStatus, Match, MatchStatus, NotificationEvent, ProposalStatus
from app.services.notify import notify

# Matches that still hold a slot until the student accepts (then it is in filled_slots) or the match ends.
OPEN = (MatchStatus.proposed, MatchStatus.approved, MatchStatus.reassigned, MatchStatus.published)


def _cycle_matches(store, student_id: str) -> list[Match]:
    rounds = {r.id for r in store.cycle.rounds} if store.cycle else set()
    return [m for m in store.matches if m.student_id == student_id and m.round_id in rounds]


def is_placed(store, student_id: str) -> bool:
    """True if the student has accepted a project in the active cycle."""
    return any(m.status == MatchStatus.accepted for m in _cycle_matches(store, student_id))


def held_by_listing(cycle, matches: list[Match]) -> dict[str, int]:
    """Slots held per project: matches and offers in `cycle` (the active one) that are still open, counted from the
    caller's reads. An earlier cycle's leftovers hold nothing, so they cannot shrink the next cycle's projects."""
    rounds = {r.id for r in cycle.rounds} if cycle else set()
    held: dict[str, int] = {}
    for m in matches:
        if m.round_id in rounds and m.status in OPEN:
            held[m.listing_id] = held.get(m.listing_id, 0) + 1
    return held


def holds_project(cycle, matches: list[Match], student_id: str) -> bool:
    """is_placed() or open_matches() in one pass over the caller's reads: the student has accepted a project in `cycle`
    or holds a match there that keeps a slot (REQ-ASSIGN-3)."""
    rounds = {r.id for r in cycle.rounds} if cycle else set()
    return any(
        m.student_id == student_id and m.round_id in rounds and (m.status == MatchStatus.accepted or m.status in OPEN)
        for m in matches
    )


def open_matches(store, student_id: str) -> list[Match]:
    """Matches in the active cycle that still hold a slot for the student: proposed, approved, reassigned or offered."""
    return [m for m in _cycle_matches(store, student_id) if m.status in OPEN]


def withdraw_pending_proposals(store, student_id: str, now: datetime, reason: str) -> None:
    """A student who is placed, or can no longer be matched, cannot have proposals waiting for a supervisor.
    Each pending one becomes withdrawn and its supervisor is told, so nobody is left holding a button that cannot work.
    `reason` completes "<student> ..." in the message, e.g. "accepted a match offer"."""
    for p in store.proposals_for(student_id=student_id):
        if p.status == ProposalStatus.submitted:
            p.status, p.decided_at = ProposalStatus.withdrawn, now
            store.save_proposal(p)
            notify(
                store,
                [p.supervisor_id],
                NotificationEvent.proposal_decided,
                "A proposal was withdrawn",
                f"{p.student_name} {reason}, so their proposal {p.title} was withdrawn.",
                now,
                "/proposals",
            )


def withdraw_applications_to_full_listing(store, listing, now: datetime) -> None:
    """The last slot of a project was taken, so every application still under review for it is withdrawn: nobody
    should keep a preference that can no longer be matched. Each student's remaining preferences move up and they are told."""
    if listing.filled_slots < listing.available_slots:
        return
    waiting = [a for a in store.applications_for(listing_id=listing.id) if a.status == ApplicationStatus.submitted]
    if not waiting:
        return
    for a in waiting:
        a.status, a.preference_rank = ApplicationStatus.withdrawn, None
    store.save_applications(*waiting)
    for student_id, round_id in {(a.student_id, a.round_id) for a in waiting}:
        left = sorted(
            (
                x
                for x in store.applications_for(student_id=student_id, round_id=round_id)
                if x.status == ApplicationStatus.submitted
            ),
            key=lambda x: x.preference_rank or 99,
        )
        for i, x in enumerate(left, start=1):
            x.preference_rank = i
        if left:
            store.save_applications(*left)
    notify(
        store,
        sorted({a.student_id for a in waiting}),
        NotificationEvent.proposal_decided,
        "A project you applied to is full",
        f"{listing.title} has no slots left, so your application was withdrawn. Your other preferences moved up.",
        now,
        "/my-applications",
    )


def open_slots(store, lst, held: dict[str, int] | None = None) -> int:
    """Slots nobody holds: accepted students are counted in filled_slots, and this cycle's pending matches and open
    offers hold one each. Pass `held` (placement.held_by_listing) when counting many projects, to read the store once."""
    held = held_by_listing(store.cycle, store.matches) if held is None else held
    return max(lst.available_slots - lst.filled_slots - held.get(lst.id, 0), 0)


def ruled_out(cycle, matches: list[Match], before=None) -> set[str]:
    """Students this cycle's matching must skip: anyone with a match in the cycle that is not a supervisor rejection,
    i.e. placed, holding an offer, or declined or timed out (REQ-OUTCOME-2, 4). With `before` (a round), only
    matches from earlier rounds count, for that round's summary."""
    rounds = {x.id for x in (cycle.rounds if cycle else []) if before is None or x.number < before.number}
    return {m.student_id for m in matches if m.round_id in rounds and m.status != MatchStatus.rejected}


def ineligible(store) -> set[str]:
    """Students who declined or missed an offer this cycle (REQ-OUTCOME-2, 4), from one read of the profiles."""
    return {p.user_id for p in store.students if not p.eligible_for_matching}
