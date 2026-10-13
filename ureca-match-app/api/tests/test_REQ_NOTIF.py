"""Slice E. Notifications: own only, newest first (REQ-NOTIF-1), mark read (REQ-NOTIF-2)."""

from datetime import timedelta

from app.models import NotificationEvent
from app.services.notify import notify
from app.settings import get_settings


def test_REQ_NOTIF_1_only_recipient_sees(fresh_store, as_student, client_for):
    notify(fresh_store, ["stu-2"], NotificationEvent.round_opened, "Round 2 open", "Apply now.", get_settings().now())
    mine = as_student.get("/me/notifications").json()
    assert mine and all(n["user_id"] == "stu-1" for n in mine)
    theirs = client_for("stu-2").get("/me/notifications").json()
    assert [n["title"] for n in theirs] == ["Round 2 open"]


def test_REQ_NOTIF_1_newest_first(fresh_store, as_student):
    now = get_settings().now()
    notify(fresh_store, ["stu-1"], NotificationEvent.cycle_changed, "Older", "m", now - timedelta(days=30))
    notify(fresh_store, ["stu-1"], NotificationEvent.cycle_changed, "Newest", "m", now)
    stamps = [n["created_at"] for n in as_student.get("/me/notifications").json()]
    assert stamps == sorted(stamps, reverse=True)
    assert as_student.get("/me/notifications").json()[0]["title"] == "Newest"


def test_REQ_NOTIF_2_mark_read_updates_unread_count(as_student, client_for):
    def unread() -> list[dict]:
        return [n for n in as_student.get("/me/notifications").json() if not n["read"]]

    before = unread()
    assert before
    assert as_student.post(f"/me/notifications/{before[0]['id']}/read").status_code == 200
    assert len(unread()) == len(before) - 1
    # Another user's notification cannot be marked read (it is not found for them).
    other = client_for("sup-1").get("/me/notifications").json()[0]["id"]
    assert as_student.post(f"/me/notifications/{other}/read").status_code == 404
