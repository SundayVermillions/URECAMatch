"""Slice C. Application window and ranking rules."""

from datetime import timedelta

from app.services import windows
from app.settings import get_settings

STATEMENT = "I am keen to join this project because it matches my coursework and interests."


def _one_minute_after_window(store, monkeypatch):
    """Move the mock clock to one minute after the current round's application window closes."""
    settings = get_settings()
    rnd = windows.current_round(store.cycle, settings.now())
    monkeypatch.setattr(settings, "demo_now", rnd.application_end + timedelta(minutes=1))


def test_REQ_APPLY_1_apply_after_window_rejected(as_student, fresh_store, monkeypatch):
    _one_minute_after_window(fresh_store, monkeypatch)
    r = as_student.post("/applications", json={"listing_id": "lst-8", "statement": STATEMENT})
    assert r.status_code == 422 and r.json()["code"] == "window_closed"


def test_REQ_APPLY_1_withdraw_after_window_rejected(as_student, fresh_store, monkeypatch):
    r = as_student.post("/applications", json={"listing_id": "lst-8", "statement": STATEMENT})
    assert r.status_code == 201
    _one_minute_after_window(fresh_store, monkeypatch)
    r = as_student.delete(f"/applications/{r.json()['id']}")
    assert r.status_code == 422 and r.json()["code"] == "window_closed"


def test_REQ_APPLY_1_profile_incomplete_rejected(as_student, fresh_store):
    fresh_store.student("stu-1").profile_complete = False
    r = as_student.post("/applications", json={"listing_id": "lst-8", "statement": STATEMENT})
    assert r.status_code == 409 and r.json()["code"] == "profile_incomplete"


def test_REQ_APPLY_2_statement_required(as_student):
    r = as_student.post("/applications", json={"listing_id": "lst-8", "statement": "too short"})
    assert r.status_code == 422 and r.json()["field"] == "statement"


def test_REQ_SRANK_2_ranking_must_cover_every_active_application(as_student):
    mine = as_student.get("/me/applications").json()
    ids = [a["id"] for a in mine if a["status"] == "submitted"]
    bad = as_student.put("/me/ranking", json={"application_ids": ids[:-1]})
    assert bad.status_code == 422
    good = as_student.put("/me/ranking", json={"application_ids": list(reversed(ids))})
    assert good.status_code == 200
    assert [a["id"] for a in good.json() if a["status"] == "submitted"] == list(reversed(ids))


def test_REQ_VRANK_1_top_ten_flag_limited(as_supervisor):
    rows = as_supervisor.get("/supervisor/listings/lst-1/applicants").json()
    assert sum(1 for r in rows if r["recommended"]) <= 10
