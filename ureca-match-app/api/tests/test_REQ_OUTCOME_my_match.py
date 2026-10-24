"""Slice D. My Applications shows the student's latest result in the active cycle (REQ-OUTCOME-1, 2, 4).

It is chosen by round, not by the order the store returns rows in: in Supabase mode match ids are random and rows
come back in id order, so "the last row" could be any of the student's matches.
"""

import pytest

from app.models import Match, MatchStatus


def _match(store, round_id: str, status: MatchStatus, student_id: str = "stu-9") -> Match:
    return Match(
        id=store.next_id("mt"),
        round_id=round_id,
        student_id=student_id,
        student_name=student_id,
        listing_id="lst-3",
        listing_title="Test listing",
        supervisor_id="sup-1",
        supervisor_name="Prof. Marcus Chua",
        status=status,
    )


def _shown(client_for, student_id: str = "stu-9"):
    r = client_for(student_id).get("/me/match")
    assert r.status_code == 200
    m = r.json()
    return (m["round_id"], m["status"]) if m else None


@pytest.mark.parametrize("accepted_first", [True, False])
def test_REQ_OUTCOME_1_the_newest_round_is_shown_whatever_the_row_order(fresh_store, client_for, accepted_first):
    """A Round 2 offer was withdrawn when the student's own proposal was accepted in Round 3."""
    rows = [_match(fresh_store, "rnd-3", MatchStatus.accepted), _match(fresh_store, "rnd-2", MatchStatus.declined)]
    fresh_store.matches.extend(rows if accepted_first else rows[::-1])
    assert _shown(client_for) == ("rnd-3", "accepted")


@pytest.mark.parametrize("accepted_first", [True, False])
def test_REQ_OUTCOME_1_in_one_round_the_project_held_beats_a_match_that_ended(fresh_store, client_for, accepted_first):
    rows = [_match(fresh_store, "rnd-2", MatchStatus.accepted), _match(fresh_store, "rnd-2", MatchStatus.declined)]
    fresh_store.matches.extend(rows if accepted_first else rows[::-1])
    assert _shown(client_for) == ("rnd-2", "accepted")


def test_REQ_OUTCOME_1_results_from_an_earlier_cycle_are_not_shown(fresh_store, client_for):
    earlier = next(c for c in fresh_store.cycles if c.id != fresh_store.cycle.id)
    fresh_store.matches.append(_match(fresh_store, earlier.rounds[0].id, MatchStatus.accepted))
    assert _shown(client_for) is None


def test_REQ_OUTCOME_1_the_result_stays_visible_after_an_admin_closes_the_cycle(fresh_store, client_for, as_admin):
    fresh_store.matches.append(_match(fresh_store, "rnd-2", MatchStatus.accepted))
    assert as_admin.post(f"/admin/cycles/{fresh_store.cycle.id}/close").status_code == 200
    assert _shown(client_for) == ("rnd-2", "accepted")
