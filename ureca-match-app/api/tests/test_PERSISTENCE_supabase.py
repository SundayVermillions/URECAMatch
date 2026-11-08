"""SupabaseStore keeps cycles, rounds, matches, the audit log and verification codes in the database, so several
servers can share them. Fake client, no network. REQ-EXEC-2, REQ-PUB-1, REQ-REG-2, REQ-AUDIT-2.

The last test needs a real Supabase project and is skipped unless SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_KEY
point at a throwaway one. It never reads the app's own SUPABASE_URL, so it cannot touch production by accident."""

from __future__ import annotations

import os
import threading
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.db import seed_data
from app.db.seed_db import seed_database
from app.db.store import MockStore, SupabaseStore
from app.models import AuditOperation, MatchStatus
from app.services.matching.run import run_matching
from app.services.schedule import advance
from app.settings import get_settings
from tests.conftest import APPROVAL_CLOSED, REVIEW_CLOSED
from tests.fake_supabase import FakeDB

NOW = datetime(2026, 9, 12, 9, tzinfo=UTC)


def make_store(db: FakeDB) -> SupabaseStore:
    """A server: its own store object over the shared database."""
    s = SupabaseStore.__new__(SupabaseStore)
    MockStore.__init__(s, seed=False)
    s.client = db.client()
    return s


@pytest.fixture
def db() -> FakeDB:
    d = FakeDB()
    seed_database(d.client())
    d.log.clear()
    return d


def round_row(db: FakeDB, round_id: str = "rnd-2") -> dict:
    return next(r for r in db.rows("matching_rounds") if r["id"] == round_id)


def matches_of(db: FakeDB, round_id: str) -> list[dict]:
    return [m for m in db.rows("match_results") if m["round_id"] == round_id]


# ------------------------------------------------------------------ start-up and seeding


def test_supabase_store_never_loads_the_seed_on_start(monkeypatch, db):
    def boom():
        raise AssertionError("the in-memory seed was built")

    monkeypatch.setattr(seed_data, "build", boom)
    monkeypatch.setattr("supabase.create_client", lambda *a, **k: FakeDB().client())  # an empty database
    monkeypatch.setattr(get_settings(), "supabase_url", "https://example.supabase.co")
    s = SupabaseStore()
    assert (s.users, s.cycles, s.cycle, s.matches, s.audit) == ([], [], None, [], [])


def test_supabase_store_refuses_to_start_without_a_database(monkeypatch):
    monkeypatch.setattr(get_settings(), "supabase_url", "")
    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        SupabaseStore()


def test_seed_script_is_safe_to_run_twice_and_keeps_live_data(db):
    first = {t: len(rows) for t, rows in db.tables.items()}
    assert first["matching_rounds"] and first["users"] and first["audit_log"]
    db.rows("users")[0]["name"] = "Changed in production"
    seed_database(db.client())
    assert {t: len(rows) for t, rows in db.tables.items()} == first
    assert db.rows("users")[0]["name"] == "Changed in production"


def test_everything_the_routers_read_comes_back_from_the_database(db):
    s = make_store(db)
    assert [c.id for c in s.cycles] == [c["id"] for c in sorted(db.rows("application_cycles"), key=lambda c: c["opening_date"])]
    assert s.cycle is not None and len(s.cycle.rounds) == 3
    assert len(s.matches) == len(db.rows("match_results")) and all(m.student_name for m in s.matches)
    assert all(e.actor_name for e in s.audit)
    assert len(s.users) == len(db.rows("users")) and len(s.students) == len(db.rows("student_profiles"))


# ------------------------------------------------------------------ verification codes (REQ-REG-2)


def test_REQ_REG_2_a_code_issued_by_one_server_verifies_on_another(db):
    a, b = make_store(db), make_store(db)
    email = db.rows("users")[0]["email"]
    expires = NOW + timedelta(minutes=10)
    a.issue_code(email, "123456", expires)
    assert b.check_code(email, "123456", NOW) == "ok"
    assert b.check_code(email, "654321", NOW) == "wrong"
    assert b.check_code(email, "123456", expires + timedelta(seconds=1)) == "expired"


def test_REQ_REG_2_codes_are_stored_as_a_hash_and_used_once(db):
    a, b = make_store(db), make_store(db)
    email = db.rows("users")[0]["email"]
    a.issue_code(email, "123456", NOW + timedelta(minutes=10))
    stored = db.rows("verification_codes")[0]
    assert "123456" not in stored.values() and len(stored["code"]) == 64
    b.clear_code(email)  # verified on another server
    assert a.check_code(email, "123456", NOW) == "none"


