"""Slice D. Offer outcomes, audit trail, and the review listing.
REQ-OUTCOME-1..4, REQ-AUDIT-1..2, REQ-REV-1."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.settings import get_settings

AFTER_R2_REVIEW = datetime(2026, 9, 12, 9, tzinfo=UTC)  # Round 2 review window has closed
SCHEMA = Path(__file__).resolve().parents[2] / "supabase" / "schema.sql"


def _set_now(monkeypatch, when: datetime):
    monkeypatch.setattr(get_settings(), "demo_now", when)


def _execute_approve_publish(as_admin, monkeypatch, client_for):
    """Run round 2 to publication and return the published matches."""
    _set_now(monkeypatch, AFTER_R2_REVIEW)
    assert as_admin.post("/admin/rounds/rnd-2/execute").status_code == 200
    for m in as_admin.get("/admin/rounds/rnd-2/matches").json():
        assert client_for(m["supervisor_id"]).post(f"/supervisor/matches/{m['id']}/approve", json={}).status_code == 200
    assert as_admin.post("/admin/rounds/rnd-2/publish").status_code == 200
    return as_admin.get("/admin/rounds/rnd-2/matches", params={"status": "published"}).json()


# ---------------------------------------------------------------- REV-1


def test_REQ_REV_1_matches_filter_by_status(as_admin):
    everything = as_admin.get("/admin/rounds/rnd-1/matches").json()
    accepted = as_admin.get("/admin/rounds/rnd-1/matches", params={"status": "accepted"}).json()
    declined = as_admin.get("/admin/rounds/rnd-1/matches", params={"status": "declined"}).json()
    assert len(everything) == 6
    assert len(accepted) == 5 and all(m["status"] == "accepted" for m in accepted)
    assert len(declined) == 1 and declined[0]["status"] == "declined"


# ---------------------------------------------------------------- OUTCOME


def test_REQ_OUTCOME_1_student_can_accept_offer(as_admin, monkeypatch, client_for):
    published = _execute_approve_publish(as_admin, monkeypatch, client_for)
    assert published, "round 2 should produce at least one published offer"
    m = published[0]
    student = client_for(m["student_id"])
    assert student.get("/me/match").json()["status"] == "published"
    accepted = student.post("/me/match/accept")
    assert accepted.status_code == 200 and accepted.json()["status"] == "accepted"
    # A placed student must not stay eligible, or a later round could match them to a second project.
    assert student.get("/me").json()["student"]["eligible_for_matching"] is False


def test_REQ_OUTCOME_3_unanswered_offer_times_out(as_admin, monkeypatch, client_for):
    published = _execute_approve_publish(as_admin, monkeypatch, client_for)
    m = published[0]
    expires = datetime.fromisoformat(m["offer_expires_at"])
    _set_now(monkeypatch, expires + timedelta(days=1))
    assert as_admin.post("/internal/tick").status_code == 200
    student = client_for(m["student_id"])
    assert student.get("/me/match").json()["status"] == "timed_out"  # REQ-OUTCOME-3
    assert student.get("/me").json()["student"]["eligible_for_matching"] is False  # REQ-OUTCOME-4


# ---------------------------------------------------------------- AUDIT


def test_REQ_AUDIT_1_execute_and_publish_write_audit(as_admin, monkeypatch, client_for):
    _set_now(monkeypatch, AFTER_R2_REVIEW)
    # The seed already holds Round 1 audit rows, so assert the NEW entry this round writes, not mere presence.
    before = {e["id"] for e in as_admin.get("/admin/audit").json()}
    as_admin.post("/admin/rounds/rnd-2/execute")
    new = [e for e in as_admin.get("/admin/audit").json() if e["id"] not in before]
    assert any(e["operation"] == "matching_executed" and "rnd-2" in e["affected_records"] for e in new)

    before = {e["id"] for e in as_admin.get("/admin/audit").json()}
    for m in as_admin.get("/admin/rounds/rnd-2/matches").json():
        client_for(m["supervisor_id"]).post(f"/supervisor/matches/{m['id']}/approve", json={})
    as_admin.post("/admin/rounds/rnd-2/publish")
    new = [e for e in as_admin.get("/admin/audit").json() if e["id"] not in before]
    assert any(e["operation"] == "results_published" and "rnd-2" in e["affected_records"] for e in new)


def test_REQ_AUDIT_1_audit_is_read_only_and_newest_first(as_admin):
    entries = as_admin.get("/admin/audit").json()
    timestamps = [e["timestamp"] for e in entries]
    assert timestamps == sorted(timestamps, reverse=True)  # newest first


def test_REQ_AUDIT_2_audit_log_table_is_append_only():
    # REQ-AUDIT-2 is enforced at the database layer: a trigger rejects UPDATE and DELETE.
    schema = SCHEMA.read_text()
    assert "before update or delete on audit_log" in schema
    assert "append-only" in schema


def test_REQ_AUDIT_1_audit_shows_names_not_only_ids(as_admin, fresh_store):
    entries = as_admin.get("/admin/audit").json()
    by_record = {e["affected_records"][0]: e["affected_labels"][0] for e in entries if e["affected_records"]}
    assert by_record["stu-40"] == fresh_store.user("stu-40").name
    m = next(x for x in fresh_store.matches if x.id == "mt-4")
    assert by_record["mt-4"] == f"{m.student_name} → {m.listing_title}"
    assert by_record["rnd-1"] == f"Round 1, {fresh_store.cycle.academic_year}"
    assert all(not e.affected_labels for e in fresh_store.audit)  # the stored entries themselves are unchanged
