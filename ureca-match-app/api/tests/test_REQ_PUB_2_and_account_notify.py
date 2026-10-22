"""Slice E. Notifications the SRS asks for beyond offers: REQ-PUB-2 tells "all affected users" when
results are published (students and supervisors), and 4.21 covers account status changes."""

from datetime import UTC, datetime

from app.models import ApplicationStatus, NotificationEvent
from app.settings import get_settings


def publish_round_2(fresh_store, as_admin, client_for, monkeypatch) -> list:
    monkeypatch.setattr(get_settings(), "demo_now", datetime(2026, 9, 12, 9, tzinfo=UTC))  # after review window
    assert as_admin.post("/admin/rounds/rnd-2/execute").status_code == 200
    for m in as_admin.get("/admin/rounds/rnd-2/matches").json():
        client_for(m["supervisor_id"]).post(f"/supervisor/matches/{m['id']}/approve", json={})
    before = len(fresh_store.notifications)
    assert as_admin.post("/admin/rounds/rnd-2/publish").status_code == 200
    return fresh_store.notifications[before:]


def test_REQ_PUB_2_unmatched_applicants_told(fresh_store, as_admin, client_for, monkeypatch):
    new = publish_round_2(fresh_store, as_admin, client_for, monkeypatch)
    offered = {n.user_id for n in new if n.event == NotificationEvent.offer_received}
    told = {n.user_id for n in new if n.event == NotificationEvent.results_published and n.user_id.startswith("stu")}
    applied = {
        a.student_id for a in fresh_store.applications if a.round_id == "rnd-2" and a.status != ApplicationStatus.withdrawn
    }
    assert offered and told
    assert told == applied - offered  # every applicant hears once: an offer, or this
    n = next(n for n in new if n.user_id in told)
    # Rollover is on by default (REQ-EXEC-3), so the next step is that the applications carry over.
    assert n.message == (
        "You were not matched to a project in Round 2. "
        "Your applications carry over to Round 3, where you can reorder or withdraw them."
    )
    assert n.link == "/my-applications"


def test_REQ_PUB_2_supervisors_told_their_offers(fresh_store, as_admin, client_for, monkeypatch):
    new = publish_round_2(fresh_store, as_admin, client_for, monkeypatch)
    sups = {m.supervisor_id for m in fresh_store.matches if m.round_id == "rnd-2"}
    told = [n for n in new if n.event == NotificationEvent.results_published and n.user_id in sups]
    assert sorted(n.user_id for n in told) == sorted(sups)  # exactly one each
    for n in told:
        offers = sum(1 for m in fresh_store.matches if m.round_id == "rnd-2" and m.supervisor_id == n.user_id)
        assert n.message.startswith(f"{offers} student") and n.link == "/approvals"


def test_REQ_USER_role_change_notifies_user(fresh_store, as_admin):
    saved = []
    original = fresh_store.save_user
    fresh_store.save_user = lambda u: saved.append(u.id) or original(u)
    assert as_admin.patch("/admin/users/stu-2?confirm_cleanup=true", json={"role": "supervisor"}).status_code == 200
    assert saved == ["stu-2"]  # persisted, not only changed in memory
    [n] = [n for n in fresh_store.notifications_for("stu-2") if n.event == NotificationEvent.account_changed]
    assert n.title == "Your account was updated"
    assert n.message == "An administrator changed your account: role is now supervisor."


def test_REQ_USER_no_change_no_notification(fresh_store, as_admin):
    name = fresh_store.user("stu-2").name
    assert as_admin.patch("/admin/users/stu-2", json={"name": name, "role": "student"}).status_code == 200
    assert not [n for n in fresh_store.notifications_for("stu-2") if n.event == NotificationEvent.account_changed]


def test_REQ_USER_deactivate_notifies_once(fresh_store, as_admin):
    assert as_admin.post("/admin/users/stu-2/deactivate?confirm_cleanup=true").status_code == 200  # stu-2 has open applications
    assert as_admin.post("/admin/users/stu-2/deactivate").status_code == 200  # already inactive, nothing left to clean up
    told = [n for n in fresh_store.notifications_for("stu-2") if n.event == NotificationEvent.account_changed]
    assert [n.title for n in told] == ["Your account was deactivated"]
