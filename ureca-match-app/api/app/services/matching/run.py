"""Slice D: running matching for a round. REQ-EXEC-1..4, REQ-AUDIT-1, REQ-AUDIT-3.

The I/O around the pure algorithm in algorithm.py. Once a round's review window has closed it reads the round's
applications, the supervisors' rankings and the open slots, runs match(), saves the proposed matches and queues the
notices. services/schedule.advance() calls it.
"""

from __future__ import annotations

from app.models import ApplicationStatus, AuditOperation, ListingStatus, Match, MatchStatus, NotificationEvent, RoundStatus
from app.services import placement
from app.services.audit import SYSTEM, audit
from app.services.matching import Outbox, active_admins
from app.services.matching.algorithm import ListingPrefs, StudentPrefs, match
from app.services.offers import expire_offers
from app.services.windows import when


def run_matching(store, cycle, r, now, outbox: Outbox) -> None:
    """REQ-EXEC-1..4: run the stable-matching algorithm for round `r` once its review window has closed. The matches
    start the approval window: each is offered when it ends unless the supervisor declines it (REQ-APPRV-4).
    The round is claimed first with one atomic update, so when several servers reach this point only the one that
    wins the claim runs matching. If it fails before the matches are saved, the claim is given back for a retry."""
    if now <= r.review_end or r.executed_at is not None:  # REQ-EXEC-1, REQ-EXEC-2
        return
    if not store.claim_round(r, "executed_at", now):
        return  # another server is running it, or has
    committed: list[bool] = []
    try:
        _match_round(store, cycle, r, now, outbox, committed)
    except Exception:
        if not committed:
            store.release_round(r, "executed_at")
        raise
    r.status = RoundStatus.approval_window
    store.save_round(r)


def _match_round(store, cycle, r, now, outbox: Outbox, committed: list[bool]) -> None:
    matches = store.matches
    expire_offers(store, now, cycle, matches)  # a lapsed offer frees its slot for this run
    apps = [a for a in store.applications_for(round_id=r.id) if a.status == ApplicationStatus.submitted]
    ruled_out, ineligible = placement.ruled_out(cycle, matches), placement.ineligible(store)
    students: dict[str, list[tuple[int, str]]] = {}
    for a in apps:
        if a.student_id in ruled_out:
            continue  # already placed, holding an offer, or declined / timed out this cycle
        if a.student_id in ineligible:
            continue  # excluded: declined or timed out earlier (REQ-OUTCOME-2, 4)
        students.setdefault(a.student_id, []).append((a.preference_rank or 99, a.listing_id))
    s_prefs = [StudentPrefs(sid, [lid for _, lid in sorted(v)]) for sid, v in students.items()]
    l_prefs = []
    app_by_id = {a.id: a for a in apps}
    held = placement.held_by_listing(cycle, matches)
    published = {lst.id: lst for lst in store.all_listings() if lst.status == ListingStatus.published}
    for lst in published.values():
        ranked_students = [app_by_id[aid].student_id for aid in store.ranking(lst.id, r.id) if aid in app_by_id]
        l_prefs.append(ListingPrefs(lst.id, placement.open_slots(store, lst, held), ranked_students))
    result = match(s_prefs, l_prefs)
    users = store.users
    names = {u.id: u.name for u in users}
    new = []
    for sid, lid in result.pairs.items():
        lst = published[lid]
        pref = next((a.preference_rank for a in apps if a.student_id == sid and a.listing_id == lid), None)
        new.append(
            Match(
                id=store.next_id("mt"),
                round_id=r.id,
                student_id=sid,
                student_name=names[sid],
                listing_id=lid,
                listing_title=lst.title,
                supervisor_id=lst.supervisor_id,
                supervisor_name=lst.supervisor_name,
                status=MatchStatus.proposed,
                preference_rank=pref,
            )
        )
    # Every read that can fail is done. The matches go in with one insert; once it succeeds the claim stays.
    store.add_matches(*new)
    committed.append(True)
    audit(store, SYSTEM, AuditOperation.matching_executed, [r.id], now, f"{len(new)} matched")  # REQ-AUDIT-1, 3
    for sup_id in sorted({m.supervisor_id for m in new}):
        n = sum(1 for m in new if m.supervisor_id == sup_id)
        outbox.append(
            (
                [sup_id],
                NotificationEvent.matches_proposed,
                f"Round {r.number}: {'1 student' if n == 1 else f'{n} students'} matched to your projects",
                f"They are offered a place unless you decline them by {when(r.approval_end)}.",
                "/approvals",
            )
        )
    outbox.append(
        (
            active_admins(users),
            NotificationEvent.matches_proposed,
            f"Round {r.number} matching ran",
            f"{len(new)} students matched. Supervisors can decline until {when(r.approval_end)}, then results publish.",
            f"/rounds/{r.id}/matches",
        )
    )
