"""REQ-VRANK-4 evidence and document reading, REQ-VRANK-5 per-project weights, REQ-APPLY-6 tips before submitting."""

from __future__ import annotations

import json as jsonlib

from app.models import ScoreWeights
from app.services import ai_match, application_tips, document_text
from app.settings import get_settings

AI_MATCH = "/supervisor/listings/lst-1/applicants/ai-match"
WEIGHTS = "/supervisor/listings/lst-1/score-weights"
TIPS = "/me/applications/tips"
FACTORS = {"prerequisites": 100, "fit": 100, "experience": 0, "cgpa": 0}


def _application(store):
    return next(a for a in store.applications_for(listing_id="lst-1", round_id="rnd-2") if a.status.value == "submitted")


class Reply:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return {"candidates": [{"content": {"parts": [{"text": jsonlib.dumps(self.payload)}]}}]}


def _gemini(monkeypatch, reply, seen=None):
    def fake_post(url, headers, json, timeout):
        text = json["contents"][0]["parts"][0]["text"]
        if seen is not None:
            seen.append(text)
        return Reply(reply(text))

    monkeypatch.setattr(get_settings(), "gemini_api_key", "test-key")
    monkeypatch.setattr("app.services.ai_match.httpx.post", fake_post)


# ---------------------------------------------------------------- documents


def test_REQ_VRANK_4_document_text_never_in_a_response(as_student, as_supervisor, fresh_store):
    assert fresh_store.student("stu-2").documents[0].extracted_text  # seeded text; stu-1 has real PDFs
    for r in [as_student.get("/me/profile"), as_student.get("/me"), as_supervisor.get("/supervisor/listings/lst-1/applicants")]:
        assert r.status_code == 200 and "extracted_text" not in r.text and "Curriculum vitae" not in r.text
    assert "extracted_text" not in as_student.get("/openapi.json").text


def test_REQ_VRANK_4_scrub_removes_private_details():
    out = document_text.scrub("Me a.b@e.ntu.edu.sg U2345678A S1234567D +65 9123 4567 scored 4.50 in SC2001")
    assert "ntu.edu" not in out and "U2345678A" not in out and "S1234567D" not in out and "9123" not in out
    assert "4.50" in out and "SC2001" in out


def test_REQ_VRANK_4_unreadable_pdf_gives_empty_text():
    assert document_text.extract_text(b"not a pdf") == ""


def test_REQ_APPLY_2_supervisor_sees_only_attached_documents(as_supervisor, fresh_store):
    """A document the student left unticked is neither listed nor viewable."""
    app = _application(fresh_store)
    left_out = next(d for d in app.document_ids if d.endswith("-cv"))
    app.document_ids = [d for d in app.document_ids if d != left_out]
    rows = as_supervisor.get("/supervisor/listings/lst-1/applicants").json()
    row = next(r for r in rows if r["application_id"] == app.id)
    assert left_out not in [d["id"] for d in row["documents"]]
    others = [a for a in fresh_store.applications_for(student_id=app.student_id) if left_out in a.document_ids]
    if not any(fresh_store.listing(a.listing_id).supervisor_id == "sup-1" for a in others):
        assert as_supervisor.get(f"/documents/{left_out}/view").status_code == 403


# ---------------------------------------------------------------- evidence


def test_REQ_VRANK_4_keeps_real_quotes_and_drops_invented_ones(as_supervisor, monkeypatch):
    a = as_supervisor.get("/supervisor/listings/lst-1/applicants").json()[0]
    real = " ".join(a["statement"].split())[:40]
    doc = next(d for d in a["documents"] if d["kind"] == "transcript")

    def reply(_):
        return [
            {
                "student_id": a["student"]["id"],
                "factor_scores": FACTORS,
                "reason": "Good fit",
                "evidence": [
                    {"factor": "fit", "source_id": "statement", "quote": real.upper()},  # case does not matter
                    {"factor": "cgpa", "source_id": doc["id"], "quote": "Cumulative GPA"},
                    {"factor": "experience", "source_id": "statement", "quote": "Won a Nobel Prize in physics"},
                    {"factor": "fit", "source_id": "doc-of-someone-else", "quote": "Cumulative GPA"},
                    {"factor": "made-up", "source_id": "statement", "quote": real},
                ],
            }
        ]

    _gemini(monkeypatch, reply)
    s = next(x for x in as_supervisor.post(AI_MATCH).json() if x["student_id"] == a["student"]["id"])
    assert s["source"] == "ai"
    assert [(e["factor"], e["source"]) for e in s["evidence"]] == [("fit", "Statement"), ("cgpa", doc["file_name"])]


