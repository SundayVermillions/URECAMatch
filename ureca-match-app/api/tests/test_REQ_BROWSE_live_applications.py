"""Slice B. Slice B reads applications through the store, never from the in-memory list.  REQ-BROWSE-2, REQ-PROJ-2, REQ-REVPROP-2.

In Supabase mode `store.applications` is only the in-memory seed list: the real applications live in the database and are
read and saved through `applications_for()` and `save_applications()`. The fixture below makes the two diverge, the way
they do in live mode, so a router that reads the list directly sees nothing and fails these tests.
"""

import pytest

from app.db.store import MockStore


@pytest.fixture
def live_like(fresh_store, monkeypatch):
    """The applications now live behind applications_for() / save_applications(); store.applications is stale and empty."""
    database = list(fresh_store.applications)
    fresh_store.applications = []

    def applications_for(self, student_id=None, listing_id=None, round_id=None):
        return [
            a
            for a in database
            if (student_id is None or a.student_id == student_id)
            and (listing_id is None or a.listing_id == listing_id)
            and (round_id is None or a.round_id == round_id)
        ]

    def save_applications(self, *apps):
        for a in apps:
            if all(x.id != a.id for x in database):
                database.append(a)

    monkeypatch.setattr(MockStore, "applications_for", applications_for)
    monkeypatch.setattr(MockStore, "save_applications", save_applications)
    return database


def test_REQ_BROWSE_2_cards_show_real_applicant_counts_and_my_application(live_like, as_student):
    rows = {r["id"]: r for r in as_student.get("/listings").json()}
    assert rows["lst-2"]["applied"] is True and rows["lst-2"]["applied_rank"] == 2  # stu-1 really applied to lst-2
    expected = sum(1 for a in live_like if a.listing_id == "lst-2" and a.status.value == "submitted")
    assert rows["lst-2"]["applicant_count"] == expected > 0


def test_REQ_BROWSE_7_recommendations_leave_out_what_the_student_really_applied_to(live_like, client_for):
    shown = {r["listing"]["id"] for r in client_for("stu-1").get("/me/recommendations", params={"limit": 50}).json()}
    assert "lst-2" not in shown  # applied, so not recommended again


def test_REQ_PROJ_2_supervisor_listing_shows_real_applicant_count(live_like, as_supervisor):
    row = next(r for r in as_supervisor.get("/supervisor/listings").json() if r["id"] == "lst-2")
    assert row["applicant_count"] > 0


def test_REQ_PROJ_2_closing_withdraws_the_real_applications(live_like, client_for):
    assert client_for("sup-5").post("/supervisor/listings/lst-10/close").status_code == 200
    mine = [a for a in live_like if a.student_id == "stu-1" and a.status.value == "submitted"]
    assert {a.listing_id: a.preference_rank for a in mine} == {"lst-2": 1}  # lst-10 withdrawn, the other moved up


def test_REQ_REVPROP_2_accepting_a_proposal_withdraws_the_real_applications(live_like, client_for):
    assert client_for("sup-1").post("/supervisor/proposals/prp-2/accept", json={}).status_code == 200
    open_ones = [a for a in live_like if a.student_id == "stu-9" and a.status.value == "submitted"]
    assert open_ones == []
    assert any(a.student_id == "stu-9" and a.status.value == "withdrawn" for a in live_like)
