"""The one place that answers "what phase is the cycle in right now".

Both the UI (via GET /me) and every guard in the API use this, so date logic
cannot drift between them. Owner: slice D. Consumers: every slice.
"""

from __future__ import annotations

from datetime import datetime

from app.models import Cycle, Phase, Round, Window


def current_round(cycle: Cycle, now: datetime) -> Round | None:
    """The round whose application or review window contains `now`, else the next scheduled one."""
    for r in cycle.rounds:
        if r.application_start <= now <= r.review_end:
            return r
    upcoming = [r for r in cycle.rounds if r.application_start > now]
    return upcoming[0] if upcoming else (cycle.rounds[-1] if cycle.rounds else None)


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
            label=f"Applications open {ends:%-d %b}",
        )
    if r.application_start <= now <= r.application_end:
        return Phase(
            cycle_id=cycle.id,
            round_id=r.id,
            round_number=r.number,
            window=Window.application,
            window_ends_at=r.application_end,
            label=f"Round {r.number} closes {r.application_end:%-d %b}",
        )
    if r.review_start <= now <= r.review_end:
        return Phase(
            cycle_id=cycle.id,
            round_id=r.id,
            round_number=r.number,
            window=Window.review,
            window_ends_at=r.review_end,
            label=f"Round {r.number} rankings due {r.review_end:%-d %b}",
        )
    if r.published_at is None:
        return Phase(
            cycle_id=cycle.id,
            round_id=r.id,
            round_number=r.number,
            window=Window.awaiting_results,
            window_ends_at=r.application_start,
            label=f"Round {r.number} results pending",
        )
    return Phase(
        cycle_id=cycle.id,
        round_id=r.id,
        round_number=r.number,
        window=Window.results,
        window_ends_at=r.application_start,
        label=f"Round {r.number} results published",
    )


def in_application_window(cycle: Cycle | None, now: datetime) -> bool:
    return phase(cycle, now).window == Window.application


def in_review_window(cycle: Cycle | None, now: datetime) -> bool:
    return phase(cycle, now).window == Window.review
