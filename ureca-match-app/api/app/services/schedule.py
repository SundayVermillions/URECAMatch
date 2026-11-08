"""Slice D: the schedule. REQ-EXEC-6, REQ-PUB-4, REQ-OUTCOME-3.

Nobody clicks "run matching" or "publish". advance() runs matching once a review window has closed and publishes once
an approval window has closed. The daily cron calls it just after 5 pm SGT, when windows open and close, and so does
an admin opening Matching Rounds. In mock mode it also runs before every request (SCHEDULER_ON_REQUEST). Both ways in
are in routers/matching/scheduler.py.
"""

from __future__ import annotations

import threading

from app.models import MatchStatus, RoundStatus
from app.services import listing_lifecycle, windows
from app.services.matching import Outbox
from app.services.matching.publish import publish
from app.services.matching.run import run_matching
from app.services.notify import notify
from app.services.offers import expire_offers

# Requests run on a thread pool. advance() and every handler that changes a round's matches before it is published
# hold this lock, so a match cannot change between a handler's checks and its write, and no step runs twice.
# Re-entrant, so a handler holding it can still call advance().
schedule_lock = threading.RLock()


def _status_for(r, now) -> RoundStatus | None:
    """The status a round that is not published yet should show at `now`, or None to leave it as it is."""
    if r.application_start <= now <= r.application_end:
        return RoundStatus.application_window
    if r.review_start <= now <= r.review_end:
        return RoundStatus.review_window
    if r.executed_at is not None:
        return RoundStatus.approval_window
    return None


def _due(store, cycle, now) -> bool:
    """Whether advance() has anything to change: a review or approval window has closed, a round's status is out of
    date, or an offer has lapsed. Checked without the lock, so a request with nothing to do never waits on it.
    `cycle` is advance()'s read; the matches are only read if no round needs anything."""
    for r in cycle.rounds if cycle else []:
        if r.published_at is not None:
            continue
        if now > r.review_end and (r.executed_at is None or now > r.approval_end):
            return True  # matching or publishing is due
        if (status := _status_for(r, now)) is not None and status != r.status:
            return True
    rounds = {r.id for r in cycle.rounds} if cycle else set()  # as expire_offers: this cycle's offers only
    return any(
        m.round_id in rounds and m.status == MatchStatus.published and m.offer_expires_at and now > m.offer_expires_at
        for m in store.matches
    )


def advance(store, now) -> None:
    """Bring the active cycle up to `now`, round by round in order (REQ-EXEC-6, REQ-PUB-4, REQ-OUTCOME-3):
    run matching once a review window has closed, publish once an approval window has closed, keep round statuses
    current, and time out unanswered offers. Each step runs once, so calling this again changes nothing.
    Notifications go out after the lock is released, even if a later step fails, since the earlier steps are done."""
    outbox: Outbox = []
    try:
        cycle = store.cycle  # read once for the checks below: each read is two queries in Supabase mode
        if cycle is not None and now > cycle.closing_date:
            listing_lifecycle.close_published(store)  # REQ-PROJ-4: the closing date passed, so its projects close
        if windows.cycle_closed(cycle, now):
            return  # nothing is matched, published or expired for a cycle that has closed
        if not _due(store, cycle, now):
            return
        with schedule_lock:
            cycle = store.cycle  # again under the lock: another request may have run a step since the check
            for r in sorted(cycle.rounds if cycle else [], key=lambda x: x.number):
                if r.published_at is not None:
                    continue
                run_matching(store, cycle, r, now, outbox)
                publish(store, cycle, r, now, outbox)
                if r.published_at is None and (status := _status_for(r, now)) is not None and status != r.status:
                    r.status = status
                    store.save_round(r)
            expire_offers(store, now, cycle, store.matches)
    finally:
        for user_ids, event, title, message, link in outbox:
            notify(store, user_ids, event, title, message, now, link)
