"""Projects live only while a cycle is open (REQ-PROJ-4).

A cycle ends when an admin closes it or its closing date passes. Every published project is then closed, so the next
cycle does not inherit last cycle's Browse. A supervisor reopens the same project for the new cycle instead of
creating it again.
"""

from __future__ import annotations

from datetime import datetime

from app.models import Cycle, ListingStatus, MatchStatus


def close_published(store) -> int:
    """Close every published project. Drafts stay drafts. Matches are kept. Returns how many were closed."""
    n = 0
    for lst in store.all_listings():
        if lst.status == ListingStatus.published:
            lst.status = ListingStatus.closed
            store.save_listing(lst)
            n += 1
    return n


def accepted_in_cycle(store, listing_id: str, cycle: Cycle) -> int:
    """Students who accepted this project in this cycle. Last cycle's students do not take up a slot."""
    rounds = {r.id for r in cycle.rounds}
    mine = (m for m in store.matches if m.listing_id == listing_id and m.round_id in rounds)
    return sum(1 for m in mine if m.status == MatchStatus.accepted)


def cycle_open(cycle: Cycle | None, now: datetime) -> bool:
    """True from the cycle's pre-application period until its closing date, after Round 3."""
    return cycle is not None and now <= cycle.closing_date
