"""Slice C. Application window and ranking rules."""


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
