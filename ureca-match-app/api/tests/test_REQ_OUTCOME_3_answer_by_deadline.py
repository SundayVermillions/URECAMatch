"""Slice D. A student can answer an offer until its deadline and not after (REQ-OUTCOME-3).

The handlers check the deadline themselves, because the scheduler may not have timed a lapsed offer out yet: in
Supabase mode the schedule runs on the daily cron, and it does nothing at all once the cycle has closed (REQ-EXEC-6).
"""

from datetime import timedelta

import pytest

from app.models import ApplicationStatus, MatchStatus
from app.settings import get_settings
from tests.conftest import APPROVAL_CLOSED, REVIEW_CLOSED

STATEMENT = "I would like to join this project because it matches my coursework and interests well."


def _rank_everyone(store, round_id: str) -> None:
    """Each supervisor ranks every applicant to their project in the round, in the order they applied."""
    for lid in {a.listing_id for a in store.applications if a.round_id == round_id}:
        store.applicant_rankings[f"{lid}:{round_id}"] = [
            a.id for a in store.applications if a.listing_id == lid and a.round_id == round_id and a.status.value == "submitted"
        ]


@pytest.fixture
def round_2_offers(fresh_store, at):
    """Round 2 published: the students it matched hold open offers until Round 3's applications close."""
    _rank_everyone(fresh_store, "rnd-2")
    at(REVIEW_CLOSED)
    at(APPROVAL_CLOSED)
    offers = [m for m in fresh_store.matches if m.round_id == "rnd-2" and m.status == MatchStatus.published]
    assert len(offers) >= 2
    return offers


def _set_now(monkeypatch, when) -> None:
    monkeypatch.setattr(get_settings(), "demo_now", when)


def _round_3_offer(store, at, client_for):
    """A student offered a place in Round 3, the last round, so the offer runs until the cycle's closing date."""
    r3 = next(r for r in store.cycle.rounds if r.number == 3)
    at(r3.application_start + timedelta(hours=1))
    for u in store.users:
        sp = store.student(u.id)
        if not (sp and sp.profile_complete and sp.eligible_for_matching) or any(m.student_id == u.id for m in store.matches):
            continue
        for lst in store.listings:
            r = client_for(u.id).post("/applications", json={"listing_id": lst.id, "statement": STATEMENT})
            if r.status_code == 201:
                store.applicant_rankings[f"{lst.id}:rnd-3"] = [r.json()["id"]]
                at(r3.review_end + timedelta(seconds=1))
                at(r3.approval_end + timedelta(seconds=1))
                return next(m for m in store.matches if m.student_id == u.id and m.round_id == "rnd-3")
    raise AssertionError("no student could apply in Round 3")


def test_REQ_OUTCOME_3_an_offer_can_be_answered_until_its_deadline(round_2_offers, client_for, monkeypatch):
    offer = round_2_offers[0]
    _set_now(monkeypatch, offer.offer_expires_at)
    assert client_for(offer.student_id).post("/me/match/accept").status_code == 200


def test_REQ_OUTCOME_3_a_lapsed_offer_cannot_be_answered_before_the_cron_times_it_out(
    round_2_offers, client_for, monkeypatch, at
):
    monkeypatch.setattr(get_settings(), "scheduler_on_request", False)  # as in Supabase mode
    first, second = round_2_offers[:2]
    late = first.offer_expires_at + timedelta(hours=1)
    _set_now(monkeypatch, late)
    r = client_for(first.student_id).post("/me/match/accept")
    assert r.status_code == 409 and r.json()["code"] == "offer_expired"
    r = client_for(second.student_id).post("/me/match/decline")
    assert r.status_code == 409 and r.json()["code"] == "offer_expired"
    assert first.status == second.status == MatchStatus.published  # nothing changed: the cron times them out
    at(late)
    assert first.status == second.status == MatchStatus.timed_out


def test_REQ_OUTCOME_3_a_last_round_offer_cannot_be_answered_after_the_cycle_closes(fresh_store, at, client_for):
    offer = _round_3_offer(fresh_store, at, client_for)
    assert offer.status == MatchStatus.published and offer.offer_expires_at == fresh_store.cycle.closing_date
    at(fresh_store.cycle.closing_date + timedelta(days=1))
    assert offer.status == MatchStatus.published  # the schedule leaves a closed cycle alone
    r = client_for(offer.student_id).post("/me/match/accept")
    assert r.status_code == 409 and r.json()["code"] == "offer_expired"


def test_REQ_OUTCOME_1_taking_the_last_slot_withdraws_everyone_elses_application(round_2_offers, client_for, fresh_store):
    offer = round_2_offers[0]
    lst = fresh_store.listing(offer.listing_id)
    lst.available_slots = lst.filled_slots + 1  # this offer takes the last slot
    other = next(u.id for u in fresh_store.users if u.role.value == "student" and u.id != offer.student_id)
    template = next(a for a in fresh_store.applications if a.listing_id == lst.id)
    waiting = template.model_copy(
        update={"id": "app-waiting", "student_id": other, "status": ApplicationStatus.submitted, "preference_rank": 1}
    )
    fresh_store.save_applications(waiting)
    assert client_for(offer.student_id).post("/me/match/accept").status_code == 200
    assert next(a for a in fresh_store.applications if a.id == "app-waiting").status == ApplicationStatus.withdrawn
    assert any(n.user_id == other and "is full" in n.title for n in fresh_store.notifications_for(other))
