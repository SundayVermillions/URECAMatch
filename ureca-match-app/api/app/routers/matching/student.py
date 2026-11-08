"""Slice D: the student's side of matching: their latest match result, and accepting or declining an offer.
REQ-OUTCOME-1..4, use case 2-5.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import SettingsDep, StoreDep, StudentUser
from app.errors import conflict
from app.models import ApplicationStatus, Match, MatchStatus
from app.services import placement, windows
from app.services.offers import mark_ineligible
from app.services.schedule import schedule_lock
from app.services.windows import when

router = APIRouter(tags=["matching"])


def _results(store, student_id: str) -> tuple[list[Match], dict[str, int]]:
    """The match results a student can see: in the active cycle or, once every cycle is closed, the latest one.
    Also returns the number of each of that cycle's rounds."""
    c = store.cycle or max(store.cycles, key=lambda x: x.opening_date, default=None)
    number = {r.id: r.number for r in c.rounds} if c else {}
    visible = [
        m
        for m in store.matches
        if m.student_id == student_id
        and m.round_id in number
        and m.status in (MatchStatus.published, MatchStatus.accepted, MatchStatus.declined, MatchStatus.timed_out)
    ]
    return visible, number


@router.get("/me/match", response_model=Match | None)
def my_match(user: StudentUser, store: StoreDep) -> Match | None:
    """The student's latest match result: in the active cycle, or in the latest cycle once every cycle is closed."""
    visible, number = _results(store, user.id)
    # By round, never by list order: in Supabase mode match ids are random and rows come back in id order. In the
    # same round, the project the student holds or the offer they can answer comes before a match that ended.
    live = (MatchStatus.accepted, MatchStatus.published)
    return max(visible, key=lambda m: (number[m.round_id], m.status in live), default=None)


def _answerable_offer(user, store, now) -> Match:
    """The student's open offer while it can still be answered (REQ-OUTCOME-3). A lapsed offer may not be timed out
    yet: in Supabase mode the schedule runs on the daily cron, and it does nothing once the cycle has closed."""
    visible, number = _results(store, user.id)
    m = max((m for m in visible if m.status == MatchStatus.published), key=lambda m: number[m.round_id], default=None)
    if m is None:
        raise conflict("no_offer", "There is no open offer to respond to.")
    if m.offer_expires_at and now > m.offer_expires_at:
        raise conflict("offer_expired", f"The deadline to respond to this offer was {when(m.offer_expires_at)}.")
    if windows.cycle_closed(store.cycle, now):
        raise conflict("cycle_closed", "The application cycle has closed, so this offer can no longer be answered.")
    return m


@router.post("/me/match/accept", response_model=Match)
def accept_offer(user: StudentUser, store: StoreDep, settings: SettingsDep) -> Match:
    now = settings.now()
    with schedule_lock:  # the scheduler must not time the offer out between these checks and the change
        m = _answerable_offer(user, store, now)
        if placement.is_placed(store, user.id):  # already registered to a self-proposed project
            raise conflict("already_placed", "You have already accepted a project this cycle, so you cannot accept this offer.")
        m.status, m.student_responded_at = MatchStatus.accepted, now  # REQ-OUTCOME-1
        store.save_match(m)
    # In Supabase mode the store returns copies, so every change below is saved explicitly.
    lst = store.listing(m.listing_id)
    if lst:
        lst.filled_slots += 1
        store.save_listing(lst)
        placement.withdraw_applications_to_full_listing(store, lst, now)  # last slot gone: others lose this preference
    # placed: exclude from later rounds (REQ-OUTCOME-1), and withdraw any proposal still waiting
    mark_ineligible(store, user.id, now, "accepted a match offer")
    # Use case 2-5: accepting closes the student's other open applications.
    others = [a for a in store.applications_for(student_id=user.id) if a.status == ApplicationStatus.submitted]
    for a in others:
        a.status, a.preference_rank = ApplicationStatus.withdrawn, None
    store.save_applications(*others)
    return m


@router.post("/me/match/decline", response_model=Match)
def decline_offer(user: StudentUser, store: StoreDep, settings: SettingsDep) -> Match:
    now = settings.now()
    with schedule_lock:  # the scheduler must not time the offer out between these checks and the change
        m = _answerable_offer(user, store, now)
        m.status, m.student_responded_at = MatchStatus.declined, now  # REQ-OUTCOME-2
        store.save_match(m)
    mark_ineligible(store, user.id, now, "declined a match offer")
    return m
