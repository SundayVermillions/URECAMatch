"""Slice D. A new cycle starts clean: nothing from the cycle that ended acts on it.
REQ-CYCLE-1, REQ-OUTCOME-1..4, REQ-REVPROP-1..3.

Seed, demo clock 7 Sep 2026: the AY26/27 cycle closes 2 Oct; stu-33 accepted lst-1 in Round 1 (mt-1), stu-38 declined
an offer (mt-6), prp-1 and prp-2 wait for a supervisor, and AY25/26 Semester 2 is in the history.
"""

from datetime import UTC, datetime

from app.models import Match, MatchStatus, ProposalStatus
from app.routers.matching import _open_slots
from app.services import placement

AFTER_CLOSE = datetime(2026, 10, 3, 9, tzinfo=UTC)  # the day after the seeded cycle closes
STATEMENT = "I would like to join this project again because it builds on what I learned last year."
NEXT = {
    "academic_year": "AY27/28 Semester 1",
    "opening_date": "2027-08-01T09:00:00Z",
    "closing_date": "2027-11-01T09:00:00Z",
    "pre_application_days": 7,
}


def _start_next_cycle(as_admin):
    r = as_admin.post("/admin/cycles", json=NEXT)
    assert r.status_code == 201


def test_REQ_OUTCOME_1_every_student_is_eligible_again_in_the_next_cycle(as_admin, at, fresh_store):
    for sid in ("stu-33", "stu-38"):  # accepted a project, and declined an offer, this cycle
        fresh_store.student(sid).eligible_for_matching = False
    at(AFTER_CLOSE)
    _start_next_cycle(as_admin)
    assert all(fresh_store.student(sid).eligible_for_matching for sid in ("stu-33", "stu-38"))


def test_REQ_OUTCOME_1_a_student_placed_last_cycle_can_apply_in_the_next(as_admin, at, client_for, fresh_store):
    fresh_store.student("stu-33").eligible_for_matching = False  # what accepting mt-1 did this cycle
    at(AFTER_CLOSE)
    _start_next_cycle(as_admin)
    cycle = as_admin.get("/cycle").json()
    rounds = {"rounds": [{"number": 1, "application_days": 5, "review_days": 2}]}
    assert as_admin.put(f"/admin/cycles/{cycle['id']}/rounds", json=rounds).status_code == 200
    at(datetime(2027, 8, 9, 9, tzinfo=UTC))  # Round 1 applications: open a week after the cycle opens on 1 Aug
    assert client_for("sup-1").post("/supervisor/listings/lst-1/reopen").status_code == 200
    r = client_for("stu-33").post("/applications", json={"listing_id": "lst-1", "statement": STATEMENT})
    assert r.status_code == 201, r.text


def test_REQ_OUTCOME_3_an_offer_nobody_answered_stops_holding_its_slot(as_admin, at, fresh_store):
    offer = next(m for m in fresh_store.matches if m.id == "mt-6")  # make it a last-round offer nobody answers
    offer.status, offer.offer_expires_at = MatchStatus.published, fresh_store.cycle.closing_date
    assert placement.held_by_listing(fresh_store.cycle, fresh_store.matches).get(offer.listing_id) == 1
    at(AFTER_CLOSE)
    assert offer.status == MatchStatus.published  # the scheduler leaves a closed cycle alone
    _start_next_cycle(as_admin)
    assert offer.status == MatchStatus.timed_out
    assert offer.listing_id not in placement.held_by_listing(fresh_store.cycle, fresh_store.matches)


def test_REQ_OUTCOME_3_an_earlier_cycles_offer_holds_no_slot_and_is_left_alone(as_admin, fresh_store):
    past = next(c for c in fresh_store.cycles if c.id != fresh_store.cycle.id)
    lst = fresh_store.listing("lst-2")
    before = _open_slots(fresh_store, lst)
    old = next(m for m in fresh_store.matches if m.id == "mt-1")
    leftover = Match(
        **{
            **old.model_dump(),
            "id": "mt-old",
            "round_id": past.rounds[0].id,
            "student_id": "stu-1",
            "listing_id": lst.id,
            "status": MatchStatus.published,
            "offer_expires_at": datetime(2026, 3, 1, tzinfo=UTC),
        }
    )
    fresh_store.matches.append(leftover)
    assert _open_slots(fresh_store, lst) == before
    # Assigning someone times out lapsed offers first; this cycle's only, so stu-1 is not made ineligible now.
    body = {"student_id": "stu-2", "listing_id": "lst-2", "justification": "Exceptional circumstances"}
    assert as_admin.post("/admin/assignments", json=body).status_code == 201
    assert leftover.status == MatchStatus.published and fresh_store.student("stu-1").eligible_for_matching


def test_REQ_REVPROP_2_proposals_still_waiting_are_withdrawn_when_the_next_cycle_starts(as_admin, at, fresh_store):
    waiting = [p for p in fresh_store.proposals if p.status == ProposalStatus.submitted]
    assert {p.id for p in waiting} == {"prp-1", "prp-2"}
    at(AFTER_CLOSE)
    _start_next_cycle(as_admin)
    assert all(p.status == ProposalStatus.withdrawn and p.decided_at is not None for p in waiting)
    assert fresh_store.proposal("prp-3").status == ProposalStatus.accepted  # a decided one stays as it was
