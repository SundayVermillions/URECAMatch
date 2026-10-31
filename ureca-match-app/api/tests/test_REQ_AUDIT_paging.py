"""Slice D. The audit log a page at a time, newest first, with the names in it read once.  REQ-AUDIT-1..3.

Seed: mt-1 is stu-33's accepted match on lst-1. Each test adds its own entries on top of the seeded ones.
"""

from datetime import UTC, datetime, timedelta

from app.models import AuditEntry, AuditOperation


def _add(store, n: int) -> None:
    base = datetime(2026, 9, 1, tzinfo=UTC)
    for i in range(n):
        store.add_audit(
            AuditEntry(
                id=f"aud-t{i:02d}",
                operation=AuditOperation.manual_reassignment,
                actor_id="adm-1",
                actor_name="Jonathan Teo",
                timestamp=base + timedelta(minutes=i),
                affected_records=["mt-1"],
                note=f"Paging check {i}",
            )
        )


def _ids(rows) -> list[str]:
    return [e["id"] for e in rows]


def test_REQ_AUDIT_1_the_log_comes_a_page_at_a_time_newest_first(as_admin, fresh_store):
    _add(fresh_store, 7)
    full = as_admin.get("/admin/audit").json()
    assert [e["timestamp"] for e in full] == sorted((e["timestamp"] for e in full), reverse=True)
    pages, cursor = [], None
    while page := as_admin.get("/admin/audit", params={"limit": 3, **({"cursor": cursor} if cursor else {})}).json():
        assert len(page) <= 3
        pages += _ids(page)
        cursor = page[-1]["id"]
    assert pages == _ids(full)  # every entry once, in order, with no gaps between pages


def test_REQ_AUDIT_1_oldest_first_on_request(as_admin, fresh_store):
    _add(fresh_store, 3)
    assert _ids(as_admin.get("/admin/audit", params={"order": "asc"}).json()) == _ids(as_admin.get("/admin/audit").json())[::-1]


def test_REQ_AUDIT_1_search_covers_names_notes_and_who_did_it(as_admin, fresh_store):
    _add(fresh_store, 5)
    m = next(x for x in fresh_store.matches if x.id == "mt-1")
    page = as_admin.get("/admin/audit", params={"q": "paging check 3"}).json()
    assert _ids(page) == ["aud-t03"] and page[0]["affected_labels"] == [f"{m.student_name} → {m.listing_title}"]
    by_name = as_admin.get("/admin/audit", params={"q": m.student_name, "limit": 2}).json()
    assert len(by_name) == 2 and all(m.student_name in " ".join(e["affected_labels"]) for e in by_name)


def test_REQ_AUDIT_1_names_are_read_once_however_long_the_log(as_admin, fresh_store, monkeypatch):
    _add(fresh_store, 40)
    real, lookups = fresh_store.user, []
    monkeypatch.setattr(fresh_store, "user", lambda uid: lookups.append(uid) or real(uid))
    assert len(as_admin.get("/admin/audit").json()) >= 40
    assert len(lookups) <= 1  # the admin's own sign-in only, not one lookup per entry
