"""Slice D. Execute, approve, publish, respond on the seeded store with a movable clock."""

from datetime import UTC, datetime

from app.settings import get_settings


def _set_now(monkeypatch, when: datetime):
    monkeypatch.setattr(get_settings(), "demo_now", when)


def test_REQ_EXEC_1_cannot_execute_before_review_window_ends(as_admin):
    r = as_admin.post("/admin/rounds/rnd-2/execute")
    assert r.status_code == 409 and r.json()["code"] == "review_open"


def test_REQ_EXEC_2_execute_once_then_publish_after_approvals(as_admin, monkeypatch, client_for):
    _set_now(monkeypatch, datetime(2026, 9, 12, 9, tzinfo=UTC))  # after Round 2 review window
    first = as_admin.post("/admin/rounds/rnd-2/execute")
    assert first.status_code == 200 and first.json()["matched"] >= 1
    again = as_admin.post("/admin/rounds/rnd-2/execute")
    assert again.status_code == 409 and again.json()["code"] == "already_executed"

    blocked = as_admin.post("/admin/rounds/rnd-2/publish")
    assert blocked.status_code == 409  # REQ-PUB-1

    for m in as_admin.get("/admin/rounds/rnd-2/matches").json():
        r = client_for(m["supervisor_id"]).post(f"/supervisor/matches/{m['id']}/approve", json={})
        assert r.status_code == 200
    published = as_admin.post("/admin/rounds/rnd-2/publish")
    assert published.status_code == 200

    first_match = as_admin.get("/admin/rounds/rnd-2/matches").json()[0]
    student = client_for(first_match["student_id"])
    assert student.get("/me/match").json()["status"] == "published"
    assert student.post("/me/match/decline").json()["status"] == "declined"  # REQ-OUTCOME-2
    assert student.get("/me").json()["student"]["eligible_for_matching"] is False


def test_REQ_ASSIGN_2_reassign_requires_justification(as_admin):
    r = as_admin.post("/admin/matches/mt-1/reassign", json={"listing_id": "lst-2", "justification": "short"})
    assert r.status_code == 422
