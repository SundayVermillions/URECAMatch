"""The one place that answers "what phase is the cycle in right now".

Both the UI (via GET /me) and every guard in the API use this, so date logic
cannot drift between them. Owner: slice D. Consumers: every slice.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models import Cycle, CycleStatus, Phase, Round, Window

SINGAPORE = timezone(timedelta(hours=8), "SGT")  # NTU's time zone (no daylight saving); users read every deadline in it


def when(moment: datetime) -> str:
    """A date and time as users read it, in Singapore time and labelled so: "10 Sep, 5:00 pm SGT".
    Windows end one second before the hour (16:59:59), so a :59 second is shown as the hour it closes at."""
    t = (moment + timedelta(seconds=1) if moment.second == 59 else moment).astimezone(SINGAPORE)
    return f"{t.day} {t:%b}, {t.hour % 12 or 12}:{t:%M} {'am' if t.hour < 12 else 'pm'} SGT"


def current_round(cycle: Cycle, now: datetime) -> Round | None:
    """The round whose application, review or approval window contains `now`. Between rounds, the latest round that
    has started: its results and offers are what is happening until the next round opens.
    Before Round 1, the first round."""
    for r in cycle.rounds:
        if r.application_start <= now <= r.approval_end:
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
            # A cycle that exists but has not opened yet is not "no cycle": say when it opens.
            label="No application cycle is open" if cycle is None else f"The cycle opens {when(cycle.opening_date)}",
            now=now,
        )
    if now > cycle.closing_date:
        return Phase(
            cycle_id=cycle.id,
            round_id=None,
            round_number=None,
            window=Window.closed,
            window_ends_at=None,
            label="The application cycle has closed",
            now=now,
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
            # With no rounds, the closing date is not when applications open.
            label=f"Applications open {when(ends)}" if first else "The rounds are not scheduled yet",
            now=now,
        )
    if r.application_start <= now <= r.application_end:
        return Phase(
            cycle_id=cycle.id,
            round_id=r.id,
            round_number=r.number,
            window=Window.application,
            window_ends_at=r.application_end,
            label=f"Round {r.number} closes {when(r.application_end)}",
            now=now,
        )
    if r.review_start <= now <= r.review_end:
        return Phase(
            cycle_id=cycle.id,
            round_id=r.id,
            round_number=r.number,
            window=Window.review,
            window_ends_at=r.review_end,
            label=f"Round {r.number} rankings due {when(r.review_end)}",
            now=now,
        )
    if r.review_end < now <= r.approval_end:  # REQ-APPRV-4
        return Phase(
            cycle_id=cycle.id,
            round_id=r.id,
            round_number=r.number,
            window=Window.approval,
            window_ends_at=r.approval_end,
            label=f"Round {r.number} results out {when(r.approval_end)}",
            now=now,
        )
    if r.published_at is None:
        return Phase(
            cycle_id=cycle.id,
            round_id=r.id,
            round_number=r.number,
            window=Window.awaiting_results,
            window_ends_at=None,  # only until the scheduler publishes, on the next request after approval_end
            label=f"Round {r.number} results pending",
            now=now,
        )
    responds_by = offer_deadline(cycle, r, now) or cycle.closing_date
    return Phase(
        cycle_id=cycle.id,
        round_id=r.id,
        round_number=r.number,
        window=Window.results,
        window_ends_at=responds_by,
        label=f"Round {r.number} results published",
        now=now,
    )


def offer_deadline(cycle: Cycle, r: Round, now: datetime) -> datetime | None:
    """REQ-OUTCOME-3: a student answers an offer from round `r` by the end of the next application window that has
    not closed yet, so a late offer still gets a real window. After the last round, the cycle's closing date.
    None once the cycle has closed: no offer can be made then."""
    later = sorted(x.application_end for x in cycle.rounds if x.number > r.number and x.application_end > now)
    deadline = later[0] if later else cycle.closing_date
    return deadline if deadline > now else None


def cycle_closed(cycle: Cycle | None, now: datetime) -> bool:
    """Whether nothing may be scheduled for this cycle any more: it has no cycle, an admin closed it, or its closing
    date has passed. A cycle can be past its closing date while its status still says in progress (the seeded one
    is), and the schedule must not run for it then."""
    return cycle is None or cycle.status == CycleStatus.closed or now > cycle.closing_date


def in_application_window(cycle: Cycle | None, now: datetime) -> bool:
    return phase(cycle, now).window == Window.application


def in_review_window(cycle: Cycle | None, now: datetime) -> bool:
    return phase(cycle, now).window == Window.review
