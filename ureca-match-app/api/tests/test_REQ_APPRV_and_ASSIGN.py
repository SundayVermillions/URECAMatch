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