def test_REQ_VRANK_4_reads_attached_documents_and_names_unreadable_ones(as_supervisor, fresh_store, monkeypatch):
    app = _application(fresh_store)
    sp = fresh_store.student(app.student_id)
    cv = next(d for d in sp.documents if d.kind == "supporting")
    cv.extracted_text = ""
    next(d for d in sp.documents if d.kind == "transcript").extracted_text = "Marker-attached-text"
    seen = []
    _gemini(monkeypatch, lambda _: [{"student_id": app.student_id, "factor_scores": FACTORS, "reason": "ok"}], seen)
    s = next(x for x in as_supervisor.post(AI_MATCH).json() if x["student_id"] == app.student_id)
    assert "Marker-attached-text" in " ".join(seen)
    assert s["unread_documents"] == [cv.file_name]


def test_REQ_VRANK_4_prompt_favours_related_grades_and_experience(as_supervisor, monkeypatch):
    seen = []
    _gemini(monkeypatch, lambda _: [], seen)
    as_supervisor.post(AI_MATCH)
    assert "count for more than overall CGPA" in seen[0] and "projects, internships and skills" in seen[0]


def test_REQ_VRANK_4_big_round_is_batched_and_a_failed_batch_falls_back(as_supervisor, monkeypatch):
    monkeypatch.setattr(ai_match, "BATCH_SIZE", 2)
    assert len(as_supervisor.get("/supervisor/listings/lst-1/applicants").json()) > 2, "lst-1 needs a few applicants"
    calls = []

    def fake_post(url, headers, json, timeout):
        text = json["contents"][0]["parts"][0]["text"]
        calls.append(text)
        people = jsonlib.loads(text.split("APPLICANTS\n")[1])
        if len(calls) == 1:
            raise ConnectionError("one batch fails")
        return Reply([{"student_id": p["student_id"], "factor_scores": FACTORS, "reason": "ok"} for p in people])

    monkeypatch.setattr(get_settings(), "gemini_api_key", "test-key")
    monkeypatch.setattr("app.services.ai_match.httpx.post", fake_post)
    scores = as_supervisor.post(AI_MATCH).json()
    assert len(calls) >= 2 and {s["source"] for s in scores} == {"ai", "local"}


def test_REQ_VRANK_4_local_formula_shows_its_facts(as_supervisor):
    scores = as_supervisor.post(AI_MATCH).json()
    assert scores and all(s["source"] == "local" and s["evidence"] and s["unread_documents"] == [] for s in scores)


# ---------------------------------------------------------------- weights


def _weights(**kw):
    base = {"prerequisites": 0, "fit": 0, "experience": 0, "cgpa": 0}
    return {**base, **kw}


VALID = {"prerequisites": 5, "fit": 15, "experience": 70, "cgpa": 10}


def test_REQ_VRANK_5_defaults_then_saved_per_project(as_supervisor, fresh_store):
    assert as_supervisor.get(WEIGHTS).json() == ScoreWeights().model_dump()
    body = VALID
    assert as_supervisor.put(WEIGHTS, json=body).json() == body
    assert as_supervisor.get(WEIGHTS).json() == body
    other = next(lst for lst in fresh_store.listings if lst.supervisor_id == "sup-1" and lst.id != "lst-1")
    assert as_supervisor.get(f"/supervisor/listings/{other.id}/score-weights").json() == ScoreWeights().model_dump()


