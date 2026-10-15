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


# ---------------------------------------------------------------- regressions: publish guards and outcomes


def test_REQ_PUB_1_cannot_publish_before_matching_runs(as_admin, fresh_store):
    r = as_admin.post("/admin/rounds/rnd-2/publish")  # 7 Sep: Round 2 is still taking applications
    assert r.status_code == 409 and r.json()["code"] == "not_executed"
    assert fresh_store.cycle.rounds[1].published_at is None


def test_REQ_PUB_1_cannot_publish_twice(as_admin, client_for, monkeypatch, fresh_store):
    _set_now(monkeypatch, datetime(2026, 9, 12, 9, tzinfo=UTC))
    as_admin.post("/admin/rounds/rnd-2/execute")
    for m in as_admin.get("/admin/rounds/rnd-2/matches").json():
        client_for(m["supervisor_id"]).post(f"/supervisor/matches/{m['id']}/approve", json={})
    assert as_admin.post("/admin/rounds/rnd-2/publish").status_code == 200
    sent = len(fresh_store.notifications)
    again = as_admin.post("/admin/rounds/rnd-2/publish")
    assert again.status_code == 409 and again.json()["code"] == "already_published"
    assert len(fresh_store.notifications) == sent  # nobody is notified twice


def test_REQ_PUB_2_every_application_gets_an_outcome(as_admin, client_for, monkeypatch, fresh_store):
    _set_now(monkeypatch, datetime(2026, 9, 12, 9, tzinfo=UTC))
    as_admin.post("/admin/rounds/rnd-2/execute")
    for m in as_admin.get("/admin/rounds/rnd-2/matches").json():
        client_for(m["supervisor_id"]).post(f"/supervisor/matches/{m['id']}/approve", json={})
    as_admin.post("/admin/rounds/rnd-2/publish")
    statuses = {a.status.value for a in fresh_store.applications if a.round_id == "rnd-2"}
    assert "submitted" not in statuses and "unmatched" in statuses


def test_REQ_OUTCOME_2_declined_or_placed_students_are_not_matched_again(as_admin, client_for, monkeypatch, fresh_store):
    # stu-38 declined and stu-33 accepted in Round 1. Even if they apply in Round 2, matching must skip them.
    for sid in ("stu-33", "stu-38"):
        assert fresh_store.student(sid).eligible_for_matching  # the seed does not set the flag (slice B's seed)
    _set_now(monkeypatch, datetime(2026, 9, 7, 10, tzinfo=UTC))
    for sid, lst in (("stu-33", "lst-1"), ("stu-38", "lst-1")):
        r = client_for(sid).post("/applications", json={"listing_id": lst, "statement": "s " * 30})
        assert r.status_code == 201
        app_id = r.json()["id"]
        fresh_store.applicant_rankings["lst-1:rnd-2"].insert(0, app_id)  # ranked first, so only the rule can stop it
    _set_now(monkeypatch, datetime(2026, 9, 12, 9, tzinfo=UTC))
    assert as_admin.post("/admin/rounds/rnd-2/execute").status_code == 200
    assert not [m for m in fresh_store.matches if m.round_id == "rnd-2" and m.student_id in ("stu-33", "stu-38")]
