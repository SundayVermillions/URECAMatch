"""Slice B. Self-proposed projects, student side.  REQ-PROPOSE-1..3.

stu-1 is signed in (as_student). The demo clock is inside Round 2's application window.
stu-1 owns doc-stu-1-t and doc-stu-1-cv; doc-stu-2-t belongs to another student.
"""

from datetime import UTC, datetime

from app.models import AccountStatus
from app.settings import get_settings

LONG = "I will build a dataset, a baseline model and an evaluation report over one semester."  # > 50 chars


def body(**over):
    b = {
        "supervisor_id": "sup-2",
        "title": "Graph Models for Protein Folding",
        "description": LONG,
        "research_interests": ["Machine Learning", "Genomics"],
        "statement": "I took SC4001 and want to apply graph learning to biology under this supervisor.",
        "document_ids": ["doc-stu-1-t"],
    }
    b.update(over)
    return b


# ---------------------------------------------------------------- REQ-PROPOSE-1


def test_REQ_PROPOSE_1_valid_proposal_created_and_supervisor_notified(as_student, fresh_store):
    r = as_student.post("/proposals", json=body())
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["status"] == "submitted" and p["supervisor_id"] == "sup-2"
    assert p["research_interests"] == ["Machine Learning", "Genomics"]
    assert any(n.user_id == "sup-2" and "New proposal" in n.title for n in fresh_store.notifications)


def test_REQ_PROPOSE_1_research_interests_required(as_student):
    r = as_student.post("/proposals", json=body(research_interests=[]))
    assert r.status_code == 422 and r.json()["field"] == "research_interests"


def test_REQ_PROPOSE_1_blank_research_interests_ignored(as_student):
    r = as_student.post("/proposals", json=body(research_interests=["  ", ""]))
    assert r.status_code == 422 and r.json()["field"] == "research_interests"


def test_REQ_PROPOSE_1_description_over_500_words_rejected(as_student):
    r = as_student.post("/proposals", json=body(description="word " * 501))
    assert r.status_code == 422 and r.json()["field"] == "description"


def test_REQ_PROPOSE_1_statement_over_300_words_rejected(as_student):
    r = as_student.post("/proposals", json=body(statement="word " * 301))
    assert r.status_code == 422 and r.json()["field"] == "statement"


def test_REQ_PROPOSE_1_documents_must_belong_to_the_student(as_student):
    r = as_student.post("/proposals", json=body(document_ids=["doc-stu-2-t"]))
    assert r.status_code == 422 and r.json()["field"] == "document_ids"


def test_REQ_PROPOSE_1_documents_are_optional(as_student):
    assert as_student.post("/proposals", json=body(document_ids=[])).status_code == 201


# ---------------------------------------------------------------- REQ-PROPOSE-2


def test_REQ_PROPOSE_2_unknown_supervisor_rejected(as_student):
    r = as_student.post("/proposals", json=body(supervisor_id="sup-999"))
    assert r.status_code == 422 and r.json()["field"] == "supervisor_id"


def test_REQ_PROPOSE_2_cannot_propose_to_a_student(as_student):
    r = as_student.post("/proposals", json=body(supervisor_id="stu-2"))
    assert r.status_code == 422 and r.json()["field"] == "supervisor_id"


def test_REQ_PROPOSE_2_inactive_supervisor_rejected(as_student, fresh_store):
    fresh_store.user("sup-2").status = AccountStatus.inactive
    r = as_student.post("/proposals", json=body())
    assert r.status_code == 422 and r.json()["field"] == "supervisor_id"


# ---------------------------------------------------------------- REQ-PROPOSE-3


def test_REQ_PROPOSE_3_outside_application_window_rejected(as_student, monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_now", datetime(2026, 10, 5, 9, tzinfo=UTC))
    r = as_student.post("/proposals", json=body())
    assert r.status_code == 422 and r.json()["code"] == "window_closed"


def test_REQ_PROPOSE_2_picker_lists_only_active_supervisors(as_student, fresh_store):
    fresh_store.user("sup-2").status = AccountStatus.inactive
    ids = {s["id"] for s in as_student.get("/supervisors").json()}
    assert "sup-1" in ids and "sup-2" not in ids