def test_REQ_VRANK_5_must_total_100(as_supervisor):
    r = as_supervisor.put(WEIGHTS, json={**VALID, "fit": 10})
    assert r.status_code == 422 and r.json()["code"] == "bad_weights"
    assert as_supervisor.put(WEIGHTS, json=_weights(fit=150, cgpa=-50)).status_code == 422


def test_REQ_VRANK_5_no_factor_under_5(as_supervisor):
    r = as_supervisor.put(WEIGHTS, json={"prerequisites": 0, "fit": 25, "experience": 65, "cgpa": 10})
    assert r.status_code == 422 and r.json()["code"] == "bad_weights"


def test_REQ_VRANK_5_only_the_projects_supervisor(as_supervisor, client_for, fresh_store):
    other = next(lst for lst in fresh_store.listings if lst.supervisor_id != "sup-1")
    path = f"/supervisor/listings/{other.id}/score-weights"
    assert as_supervisor.get(path).status_code == 403
    assert as_supervisor.put(path, json=VALID).status_code == 403
    assert client_for("stu-1").get(WEIGHTS).status_code == 403


def test_REQ_VRANK_5_not_in_the_listing_students_read(as_supervisor, as_student):
    assert as_supervisor.put(WEIGHTS, json=VALID).status_code == 200
    assert "score_weights" not in as_student.get("/listings/lst-1").text


def test_REQ_VRANK_5_weights_decide_the_gemini_score(as_supervisor, monkeypatch):
    a = as_supervisor.get("/supervisor/listings/lst-1/applicants").json()[0]["student"]["id"]
    rating = {"prerequisites": 0, "fit": 0, "experience": 90, "cgpa": 50}
    _gemini(monkeypatch, lambda _: [{"student_id": a, "factor_scores": rating, "reason": "ok"}])
    for weights in (VALID, {"prerequisites": 5, "fit": 5, "experience": 45, "cgpa": 45}):
        assert as_supervisor.put(WEIGHTS, json=weights).status_code == 200
        s = next(x for x in as_supervisor.post(AI_MATCH).json() if x["student_id"] == a)
        assert s["factor_scores"]["experience"] == 90 and s["score"] == ai_match.weighted(
            s["factor_scores"], ScoreWeights(**weights)
        )


def test_REQ_VRANK_5_a_statement_cannot_claim_a_prerequisite(as_supervisor, fresh_store, monkeypatch):
    """Gemini may believe "I completed the prerequisite"; the record decides that factor."""
    lst = fresh_store.listing("lst-1")
    rows = as_supervisor.get("/supervisor/listings/lst-1/applicants").json()
    a = next(r for r in rows if not r["meets_prerequisites"])
    passed = sum(m in a["student"]["completed_modules"] for m in lst.prerequisites)
    rating = {"prerequisites": 100, "fit": 0, "experience": 0, "cgpa": 0}
    _gemini(monkeypatch, lambda _: [{"student_id": a["student"]["id"], "factor_scores": rating, "reason": "ok"}])
    s = next(x for x in as_supervisor.post(AI_MATCH).json() if x["student_id"] == a["student"]["id"])
    assert s["factor_scores"]["prerequisites"] == round(100 * passed / len(lst.prerequisites))


def test_REQ_VRANK_5_incomplete_rating_is_scored_locally(as_supervisor, monkeypatch):
    a = as_supervisor.get("/supervisor/listings/lst-1/applicants").json()[0]["student"]["id"]
    _gemini(monkeypatch, lambda _: [{"student_id": a, "factor_scores": {"fit": 90}, "reason": "ok"}])
    assert next(x for x in as_supervisor.post(AI_MATCH).json() if x["student_id"] == a)["source"] == "local"


def test_REQ_VRANK_5_local_formula_uses_weights(fresh_store):
    from app.routers.rankings import _applicants

    lst = fresh_store.listing("lst-1")
    a = _applicants(fresh_store, "lst-1", None)[0].model_copy(deep=True)
    a.student.cgpa, a.student.completed_modules, a.student.research_interests = 5.0, [], []
    assert ai_match.local_score(lst, a, ScoreWeights(**_weights(cgpa=100)))[0] == 100
    assert ai_match.local_score(lst, a, ScoreWeights(**_weights(prerequisites=100)))[0] == 0
    # the default is an equal share of the three it can read; only experience weighted falls back to that
    assert ai_match.local_score(lst, a)[0] == 33
    assert ai_match.local_score(lst, a, ScoreWeights(**_weights(experience=100)))[0] == 33


