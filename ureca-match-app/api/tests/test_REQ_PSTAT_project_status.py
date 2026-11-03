"""Slice B. The admin sees every project and its status, read only.  REQ-PSTAT-1.

Seed: sup-1 owns lst-1..3; lst-9 is closed.
"""

from tests.test_REQ_PROJ import new_listing


def test_REQ_PSTAT_1_admin_sees_published_draft_and_closed(as_admin, as_supervisor):
    as_supervisor.post("/supervisor/listings", json=new_listing(title="A draft for later on", publish=False))
    rows = as_admin.get("/admin/listings").json()
    assert {r["status"] for r in rows} == {"published", "draft", "closed"}
    assert [r["status"] for r in rows] == sorted((r["status"] for r in rows), key={"published": 0, "draft": 1, "closed": 2}.get)


def test_REQ_PSTAT_1_students_still_see_published_only(as_student, as_supervisor):
    as_supervisor.post("/supervisor/listings", json=new_listing(title="A draft for later on", publish=False))
    assert {r["status"] for r in as_student.get("/listings").json()} == {"published"}


def test_REQ_PSTAT_1_only_the_admin_may_use_the_admin_list(as_student, as_supervisor, anon):
    assert as_student.get("/admin/listings").status_code == 403
    assert as_supervisor.get("/admin/listings").status_code == 403
    assert anon.get("/admin/listings").status_code == 401


def test_REQ_PSTAT_1_the_admin_list_still_shows_projects_after_the_cycle_ends(as_admin, at):
    from datetime import UTC, datetime

    at(datetime(2027, 3, 1, 9, tzinfo=UTC))  # the cycle closed on 30 Nov 2026: Browse is empty, the admin still sees them closed
    rows = as_admin.get("/admin/listings").json()
    assert rows and all(r["status"] in ("closed", "draft") for r in rows)  # nothing is still published
