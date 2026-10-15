"""Slice D. Supervisor approvals and admin manual assignment.
REQ-APPRV-1..3, REQ-ASSIGN-1..3."""

from datetime import UTC, datetime

from app.settings import get_settings

AFTER_R2_REVIEW = datetime(2026, 9, 12, 9, tzinfo=UTC)  # Round 2 review window has closed


def _set_now(monkeypatch, when: datetime):
    monkeypatch.setattr(get_settings(), "demo_now", when)


def _execute_r2(as_admin, monkeypatch):
    _set_now(monkeypatch, AFTER_R2_REVIEW)
    assert as_admin.post("/admin/rounds/rnd-2/execute").status_code == 200
    return as_admin.get("/admin/rounds/rnd-2/matches").json()


# ---------------------------------------------------------------- APPRV


def test_REQ_APPRV_1_cannot_approve_before_execute(as_admin, client_for):
    # No matches exist for round 2 until it is executed, so seed a manual one first.
    r = as_admin.post(
        "/admin/rounds/rnd-2/assign",
        json={"student_id": "stu-1", "listing_id": "lst-2", "justification": "Seed a match for the guard test"},
    )
    mid, sup = r.json()["id"], r.json()["supervisor_id"]
    # Round 2 has not been executed, so its supervisor cannot act on the match yet.
    resp = client_for(sup).post(f"/supervisor/matches/{mid}/approve", json={})
    assert resp.status_code == 409 and resp.json()["code"] == "not_executed"


def test_REQ_APPRV_2_reject_frees_the_slot(as_admin, monkeypatch, client_for):
    matches = _execute_r2(as_admin, monkeypatch)
    rejected = matches[0]
    resp = client_for(rejected["supervisor_id"]).post(f"/supervisor/matches/{rejected['id']}/reject", json={})
    assert resp.status_code == 200 and resp.json()["status"] == "rejected"
    # Approve the rest and publish; the rejected student must not be placed, i.e. the slot was returned.
    for m in as_admin.get("/admin/rounds/rnd-2/matches", params={"status": "proposed"}).json():
        assert client_for(m["supervisor_id"]).post(f"/supervisor/matches/{m['id']}/approve", json={}).status_code == 200
    assert as_admin.post("/admin/rounds/rnd-2/publish").status_code == 200
    placed = {m["student_id"] for m in as_admin.get("/admin/rounds/rnd-2/matches", params={"status": "published"}).json()}
    assert rejected["student_id"] not in placed


def test_REQ_APPRV_3_no_change_after_publish(client_for):
    # mt-1 belongs to round 1, which is already published in the seed.
    resp = client_for("sup-1").post("/supervisor/matches/mt-1/approve", json={})
    assert resp.status_code == 409 and resp.json()["code"] == "already_published"


def test_REQ_APPRV_supervisor_cannot_decide_another_supervisors_match(as_admin, monkeypatch, client_for):
    matches = _execute_r2(as_admin, monkeypatch)
    m = matches[0]
    other = "sup-2" if m["supervisor_id"] != "sup-2" else "sup-1"
    resp = client_for(other).post(f"/supervisor/matches/{m['id']}/approve", json={})
    assert resp.status_code == 403


# ---------------------------------------------------------------- ASSIGN


def test_REQ_ASSIGN_1_manual_assign_creates_match_and_audit(as_admin):
    resp = as_admin.post(
        "/admin/rounds/rnd-2/assign",
        json={"student_id": "stu-1", "listing_id": "lst-2", "justification": "Supervisor requested this placement"},
    )
    assert resp.status_code == 201 and resp.json()["status"] == "reassigned"
    match_id = resp.json()["id"]
    audit = as_admin.get("/admin/audit", params={"operation": "manual_reassignment"}).json()
    assert any(match_id in e["affected_records"] for e in audit)


def test_REQ_ASSIGN_2_reassign_requires_justification(as_admin):
    r = as_admin.post("/admin/matches/mt-1/reassign", json={"listing_id": "lst-2", "justification": "short"})
    assert r.status_code == 422


def test_REQ_ASSIGN_3_cannot_assign_already_assigned_student(as_admin):
    # stu-33 already holds an accepted match (mt-1) in the seed.
    resp = as_admin.post(
        "/admin/rounds/rnd-2/assign",
        json={"student_id": "stu-33", "listing_id": "lst-2", "justification": "Attempt a second placement"},
    )
    assert resp.status_code == 409 and resp.json()["code"] == "already_assigned"


