"""Slice B. A supervisor who declines a student's proposal gives a reason, and the student reads it.  REQ-REVPROP-2.

prp-2 is from stu-9 to sup-1 and waits for an answer.
"""

import pytest


def _decline(client, body):
    return client.post("/supervisor/proposals/prp-2/decline", json=body)


@pytest.mark.parametrize("body", [{}, {"note": ""}, {"note": "   "}, {"note": "Too short"}, {"note": "x" * 9 + "   "}])
def test_REQ_REVPROP_2_decline_needs_a_reason(as_supervisor, fresh_store, body):
    r = _decline(as_supervisor, body)
    assert r.status_code == 422 and r.json()["code"] == "reason_required" and r.json()["field"] == "note"
    assert fresh_store.proposal("prp-2").status.value == "submitted"  # nothing changed


def test_REQ_REVPROP_2_reason_is_saved_and_the_student_reads_it(as_supervisor, client_for):
    r = _decline(as_supervisor, {"note": "  The scope is too broad for one semester.  "})
    assert r.status_code == 200 and r.json()["status"] == "declined"
    assert r.json()["decision_note"] == "The scope is too broad for one semester."  # trimmed
    mine = next(p for p in client_for("stu-9").get("/me/proposals").json() if p["id"] == "prp-2")
    assert mine["status"] == "declined" and mine["decision_note"] == "The scope is too broad for one semester."


def test_REQ_REVPROP_2_the_notification_carries_the_reason(as_supervisor, client_for):
    _decline(as_supervisor, {"note": "The scope is too broad for one semester."})
    texts = [
        n["message"] for n in client_for("stu-9").get("/me/notifications").json() if n["title"] == "Your proposal was declined"
    ]
    assert any("The scope is too broad for one semester." in t for t in texts)


def test_REQ_REVPROP_2_accepting_needs_no_reason(as_supervisor):
    """Positive control: only a decline asks for one."""
    r = as_supervisor.post("/supervisor/proposals/prp-2/accept", json={})
    assert r.status_code == 200 and r.json()["decision_note"] is None
