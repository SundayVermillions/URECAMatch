"""Slice D. The Assignments page: where every student stands in the cycle, and assigning from it.  REQ-ASSIGN-1..3.

Seed, demo clock 7 Sep 2026 (Round 2 applications open): stu-33 accepted lst-1 in Round 1, stu-38 declined an offer,
stu-1 applied in Round 2, stu-39 has not completed their profile and has not applied, stu-40 is inactive.
"""

from datetime import timedelta

from app.models import Match, MatchStatus
from app.routers.matching import _open_slots
from app.settings import get_settings
from tests.conftest import APPROVAL_CLOSED, REVIEW_CLOSED

ASSIGN = {"student_id": "stu-1", "listing_id": "lst-2", "justification": "Exceptional circumstances"}


def _view(as_admin):
    r = as_admin.get("/admin/assignments")
    assert r.status_code == 200
    return r.json()


def _row(view, student_id):
    return next(s for s in view["students"] if s["user"]["id"] == student_id)


def _standing(view, student_id):
    row = _row(view, student_id)
    return row["status"], row["reason"]


def test_REQ_ASSIGN_1_every_active_student_is_listed_with_where_they_stand(as_admin, fresh_store):
    view = _view(as_admin)
    active = {u.id for u in fresh_store.users if u.role == "student" and u.status == "active"}
    assert {s["user"]["id"] for s in view["students"]} == active and "stu-40" not in active
    accepted = _row(view, "stu-33")
    assert accepted["status"] == "accepted" and accepted["match"]["id"] == "mt-1" and accepted["round_number"] == 1
    assert _standing(view, "stu-38") == ("unassigned", "Declined an offer")
    assert _standing(view, "stu-1") == ("unassigned", "Waiting for Round 2 matching")
    assert _standing(view, "stu-39") == ("unassigned", "Profile not complete")
    fresh_store.student("stu-39").profile_complete = True
    assert _standing(_view(as_admin), "stu-39") == ("unassigned", "Has not applied")


def test_REQ_ASSIGN_1_a_rejection_and_a_student_matching_left_out_say_so(as_admin, at, client_for):
    at(REVIEW_CLOSED)  # Round 2 matching has run; its approval window is open
    proposed = as_admin.get("/admin/rounds/rnd-2/matches", params={"status": "proposed"}).json()[0]
    sup = client_for(proposed["supervisor_id"])
    assert sup.post(f"/supervisor/matches/{proposed['id']}/decline", json={"note": "Not a fit for the lab"}).status_code == 200
    view = _view(as_admin)
    assert _standing(view, proposed["student_id"]) == ("unassigned", "Rejected by the supervisor")
    unmatched = [u["user"]["id"] for u in as_admin.get("/admin/rounds/rnd-2/unmatched").json()]
    left_out = next(sid for sid in unmatched if sid != proposed["student_id"])
    assert _standing(view, left_out) == ("unassigned", "Not matched")


def test_REQ_ASSIGN_1_with_no_cycle_nobody_can_be_assigned(as_admin, fresh_store):
    fresh_store.cycles = []
    view = _view(as_admin)
    assert view["round"] is None and {s["status"] for s in view["students"]} == {"unassigned"}
    r = as_admin.post("/admin/assignments", json=ASSIGN)
    assert r.status_code == 409 and r.json()["code"] == "cycle_closed"


def test_REQ_ASSIGN_1_a_reassignment_logs_both_projects(as_admin):
    m = as_admin.post("/admin/assignments", json=ASSIGN).json()  # Round 2's results are not out, so it can still move
    move = {"listing_id": "lst-3", "justification": "Supervisor asked for it"}
    r = as_admin.post(f"/admin/matches/{m['id']}/reassign", json=move)
    assert r.status_code == 200
    notes = [e["note"] for e in as_admin.get("/admin/audit", params={"operation": "manual_reassignment"}).json()]
    assert f"Moved from {m['listing_title']} to {r.json()['listing_title']}: Supervisor asked for it" in notes  # AF-S3


