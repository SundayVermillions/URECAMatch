"""Stable matching (REQ-EXEC-1..3). Owner: slice D.

Pure function. No database, no datetime, no I/O. That is what makes it testable
with small fixtures (tests/test_REQ_EXEC.py).

Algorithm: student-proposing deferred acceptance (Gale-Shapley) with capacities.
  - Each student proposes down their preference list (most preferred first).
  - A listing tentatively holds up to `capacity` proposals, keeping the ones its
    supervisor ranked highest; applicants the supervisor did not rank are never held.
  - Rejected students move to their next preference. Stops when no student can propose.
Result is stable: no student and listing both prefer each other over their assignment.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class StudentPrefs:
    student_id: str
    listing_ids: list[str]  # ordered, most preferred first


@dataclass
class ListingPrefs:
    listing_id: str
    capacity: int  # open slots this round
    ranked_student_ids: list[str]  # supervisor order, best first; unranked students are ineligible


@dataclass
class MatchResult:
    pairs: dict[str, str] = field(default_factory=dict)  # student_id -> listing_id
    unmatched: list[str] = field(default_factory=list)


def match(students: list[StudentPrefs], listings: list[ListingPrefs]) -> MatchResult:
    rank_of = {lst.listing_id: {sid: i for i, sid in enumerate(lst.ranked_student_ids)} for lst in listings}
    capacity = {lst.listing_id: lst.capacity for lst in listings}
    held: dict[str, list[str]] = {lst.listing_id: [] for lst in listings}
    next_choice = {s.student_id: 0 for s in students}
    prefs = {s.student_id: s.listing_ids for s in students}
    free = [s.student_id for s in students]

    while free:
        sid = free.pop()
        choices = prefs[sid]
        if next_choice[sid] >= len(choices):
            continue  # exhausted list: stays unmatched
        lid = choices[next_choice[sid]]
        next_choice[sid] += 1
        if lid not in rank_of or sid not in rank_of[lid] or capacity.get(lid, 0) == 0:
            free.append(sid)  # not ranked by this supervisor or listing not open: try next
            continue
        held[lid].append(sid)
        held[lid].sort(key=lambda x: rank_of[lid][x])
        if len(held[lid]) > capacity[lid]:
            bumped = held[lid].pop()  # worst-ranked held applicant loses the slot
            free.append(bumped)

    pairs = {sid: lid for lid, sids in held.items() for sid in sids}
    unmatched = [s.student_id for s in students if s.student_id not in pairs]
    return MatchResult(pairs=pairs, unmatched=unmatched)
