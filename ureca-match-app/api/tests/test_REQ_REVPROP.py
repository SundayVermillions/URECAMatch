"""Slice B. Self-proposed project review rules.  REQ-REVPROP-2, REQ-REVPROP-3.

The seeded cycle runs 18 Aug to 2 Oct 2026. prp-2 is submitted to sup-1.
"""

from datetime import UTC, datetime

from app.settings import get_settings


def _set_now(monkeypatch, when: datetime) -> None:
    monkeypatch.setattr(get_settings(), "demo_now", when)


def test_REQ_REVPROP_3_cannot_accept_after_cycle_closes(as_supervisor, monkeypatch):
    _set_now(monkeypatch, datetime(2026, 10, 3, 9, tzinfo=UTC))
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


# prp-2: stu-9 proposed to sup-1 with doc-stu-9-t attached and never applied to a sup-1 listing,
# so only the proposal can grant access (SRS 5.3.3).
def test_REQ_REVPROP_1_supervisor_can_view_proposal_document(as_supervisor, fresh_store):
    applied_to = {fresh_store.listing(a.listing_id).supervisor_id for a in fresh_store.applications_for(student_id="stu-9")}
    assert "sup-1" not in applied_to
    r = as_supervisor.get("/documents/doc-stu-9-t/view")
    assert r.status_code == 200 and r.json()["url"]


def test_REQ_REVPROP_1_document_not_attached_to_proposal_is_refused(as_supervisor):
    assert as_supervisor.get("/documents/doc-stu-9-cv/view").status_code == 403


def test_REQ_REVPROP_1_other_supervisor_cannot_view_proposal_document(client_for):
    assert client_for("sup-4").get("/documents/doc-stu-9-t/view").status_code == 403


# ---------------------------------------------------------------- REQ-REVPROP-2
# An accepted proposal becomes a Match. Slice D's round summary and match list filter by
# round_id, so the match must carry a real round. Rounds: rnd-1 25 Aug, rnd-2 5 Sep, rnd-3 16 Sep.


def _accepted_match(as_supervisor, fresh_store):
    r = as_supervisor.post("/supervisor/proposals/prp-2/accept", json={})
    assert r.status_code == 200
    return next(m for m in fresh_store.matches if m.student_id == "stu-9" and m.listing_title == r.json()["title"])


def test_REQ_REVPROP_2_match_gets_current_round_in_application_window(as_supervisor, fresh_store):
    """Default demo clock is 7 Sep, inside Round 2's application window."""
    assert _accepted_match(as_supervisor, fresh_store).round_id == "rnd-2"


def test_REQ_REVPROP_2_match_gets_current_round_in_review_window(as_supervisor, fresh_store, monkeypatch):
    _set_now(monkeypatch, datetime(2026, 9, 11, 9, tzinfo=UTC))
    assert _accepted_match(as_supervisor, fresh_store).round_id == "rnd-2"


def test_REQ_REVPROP_2_match_before_first_round_falls_back_to_round_1(as_supervisor, fresh_store, monkeypatch):
    """Cycle is open (opens 18 Aug) but Round 1 has not started, so phase() has no round."""
    _set_now(monkeypatch, datetime(2026, 8, 20, 9, tzinfo=UTC))
    assert _accepted_match(as_supervisor, fresh_store).round_id == "rnd-1"


def test_REQ_REVPROP_2_accepted_match_listed_in_admin_round_matches(as_supervisor, as_admin, fresh_store):
    _accepted_match(as_supervisor, fresh_store)
    rows = as_admin.get("/admin/rounds/rnd-2/matches").json()
    assert any(m["student_id"] == "stu-9" for m in rows)
