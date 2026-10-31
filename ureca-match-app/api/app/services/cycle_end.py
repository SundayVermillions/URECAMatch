"""When a cycle is over, nothing from it may act on the next one (REQ-CYCLE-1, REQ-OUTCOME-1..4, REQ-REVPROP-1..3).

Run when the next cycle is created (cycles.create_cycle), as the old cycle moves to the history. The rows stay, as
history; only their state changes, and nobody is notified, since the cycle closed some time before.
"""

from __future__ import annotations

from datetime import datetime

from app.models import Cycle, MatchStatus, ProposalStatus


def close_out(store, cycle: Cycle, now: datetime) -> None:
    """Offers from `cycle` that nobody answered are timed out: they lapsed at its close at the latest (REQ-OUTCOME-3), and
    the scheduler leaves a closed cycle alone. Proposals still waiting are withdrawn: no cycle is left to accept them in.
    Every student is eligible again: accepting, declining or missing an offer counts only for its own cycle
    (REQ-OUTCOME-1, 2, 4)."""
    rounds = {r.id for r in cycle.rounds}
    for m in store.matches:
        if m.round_id in rounds and m.status == MatchStatus.published:
            m.status = MatchStatus.timed_out
            store.save_match(m)
    for p in store.proposals:
        if p.status == ProposalStatus.submitted:
            p.status, p.decided_at = ProposalStatus.withdrawn, now
            store.save_proposal(p)
    for sp in store.students:
        if not sp.eligible_for_matching:
            sp.eligible_for_matching = True
            store.save_student(sp)
