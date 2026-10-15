"""The one place that answers "what phase is the cycle in right now".

Both the UI (via GET /me) and every guard in the API use this, so date logic
cannot drift between them. Owner: slice D. Consumers: every slice.
"""

from __future__ import annotations

from datetime import datetime

from app.models import Cycle, Phase, Round, Window


def current_round(cycle: Cycle, now: datetime) -> Round | None:
    """The round whose application or review window contains `now`. Between rounds, the latest round that has
    started: its matching, results and offers are what is happening until the next round opens.
    Before Round 1, the first round."""
    for r in cycle.rounds:
        if r.application_start <= now <= r.review_end:
            return r
    started = [r for r in cycle.rounds if r.application_start <= now]
    if started:
        return max(started, key=lambda r: r.application_start)
    upcoming = [r for r in cycle.rounds if r.application_start > now]
    return min(upcoming, key=lambda r: r.application_start) if upcoming else None


def phase(cycle: Cycle | None, now: datetime) -> Phase:
    if cycle is None or now < cycle.opening_date:
        return Phase(
            cycle_id=None,
            round_id=None,
            round_number=None,
            window=Window.before_cycle,
            window_ends_at=None,
            label="No application cycle is open",
        )
    if now > cycle.closing_date:
        return Phase(
            cycle_id=cycle.id,
            round_id=None,
            round_number=None,
            window=Window.closed,
            window_ends_at=None,
            label="The application cycle has closed",
        )
    r = current_round(cycle, now)
    if r is None or now < cycle.rounds[0].application_start:
        first = cycle.rounds[0] if cycle.rounds else None
        ends = first.application_start if first else cycle.closing_date
        return Phase(
            cycle_id=cycle.id,
            round_id=None,
            round_number=None,
            window=Window.pre_application,
            window_ends_at=ends,
            label=f"Applications open {ends:%d %b}",
        )
    if r.application_start <= now <= r.application_end:
        return Phase(
            cycle_id=cycle.id,
            round_id=r.id,
            round_number=r.number,
            window=Window.application,
            window_ends_at=r.application_end,
            label=f"Round {r.number} closes {r.application_end:%d %b}",
        )
    if r.review_start <= now <= r.review_end:
        return Phase(
            cycle_id=cycle.id,
            round_id=r.id,
            round_number=r.number,
            window=Window.review,
            window_ends_at=r.review_end,
            label=f"Round {r.number} rankings due {r.review_end:%d %b}",
        )
    if r.published_at is None:
        return Phase(
            cycle_id=cycle.id,
            round_id=r.id,
            round_number=r.number,
            window=Window.awaiting_results,
            window_ends_at=None,  # ends when an admin publishes; no fixed date to count down to
            label=f"Round {r.number} results pending",
        )
    nxt = next((x for x in cycle.rounds if x.number == r.number + 1), None)
    responds_by = nxt.review_start if nxt else cycle.closing_date  # offer response deadline (same rule as publish())
    return Phase(
        cycle_id=cycle.id,
        round_id=r.id,
        round_number=r.number,
        window=Window.results,
        window_ends_at=responds_by,
        label=f"Round {r.number} results published",
    )


def in_application_window(cycle: Cycle | None, now: datetime) -> bool:
    return phase(cycle, now).window == Window.application


def in_review_window(cycle: Cycle | None, now: datetime) -> bool:
    return phase(cycle, now).window == Window.review
