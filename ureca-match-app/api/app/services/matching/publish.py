"""Slice D: publishing a round's results. REQ-PUB-1..3, REQ-EXEC-3, REQ-AUDIT-3.

Once a round's approval window has closed, every match nobody declined becomes an offer, every application still under
review gets its outcome, unmatched students' applications carry over to the next round, and everyone affected is told.
services/schedule.advance() calls it.
"""

from __future__ import annotations

from app.models import ApplicationStatus, AuditOperation, ListingStatus, MatchStatus, NotificationEvent, RoundStatus
from app.services import placement, windows
from app.services.audit import SYSTEM, audit
from app.services.matching import Outbox, active_admins
from app.services.windows import when


def publish(store, cycle, r, now, outbox: Outbox) -> None:
    """REQ-PUB-1..3: when the approval window closes, every match nobody declined becomes an offer (REQ-APPRV-4).
    Runs once per round, and only after matching has run. The writes that can fail come first, while nothing in
    memory has changed, so if one fails the next request starts again cleanly: the rollover copies (which skip copies
    that already exist), then the offers and the applications' outcomes together. Like matching, the round is claimed
    first with one atomic update, and the claim is given back if the step fails before the offers are saved."""
    if r.executed_at is None or r.published_at is not None or now <= r.approval_end:  # REQ-PUB-1, REQ-PUB-4
        return
    expires = windows.offer_deadline(cycle, r, now) if cycle else None  # REQ-OUTCOME-3
    if expires is None:
        return  # the cycle has closed: an offer would already be expired, so none is made and nothing is published
    if not store.claim_round(r, "published_at", now):
        return  # another server is publishing it, or has
    committed: list[bool] = []
    try:
        _publish_round(store, cycle, r, now, expires, outbox, committed)
    except Exception:
        if not committed:
            store.release_round(r, "published_at")
        raise
    r.status = RoundStatus.published
    store.save_round(r)


def _publish_round(store, cycle, r, now, expires, outbox: Outbox, committed: list[bool]) -> None:
    matches = store.matches
    ms = [m for m in matches if m.round_id == r.id]
    nxt = next((x for x in cycle.rounds if x.number == r.number + 1), None)
    offers = [m for m in ms if m.status in (MatchStatus.proposed, MatchStatus.approved, MatchStatus.reassigned)]
    offered = {m.student_id: m.listing_id for m in offers}  # accepted by default; student id -> listing id
    # Every application still under review in this round gets its outcome, offer or not, so none carries
    # into the next round as if it were still live.
    apps = [a for a in store.applications_for(round_id=r.id) if a.status == ApplicationStatus.submitted]
    unmatched = sorted({a.student_id for a in apps if a.student_id not in offered})
    # REQ-PUB-2 "all affected users": students who applied and got no offer, and supervisors with matches.
    # Only students who may still take part are told they can apply again (REQ-OUTCOME-2, 4).
    ruled_out, ineligible = placement.ruled_out(cycle, matches), placement.ineligible(store)
    can_retry = [s for s in unmatched if s not in ruled_out and s not in ineligible]
    carried = _roll_over(store, apps, can_retry, nxt, now) if nxt and cycle.rollover_unmatched else set()
    for a in apps:
        a.status = ApplicationStatus.matched if offered.get(a.student_id) == a.listing_id else ApplicationStatus.unmatched
    # One operation: an application is only "matched" if its match row is saved with it (REQ-PUB-1).
    published = [
        m.model_copy(update={"status": MatchStatus.published, "published_at": now, "offer_expires_at": expires}) for m in offers
    ]
    store.publish_outcomes(published, apps)
    committed.append(True)
    audit(store, SYSTEM, AuditOperation.results_published, [r.id], now, f"{len(offers)} offers")  # REQ-AUDIT-3
    outbox.append(
        (
            [m.student_id for m in offers],
            NotificationEvent.offer_received,
            "You have a match offer",
            f"Respond by {when(expires)}. You cannot apply to other projects while this offer is open.",
            "/my-applications",
        )
    )  # REQ-PUB-2, REQ-APPLY-5
    later = f"Round {nxt.number}" if nxt else ""
    for group, next_step in (
        (
            [s for s in can_retry if s in carried],
            f" Your applications carry over to {later}, where you can reorder or withdraw them.",
        ),
        ([s for s in can_retry if s not in carried], f" You can apply again in {later}." if nxt else ""),
        ([s for s in unmatched if s not in can_retry], ""),
    ):
        outbox.append(
            (
                group,
                NotificationEvent.results_published,
                f"Round {r.number} results are out",
                f"You were not matched to a project in Round {r.number}.{next_step}",
                "/my-applications",
            )
        )
    for sup_id in sorted({m.supervisor_id for m in ms}):
        n_offered = sum(1 for m in offers if m.supervisor_id == sup_id)
        students = "1 student on your listings was" if n_offered == 1 else f"{n_offered} students on your listings were"
        outbox.append(
            (
                [sup_id],
                NotificationEvent.results_published,
                f"Round {r.number} results are out",
                f"{students} offered a place. They have until {when(expires)} to respond."
                if n_offered
                else f"No students on your listings were offered a place in Round {r.number}.",
                "/approvals",
            )
        )
    # REQ-APPRV-2: admins hear about declines once, here, rather than one notice per decline
    declined = sum(1 for m in ms if m.status == MatchStatus.rejected)
    sent = "1 offer sent." if len(offers) == 1 else f"{len(offers)} offers sent."
    unplaced = (
        ""
        if not declined
        else " 1 student declined by a supervisor is now unmatched."
        if declined == 1
        else f" {declined} students declined by supervisors are now unmatched."
    )
    outbox.append(
        (
            active_admins(store.users),
            NotificationEvent.results_published,
            f"Round {r.number} results published",
            f"{sent}{unplaced} Students have until {when(expires)} to respond.",
            f"/rounds/{r.id}/matches",
        )
    )


def _roll_over(store, apps, students: list[str], nxt, now) -> set[str]:
    """REQ-EXEC-3: copy each unmatched, eligible student's applications into the next round in their order, skipping
    projects that are no longer published, that are fully allocated (as apply() refuses them), or that the student
    already applied to there. Open projects and slots freed by declines carry over on their own.
    Returns the students whose applications were carried."""
    already = {
        (a.student_id, a.listing_id): a
        for a in store.applications_for(round_id=nxt.id)
        if a.status == ApplicationStatus.submitted
    }
    copies = []
    listings = {lst.id: lst for lst in store.all_listings()} if students else {}  # one read, not one per application
    for sid in students:
        rank = sum(1 for s, _ in already if s == sid)
        for a in sorted((a for a in apps if a.student_id == sid), key=lambda a: a.preference_rank or 99):
            lst = listings.get(a.listing_id)
            full = lst is not None and lst.filled_slots >= lst.available_slots
            if lst is None or lst.status != ListingStatus.published or full or (sid, a.listing_id) in already:
                continue
            rank += 1
            copies.append(
                a.model_copy(
                    update={
                        "id": store.next_id("app"),
                        "round_id": nxt.id,
                        "status": ApplicationStatus.submitted,
                        "preference_rank": rank,
                        "submitted_at": now,
                    }
                )
            )
    store.save_applications(*copies)
    return {a.student_id for a in copies}
