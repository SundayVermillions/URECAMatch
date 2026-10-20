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
    # A placed student is now refused at the door (one project per cycle, slice B)...
    r = client_for("stu-33").post("/applications", json={"listing_id": "lst-1", "statement": "s " * 30})
    assert r.status_code == 409 and r.json()["code"] == "already_placed"
    # ...so give stu-33 an application directly, as one made before placement would be: matching must still skip it.
    stray = fresh_store.application("app-1").model_copy(
        update={"id": "app-stray", "student_id": "stu-33", "listing_id": "lst-1", "round_id": "rnd-2", "status": "submitted"}
    )
    fresh_store.save_applications(stray)
    fresh_store.applicant_rankings["lst-1:rnd-2"].insert(0, stray.id)
    r = client_for("stu-38").post("/applications", json={"listing_id": "lst-1", "statement": "s " * 30})
    assert r.status_code == 201
    fresh_store.applicant_rankings["lst-1:rnd-2"].insert(0, r.json()["id"])  # ranked first, so only the rule can stop it
    _set_now(monkeypatch, datetime(2026, 9, 12, 9, tzinfo=UTC))
    assert as_admin.post("/admin/rounds/rnd-2/execute").status_code == 200
    assert not [m for m in fresh_store.matches if m.round_id == "rnd-2" and m.student_id in ("stu-33", "stu-38")]


# ---------------------------------------------------------------- REQ-EXEC-3 rollover of unmatched students


def _publish_round_2(as_admin, client_for, monkeypatch):
    _set_now(monkeypatch, datetime(2026, 9, 12, 9, tzinfo=UTC))
    as_admin.post("/admin/rounds/rnd-2/execute")
    for m in as_admin.get("/admin/rounds/rnd-2/matches").json():
        client_for(m["supervisor_id"]).post(f"/supervisor/matches/{m['id']}/approve", json={})
    assert as_admin.post("/admin/rounds/rnd-2/publish").status_code == 200


def test_REQ_EXEC_3_unmatched_applications_carry_into_the_next_round(as_admin, client_for, monkeypatch, fresh_store):
    _publish_round_2(as_admin, client_for, monkeypatch)
    loser = next(a.student_id for a in fresh_store.applications if a.round_id == "rnd-2" and a.status.value == "unmatched")
    old = sorted(
        (a for a in fresh_store.applications_for(student_id=loser, round_id="rnd-2")), key=lambda a: a.preference_rank or 99
    )
    new = sorted(fresh_store.applications_for(student_id=loser, round_id="rnd-3"), key=lambda a: a.preference_rank)
    assert [a.listing_id for a in new] == [a.listing_id for a in old]  # same projects, same order
    assert [a.preference_rank for a in new] == list(range(1, len(new) + 1))
    assert all(a.status.value == "submitted" for a in new)
    note = fresh_store.notifications_for(loser)[-1]
    assert "carry over to Round 3" in note.message


def test_REQ_EXEC_3_rollover_off_leaves_students_to_apply_again(as_admin, client_for, monkeypatch, fresh_store):
    fresh_store.cycle.rollover_unmatched = False
    _publish_round_2(as_admin, client_for, monkeypatch)
    assert not fresh_store.applications_for(round_id="rnd-3")
    loser = next(a.student_id for a in fresh_store.applications if a.round_id == "rnd-2" and a.status.value == "unmatched")
    assert fresh_store.notifications_for(loser)[-1].message.endswith("You can apply again in Round 3.")


def test_REQ_EXEC_3_placed_and_excluded_students_do_not_roll_over(as_admin, client_for, monkeypatch, fresh_store):
    _publish_round_2(as_admin, client_for, monkeypatch)
    offered = {m.student_id for m in fresh_store.matches if m.round_id == "rnd-2"}
    rolled = {a.student_id for a in fresh_store.applications_for(round_id="rnd-3")}
    assert rolled and not rolled & offered


def test_REQ_EXEC_3_rollover_skips_projects_that_are_full(as_admin, client_for, monkeypatch, fresh_store):
    full = fresh_store.listing("lst-2")
    full.filled_slots = full.available_slots  # as apply() would say: "All slots on this project are filled"
    _publish_round_2(as_admin, client_for, monkeypatch)
    assert all(a.listing_id != "lst-2" for a in fresh_store.applications_for(round_id="rnd-3"))