def test_REQ_ASSIGN_1_an_assignment_joins_the_current_round(as_admin):
    view = _view(as_admin)
    assert view["round"]["id"] == "rnd-2" and view["offer_deadline"] is None  # Round 2's results are not out yet
    r = as_admin.post("/admin/assignments", json=ASSIGN)
    assert r.status_code == 201
    m = r.json()
    assert m["round_id"] == "rnd-2" and m["status"] == "reassigned" and m["published_at"] is None  # out with the round
    assert _standing(_view(as_admin), "stu-1") == ("matched", None)
    audit = as_admin.get("/admin/audit", params={"operation": "manual_reassignment"}).json()
    assert any(m["id"] in e["affected_records"] for e in audit)  # REQ-AUDIT-1


def test_REQ_ASSIGN_1_once_the_rounds_results_are_out_the_offer_goes_at_once(as_admin, at, fresh_store):
    at(APPROVAL_CLOSED)  # Round 2's results are published
    view = _view(as_admin)
    assert view["round"]["id"] == "rnd-2" and view["offer_deadline"]
    lst = next(lst for lst in fresh_store.all_listings() if lst.status == "published" and _open_slots(fresh_store, lst))
    r = as_admin.post("/admin/assignments", json={**ASSIGN, "student_id": "stu-39", "listing_id": lst.id})
    assert r.status_code == 201 and r.json()["status"] == "published"
    assert r.json()["offer_expires_at"] == view["offer_deadline"]  # the page told the admin this deadline
    assert _standing(_view(as_admin), "stu-39") == ("offered", None)


def test_REQ_ASSIGN_2_assigning_needs_a_justification(as_admin):
    assert as_admin.post("/admin/assignments", json={**ASSIGN, "justification": "short"}).status_code == 422


def test_REQ_ASSIGN_3_a_student_with_a_project_is_refused_until_it_is_unassigned(as_admin):
    r = as_admin.post("/admin/assignments", json={**ASSIGN, "student_id": "stu-33"})
    assert r.status_code == 409 and r.json()["code"] == "already_assigned"


def test_REQ_ASSIGN_3_a_project_from_an_earlier_cycle_does_not_block_a_new_one(as_admin, fresh_store):
    past = next(c for c in fresh_store.cycles if c.id != fresh_store.cycle.id)
    old = next(m for m in fresh_store.matches if m.id == "mt-1")
    fresh_store.matches.append(
        Match(**{**old.model_dump(), "id": "mt-past", "round_id": past.rounds[0].id, "student_id": "stu-1"})
    )
    assert _standing(_view(as_admin), "stu-1") == ("unassigned", "Waiting for Round 2 matching")
    assert as_admin.post("/admin/assignments", json=ASSIGN).status_code == 201


def test_REQ_ASSIGN_1_nothing_can_be_assigned_once_the_cycle_has_closed(as_admin, at, fresh_store):
    at(fresh_store.cycle.closing_date + timedelta(days=1))
    assert _view(as_admin)["round"] is None
    r = as_admin.post("/admin/assignments", json=ASSIGN)
    assert r.status_code == 409 and r.json()["code"] == "cycle_closed"


def test_REQ_ASSIGN_1_a_cycle_without_rounds_takes_no_assignments(as_admin, fresh_store):
    fresh_store.cycle.rounds = []
    assert _view(as_admin)["round"] is None
    r = as_admin.post("/admin/assignments", json=ASSIGN)
    assert r.status_code == 409 and r.json()["code"] == "no_rounds"


def test_REQ_ASSIGN_1_an_offer_past_its_deadline_counts_as_lapsed_before_the_scheduler_runs(as_admin, monkeypatch, fresh_store):
    # In Supabase mode the schedule runs on the daily cron, so a lapsed offer can still say published for a while.
    monkeypatch.setattr(get_settings(), "scheduler_on_request", False)
    offer = next(m for m in fresh_store.matches if m.id == "mt-1")
    offer.status = MatchStatus.published  # stu-33 never answered
    monkeypatch.setattr(get_settings(), "demo_now", offer.offer_expires_at + timedelta(hours=1))
    assert _standing(_view(as_admin), "stu-33") == ("unassigned", "Did not answer an offer in time")
