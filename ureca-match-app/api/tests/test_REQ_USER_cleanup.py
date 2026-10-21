"""Admin deactivation and role change with a warning and auto-cleanup (REQ-USER-3, SRS 4.8.2).

The SRS has no separate requirement for the cleanup, so these tests extend REQ-USER-3 and the role edit in 4.8.2 a).
"""

import pytest

from app.models import (
    ApplicationStatus,
    ListingStatus,
    Match,
    MatchStatus,
    NotificationEvent,
    ProposalStatus,
    Role,
)


def _kinds(items):
    return sorted(i["kind"] for i in items)


def _only_admin(as_admin):
    """Leave adm-1 as the one active administrator."""
    for other in ("adm-2", "adm-3"):
        assert as_admin.post(f"/admin/users/{other}/deactivate").status_code == 200


# ---------------------------------------------------------------- last admin: a hard block


def test_REQ_USER_3_last_admin_cannot_be_deactivated(as_admin):
    _only_admin(as_admin)
    r = as_admin.post("/admin/users/adm-1/deactivate")
    assert r.status_code == 409
    assert r.json()["code"] == "last_admin"


def test_REQ_USER_3_last_admin_cannot_be_demoted(as_admin):
    _only_admin(as_admin)
    r = as_admin.patch("/admin/users/adm-1", json={"role": "supervisor"})
    assert r.status_code == 409
    assert r.json()["code"] == "last_admin"


def test_REQ_USER_3_last_admin_cannot_be_set_inactive_by_patch(as_admin):
    _only_admin(as_admin)
    r = as_admin.patch("/admin/users/adm-1", json={"status": "inactive"})
    assert r.status_code == 409
    assert r.json()["code"] == "last_admin"


@pytest.mark.parametrize("flag", ["true", "1"])
def test_REQ_USER_3_confirm_flag_cannot_bypass_last_admin(as_admin, fresh_store, flag):
    _only_admin(as_admin)
    for call in (
        lambda: as_admin.post(f"/admin/users/adm-1/deactivate?confirm_cleanup={flag}"),
        lambda: as_admin.patch(f"/admin/users/adm-1?confirm_cleanup={flag}", json={"role": "student"}),
        lambda: as_admin.patch(f"/admin/users/adm-1?confirm_cleanup={flag}", json={"status": "inactive"}),
    ):
        r = call()
        assert r.status_code == 409 and r.json()["code"] == "last_admin"
    adm = fresh_store.user("adm-1")
    assert adm.role == Role.admin and adm.status.value == "active"


def test_REQ_USER_3_admin_can_change_when_another_admin_is_active(as_admin):
    """With two active admins either may be demoted; the block only protects the last one."""
    assert as_admin.post("/admin/users/adm-2/deactivate").status_code == 200
    assert as_admin.patch("/admin/users/adm-3", json={"role": "supervisor"}).status_code == 200
    r = as_admin.post("/admin/users/adm-1/deactivate")
    assert r.status_code == 409 and r.json()["code"] == "last_admin"


def test_REQ_USER_3_other_admin_taking_over_unblocks(as_admin, client_for):
    _only_admin(as_admin)
    assert as_admin.patch("/admin/users/adm-2", json={"status": "active"}).status_code == 200
    assert client_for("adm-2").post("/admin/users/adm-1/deactivate").status_code == 200


# ---------------------------------------------------------------- preview: nothing changes without the flag


def test_REQ_USER_3_deactivate_supervisor_returns_preview(as_admin, fresh_store):
    r = as_admin.post("/admin/users/sup-1/deactivate")
    assert r.status_code == 409
    body = r.json()
    assert body["code"] == "has_active_items"
    assert _kinds(body["items"]) == ["listing", "listing", "listing", "proposal"]
    assert {i["id"] for i in body["items"]} >= {"lst-1", "lst-2", "lst-3", "prp-2"}
    # nothing was touched
    assert fresh_store.user("sup-1").status.value == "active"
    assert fresh_store.listing("lst-1").status == ListingStatus.published
    assert fresh_store.proposal("prp-2").status == ProposalStatus.submitted


def test_REQ_USER_3_role_change_returns_preview(as_admin, fresh_store):
    r = as_admin.patch("/admin/users/sup-1", json={"role": "student"})
    assert r.status_code == 409
    assert r.json()["code"] == "has_active_items"
    assert fresh_store.user("sup-1").role == Role.supervisor


