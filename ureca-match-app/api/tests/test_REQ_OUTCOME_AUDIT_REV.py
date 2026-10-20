"""Slice D. Offer outcomes, audit trail, and the review listing.
REQ-OUTCOME-1..4, REQ-AUDIT-1..3, REQ-REV-1."""

from datetime import datetime, timedelta
from pathlib import Path

from tests.conftest import APPROVAL_CLOSED, REVIEW_CLOSED

SCHEMA = Path(__file__).resolve().parents[2] / "supabase" / "schema.sql"


def _run_round_2(as_admin, at):
    """Let the clock run Round 2 to publication and return the published matches."""
    at(REVIEW_CLOSED)
    at(APPROVAL_CLOSED)
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


def test_REQ_OUTCOME_1_student_can_accept_offer(as_admin, client_for, at):
    published = _run_round_2(as_admin, at)
    assert published, "round 2 should produce at least one published offer"
    m = published[0]
    student = client_for(m["student_id"])
    assert student.get("/me/match").json()["status"] == "published"
    accepted = student.post("/me/match/accept")
    assert accepted.status_code == 200 and accepted.json()["status"] == "accepted"
    # A placed student must not stay eligible, or a later round could match them to a second project.
    assert student.get("/me").json()["student"]["eligible_for_matching"] is False


def test_REQ_OUTCOME_3_unanswered_offer_times_out(as_admin, client_for, at):
    published = _run_round_2(as_admin, at)
    m = published[0]
    expires = datetime.fromisoformat(m["offer_expires_at"])
    at(expires + timedelta(days=1))
    student = client_for(m["student_id"])
    assert student.get("/me/match").json()["status"] == "timed_out"  # REQ-OUTCOME-3
    assert student.get("/me").json()["student"]["eligible_for_matching"] is False  # REQ-OUTCOME-4


# ---------------------------------------------------------------- AUDIT


def test_REQ_AUDIT_3_system_runs_and_publishes_are_audited_as_system(as_admin, at):
    # The seed already holds Round 1 audit rows, so assert the NEW entry this round writes, not mere presence.
    before = {e["id"] for e in as_admin.get("/admin/audit").json()}
    at(REVIEW_CLOSED)
    new = [e for e in as_admin.get("/admin/audit").json() if e["id"] not in before]
    assert [(e["operation"], e["actor_name"]) for e in new if "rnd-2" in e["affected_records"]] == [
        ("matching_executed", "System")
    ]

    before = {e["id"] for e in as_admin.get("/admin/audit").json()}
    at(APPROVAL_CLOSED)
    new = [e for e in as_admin.get("/admin/audit").json() if e["id"] not in before]
    assert [(e["operation"], e["actor_id"]) for e in new if "rnd-2" in e["affected_records"]] == [("results_published", "system")]


def test_REQ_AUDIT_3_schema_has_a_system_user_for_the_audit_log():
    # audit_log.actor_id references users(id), so the System actor needs a row nobody can sign in as.
    schema = SCHEMA.read_text()
    assert "'system', 'system@urecamatch.app', 'System', 'admin', 'inactive'" in schema


def test_REQ_AUDIT_3_nobody_can_act_as_the_system_user(client_for):
    assert client_for("system").get("/me").status_code == 401


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
