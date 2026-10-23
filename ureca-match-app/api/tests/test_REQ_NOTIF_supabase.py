"""Slice E. SupabaseStore notification methods send the right queries (REQ-NOTIF-1, 2). No network: fake client."""

from app.db import store as store_module
from app.db.store import MockStore, SupabaseStore
from app.models import Notification, NotificationEvent
from app.settings import get_settings

ROW = {
    "id": "ntf-9",
    "user_id": "stu-1",
    "event": "round_opened",
    "title": "t",
    "message": "m",
    "created_at": "2026-09-07T10:00:00+00:00",
    "read": False,
    "link": None,
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
        return type("Res", (), {"data": self.data, "count": len(self.data)})()


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
    n = Notification(
        id="ntf-9", user_id="stu-1", event=NotificationEvent.round_opened, title="t", message="m", created_at=get_settings().now()
    )
    s.save_notifications(n)
    inserts = [args[0] for name, args, _ in s.client.log if name == "insert"]
    assert inserts == [[n.model_dump(mode="json")]]


def test_REQ_NOTIF_2_supabase_mark_read_scoped_to_owner():
    s = store_with([ROW])
    assert s.mark_notification_read("ntf-9", "stu-1") is True
    assert ("update", ({"read": True},), {}) in s.client.log
    assert ("eq", ("user_id", "stu-1"), {}) in s.client.log
    assert store_with([]).mark_notification_read("ntf-9", "stu-2") is False


def test_REQ_NOTIF_2_supabase_unread_count_queries_table():
    s = store_with([ROW, ROW])
    assert s.unread_notification_count("stu-1") == 2
    assert ("table", ("notifications",), {}) in s.client.log
    assert ("select", ("id",), {"count": "exact", "head": True}) in s.client.log
    assert ("eq", ("user_id", "stu-1"), {}) in s.client.log
    assert ("eq", ("read", False), {}) in s.client.log


class TableQuery:
    """Just enough of PostgREST over in-memory rows: select/update with eq filters, count, head."""

    def __init__(self, rows: list[dict]):
        self.rows, self.filters, self.patch, self.head = rows, [], None, False

    def select(self, *columns, count=None, head=None):
        self.head = bool(head)
        return self

    def update(self, patch: dict):
        self.patch = patch
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def ilike(self, column, value):
        self.filters.append((column, value))
        return self

    def limit(self, n):
        return self

    def range(self, start, end):
        return self

    def order(self, column, desc=False):
        return self

    def execute(self):
        hits = [r for r in self.rows if all(r.get(c) == v for c, v in self.filters)]
        for r in hits if self.patch else []:
            r.update(self.patch)
        return type("Res", (), {"data": [] if self.head else hits, "count": len(hits)})()


class TableClient:
    def __init__(self, tables: dict[str, list[dict]]):
        self.tables = tables

    def table(self, name):
        return TableQuery(self.tables.setdefault(name, []))


def test_REQ_NOTIF_2_me_unread_from_supabase_drops_after_mark_read(as_student):
    seed = MockStore()
    rows = [
        {**ROW, "id": f"ntf-s{i}", "user_id": user, "read": read}
        for i, (user, read) in enumerate([("stu-1", False), ("stu-1", False), ("stu-1", True), ("sup-1", False)])
    ]
    s = SupabaseStore.__new__(SupabaseStore)
    MockStore.__init__(s, seed=False)  # live mode never loads the in-memory seed
    s.client = TableClient({"users": [u.model_dump(mode="json") for u in seed.users], "notifications": rows})
    store_module._store = s

    assert as_student.get("/me").json()["unread_notifications"] == 2
    assert as_student.post("/me/notifications/ntf-s0/read").status_code == 200
    assert as_student.get("/me").json()["unread_notifications"] == 1
    # PostgREST answers 200 with no rows for someone else's id; the router must still say 404.
    assert as_student.post("/me/notifications/ntf-s3/read").status_code == 404
    assert rows[3]["read"] is False
    assert as_student.get("/me").json()["unread_notifications"] == 1
