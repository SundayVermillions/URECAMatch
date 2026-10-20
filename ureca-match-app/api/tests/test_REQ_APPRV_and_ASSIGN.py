"""Slice D. The supervisor approval window (decline only) and admin manual assignment.
REQ-APPRV-1..4, REQ-ASSIGN-1..3."""

from datetime import timedelta

from tests.conftest import APPROVAL_CLOSED, REVIEW_CLOSED


def _execute_r2(as_admin, at):
    """Close Round 2's review window: matching runs and its approval window opens."""
    at(REVIEW_CLOSED)
    return as_admin.get("/admin/rounds/rnd-2/matches").json()


def _decline(client_for, m, note=None):
    return client_for(m["supervisor_id"]).post(f"/supervisor/matches/{m['id']}/decline", json={"note": note})


# ---------------------------------------------------------------- APPRV


def test_REQ_APPRV_1_cannot_decline_before_matching_runs(as_admin, client_for):
    # No matches exist for round 2 until it is executed, so seed a manual one first.
    r = as_admin.post(
        "/admin/rounds/rnd-2/assign",
        json={"student_id": "stu-1", "listing_id": "lst-2", "justification": "Seed a match for the guard test"},
    )
    mid, sup = r.json()["id"], r.json()["supervisor_id"]
    # Round 2's matching has not run, so its supervisor cannot act on the match yet.
    resp = client_for(sup).post(f"/supervisor/matches/{mid}/decline", json={})
    assert resp.status_code == 409 and resp.json()["code"] == "not_executed"


def test_REQ_APPRV_2_decline_frees_the_slot(as_admin, client_for, at):
    declined = _execute_r2(as_admin, at)[0]
    resp = _decline(client_for, declined)
    assert resp.status_code == 200 and resp.json()["status"] == "rejected"
    at(APPROVAL_CLOSED)  # everyone else is offered a place; the declined student must not be
    placed = {m["student_id"] for m in as_admin.get("/admin/rounds/rnd-2/matches", params={"status": "published"}).json()}
    assert placed and declined["student_id"] not in placed


def test_REQ_APPRV_4_matches_nobody_declines_are_offered(as_admin, at):
    matched = {m["student_id"] for m in _execute_r2(as_admin, at)}
    at(APPROVAL_CLOSED)
    offered = {m["student_id"] for m in as_admin.get("/admin/rounds/rnd-2/matches", params={"status": "published"}).json()}
    assert offered == matched


def test_REQ_APPRV_4_decline_only_during_the_approval_window(as_admin, client_for, at):
    first, second = _execute_r2(as_admin, at)[:2]
    at(APPROVAL_CLOSED - timedelta(seconds=1))  # the window's last second
    assert _decline(client_for, first).status_code == 200
    at(APPROVAL_CLOSED)
    resp = _decline(client_for, second)
    assert resp.status_code == 409 and resp.json()["code"] == "approval_closed"


def test_REQ_APPRV_4_there_is_nothing_to_approve(as_admin, client_for, at):
    m = _execute_r2(as_admin, at)[0]
    assert client_for(m["supervisor_id"]).post(f"/supervisor/matches/{m['id']}/approve", json={}).status_code == 404


def test_REQ_APPRV_4_an_admin_reassignment_cannot_be_declined(as_admin, client_for, at, fresh_store):
    m = _execute_r2(as_admin, at)[0]
    target = next(
        x.id for x in fresh_store.listings if x.status.value == "published" and x.id != m["listing_id"] and x.id != "lst-1"
    )
    moved = as_admin.post(f"/admin/matches/{m['id']}/reassign", json={"listing_id": target, "justification": "Better fit"})
    assert moved.status_code == 200
    resp = _decline(client_for, moved.json())
    assert resp.status_code == 409 and resp.json()["code"] == "not_declinable"


def test_REQ_APPRV_3_no_change_after_publish(client_for):
    # mt-1 belongs to round 1, which is already published in the seed.
    resp = client_for("sup-1").post("/supervisor/matches/mt-1/decline", json={})
    assert resp.status_code == 409 and resp.json()["code"] == "approval_closed"


def test_REQ_APPRV_supervisor_cannot_decline_another_supervisors_match(as_admin, client_for, at):
    m = _execute_r2(as_admin, at)[0]
    other = "sup-2" if m["supervisor_id"] != "sup-2" else "sup-1"
    resp = client_for(other).post(f"/supervisor/matches/{m['id']}/decline", json={})
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


def test_REQ_ASSIGN_1_reassign_cannot_overfill_a_project(as_admin, at, fresh_store):
    matches = _execute_r2(as_admin, at)
    target = next(lst for lst in fresh_store.listings if lst.id == "lst-4")
    movers = [m for m in matches if m["listing_id"] != target.id][:2]
    assert len(movers) == 2
    body = {"listing_id": target.id, "justification": "Exceptional circumstances"}
    assert as_admin.post(f"/admin/matches/{movers[0]['id']}/reassign", json=body).status_code == 200
    r = as_admin.post(f"/admin/matches/{movers[1]['id']}/reassign", json=body)
    assert r.status_code == 422 and r.json()["code"] == "no_slot"


