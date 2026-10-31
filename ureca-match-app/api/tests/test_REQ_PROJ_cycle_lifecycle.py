"""Slice B. Projects live only while a cycle is open, and a supervisor reopens the same one.  REQ-PROJ-4.

Seed: sup-1 owns lst-1..3, demo clock 7 Sep 2026 (inside Round 2). The seeded cycle closes in October.
"""

from datetime import UTC, datetime

from app.models import ListingStatus
from app.settings import get_settings
from tests.test_REQ_PROJ import new_listing

AFTER_CYCLE = datetime(2026, 12, 1, 9, tzinfo=UTC)


def _status(store, lid):
    return store.listing(lid).status


def test_REQ_PROJ_4_creating_the_next_cycle_closes_last_cycles_projects(as_admin, fresh_store, monkeypatch):
    # In Supabase mode the schedule runs on the daily cron, so the next cycle can be created before it has run.
    monkeypatch.setattr(get_settings(), "scheduler_on_request", False)
    monkeypatch.setattr(get_settings(), "demo_now", AFTER_CYCLE)
    assert _status(fresh_store, "lst-1") == ListingStatus.published
    body = {
        "academic_year": "AY27/28 Semester 1",
        "opening_date": "2027-08-01T09:00:00Z",
        "closing_date": "2027-11-01T09:00:00Z",
        "pre_application_days": 7,
    }
    assert as_admin.post("/admin/cycles", json=body).status_code == 201
    assert _status(fresh_store, "lst-1") == ListingStatus.closed


def test_REQ_PROJ_4_the_closing_date_passing_closes_them_and_empties_browse(at, as_student, fresh_store):
    at(AFTER_CYCLE)
    assert _status(fresh_store, "lst-1") == ListingStatus.closed
    assert as_student.get("/listings").json() == []


def test_REQ_PROJ_4_drafts_stay_drafts(as_supervisor, at, fresh_store):
    draft = as_supervisor.post("/supervisor/listings", json=new_listing(publish=False)).json()["id"]
    at(AFTER_CYCLE)
    assert _status(fresh_store, draft) == ListingStatus.draft


def test_REQ_PROJ_4_reopen_keeps_the_project_and_restarts_slots(as_supervisor, fresh_store):
    lid = as_supervisor.post("/supervisor/listings", json=new_listing()).json()["id"]
    fresh_store.listing(lid).filled_slots = 1  # last cycle's student, with no accepted match in this cycle
    as_supervisor.post(f"/supervisor/listings/{lid}/close")
    r = as_supervisor.post(f"/supervisor/listings/{lid}/reopen")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "published" and body["title"] == new_listing()["title"]
    assert body["filled_slots"] == 0


def test_REQ_PROJ_4_reopen_counts_students_who_accepted_this_cycle(as_supervisor):
    as_supervisor.post("/supervisor/listings/lst-1/close")  # seed: stu-33 accepted lst-1 in Round 1 of this cycle
    assert as_supervisor.post("/supervisor/listings/lst-1/reopen").json()["filled_slots"] == 1


def test_REQ_PROJ_4_reopen_refused_when_no_cycle_is_open(at, as_supervisor, as_admin, fresh_store):
    at(AFTER_CYCLE)
    r = as_supervisor.post("/supervisor/listings/lst-1/reopen")
    assert r.status_code == 422 and r.json()["code"] == "cycle_not_open"


def test_REQ_PROJ_4_only_the_owner_reopens_and_only_a_closed_project(client_for, as_supervisor):
    as_supervisor.post("/supervisor/listings/lst-1/close")
    assert client_for("sup-2").post("/supervisor/listings/lst-1/reopen").status_code == 403
    assert as_supervisor.post("/supervisor/listings/lst-1/reopen").status_code == 200
    assert as_supervisor.post("/supervisor/listings/lst-1/reopen").status_code == 409