def test_REQ_REG_4_a_new_code_replaces_the_old_one(db):
    a, b = make_store(db), make_store(db)
    email = db.rows("users")[0]["email"]
    a.issue_code(email, "111111", NOW + timedelta(minutes=10))
    b.issue_code(email, "222222", NOW + timedelta(minutes=10))
    assert a.check_code(email, "111111", NOW) == "wrong"
    assert a.check_code(email, "222222", NOW) == "ok"


# ------------------------------------------------------------------ claiming a round (REQ-EXEC-2)


def test_REQ_EXEC_2_only_one_of_many_servers_wins_the_claim(db):
    stores = [make_store(db) for _ in range(8)]
    rounds = [next(r for r in s.cycle.rounds if r.number == 2) for s in stores]  # all read the round before any claim
    barrier, results = threading.Barrier(len(stores)), []

    def go(store, r):
        barrier.wait()
        results.append(store.claim_round(r, "executed_at", NOW))

    threads = [threading.Thread(target=go, args=(s, r)) for s, r in zip(stores, rounds, strict=True)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count(True) == 1
    assert round_row(db)["executed_at"] == NOW.isoformat()


def test_REQ_EXEC_2_two_servers_racing_for_a_round_run_matching_once(db):
    a, b = make_store(db), make_store(db)
    ra = next(r for r in a.cycle.rounds if r.number == 2)
    rb = next(r for r in b.cycle.rounds if r.number == 2)  # read before A ran: B still sees an unmatched round
    assert rb.executed_at is None
    out_a, out_b = [], []
    run_matching(a, a.cycle, ra, REVIEW_CLOSED, out_a)
    after_a = len(matches_of(db, "rnd-2"))
    run_matching(b, b.cycle, rb, REVIEW_CLOSED, out_b)  # the unique (round, student) key would also reject a second run
    assert after_a > 0 and len(matches_of(db, "rnd-2")) == after_a
    runs = [
        e
        for e in db.rows("audit_log")
        if e["operation"] == AuditOperation.matching_executed and e["affected_records"] == ["rnd-2"]
    ]
    assert len(runs) == 1
    assert out_a and out_b == []  # only the winner tells supervisors and admins


def test_REQ_EXEC_2_a_failed_matching_run_gives_the_claim_back(db):
    s = make_store(db)
    r = next(x for x in s.cycle.rounds if x.number == 2)
    db.fail_next("insert", "match_results")
    with pytest.raises(RuntimeError):
        run_matching(s, s.cycle, r, REVIEW_CLOSED, [])
    assert round_row(db)["executed_at"] is None and matches_of(db, "rnd-2") == []
    advance(make_store(db), REVIEW_CLOSED)  # the next server tries again
    assert round_row(db)["executed_at"] is not None and matches_of(db, "rnd-2")


# ------------------------------------------------------------------ publishing (REQ-PUB-1)


def test_REQ_PUB_1_publishing_claims_the_round_and_marks_applications_with_their_offers(db):
    s = make_store(db)
    advance(s, REVIEW_CLOSED)
    advance(s, APPROVAL_CLOSED)
    assert round_row(db)["published_at"] is not None and round_row(db)["status"] == "published"
    offers = {(m["student_id"], m["listing_id"]) for m in matches_of(db, "rnd-2") if m["status"] == MatchStatus.published}
    assert offers
    for a in (a for a in db.rows("listing_applications") if a["round_id"] == "rnd-2"):
        assert (a["status"] == "matched") == ((a["student_id"], a["listing_id"]) in offers)
    advance(make_store(db), APPROVAL_CLOSED)  # another server later: nothing runs twice
    assert (
        len(
            [
                e
                for e in db.rows("audit_log")
                if e["operation"] == AuditOperation.results_published and e["affected_records"] == ["rnd-2"]
            ]
        )
        == 1
    )


def test_REQ_PUB_1_a_failed_match_save_leaves_applications_as_they_were(db):
    s = make_store(db)
    advance(s, REVIEW_CLOSED)
    before = {a["id"]: a["status"] for a in db.rows("listing_applications")}
    db.fail_next("rpc", "publish_outcomes")
    with pytest.raises(RuntimeError):
        advance(s, APPROVAL_CLOSED)
    assert {a["id"]: a["status"] for a in db.rows("listing_applications") if a["id"] in before} == before
    assert round_row(db)["published_at"] is None  # the claim was given back
    assert not [m for m in matches_of(db, "rnd-2") if m["status"] == MatchStatus.published]
    advance(s, APPROVAL_CLOSED)  # retried cleanly
    assert round_row(db)["published_at"] is not None


# ------------------------------------------------------------------ the audit log is append only (REQ-AUDIT-2)


def test_REQ_AUDIT_2_the_store_only_inserts_and_reads_the_audit_log(db):
    s = make_store(db)
    advance(s, REVIEW_CLOSED)
    assert {n for n in dir(SupabaseStore) if "audit" in n.lower()} == {"audit", "add_audit", "_AUDIT_COLUMNS"}
    ops = {op for op, table in db.log if table == "audit_log"}
    assert "insert" in ops and ops <= {"select", "insert"}


def test_REQ_AUDIT_2_the_table_rejects_changes(db):
    with pytest.raises(RuntimeError, match="append-only"):
        db.client().table("audit_log").update({"note": "edited"}).eq("id", db.rows("audit_log")[0]["id"]).execute()


# ------------------------------------------------------------------ cycles and matches round trip


def test_cycle_and_round_changes_are_saved(db):
    s = make_store(db)
    c = s.cycle
    c.rounds = [r for r in c.rounds if r.number != 3]
    c.rollover_unmatched = False
    s.save_cycle(c)
    again = make_store(db).cycle
    assert [r.number for r in again.rounds] == [1, 2] and again.rollover_unmatched is False


def test_match_changes_are_saved_and_removed(db):
    s = make_store(db)
    m = s.matches[0]
    m.status, m.supervisor_note = MatchStatus.rejected, "Not a fit"
    s.save_match(m)
    saved = next(x for x in make_store(db).matches if x.id == m.id)
    assert (saved.status, saved.supervisor_note) == (MatchStatus.rejected, "Not a fit")
    s.remove_match(m)
    assert all(x.id != m.id for x in make_store(db).matches)


def test_mock_store_claims_a_round_once():
    s = MockStore()
    r = next(x for x in s.cycle.rounds if x.number == 3)
    assert s.claim_round(r, "executed_at", NOW) is True and s.claim_round(r, "executed_at", NOW) is False
    s.release_round(r, "executed_at")
    assert r.executed_at is None


# ------------------------------------------------------------------ real database (skipped unless configured)

TEST_URL, TEST_KEY = os.environ.get("SUPABASE_TEST_URL"), os.environ.get("SUPABASE_TEST_SERVICE_KEY")


@pytest.mark.skipif(
    not (TEST_URL and TEST_KEY), reason="needs a throwaway Supabase project: SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_KEY"
)
def test_REQ_EXEC_2_claim_is_atomic_in_a_real_database():
    from supabase import create_client

    clients = [create_client(TEST_URL, TEST_KEY) for _ in range(4)]
    tag = uuid.uuid4().hex[:8]
    day = datetime(2030, 1, 1, tzinfo=UTC)
    clients[0].table("application_cycles").insert(
        {
            "id": f"t-cyc-{tag}",
            "academic_year": "test",
            "opening_date": day.isoformat(),
            "closing_date": (day + timedelta(days=60)).isoformat(),
        }
    ).execute()
    try:
        row = {
            "id": f"t-rnd-{tag}",
            "cycle_id": f"t-cyc-{tag}",
            "number": 1,
            "application_start": day.isoformat(),
            "application_end": (day + timedelta(days=1)).isoformat(),
            "review_start": (day + timedelta(days=2)).isoformat(),
            "review_end": (day + timedelta(days=3)).isoformat(),
            "approval_end": (day + timedelta(days=4)).isoformat(),
        }
        clients[0].table("matching_rounds").insert(row).execute()
        stores = []
        for c in clients:
            s = SupabaseStore.__new__(SupabaseStore)
            MockStore.__init__(s, seed=False)
            s.client = c
            stores.append(s)
        from app.models import Round

        rounds = [Round.model_validate({**row, "status": "scheduled"}) for _ in stores]
        barrier, wins = threading.Barrier(len(stores)), []

        def go(s, r):
            barrier.wait()
            wins.append(s.claim_round(r, "executed_at", datetime.now(UTC)))

        threads = [threading.Thread(target=go, args=(s, r)) for s, r in zip(stores, rounds, strict=True)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        assert wins.count(True) == 1
    finally:
        clients[0].table("application_cycles").delete().eq("id", f"t-cyc-{tag}").execute()