def test_REQ_ASSIGN_1_reassign_takes_the_students_preference_for_the_new_project(as_admin, at, fresh_store):
    def ranks(student_id):  # the student's own order of the projects they applied to this round
        return {a.listing_id: a.preference_rank for a in fresh_store.applications_for(student_id=student_id, round_id="rnd-2")}

    m = next(x for x in _execute_r2(as_admin, at) if len(ranks(x["student_id"])) > 1)
    own = ranks(m["student_id"])
    published = [x.id for x in fresh_store.listings if x.status.value == "published" and x.id != m["listing_id"]]

    def reassign_to_first_open(candidates):
        for lid in candidates:
            r = as_admin.post(f"/admin/matches/{m['id']}/reassign", json={"listing_id": lid, "justification": "Exceptional case"})
            if r.status_code == 200:
                return r.json()
        raise AssertionError("no candidate project had an open slot")

    applied = reassign_to_first_open([lid for lid in published if lid in own])
    assert applied["preference_rank"] == own[applied["listing_id"]] != m["preference_rank"]  # not the old project's
    never = reassign_to_first_open([lid for lid in published if lid not in own])
    assert never["preference_rank"] is None  # the student never applied to it


def test_REQ_ASSIGN_1_assignment_into_a_published_round_is_offered_at_once(as_admin, client_for):
    # Round 1 is published in the seed, so no later publish step would ever release this match.
    r = _assign(as_admin, "stu-2", "lst-2", round_id="rnd-1")
    assert r.status_code == 201 and r.json()["status"] == "published"
    assert r.json()["offer_expires_at"].startswith("2026-09-10")  # Round 2's application window closes (REQ-OUTCOME-3)
    student = client_for("stu-2")
    assert student.get("/me/match").json()["id"] == r.json()["id"]
    assert any(n["event"] == "offer_received" for n in student.get("/me/notifications").json())


def test_REQ_ASSIGN_3_assigned_student_is_not_matched_again(as_admin, at, fresh_store):
    assert _assign(as_admin, "stu-1", "lst-2").status_code == 201
    # Rank stu-1 first on a project they applied to, so only the rule can keep them out of the run.
    own = next(a for a in fresh_store.applications_for(student_id="stu-1", round_id="rnd-2") if a.listing_id != "lst-2")
    fresh_store.applicant_rankings.setdefault(f"{own.listing_id}:rnd-2", []).insert(0, own.id)
    _execute_r2(as_admin, at)
    assert [m.status.value for m in fresh_store.matches if m.student_id == "stu-1"] == ["reassigned"]


def test_REQ_APPRV_2_decline_keeps_the_reason_without_notifying_admins(as_admin, client_for, at, fresh_store):
    m = _execute_r2(as_admin, at)[0]
    admins = ("adm-1", "adm-2", "adm-3")
    before = {a: len(fresh_store.notifications_for(a)) for a in admins}
    r = _decline(client_for, m, "Not a fit for the lab")
    assert r.status_code == 200 and r.json()["supervisor_note"] == "Not a fit for the lab"
    assert {a: len(fresh_store.notifications_for(a)) for a in admins} == before  # no notice or e-mail per decline
    shown = next(x for x in as_admin.get("/admin/rounds/rnd-2/matches").json() if x["id"] == m["id"])
    assert shown["supervisor_note"] == "Not a fit for the lab"  # kept on the match for admin review
    assert as_admin.get("/admin/rounds/rnd-2/summary").json()["declined"] == 1


def test_REQ_APPRV_2_admins_hear_about_declines_once_when_results_publish(as_admin, client_for, at, fresh_store):
    _decline(client_for, _execute_r2(as_admin, at)[0])
    at(APPROVAL_CLOSED)
    [notice] = [n for n in fresh_store.notifications_for("adm-1") if n.title == "Round 2 results published"]
    offers = sum(1 for x in fresh_store.matches if x.round_id == "rnd-2" and x.status.value == "published")
    sent = "1 offer sent." if offers == 1 else f"{offers} offers sent."
    assert notice.message == (
        f"{sent} 1 student declined by a supervisor is now unmatched. Students have until 21 Sep, 5:00 pm SGT to respond."
    )


# ---------------------------------------------------------------- REQ-REV-1 unmatched view, unassign, use case 3-3


