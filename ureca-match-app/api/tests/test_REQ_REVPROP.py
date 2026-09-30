"""Slice B. Self-proposed project review rules.  REQ-REVPROP-3.

The seeded cycle runs 18 Aug to 30 Sep 2026. prp-2 is submitted to sup-1.
"""

from datetime import UTC, datetime

from app.settings import get_settings


def _set_now(monkeypatch, when: datetime) -> None:
    monkeypatch.setattr(get_settings(), "demo_now", when)


def test_REQ_REVPROP_3_cannot_accept_after_cycle_closes(as_supervisor, monkeypatch):
    _set_now(monkeypatch, datetime(2026, 10, 1, 9, tzinfo=UTC))
    r = as_supervisor.post("/supervisor/proposals/prp-2/accept", json={})
    assert r.status_code == 422 and r.json()["code"] == "cycle_closed"


def test_REQ_REVPROP_3_cannot_accept_before_cycle_opens(as_supervisor, monkeypatch):
    _set_now(monkeypatch, datetime(2026, 8, 1, 9, tzinfo=UTC))
    r = as_supervisor.post("/supervisor/proposals/prp-2/accept", json={})
    assert r.status_code == 422 and r.json()["code"] == "cycle_closed"


def test_REQ_REVPROP_3_accept_allowed_inside_cycle(as_supervisor):
    """Positive control: the guard must not block a supervisor during the cycle."""
    r = as_supervisor.post("/supervisor/proposals/prp-2/accept", json={})
    assert r.status_code == 200 and r.json()["status"] == "accepted"


def test_REQ_REVPROP_3_decline_still_allowed_after_close(as_supervisor, monkeypatch):
    """SRS 4.18.3 restricts accepting only. Declining is not a registration action."""
    _set_now(monkeypatch, datetime(2026, 10, 1, 9, tzinfo=UTC))
    r = as_supervisor.post("/supervisor/proposals/prp-2/decline", json={})
    assert r.status_code == 200 and r.json()["status"] == "declined"


# ---------------------------------------------------------------- REQ-REVPROP-1
# prp-2 is from stu-9 to sup-1 and attaches doc-stu-9-t (the transcript).
# prp-1 is from stu-3 to sup-2, so sup-1 must not see it.


def test_REQ_REVPROP_1_supervisor_sees_student_profile(as_supervisor, fresh_store):
    r = as_supervisor.get("/supervisor/proposals")
    assert r.status_code == 200
    p = next(p for p in r.json() if p["id"] == "prp-2")
    profile = fresh_store.student("stu-9")
    assert p["student"]["id"] == "stu-9"
    assert p["student"]["school"] == profile.school
    assert p["student"]["cgpa"] == profile.cgpa
    assert p["student"]["year_of_study"] == profile.year_of_study
    assert p["student"]["completed_modules"] == profile.completed_modules


def test_REQ_REVPROP_1_supervisor_sees_attached_documents(as_supervisor):
    p = next(p for p in as_supervisor.get("/supervisor/proposals").json() if p["id"] == "prp-2")
    assert [d["id"] for d in p["documents"]] == ["doc-stu-9-t"]


def test_REQ_REVPROP_1_supervisor_sees_only_own_proposals(as_supervisor):
    ids = {p["id"] for p in as_supervisor.get("/supervisor/proposals").json()}
    assert "prp-2" in ids and "prp-1" not in ids


def test_REQ_REVPROP_1_student_cannot_list_supervisor_proposals(as_student):
    assert as_student.get("/supervisor/proposals").status_code == 403
