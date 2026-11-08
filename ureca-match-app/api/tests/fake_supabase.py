"""A small in-memory stand-in for the supabase-py client, so SupabaseStore runs without a network.

It keeps the rules the real tables enforce that the store depends on: primary keys, the unique constraints that
guard matching (one match per student per round, one round number per cycle), the audit trigger that rejects UPDATE
and DELETE, and an UPDATE ... WHERE that changes a row for exactly one caller. Several stores can share one FakeDB,
which stands in for several servers sharing one database.
"""

from __future__ import annotations

import copy
import threading
import uuid
from collections.abc import Callable

PRIMARY_KEYS = {
    "student_profiles": ("user_id",),
    "supervisor_profiles": ("user_id",),
    "applicant_rankings": ("listing_id", "round_id"),
}
UNIQUE = {
    "match_results": [("round_id", "student_id")],
    "matching_rounds": [("cycle_id", "number")],
    "users": [("email",)],
    "listing_applications": [("student_id", "listing_id", "round_id")],
}


# Column defaults the real tables fill in.
DEFAULTS = {"verification_codes": {"used": False}}


class FakeResponse:
    def __init__(self, data: list[dict], count: int | None = None):
        self.data, self.count = data, count if count is not None else len(data)


class FakeDB:
    def __init__(self) -> None:
        self.tables: dict[str, list[dict]] = {}
        self.lock = threading.RLock()  # a statement is atomic, as in Postgres
        self.log: list[tuple[str, str]] = []  # (operation, table or rpc name)
        self.failures: dict[tuple[str, str], Exception] = {}  # (operation, name) -> raised on the next call
        self.auth_calls: list[tuple[str, dict]] = []  # (user id, attributes) sent to client.auth.admin.update_user_by_id
        self.rpcs: dict[str, Callable[[FakeDB, dict], object]] = {"publish_outcomes": publish_outcomes}

    def client(self) -> FakeClient:
        return FakeClient(self)

    def rows(self, table: str) -> list[dict]:
        return self.tables.setdefault(table, [])

    def fail_next(self, operation: str, name: str, error: Exception | None = None) -> None:
        self.failures[(operation, name)] = error or RuntimeError(f"{operation} {name} failed")

    def check_failure(self, operation: str, name: str) -> None:
        if (operation, name) in self.failures:
            raise self.failures.pop((operation, name))


class FakeClient:
    def __init__(self, db: FakeDB):
        self.db = db
        self.auth = FakeAuth(db)

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self.db, name)

    def rpc(self, name: str, params: dict) -> FakeRpc:
        return FakeRpc(self.db, name, params)


class FakeAuth:
    """client.auth: only the admin calls the API makes. Calls are kept in db.auth_calls."""

    def __init__(self, db: FakeDB):
        self.admin = FakeAuthAdmin(db)


class FakeAuthAdmin:
    def __init__(self, db: FakeDB):
        self.db = db

    def update_user_by_id(self, user_id: str, attributes: dict) -> None:
        with self.db.lock:
            self.db.log.append(("auth", "update_user_by_id"))
            self.db.check_failure("auth", "update_user_by_id")
            self.db.auth_calls.append((user_id, dict(attributes)))


class FakeRpc:
    def __init__(self, db: FakeDB, name: str, params: dict):
        self.db, self.name, self.params = db, name, params

    def execute(self) -> FakeResponse:
        with self.db.lock:
            self.db.log.append(("rpc", self.name))
            self.db.check_failure("rpc", self.name)
            snapshot = copy.deepcopy(self.db.tables)
            try:
                self.db.rpcs[self.name](self.db, self.params)
            except Exception:
                self.db.tables = snapshot  # a function is one transaction: all or nothing
                raise
        return FakeResponse([])


def publish_outcomes(db: FakeDB, params: dict) -> None:
    """Python stand-in for the SQL function of the same name: match updates, then application updates."""
    for m in params["p_matches"]:
        row = next((r for r in db.rows("match_results") if r["id"] == m["id"]), None)
        if row is None:
            raise RuntimeError(f"no match {m['id']}")
        row.update(m)
    for a in params["p_applications"]:
        row = next((r for r in db.rows("listing_applications") if r["id"] == a["id"]), None)
        if row is None:
            raise RuntimeError(f"no application {a['id']}")
        row.update(a)