# ---------------------------------------------------------------- regressions: assignment guards


def _assign(as_admin, student, listing, round_id="rnd-2"):
    return as_admin.post(
        f"/admin/rounds/{round_id}/assign",
        json={"student_id": student, "listing_id": listing, "justification": "Exceptional circumstances"},
    )


def test_REQ_ASSIGN_1_unknown_student_rejected_not_500(as_admin):
    r = _assign(as_admin, "nobody", "lst-2")
    assert r.status_code == 422 and r.json()["code"] == "unknown_student"


def test_REQ_ASSIGN_1_only_students_can_be_assigned(as_admin):
    r = _assign(as_admin, "sup-2", "lst-2")
    assert r.status_code == 422 and r.json()["code"] == "unknown_student"


def test_REQ_ASSIGN_1_closed_listing_rejected(as_admin):
    r = _assign(as_admin, "stu-2", "lst-9")  # closed in the seed
    assert r.status_code == 422 and r.json()["code"] == "listing_unavailable"


def test_REQ_ASSIGN_1_assign_counts_slots_already_held(as_admin):
    # lst-4 has 2 slots and 1 filled: one assignment takes the last slot, the next must be refused.
    assert _assign(as_admin, "stu-2", "lst-4").status_code == 201
    r = _assign(as_admin, "stu-3", "lst-4")
    assert r.status_code == 422 and r.json()["code"] == "no_slot"


def test_REQ_ASSIGN_1_reassign_cannot_overfill_a_project(as_admin, monkeypatch, fresh_store):
    matches = _execute_r2(as_admin, monkeypatch)
    target = next(lst for lst in fresh_store.listings if lst.id == "lst-4")
    movers = [m for m in matches if m["listing_id"] != target.id][:2]
    assert len(movers) == 2
    body = {"listing_id": target.id, "justification": "Exceptional circumstances"}
    assert as_admin.post(f"/admin/matches/{movers[0]['id']}/reassign", json=body).status_code == 200
    r = as_admin.post(f"/admin/matches/{movers[1]['id']}/reassign", json=body)
    assert r.status_code == 422 and r.json()["code"] == "no_slot"


def test_REQ_ASSIGN_1_assignment_into_a_published_round_is_offered_at_once(as_admin, client_for):
    # Round 1 is published in the seed, so no later publish step would ever release this match.
    r = _assign(as_admin, "stu-2", "lst-2", round_id="rnd-1")
    assert r.status_code == 201 and r.json()["status"] == "published"
    assert r.json()["offer_expires_at"].startswith("2026-09-10")  # Round 2's review window opens (REQ-OUTCOME-3)
    student = client_for("stu-2")
    assert student.get("/me/match").json()["id"] == r.json()["id"]
    assert any(n["event"] == "offer_received" for n in student.get("/me/notifications").json())


def test_REQ_ASSIGN_3_assigned_student_is_not_matched_again(as_admin, monkeypatch, fresh_store):
    assert _assign(as_admin, "stu-1", "lst-2").status_code == 201
    # Rank stu-1 first on a project they applied to, so only the rule can keep them out of the run.
    own = next(a for a in fresh_store.applications_for(student_id="stu-1", round_id="rnd-2") if a.listing_id != "lst-2")
    fresh_store.applicant_rankings.setdefault(f"{own.listing_id}:rnd-2", []).insert(0, own.id)
    _execute_r2(as_admin, monkeypatch)
    assert [m.status.value for m in fresh_store.matches if m.student_id == "stu-1"] == ["reassigned"]


def test_REQ_APPRV_2_rejection_reason_kept_and_admin_told(as_admin, monkeypatch, client_for, fresh_store):
    m = _execute_r2(as_admin, monkeypatch)[0]
    before = len(fresh_store.notifications_for("adm-1"))
    r = client_for(m["supervisor_id"]).post(f"/supervisor/matches/{m['id']}/reject", json={"note": "Not a fit for the lab"})
    assert r.status_code == 200 and r.json()["supervisor_note"] == "Not a fit for the lab"
    told = fresh_store.notifications_for("adm-1")[before:]
    assert [n.event.value for n in told] == ["match_rejected"] and "Not a fit for the lab" in told[0].message
    summary = as_admin.get("/admin/rounds/rnd-2/summary").json()
    assert summary["approvals_done"] == 1  # a rejection counts as a decision
