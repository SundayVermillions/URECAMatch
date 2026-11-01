"""Slice D on a store that behaves like SupabaseStore: reads return copies and only save_* calls change what
is stored. Catches routers that read the in-memory seed lists or forget to save.
REQ-EXEC-1..4, 6, REQ-PUB-2, 4, REQ-OUTCOME-1..4."""

from datetime import UTC, datetime

import pytest

from app.db import store as store_module
from app.db.store import MockStore
from app.models import ApplicationStatus, MatchStatus, NotificationEvent
from app.settings import get_settings
from tests.conftest import APPROVAL_CLOSED, REVIEW_CLOSED


class CopyStore(MockStore):
    """Saved data lives in private dicts. The public lists the old code read directly are left empty."""

    def __init__(self) -> None:
        super().__init__()
        self.saved_apps = {a.id: a.model_copy(deep=True) for a in self.applications}
        self.saved_listings = {x.id: x.model_copy(deep=True) for x in self.listings}
        self.saved_students = {s.user_id: s.model_copy(deep=True) for s in self.students}
        self.saved_rankings = dict(self.applicant_rankings)
        self.applications, self.listings, self.applicant_rankings = [], [], {}

    def student(self, user_id):
        s = self.saved_students.get(user_id)
        return s.model_copy(deep=True) if s else None

    def save_student(self, student):
        self.saved_students[student.user_id] = student.model_copy(deep=True)
        return student

    def listing(self, listing_id):
        x = self.saved_listings.get(listing_id)
        return x.model_copy(deep=True) if x else None

    def all_listings(self):
        return [x.model_copy(deep=True) for x in self.saved_listings.values()]

    def save_listing(self, listing):
        self.saved_listings[listing.id] = listing.model_copy(deep=True)
        return listing

    def applications_for(self, student_id=None, listing_id=None, round_id=None):
        return [
            a.model_copy(deep=True)
            for a in self.saved_apps.values()
            if (student_id is None or a.student_id == student_id)
            and (listing_id is None or a.listing_id == listing_id)
            and (round_id is None or a.round_id == round_id)
        ]

    def application(self, application_id):
        a = self.saved_apps.get(application_id)
        return a.model_copy(deep=True) if a else None

    def save_applications(self, *apps):
        for a in apps:
            self.saved_apps[a.id] = a.model_copy(deep=True)

    def ranking(self, listing_id, round_id):
        return list(self.saved_rankings.get(f"{listing_id}:{round_id}", []))

    def save_ranking(self, listing_id, round_id, application_ids, submitted_at):
        self.saved_rankings[f"{listing_id}:{round_id}"] = list(application_ids)


@pytest.fixture
def copies(fresh_store, monkeypatch):
    s = CopyStore()
    monkeypatch.setattr(store_module, "_store", s)
    return s


def _at(monkeypatch, *ymd_h):
    monkeypatch.setattr(get_settings(), "demo_now", datetime(*ymd_h, tzinfo=UTC))


def _run_round_2(copies, client_for, at):
    """sup-2 ranks every lst-4 applicant (saved through the store), then the clock runs Round 2 to publication."""
    ids = [a["application_id"] for a in client_for("sup-2").get("/supervisor/listings/lst-4/applicants").json()]
    assert client_for("sup-2").put("/supervisor/listings/lst-4/ranking", json={"application_ids": ids}).status_code == 200
    at(REVIEW_CLOSED)
    at(APPROVAL_CLOSED)
    return [m for m in copies.matches if m.round_id == "rnd-2" and m.status == MatchStatus.published]


def test_REQ_EXEC_matching_uses_saved_rankings_and_applications(copies, client_for, at):
    offers = _run_round_2(copies, client_for, at)
    assert any(m.listing_id == "lst-4" for m in offers)  # only reachable through the saved ranking


def test_REQ_PUB_2_publish_saves_application_outcomes(copies, client_for, at):
    _run_round_2(copies, client_for, at)
    statuses = {a.status for a in copies.saved_apps.values() if a.round_id == "rnd-2"}
    assert ApplicationStatus.submitted not in statuses


def test_REQ_OUTCOME_1_accept_saves_slot_eligibility_and_withdrawals(copies, client_for, at):
    m = _run_round_2(copies, client_for, at)[0]
    filled = copies.saved_listings[m.listing_id].filled_slots
    later = next(a for a in copies.saved_apps.values() if a.student_id != m.student_id and a.round_id == "rnd-2")
    # an application the student still has open in a later round
    update = {"id": "app-later", "student_id": m.student_id, "round_id": "rnd-3", "status": ApplicationStatus.submitted}
    copies.saved_apps["app-later"] = later.model_copy(update=update)
    assert client_for(m.student_id).post("/me/match/accept").status_code == 200
    assert copies.saved_listings[m.listing_id].filled_slots == filled + 1
    assert copies.saved_students[m.student_id].eligible_for_matching is False
    assert copies.saved_apps["app-later"].status == ApplicationStatus.withdrawn  # use case 2-5


def test_REQ_OUTCOME_2_decline_saves_ineligibility(copies, client_for, at):
    m = _run_round_2(copies, client_for, at)[0]
    assert client_for(m.student_id).post("/me/match/decline").status_code == 200
    assert copies.saved_students[m.student_id].eligible_for_matching is False


def test_REQ_OUTCOME_4_timeout_saves_ineligibility(copies, as_admin, client_for, monkeypatch, at):
    m = _run_round_2(copies, client_for, at)[0]
    _at(monkeypatch, 2026, 9, 30, 9)  # after the offer deadline
    assert as_admin.post("/internal/tick").status_code == 200
    assert copies.saved_students[m.student_id].eligible_for_matching is False


@pytest.mark.parametrize("failing_save", [1, 2])  # the rollover copies, then the applications' outcomes
def test_REQ_PUB_4_a_failed_save_while_publishing_is_retried_cleanly(copies, client_for, at, monkeypatch, failing_save):
    at(REVIEW_CLOSED)
    calls, save = [], copies.save_applications

    def flaky(*apps):
        calls.append(len(apps))
        if len(calls) == failing_save:
            raise RuntimeError("database unavailable")
        save(*apps)

    monkeypatch.setattr(copies, "save_applications", flaky)
    monkeypatch.setattr(get_settings(), "demo_now", APPROVAL_CLOSED)
    assert client_for("stu-1").get("/me").status_code == 200  # the failure is logged, not passed on to this request
    assert copies.cycle.rounds[1].published_at is None
    at(APPROVAL_CLOSED)  # the next request publishes from a clean start
    offers = {m.student_id: m.listing_id for m in copies.matches if m.round_id == "rnd-2" and m.status == MatchStatus.published}
    assert offers
    won = [a for a in copies.saved_apps.values() if a.round_id == "rnd-2" and offers.get(a.student_id) == a.listing_id]
    assert {a.status for a in won} == {ApplicationStatus.matched}
    told_unmatched = {
        n.user_id for n in copies.notifications if n.event == NotificationEvent.results_published and "not matched" in n.message
    }
    assert not told_unmatched & offers.keys()
    carried = [(a.student_id, a.listing_id) for a in copies.saved_apps.values() if a.round_id == "rnd-3"]
    assert carried and len(carried) == len(set(carried))  # no application carried over twice
