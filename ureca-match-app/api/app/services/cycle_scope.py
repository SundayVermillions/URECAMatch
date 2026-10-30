"""What a student sees belongs to the cycle that is running (REQ-SRANK-1).

When a cycle ends, or before the next one opens, My applications and Self-proposed projects start empty. Old rows stay
in the database and in the admin's records; the student just does not carry them into the next cycle.
"""

from __future__ import annotations

from datetime import datetime

from app.models import Application, Cycle, Proposal, Window
from app.services import windows


def running_cycle(store, now: datetime) -> Cycle | None:
    """The cycle between its opening and closing date, or None when nothing is running."""
    phase = windows.phase(store.cycle, now)
    return None if phase.window in (Window.before_cycle, Window.closed) else store.cycle


def applications_in(cycle: Cycle | None, applications: list[Application]) -> list[Application]:
    if cycle is None:
        return []
    rounds = {r.id for r in cycle.rounds}
    return [a for a in applications if a.round_id in rounds]


def proposals_in(cycle: Cycle | None, proposals: list[Proposal]) -> list[Proposal]:
    if cycle is None:
        return []
    return [p for p in proposals if cycle.opening_date <= p.submitted_at <= cycle.closing_date]
