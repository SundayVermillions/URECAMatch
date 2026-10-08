"""Slice C. Supervisor applicant review, ranking and document access."""


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
