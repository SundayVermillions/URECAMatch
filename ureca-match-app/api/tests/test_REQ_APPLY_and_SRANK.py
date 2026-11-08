"""Slice C. Application window and ranking rules."""

from datetime import timedelta

import pytest

from app.errors import ApiError
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


def test_REQ_APPLY_1_cannot_withdraw_matched_application(client_for, fresh_store):
    a = next(a for a in fresh_store.applications if a.student_id == "stu-33" and a.status.value == "matched")
    r = client_for("stu-33").delete(f"/applications/{a.id}")
    assert r.status_code == 409 and r.json()["code"] == "not_withdrawable"


def test_REQ_APPLY_2_document_must_belong_to_applicant(as_student):
    body = {"listing_id": "lst-8", "statement": STATEMENT, "document_ids": ["doc-stu-7-t"]}
    r = as_student.post("/applications", json=body)
    assert r.status_code == 422 and r.json()["code"] == "unknown_document"
    r = as_student.post("/applications", json={**body, "document_ids": ["doc-stu-1-t"]})
    assert r.status_code == 201 and r.json()["document_ids"] == ["doc-stu-1-t"]


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


def test_REQ_SRANK_1_order_persisted(as_student):
    ids = [a["id"] for a in as_student.get("/me/applications").json() if a["status"] == "submitted"]
    assert as_student.put("/me/ranking", json={"application_ids": ids[::-1]}).status_code == 200
    again = [a["id"] for a in as_student.get("/me/applications").json() if a["status"] == "submitted"]
    assert again == ids[::-1]


def test_REQ_SRANK_2_duplicate_ids_rejected(as_student):
    ids = [a["id"] for a in as_student.get("/me/applications").json() if a["status"] == "submitted"]
    r = as_student.put("/me/ranking", json={"application_ids": [*ids, ids[0]]})
    assert r.status_code == 422 and r.json()["code"] == "ranking_incomplete"


# ------------------------------------------------------------------ re-applying after a withdrawal (REQ-APPLY-2)


def _open_listings(store, student_id: str, n: int) -> list[str]:
    """Published projects with a free slot that the student has never applied to."""
    applied = {a.listing_id for a in store.applications_for(student_id=student_id)}
    return [
        lst.id
        for lst in store.all_listings()
        if lst.status.value == "published" and lst.filled_slots < lst.available_slots and lst.id not in applied
    ][:n]


def _rows(store, student_id: str, listing_id: str, round_id: str):
    return store.applications_for(student_id=student_id, listing_id=listing_id, round_id=round_id)


def test_REQ_APPLY_2_reapply_after_withdraw_reopens_the_same_row(as_student, fresh_store):
    (lst,) = _open_listings(fresh_store, "stu-1", 1)
    first = as_student.post("/applications", json={"listing_id": lst, "statement": STATEMENT})
    assert first.status_code == 201
    assert as_student.delete(f"/applications/{first.json()['id']}").status_code == 200
    again_body = {"listing_id": lst, "statement": STATEMENT + " Second try.", "document_ids": ["doc-stu-1-t"]}
    again = as_student.post("/applications", json=again_body)
    assert again.status_code == 201
    assert again.json()["status"] == "submitted"
    rows = _rows(fresh_store, "stu-1", lst, first.json()["round_id"])
    assert len(rows) == 1 and rows[0].id == first.json()["id"]
    assert rows[0].statement == again_body["statement"] and rows[0].document_ids == ["doc-stu-1-t"]


def test_REQ_APPLY_2_reapply_goes_to_the_end_of_the_preference_order(as_student, fresh_store):
    lst_a, lst_b = _open_listings(fresh_store, "stu-1", 2)
    a = as_student.post("/applications", json={"listing_id": lst_a, "statement": STATEMENT}).json()
    assert as_student.delete(f"/applications/{a['id']}").status_code == 200
    assert as_student.post("/applications", json={"listing_id": lst_b, "statement": STATEMENT}).status_code == 201
    again = as_student.post("/applications", json={"listing_id": lst_a, "statement": STATEMENT})
    assert again.status_code == 201
    mine = [x for x in as_student.get("/me/applications").json() if x["status"] == "submitted"]
    assert mine[-1]["listing_id"] == lst_a
    assert again.json()["preference_rank"] == len(mine)
    assert sorted(x["preference_rank"] for x in mine) == list(range(1, len(mine) + 1))


def test_REQ_APPLY_2_applying_twice_without_withdrawing_is_409(as_student, fresh_store):
    (lst,) = _open_listings(fresh_store, "stu-1", 1)
    assert as_student.post("/applications", json={"listing_id": lst, "statement": STATEMENT}).status_code == 201
    r = as_student.post("/applications", json={"listing_id": lst, "statement": STATEMENT})
    assert r.status_code == 409 and r.json()["code"] == "already_applied"


def _supabase_store(monkeypatch):
    """SupabaseStore over the fake database, served by the app instead of the in-memory store."""
    from app.db import store as store_module
    from app.db.seed_db import seed_database
    from tests.fake_supabase import FakeDB
    from tests.test_PERSISTENCE_supabase import make_store

    db = FakeDB()
    seed_database(db.client())
    s = make_store(db)
    monkeypatch.setattr(store_module, "_store", s)
    return db, s


def test_REQ_APPLY_2_reapply_after_withdraw_in_supabase_store(as_student, monkeypatch):
    db, s = _supabase_store(monkeypatch)
    (lst,) = _open_listings(s, "stu-1", 1)
    first = as_student.post("/applications", json={"listing_id": lst, "statement": STATEMENT})
    assert first.status_code == 201
    assert as_student.delete(f"/applications/{first.json()['id']}").status_code == 200
    again = as_student.post("/applications", json={"listing_id": lst, "statement": STATEMENT + " Again."})
    assert again.status_code == 201
    rows = [
        r
        for r in db.rows("listing_applications")
        if (r["student_id"], r["listing_id"], r["round_id"]) == ("stu-1", lst, first.json()["round_id"])
    ]
    assert len(rows) == 1 and rows[0]["status"] == "submitted" and rows[0]["statement"].endswith("Again.")


def test_REQ_APPLY_2_duplicate_row_in_supabase_is_409_not_500(monkeypatch):
    """Safety net: if a second row for one student, project and round reaches the database, the unique constraint
    refuses it and the API answers 409 already_applied instead of crashing."""
    _, s = _supabase_store(monkeypatch)
    existing = s.applications_for(student_id="stu-1")[0]
    clash = existing.model_copy(update={"id": "app-duplicate", "preference_rank": None})
    with pytest.raises(ApiError) as err:
        s.save_applications(clash)
    assert err.value.status_code == 409 and err.value.detail["code"] == "already_applied"