def test_REQ_USER_3_patch_to_inactive_returns_preview(as_admin, fresh_store):
    r = as_admin.patch("/admin/users/stu-1", json={"status": "inactive"})
    assert r.status_code == 409 and r.json()["code"] == "has_active_items"
    assert fresh_store.user("stu-1").status.value == "active"


def test_REQ_USER_3_name_change_needs_no_confirmation(as_admin):
    assert as_admin.patch("/admin/users/sup-1", json={"name": "Prof. Renamed"}).status_code == 200


def test_REQ_USER_3_user_without_items_changes_straight_away(as_admin, fresh_store):
    created = as_admin.post("/admin/users", json={"name": "No Items", "email": "noitems@ntu.edu.sg", "role": "supervisor"}).json()
    assert as_admin.patch(f"/admin/users/{created['id']}", json={"role": "student"}).status_code == 200
    assert as_admin.post(f"/admin/users/{created['id']}/deactivate").status_code == 200
    assert fresh_store.user(created["id"]).status.value == "inactive"


# ---------------------------------------------------------------- cleanup: supervisor with open listings


def test_REQ_USER_3_confirmed_deactivation_closes_supervisor_listings(as_admin, client_for, fresh_store):
    open_apps = [a for a in fresh_store.applications if a.listing_id == "lst-1" and a.status == ApplicationStatus.submitted]
    assert open_apps
    applicant = open_apps[0].student_id
    audit_before = len(fresh_store.audit)

    r = as_admin.post("/admin/users/sup-1/deactivate?confirm_cleanup=true")
    assert r.status_code == 200

    assert fresh_store.user("sup-1").status.value == "inactive"
    for lid in ("lst-1", "lst-2", "lst-3"):
        assert fresh_store.listing(lid).status == ListingStatus.closed
    assert fresh_store.proposal("prp-2").status == ProposalStatus.declined
    assert not any(a.status == ApplicationStatus.submitted for a in fresh_store.applications if a.listing_id == "lst-1")

    # the people on the other side are told, once each, through the notify service
    mine = client_for(applicant).get("/me/notifications").json()
    assert any(n["event"] == NotificationEvent.account_changed.value and "was closed" in n["message"] for n in mine)
    chloe = fresh_store.proposal("prp-2").student_id
    assert any("was declined" in n.message for n in fresh_store.notifications_for(chloe))

    # one audit entry for the cleanup, plus the usual deactivation entry
    notes = [e.note for e in fresh_store.audit[audit_before:] if e.note]
    assert any(n.startswith("Cleanup before account deactivated") and "3 listings" in n for n in notes)
    assert any(e.operation.value == "user_deactivated" for e in fresh_store.audit[audit_before:])


def test_REQ_USER_3_remaining_ranks_stay_in_sequence_after_listing_closes(as_admin, fresh_store):
    """A student who applied to a closed listing and another keeps rank 1..n on what is left."""
    student = next(
        s
        for s in {a.student_id for a in fresh_store.applications}
        if {a.listing_id for a in fresh_store.applications_for(student_id=s)} & {"lst-1", "lst-2", "lst-3"}
        and {a.listing_id for a in fresh_store.applications_for(student_id=s)} - {"lst-1", "lst-2", "lst-3"}
    )
    assert as_admin.post("/admin/users/sup-1/deactivate?confirm_cleanup=true").status_code == 200
    left = [a for a in fresh_store.applications_for(student_id=student) if a.status == ApplicationStatus.submitted]
    assert sorted(a.preference_rank for a in left) == list(range(1, len(left) + 1))


def test_REQ_USER_3_supervisor_role_change_confirmed_cleans_up_then_changes(as_admin, fresh_store):
    r = as_admin.patch("/admin/users/sup-2?confirm_cleanup=true", json={"role": "student"})
    assert r.status_code == 200
    assert r.json()["role"] == "student"
    assert fresh_store.listing("lst-4").status == ListingStatus.closed
    assert fresh_store.proposal("prp-1").status == ProposalStatus.declined


