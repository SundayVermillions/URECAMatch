"""Slice B. A supervisor cannot take slots away from accepted students or from offers still open.  REQ-PROJ-3.

Flow: Round 2 is executed, approved and published, so students hold offers. Some accept; some have not answered.
Slots may never drop below accepted students plus open offers, otherwise a late acceptance overfills the project.
"""

from datetime import UTC, datetime

import pytest

from app.settings import get_settings

ROUND_3_REVIEW = datetime(2026, 9, 21, 9, tzinfo=UTC)


def _set_now(monkeypatch, when):
    monkeypatch.setattr(get_settings(), "demo_now", when)


@pytest.fixture
def published_round_2(as_admin, client_for, monkeypatch, fresh_store):
    """Round 2 published. lst-1 (3 slots, 1 filled from Round 1) ends with 2 students holding open offers."""
    for lid in ("lst-1", "lst-2", "lst-3"):
        ids = [
            a.id
            for a in fresh_store.applications
            if a.listing_id == lid and a.round_id == "rnd-2" and a.status.value == "submitted"
        ]
        fresh_store.applicant_rankings[f"{lid}:rnd-2"] = ids
    _set_now(monkeypatch, datetime(2026, 9, 12, 9, tzinfo=UTC))
    assert as_admin.post("/admin/rounds/rnd-2/execute").status_code == 200
    for m in as_admin.get("/admin/rounds/rnd-2/matches").json():
        client_for(m["supervisor_id"]).post(f"/supervisor/matches/{m['id']}/approve", json={})
    assert as_admin.post("/admin/rounds/rnd-2/publish").status_code == 200
    return fresh_store


def _offers(store, listing_id):
    return [m for m in store.matches if m.listing_id == listing_id and m.status.value == "published"]


def test_REQ_PROJ_3_cannot_cut_slots_below_accepted_students_in_a_later_round(
    published_round_2, client_for, as_supervisor, monkeypatch
):
    store = published_round_2
    client_for(_offers(store, "lst-1")[0].student_id).post("/me/match/accept")
    _set_now(monkeypatch, ROUND_3_REVIEW)
    accepted = store.listing("lst-1").filled_slots
    r = as_supervisor.put("/supervisor/listings/lst-1", json={"available_slots": accepted - 1})
    assert r.status_code == 422 and r.json()["code"] == "slots_below_matched"


def test_REQ_PROJ_3_cannot_cut_slots_below_accepted_plus_open_offers(published_round_2, as_supervisor):
    store = published_round_2
    lst = store.listing("lst-1")
    assert lst.filled_slots == 1 and len(_offers(store, "lst-1")) == 2  # 1 accepted + 2 open offers
    r = as_supervisor.put("/supervisor/listings/lst-1", json={"available_slots": 1})
    assert r.status_code == 422 and r.json()["code"] == "slots_below_matched"
    assert "3" in r.json()["message"]
    assert store.listing("lst-1").available_slots == 3  # nothing was saved


def test_REQ_PROJ_3_slots_can_drop_to_exactly_accepted_plus_open_offers(published_round_2, as_supervisor):
    assert as_supervisor.put("/supervisor/listings/lst-1", json={"available_slots": 3}).status_code == 200


def test_REQ_PROJ_3_all_open_offers_can_still_be_accepted(published_round_2, client_for, as_supervisor):
    store = published_round_2
    offers = _offers(store, "lst-1")
    as_supervisor.put("/supervisor/listings/lst-1", json={"available_slots": 3})
    for m in offers:
        assert client_for(m.student_id).post("/me/match/accept").status_code == 200
    lst = store.listing("lst-1")
    assert lst.filled_slots == 3 <= lst.available_slots  # never over capacity


def test_REQ_PROJ_3_a_declined_offer_frees_its_slot_for_the_supervisor(published_round_2, client_for, as_supervisor):
    store = published_round_2
    client_for(_offers(store, "lst-1")[0].student_id).post("/me/match/decline")
    assert (
        as_supervisor.put("/supervisor/listings/lst-1", json={"available_slots": 2}).status_code == 200
    )  # 1 accepted + 1 open offer
    assert as_supervisor.put("/supervisor/listings/lst-1", json={"available_slots": 1}).status_code == 422


def test_REQ_PROJ_3_supervisor_sees_how_many_slots_are_held(published_round_2, as_supervisor):
    lst = as_supervisor.get("/listings/lst-1").json()
    assert lst["filled_slots"] == 1 and lst["held_slots"] == 2


def test_REQ_PROJ_3_raising_slots_is_always_allowed(published_round_2, as_supervisor):
    assert as_supervisor.put("/supervisor/listings/lst-1", json={"available_slots": 10}).status_code == 200
