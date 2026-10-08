"""Slice C. Supervisor applicant review, ranking and document access."""

from datetime import timedelta

from app.services import windows
from app.settings import get_settings


def _supervisors_applied_to(store, student_id):
    return {store.listing(a.listing_id).supervisor_id for a in store.applications if a.student_id == student_id}


def test_REQ_VRANK_3_other_student_cannot_view(client_for):
    r = client_for("stu-7").get("/documents/doc-stu-1-t/view")
    assert r.status_code == 403


def test_REQ_VRANK_3_supervisor_of_applied_listing_can_view(client_for, fresh_store):
    sup = sorted(_supervisors_applied_to(fresh_store, "stu-1"))[0]
    r = client_for(sup).get("/documents/doc-stu-1-t/view")
    assert r.status_code == 200 and r.json()["url"]


def test_REQ_VRANK_3_unrelated_supervisor_cannot_view(client_for, fresh_store):
    applied = _supervisors_applied_to(fresh_store, "stu-1")
    sup = next(u.id for u in fresh_store.users if u.role.value == "supervisor" and u.id not in applied)
    r = client_for(sup).get("/documents/doc-stu-1-t/view")
    assert r.status_code == 403


def test_REQ_VRANK_3_drawer_for_closed_application_is_404(as_supervisor, fresh_store):
    a = next(
        a
        for a in fresh_store.applications
        if fresh_store.listing(a.listing_id).supervisor_id == "sup-1" and a.status.value != "submitted"
    )
    r = as_supervisor.get(f"/supervisor/applicants/{a.id}")
    assert r.status_code == 404


def test_REQ_VRANK_2_cannot_read_other_supervisors_ranking(as_supervisor, fresh_store):
    other = next(lst for lst in fresh_store.listings if lst.supervisor_id != "sup-1")
    r = as_supervisor.get(f"/supervisor/listings/{other.id}/ranking")
    assert r.status_code == 403


def _with_applicants(store, listing_id, n):
    """Make sure the listing has at least n applicants this round (seed data is random, so build our own)."""
    template = next(a for a in store.applications if a.listing_id == listing_id and a.status.value == "submitted")
    have = {a.student_id for a in store.applications if a.listing_id == listing_id and a.round_id == template.round_id}
    for sp in store.students:
        if len(have) >= n:
            break
        if sp.user_id not in have and sp.cgpa is not None:
            store.applications.append(template.model_copy(update={"id": store.next_id("app"), "student_id": sp.user_id}))
            have.add(sp.user_id)


def test_REQ_VRANK_1_at_most_ten_recommended(as_supervisor, fresh_store):
    _with_applicants(fresh_store, "lst-1", 14)
    rows = as_supervisor.get("/supervisor/listings/lst-1/applicants").json()
    assert len(rows) > 10
    recommended = [r for r in rows if r["recommended"]]
    assert len(recommended) == 10
    # prerequisites met first, then highest CGPA
    best = sorted(rows, key=lambda r: (not r["meets_prerequisites"], -(r["student"]["cgpa"] or 0)))[:10]
    assert {r["application_id"] for r in recommended} == {r["application_id"] for r in best}


def test_REQ_VRANK_1_min_cgpa_filter(as_supervisor, fresh_store):
    _with_applicants(fresh_store, "lst-1", 14)
    every = as_supervisor.get("/supervisor/listings/lst-1/applicants").json()
    cutoff = sorted((r["student"]["cgpa"] for r in every), reverse=True)[4]  # keep roughly the best five
    rows = as_supervisor.get("/supervisor/listings/lst-1/applicants", params={"min_cgpa": cutoff}).json()
    assert 0 < len(rows) < len(every) and all(r["student"]["cgpa"] >= cutoff for r in rows)
    # top 10 is picked after filtering, so with 10 or fewer rows left every row is recommended
    assert len(rows) <= 10 and all(r["recommended"] for r in rows)


def test_REQ_VRANK_2_ranking_after_review_end_rejected(as_supervisor, fresh_store, monkeypatch):
    ids = [r["application_id"] for r in as_supervisor.get("/supervisor/listings/lst-1/applicants").json()]
    settings = get_settings()
    rnd = windows.current_round(fresh_store.cycle, settings.now())
    monkeypatch.setattr(settings, "demo_now", rnd.review_end + timedelta(minutes=1))
    r = as_supervisor.put("/supervisor/listings/lst-1/ranking", json={"application_ids": ids})
    assert r.status_code == 422 and r.json()["code"] == "ranking_closed"


def test_REQ_VRANK_3_view_returns_signed_storage_url(client_for, fresh_store, monkeypatch):
    calls = []

    class FakeStorage:
        def signed_url(self, bucket, path, minutes=10):
            calls.append((bucket, path, minutes))
            return "https://storage.example/signed"

    monkeypatch.setattr("app.routers.rankings.get_storage", lambda: FakeStorage())
    doc = next(d for d in fresh_store.student("stu-1").documents if d.id == "doc-stu-1-t")
    doc.storage_path = "documents/stu-1/doc-stu-1-t.pdf"
    r = client_for("stu-1").get("/documents/doc-stu-1-t/view")
    assert r.status_code == 200 and r.json()["url"] == "https://storage.example/signed"
    assert calls == [("documents", "documents/stu-1/doc-stu-1-t.pdf", 10)]