def test_REQ_USER_3_open_matches_on_supervisor_listings_are_cancelled(as_admin, fresh_store):
    fresh_store.matches.append(
        Match(
            id="mt-open",
            round_id="rnd-2",
            student_id="stu-1",
            student_name="Stu One",
            listing_id="lst-1",
            listing_title="Listing",
            supervisor_id="sup-1",
            supervisor_name="Prof. Marcus Chua",
            status=MatchStatus.proposed,
        )
    )
    preview = as_admin.post("/admin/users/sup-1/deactivate").json()
    assert "match" in _kinds(preview["items"])
    assert as_admin.post("/admin/users/sup-1/deactivate?confirm_cleanup=true").status_code == 200
    m = next(m for m in fresh_store.matches if m.id == "mt-open")
    assert m.status == MatchStatus.rejected
    assert any("was cancelled" in n.message for n in fresh_store.notifications_for("stu-1"))


# ---------------------------------------------------------------- cleanup: student with applications and a match


def test_REQ_USER_3_student_preview_lists_applications_and_match(as_admin, fresh_store):
    fresh_store.matches.append(
        Match(
            id="mt-stu1",
            round_id="rnd-2",
            student_id="stu-1",
            student_name="Stu One",
            listing_id="lst-2",
            listing_title="Listing",
            supervisor_id="sup-1",
            supervisor_name="Prof. Marcus Chua",
            status=MatchStatus.published,
        )
    )
    r = as_admin.post("/admin/users/stu-1/deactivate")
    assert r.status_code == 409
    assert _kinds(r.json()["items"]) == ["application", "application", "match"]


def test_REQ_USER_3_confirmed_student_cleanup_withdraws_and_cancels(as_admin, fresh_store):
    fresh_store.matches.append(
        Match(
            id="mt-stu1",
            round_id="rnd-2",
            student_id="stu-1",
            student_name="Stu One",
            listing_id="lst-2",
            listing_title="Listing",
            supervisor_id="sup-1",
            supervisor_name="Prof. Marcus Chua",
            status=MatchStatus.published,
        )
    )
    # a student with a proposal too
    prop = fresh_store.proposal("prp-1")  # Aisha Rahman -> sup-2
    student = prop.student_id
    assert as_admin.post(f"/admin/users/{student}/deactivate?confirm_cleanup=true").status_code == 200
    assert fresh_store.proposal("prp-1").status == ProposalStatus.declined
    assert any("withdrawn" in n.message for n in fresh_store.notifications_for("sup-2"))

    assert as_admin.post("/admin/users/stu-1/deactivate?confirm_cleanup=true").status_code == 200
    assert all(a.status == ApplicationStatus.withdrawn for a in fresh_store.applications_for(student_id="stu-1"))
    assert next(m for m in fresh_store.matches if m.id == "mt-stu1").status == MatchStatus.declined
    assert any("withdrew their application" in n.message for n in fresh_store.notifications_for("sup-1"))


def test_REQ_USER_3_accepted_match_is_cancelled_and_slot_freed(as_admin, fresh_store):
    """stu-33 holds an accepted match in the demo data."""
    m = next(m for m in fresh_store.matches if m.student_id == "stu-33")
    lst = fresh_store.listing(m.listing_id)
    filled = lst.filled_slots
    assert filled > 0

    r = as_admin.post("/admin/users/stu-33/deactivate")
    assert r.status_code == 409
    assert _kinds(r.json()["items"]) == ["match"]

    assert as_admin.post("/admin/users/stu-33/deactivate?confirm_cleanup=true").status_code == 200
    assert m.status == MatchStatus.declined
    assert fresh_store.listing(m.listing_id).filled_slots == filled - 1
    assert any("cancelled" in n.message for n in fresh_store.notifications_for(m.supervisor_id))


def test_REQ_USER_3_confirmed_cleanup_is_audited(as_admin, fresh_store):
    as_admin.post("/admin/users/stu-33/deactivate?confirm_cleanup=true")
    notes = [e.note for e in fresh_store.audit if e.note]
    assert any(n.startswith("Cleanup before account deactivated: closed 1 match") for n in notes)


def test_REQ_USER_3_only_admins_can_use_the_flag(client_for):
    for uid in ("stu-1", "sup-1"):
        assert client_for(uid).post("/admin/users/stu-33/deactivate?confirm_cleanup=true").status_code == 403