# ---------------------------------------------------------------- tips


def test_REQ_APPLY_6_local_tips_never_score(as_student):
    r = as_student.post(TIPS, json={"listing_id": "lst-1", "statement": "Short.", "document_ids": []})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "local" and set(body) == {"tips", "source"}
    text = " ".join(t["text"] for t in body["tips"])
    assert "statement is short" in text and "transcript is not attached" in text


def test_REQ_APPLY_6_saves_nothing(as_student, fresh_store):
    before = len(fresh_store.applications)
    as_student.post(TIPS, json={"listing_id": "lst-1", "statement": "x" * 60})
    assert len(fresh_store.applications) == before


def test_REQ_APPLY_6_only_own_documents(as_student):
    r = as_student.post(TIPS, json={"listing_id": "lst-1", "statement": "x", "document_ids": ["doc-stu-2-t"]})
    assert r.status_code == 422


def test_REQ_APPLY_6_students_only(as_supervisor):
    assert as_supervisor.post(TIPS, json={"listing_id": "lst-1"}).status_code == 403


def test_REQ_APPLY_6_gemini_tips_come_first_and_failure_falls_back(as_student, monkeypatch):
    application_tips._calls.clear()
    _gemini(monkeypatch, lambda _: [{"tone": "improve", "text": "Name a method you would try."}])
    body = as_student.post(TIPS, json={"listing_id": "lst-1", "statement": "x" * 60}).json()
    assert body["source"] == "ai" and body["tips"][0]["text"] == "Name a method you would try."

    def boom(*a, **k):
        raise ConnectionError("offline")

    monkeypatch.setattr("app.services.ai_match.httpx.post", boom)
    assert as_student.post(TIPS, json={"listing_id": "lst-1", "statement": "x" * 60}).json()["source"] == "local"


def test_REQ_APPLY_6_demo_statement_passes_every_check():
    """Wei Ling's "Fill demo" statement and her seeded PDFs on lst-1 get no "improve" tip from the fixed checks."""
    import re
    from pathlib import Path

    from app.db.seed_data import DEMO_MODULES
    from app.models import Document, Listing, StudentProfile

    api = Path(__file__).resolve().parents[1]
    src = (api.parent / "web/lib/demo-data.ts").read_text(encoding="utf-8")
    block = src[src.index("s2: {"):]
    statement = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', block[block.index("applyStatement:"):block.index("proposal:")]))
    docs = [
        Document.model_construct(id=name, owner_id="stu-1", file_name=name, kind=kind,
                                 extracted_text=document_text.extract_text((api / "app/db/demo_docs" / name).read_bytes()))
        for kind, name in [("transcript", "Transcript_WeiLingTan.pdf"), ("supporting", "CV_WeiLingTan.pdf")]
    ]
    listing = Listing.model_construct(id="lst-1", prerequisites=["SC4001"], topic_tags=["Machine Learning", "Healthcare AI", "Computer Vision"])
    sp = StudentProfile.model_construct(user_id="stu-1", completed_modules=DEMO_MODULES)
    tips = application_tips.local_tips(listing, sp, statement, docs)
    assert tips and all(t.tone == "good" for t in tips), [t.text for t in tips if t.tone != "good"]


def test_REQ_APPLY_6_repeat_clicks_stop_calling_gemini(as_student, monkeypatch):
    application_tips._calls.clear()
    seen = []
    _gemini(monkeypatch, lambda _: [], seen)
    for _ in range(application_tips.CALLS_PER_WINDOW + 3):
        as_student.post(TIPS, json={"listing_id": "lst-1", "statement": "x" * 60})
    assert len(seen) == application_tips.CALLS_PER_WINDOW