def test_REQ_REV_1_a_declined_student_counts_as_unmatched_not_matched(as_admin, client_for, at):
    m = _execute_r2(as_admin, at)[0]
    before = as_admin.get("/admin/rounds/rnd-2/summary").json()
    _decline(client_for, m)
    after = as_admin.get("/admin/rounds/rnd-2/summary").json()
    assert (after["matched"], after["unmatched"], after["declined"]) == (before["matched"] - 1, before["unmatched"] + 1, 1)


def test_REQ_REV_1_unmatched_list_matches_the_summary(as_admin, at):
    _execute_r2(as_admin, at)
    unmatched = as_admin.get("/admin/rounds/rnd-2/unmatched").json()
    summary = as_admin.get("/admin/rounds/rnd-2/summary").json()
    assert len(unmatched) == summary["unmatched"] > 0
    matched = {m["student_id"] for m in as_admin.get("/admin/rounds/rnd-2/matches").json()}
    assert not {u["user"]["id"] for u in unmatched} & matched


def test_REQ_ASSIGN_3_unassign_needs_a_reason(as_admin, at):
    m = _execute_r2(as_admin, at)[0]
    r = as_admin.post(f"/admin/matches/{m['id']}/unassign", json={"note": "short"})
    assert r.status_code == 422 and r.json()["code"] == "justification_required"


def test_REQ_ASSIGN_3_unassign_then_assign_elsewhere(as_admin, at, fresh_store):
    m = _execute_r2(as_admin, at)[0]
    r = as_admin.post(f"/admin/matches/{m['id']}/unassign", json={"note": "Student asked to change project"})
    assert r.status_code == 200
    assert all(x.id != m["id"] for x in fresh_store.matches)
    audit = as_admin.get("/admin/audit", params={"operation": "manual_reassignment"}).json()[0]
    assert m["id"] in audit["affected_records"] and "Student asked to change project" in audit["note"]
    assert _assign(as_admin, m["student_id"], "lst-2").status_code == 201  # no longer "already assigned"


def test_REQ_ASSIGN_3_unassigning_an_accepted_student_frees_the_slot(as_admin, client_for, monkeypatch, fresh_store):
    lst = fresh_store.listing("lst-1")
    filled = lst.filled_slots
    assert fresh_store.student("stu-33").eligible_for_matching
    fresh_store.student("stu-33").eligible_for_matching = False  # what accepting sets
    r = as_admin.post("/admin/matches/mt-1/unassign", json={"note": "Student left the university"})  # mt-1 is accepted
    assert r.status_code == 200
    assert lst.filled_slots == filled - 1
    assert fresh_store.student("stu-33").eligible_for_matching is True  # back in the pool
    assert any(n.event.value == "match_rejected" for n in fresh_store.notifications_for("stu-33"))


def test_REQ_ASSIGN_3_declined_match_cannot_be_unassigned(as_admin):
    r = as_admin.post("/admin/matches/mt-6/unassign", json={"note": "Nothing to take back here"})  # mt-6 was declined
    assert r.status_code == 409 and r.json()["code"] == "not_assigned"


def test_REQ_ASSIGN_1_assign_reuses_a_declined_row_in_the_round(as_admin, client_for, at, fresh_store):
    m = _execute_r2(as_admin, at)[0]
    _decline(client_for, m)
    target = next(x.id for x in fresh_store.listings if x.status.value == "published" and x.id not in (m["listing_id"], "lst-1"))
    r = _assign(as_admin, m["student_id"], target)
    assert r.status_code == 201 and r.json()["id"] == m["id"] and r.json()["original_listing_id"] == m["listing_id"]
    assert len([x for x in fresh_store.matches if x.round_id == "rnd-2" and x.student_id == m["student_id"]]) == 1


def test_REQ_APPRV_supervisor_sees_the_student_behind_a_match(as_admin, client_for, at):
    m = _execute_r2(as_admin, at)[0]
    r = client_for(m["supervisor_id"]).get(f"/supervisor/matches/{m['id']}/student")
    assert r.status_code == 200
    body = r.json()
    assert body["student"]["id"] == m["student_id"] and body["application_id"] and len(body["statement"]) >= 50
    other = "sup-2" if m["supervisor_id"] != "sup-2" else "sup-1"
    assert client_for(other).get(f"/supervisor/matches/{m['id']}/student").status_code == 403


def test_REQ_ASSIGN_3_unassigning_an_offer_resets_its_application(as_admin, at, fresh_store):
    _execute_r2(as_admin, at)
    at(APPROVAL_CLOSED)
    m = next(x for x in fresh_store.matches if x.round_id == "rnd-2" and x.status.value == "published")
    assert as_admin.post(f"/admin/matches/{m.id}/unassign", json={"note": "Placed through another scheme"}).status_code == 200
    app = next(a for a in fresh_store.applications_for(student_id=m.student_id, round_id="rnd-2") if a.listing_id == m.listing_id)
    assert app.status.value == "unmatched"  # no longer "matched" to a project they do not hold
