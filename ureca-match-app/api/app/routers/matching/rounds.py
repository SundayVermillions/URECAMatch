"""Slice D: an admin's view of a round: its summary, its matches and the students it left unmatched. REQ-REV-1."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import AdminUser, StoreDep
from app.errors import not_found
from app.models import ApplicationStatus, ListingStatus, Match, MatchStatus, RoundSummary, UserListItem
from app.services import placement

router = APIRouter(tags=["matching"])


# In Supabase mode every read of the store is a query, and store.cycle is two (cycles and rounds). So each handler reads
# the cycle, the matches and the profiles it needs once and passes them down; the helpers below never read them again.


def find_round(cycle, round_id: str):
    r = next((r for r in (cycle.rounds if cycle else []) if r.id == round_id), None)
    if r is None:
        raise not_found("Round")
    return r


@router.get("/admin/rounds/{round_id}/summary", response_model=RoundSummary)
def summary(round_id: str, admin: AdminUser, store: StoreDep) -> RoundSummary:
    cycle, matches = store.cycle, store.matches
    r = find_round(cycle, round_id)
    ms = [m for m in matches if m.round_id == round_id]
    applied, placed, excluded = _round_sets(store, r, cycle, matches, placement.ineligible(store))
    prefs = [m.preference_rank for m in ms if m.preference_rank]
    held = placement.held_by_listing(cycle, matches)
    return RoundSummary(
        round=r,
        eligible=len(applied - excluded),  # before matching runs, the students it will consider
        open_slots=sum(
            placement.open_slots(store, lst, held) for lst in store.all_listings() if lst.status == ListingStatus.published
        ),
        matched=len(placed),  # a student a supervisor declined is not matched until they are placed again
        unmatched=len(applied - placed - excluded),
        excluded=len(excluded),
        avg_preference=round(sum(prefs) / len(prefs), 2) if prefs else None,
        declined=sum(1 for m in ms if m.status == MatchStatus.rejected),  # REQ-APPRV-2
    )


def _round_sets(store, r, cycle, matches: list[Match], ineligible: set[str]) -> tuple[set[str], set[str], set[str]]:
    """Students who applied in the round, those it placed (any match but a rejection), and those excluded because an
    earlier round placed them or they declined or timed out. Applications already decided by publish still count.
    `cycle`, `matches` and `ineligible` (placement.ineligible) are the caller's single reads."""
    applied = {
        a.student_id
        for a in store.applications_for(round_id=r.id)
        if a.status in (ApplicationStatus.submitted, ApplicationStatus.matched, ApplicationStatus.unmatched)
    }
    placed = {m.student_id for m in matches if m.round_id == r.id and m.status != MatchStatus.rejected}
    earlier = placement.ruled_out(cycle, matches, before=r)
    excluded = {sid for sid in applied - placed if sid in earlier or sid in ineligible}
    return applied, placed, excluded


@router.get("/admin/rounds/{round_id}/unmatched", response_model=list[UserListItem])
def unmatched_students(round_id: str, admin: AdminUser, store: StoreDep) -> list[UserListItem]:
    """REQ-REV-1 "Unmatched": students who applied in this round and hold no match, so an admin can assign them
    (REQ-ASSIGN-1). The same set as the summary's unmatched count. Profiles and accounts are read once, not per student."""
    cycle, matches = store.cycle, store.matches
    r = find_round(cycle, round_id)
    profiles = {p.user_id: p for p in store.students}
    ineligible = {sid for sid, p in profiles.items() if not p.eligible_for_matching}
    applied, placed, excluded = _round_sets(store, r, cycle, matches, ineligible)
    wanted = applied - placed - excluded
    users = {u.id: u for u in store.users if u.id in wanted} if wanted else {}
    out = [
        UserListItem(user=u, school=profiles[sid].school if sid in profiles else None)
        for sid in wanted
        if (u := users.get(sid)) is not None
    ]
    return sorted(out, key=lambda x: x.user.name)


@router.get("/admin/rounds/{round_id}/matches", response_model=list[Match])
def matches(round_id: str, admin: AdminUser, store: StoreDep, status: MatchStatus | None = None) -> list[Match]:  # REQ-REV-1
    return [m for m in store.matches if m.round_id == round_id and (status is None or m.status == status)]
