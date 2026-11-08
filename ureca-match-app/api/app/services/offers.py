"""Slice D: match offers. REQ-OUTCOME-1..4, REQ-ASSIGN-1..3.

Making an offer straight away when an admin places a student after the round has published, timing out offers nobody
answered, moving open offers' deadlines when the schedule changes, and taking a student out of the rest of the cycle
once they accept, decline or miss an offer.
"""

from __future__ import annotations

from datetime import datetime

from app.errors import conflict
from app.models import Cycle, Match, MatchStatus, NotificationEvent
from app.services import placement, windows
from app.services.notify import notify
from app.services.windows import when


def late_offer_deadline(cycle, r, now):
    """For an admin assignment in a round that is already published: there is no later publish step, so the match
    becomes an offer straight away. Returns its deadline, or None if the round is not published yet."""
    if r.published_at is None:
        return None
    deadline = windows.offer_deadline(cycle, r, now)  # REQ-OUTCOME-3
    if deadline is None:
        raise conflict("cycle_closed", "The cycle has closed, so no new offers can be made.")
    return deadline


def offer_now(store, m: Match, deadline, now) -> None:
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


def expire_offers(store, now, cycle, matches: list[Match]) -> None:
    """REQ-OUTCOME-3, 4: offers past their deadline time out. Run by the cron and before anything that counts slots.
    Only the active cycle's: an earlier cycle's offers were closed out when this one was created (cycle_end), and must
    not mark a student ineligible for this cycle. `matches` is the caller's read; it is updated in place."""
    rounds = {r.id for r in cycle.rounds} if cycle else set()
    for m in matches:
        if m.round_id in rounds and m.status == MatchStatus.published and m.offer_expires_at and now > m.offer_expires_at:
            m.status = MatchStatus.timed_out
            store.save_match(m)
            mark_ineligible(store, m.student_id, now, "did not answer a match offer in time")


def moved_offer_deadlines(store, planned: Cycle, now: datetime) -> list[tuple[Match, datetime]]:
    """REQ-OUTCOME-3: the open offers whose deadline moves if the cycle's schedule becomes `planned`. An offer is open
    until the end of the next application window still open, or the cycle's close after the last round, so moving
    that round or the closing date moves the deadline with it. Returns each such offer with its new deadline.
    The caller holds schedule_lock."""
    rounds = {r.id: r for r in planned.rounds}
    moved = []
    for m in store.matches:
        if m.status != MatchStatus.published or m.round_id not in rounds:
            continue
        deadline = windows.offer_deadline(planned, rounds[m.round_id], now) or planned.closing_date
        if deadline != m.offer_expires_at:
            moved.append((m, deadline))
    return moved


def mark_ineligible(store, student_id: str, now, reason: str) -> None:
    """The student leaves the rest of the cycle (REQ-OUTCOME-1, 2, 4). Proposals still waiting are withdrawn with them."""
    sp = store.student(student_id)
    if sp and sp.eligible_for_matching:
        sp.eligible_for_matching = False
        store.save_student(sp)
    placement.withdraw_pending_proposals(store, student_id, now, reason)
