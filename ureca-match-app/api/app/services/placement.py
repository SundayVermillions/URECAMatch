"""One student, one project per cycle (REQ-OUTCOME-1, REQ-REVPROP-2).

A student is placed once they hold an accepted match in the active cycle, whether it came from a match offer or
from an accepted self-proposal. Both paths ask the same question here, so neither can place a student twice.
"""

from __future__ import annotations

from datetime import datetime

from app.models import Match, MatchStatus, NotificationEvent, ProposalStatus
from app.services.notify import notify

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
