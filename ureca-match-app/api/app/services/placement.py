"""One student, one project per cycle (REQ-OUTCOME-1, REQ-REVPROP-2).

A student is placed once they hold an accepted match in the active cycle, whether it came from a match offer or
from an accepted self-proposal. Both paths ask the same question here, so neither can place a student twice.
"""

from __future__ import annotations

from app.models import Match, MatchStatus

# Matches that still hold a slot for the student (the same states as matching.HOLDS_SLOT).
OPEN = (MatchStatus.proposed, MatchStatus.approved, MatchStatus.reassigned, MatchStatus.published)


def _cycle_matches(store, student_id: str) -> list[Match]:
    rounds = {r.id for r in store.cycle.rounds} if store.cycle else set()
    return [m for m in store.matches if m.student_id == student_id and m.round_id in rounds]


def is_placed(store, student_id: str) -> bool:
    """True if the student has accepted a project in the active cycle."""
    return any(m.status == MatchStatus.accepted for m in _cycle_matches(store, student_id))


def open_matches(store, student_id: str) -> list[Match]:
    """Matches in the active cycle that still hold a slot for the student: proposed, approved, reassigned or offered."""
    return [m for m in _cycle_matches(store, student_id) if m.status in OPEN]
