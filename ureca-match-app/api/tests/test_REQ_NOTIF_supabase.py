"""Slice E. SupabaseStore notification methods send the right queries (REQ-NOTIF-1, 2). No network: fake client."""

from app.db.store import SupabaseStore
from app.models import Notification, NotificationEvent
from app.settings import get_settings

ROW = {
    "id": "ntf-9", "user_id": "stu-1", "event": "round_opened", "title": "t", "message": "m",
    "created_at": "2026-09-07T10:00:00+00:00", "read": False, "link": None,
}


class FakeQuery:
    def __init__(self, log: list, data: list):
        self.log, self.data = log, data

    def __getattr__(self, name):
        def call(*args, **kwargs):
            self.log.append((name, args, kwargs))
            return self

        return call

    def execute(self):
        return type("Res", (), {"data": self.data})()


class FakeClient:
    def __init__(self, data: list):
        self.log: list = []
        self.data = data

    def table(self, name):
        self.log.append(("table", (name,), {}))
        return FakeQuery(self.log, self.data)


def store_with(data: list) -> SupabaseStore:
    s = SupabaseStore.__new__(SupabaseStore)  # skip __init__: no seed, no real client
    s.client = FakeClient(data)
    return s


def test_REQ_NOTIF_1_supabase_reads_own_newest_first():
    s = store_with([ROW])
    assert [n.id for n in s.notifications_for("stu-1")] == ["ntf-9"]
    assert ("table", ("notifications",), {}) in s.client.log
    assert ("eq", ("user_id", "stu-1"), {}) in s.client.log
    assert ("order", ("created_at",), {"desc": True}) in s.client.log


def test_REQ_NOTIF_1_supabase_inserts_rows():
    s = store_with([])
    n = Notification(id="ntf-9", user_id="stu-1", event=NotificationEvent.round_opened, title="t", message="m",
                     created_at=get_settings().now())
    s.save_notifications(n)
    inserts = [args[0] for name, args, _ in s.client.log if name == "insert"]
    assert inserts == [[n.model_dump(mode="json")]]


def test_REQ_NOTIF_2_supabase_mark_read_scoped_to_owner():
    s = store_with([ROW])
    assert s.mark_notification_read("ntf-9", "stu-1") is True
    assert ("update", ({"read": True},), {}) in s.client.log
    assert ("eq", ("user_id", "stu-1"), {}) in s.client.log
    assert store_with([]).mark_notification_read("ntf-9", "stu-2") is False