class FakeQuery:
    def __init__(self, db: FakeDB, table: str):
        self.db, self.name = db, table
        self.op, self.payload, self.options = "select", None, {}
        self.filters: list[tuple[str, str, object]] = []
        self.sort: tuple[str, bool] | None = None
        self.window: tuple[int, int] | None = None
        self.max: int | None = None
        self.head = False

    # --- builders
    def select(self, columns: str = "*", count=None, head=None):
        self.op, self.head = "select", bool(head)
        return self

    def insert(self, rows):
        self.op, self.payload = "insert", rows
        return self

    def upsert(self, rows, ignore_duplicates: bool = False, on_conflict: str | None = None, **_):
        self.op, self.payload, self.options = "upsert", rows, {"ignore": ignore_duplicates}
        return self

    def update(self, patch: dict):
        self.op, self.payload = "update", patch
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, column, value):
        self.filters.append((column, "eq", value))
        return self

    def neq(self, column, value):
        self.filters.append((column, "neq", value))
        return self

    def is_(self, column, value):
        self.filters.append((column, "is", None if value == "null" else value))
        return self

    def ilike(self, column, pattern):
        self.filters.append((column, "ilike", pattern))
        return self

    def order(self, column, desc=False):
        self.sort = (column, desc)
        return self

    def range(self, start, end):
        self.window = (start, end)
        return self

    def limit(self, n):
        self.max = n
        return self

    # --- execution
    def _match(self, row: dict) -> bool:
        for column, kind, value in self.filters:
            have = row.get(column)
            if kind == "ilike":
                if str(have).lower() != str(value).lower():  # patterns without % match the whole value
                    return False
            elif (kind in ("eq", "is") and have != value) or (kind == "neq" and have == value):
                return False
        return True

    def _key(self, row: dict) -> tuple:
        return tuple(row.get(k) for k in PRIMARY_KEYS.get(self.name, ("id",)))

    def _check_unique(self, rows: list[dict], row: dict, ignore: dict | None = None) -> None:
        for cols in UNIQUE.get(self.name, []):
            for other in rows:
                if other is not ignore and all(other.get(c) == row.get(c) for c in cols):
                    raise RuntimeError(f"duplicate key value violates unique constraint on {self.name}{cols}")

    def execute(self) -> FakeResponse:
        db = self.db
        with db.lock:
            db.log.append((self.op, self.name))
            db.check_failure(self.op, self.name)
            rows = db.rows(self.name)
            if self.name == "audit_log" and self.op in ("update", "delete"):
                raise RuntimeError("audit_log is append-only")
            if self.op == "select":
                hits = [r for r in rows if self._match(r)]
                if self.sort:
                    column, desc = self.sort
                    hits.sort(key=lambda r: (r.get(column) is None, r.get(column)), reverse=desc)
                if self.window:
                    hits = hits[self.window[0] : self.window[1] + 1]
                if self.max is not None:
                    hits = hits[: self.max]
                return FakeResponse([] if self.head else copy.deepcopy(hits), len(hits))
            if self.op in ("insert", "upsert"):
                batch = self.payload if isinstance(self.payload, list) else [self.payload]
                staged = copy.deepcopy(rows)
                out = []
                for new in copy.deepcopy(batch):
                    existing = next((r for r in staged if self._key(r) == self._key(new)), None)
                    if existing is not None:
                        if self.op == "insert":
                            raise RuntimeError(f"duplicate key on {self.name}")
                        if self.options["ignore"]:
                            continue
                        self._check_unique(staged, {**existing, **new}, ignore=existing)
                        existing.update(new)
                        out.append(existing)
                    else:
                        new = {**DEFAULTS.get(self.name, {}), **new}
                        if self.name == "verification_codes":
                            new.setdefault("id", str(uuid.uuid4()))
                        self._check_unique(staged, new)
                        staged.append(new)
                        out.append(new)
                db.tables[self.name] = staged  # the whole statement applies, or none of it
                return FakeResponse(copy.deepcopy(out))
            if self.op == "update":
                hits = [r for r in rows if self._match(r)]
                for r in hits:
                    r.update(copy.deepcopy(self.payload))
                return FakeResponse(copy.deepcopy(hits))
            if self.op == "delete":
                gone = [r for r in rows if self._match(r)]
                db.tables[self.name] = [r for r in rows if r not in gone]
                return FakeResponse(copy.deepcopy(gone))
        raise AssertionError(self.op)
