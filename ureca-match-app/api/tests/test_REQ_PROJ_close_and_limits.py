"""Slice B. Closing a project, closed projects are read-only, and sensible limits.  REQ-PROJ-1, REQ-PROJ-2.

Seed: stu-1 applied to lst-2 (preference 2) and lst-10 (preference 1) in Round 2. sup-1 owns lst-1..3, sup-5 owns lst-10.
"""

from tests.test_REQ_PROJ import new_listing

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64


def _active(store, student_id):
    apps = [a for a in store.applications_for(student_id=student_id) if a.status.value == "submitted"]
    return {a.listing_id: a.preference_rank for a in apps}


# ---------------------------------------------------------------- closing a project


def test_REQ_PROJ_close_withdraws_applications_under_review(client_for, fresh_store):
    assert _active(fresh_store, "stu-1") == {"lst-10": 1, "lst-2": 2}
    assert client_for("sup-5").post("/supervisor/listings/lst-10/close").status_code == 200
    assert "lst-10" not in _active(fresh_store, "stu-1")
    withdrawn = [a for a in fresh_store.applications_for(student_id="stu-1") if a.listing_id == "lst-10"]
    assert withdrawn and all(a.status.value == "withdrawn" and a.preference_rank is None for a in withdrawn)


def test_REQ_PROJ_close_moves_the_students_other_preferences_up(client_for, fresh_store):
    client_for("sup-5").post("/supervisor/listings/lst-10/close")
    assert _active(fresh_store, "stu-1") == {"lst-2": 1}
    ranks = [a["preference_rank"] for a in client_for("stu-1").get("/me/applications").json() if a["status"] == "submitted"]
    assert ranks == [1]


def test_REQ_PROJ_close_tells_every_affected_student(client_for, fresh_store):
    students = {a.student_id for a in fresh_store.applications if a.listing_id == "lst-10" and a.status.value == "submitted"}
    assert students
    client_for("sup-5").post("/supervisor/listings/lst-10/close")
    for sid in students:
        told = [n for n in fresh_store.notifications_for(sid) if n.title == "A project you applied to was closed"]
        assert len(told) == 1 and "Bayesian" in told[0].message


def test_REQ_PROJ_close_leaves_other_projects_alone(client_for, fresh_store):
    before = {a.id: a.status for a in fresh_store.applications if a.listing_id != "lst-10"}
    client_for("sup-5").post("/supervisor/listings/lst-10/close")
    assert {a.id: a.status for a in fresh_store.applications if a.listing_id != "lst-10"} == before


def test_REQ_PROJ_closing_twice_does_not_notify_twice(client_for, fresh_store):
    sup = client_for("sup-5")
    sup.post("/supervisor/listings/lst-10/close")
    sent = len(fresh_store.notifications)
    assert sup.post("/supervisor/listings/lst-10/close").status_code == 200
    assert len(fresh_store.notifications) == sent


def test_REQ_PROJ_close_with_no_applicants_just_closes(client_for):
    made = client_for("sup-1").post("/supervisor/listings", json=new_listing()).json()
    r = client_for("sup-1").post(f"/supervisor/listings/{made['id']}/close")
    assert r.status_code == 200 and r.json()["status"] == "closed"


# ---------------------------------------------------------------- closed projects are read-only


def test_REQ_PROJ_2_closed_project_cannot_be_edited(as_supervisor):
    as_supervisor.post("/supervisor/listings/lst-2/close")
    r = as_supervisor.put("/supervisor/listings/lst-2", json={"title": "Edited after it was closed"})
    assert r.status_code == 409 and r.json()["code"] == "listing_closed"


def test_REQ_PROJ_2_closed_project_takes_no_new_photos_or_cover(as_supervisor):
    as_supervisor.post("/supervisor/listings/lst-2/close")
    assert (
        as_supervisor.post("/supervisor/listings/lst-2/gallery", files={"file": ("p.png", PNG, "image/png")}).status_code == 409
    )
    assert as_supervisor.post("/supervisor/listings/lst-2/cover", files={"file": ("c.png", PNG, "image/png")}).status_code == 409


def test_REQ_PROJ_2_the_project_made_by_an_accepted_proposal_is_read_only(client_for, fresh_store):
    client_for("sup-1").post("/supervisor/proposals/prp-2/accept", json={})
    made = next(lst for lst in fresh_store.all_listings() if lst.title.startswith("Self-Supervised Pretraining"))
    assert client_for("sup-1").put(f"/supervisor/listings/{made.id}", json={"available_slots": 5}).status_code == 409


# ---------------------------------------------------------------- limits


def test_REQ_PROJ_1_faculty_is_required(as_supervisor):
    for blank in ("", "   "):
        r = as_supervisor.post("/supervisor/listings", json=new_listing(offering_faculty=blank))
        assert r.status_code == 422 and r.json()["field"] == "offering_faculty"
    assert as_supervisor.put("/supervisor/listings/lst-2", json={"offering_faculty": " "}).status_code == 422


def test_REQ_PROJ_1_text_has_a_length_limit(as_supervisor):
    assert as_supervisor.post("/supervisor/listings", json=new_listing(title="T" * 151)).status_code == 422
    assert as_supervisor.post("/supervisor/listings", json=new_listing(description="D" * 5001)).status_code == 422
    assert as_supervisor.post("/supervisor/listings", json=new_listing(research_location="L" * 101)).status_code == 422
    assert as_supervisor.post("/supervisor/listings", json=new_listing(title="T" * 150)).status_code == 201


# ---------------------------------------------------------------- uploads are checked by their bytes


def test_REQ_PROJ_2_a_file_labelled_png_that_is_not_an_image_is_refused(as_supervisor):
    for send in (("x.png", b"%PDF-1.4 not an image", "image/png"), ("x.png", b"<script>alert(1)</script>", "image/png")):
        r = as_supervisor.post("/supervisor/listings/lst-2/cover", files={"file": send})
        assert r.status_code == 422 and r.json()["code"] == "not_image"
        r = as_supervisor.post("/supervisor/listings/lst-2/gallery", files={"file": send})
        assert r.status_code == 422 and r.json()["code"] == "not_image"


def test_REQ_PROJ_2_real_images_are_accepted_whatever_the_label_says(as_supervisor):
    assert as_supervisor.post("/supervisor/listings/lst-2/cover", files={"file": ("c.jpg", PNG, "image/jpeg")}).status_code == 200
    assert as_supervisor.post("/supervisor/listings/lst-3/cover", files={"file": ("c.png", JPEG, "image/png")}).status_code == 200


def test_REQ_PROJ_2_the_stored_name_follows_the_real_type(as_supervisor):
    r = as_supervisor.post("/supervisor/listings/lst-2/cover", files={"file": ("c.jpg", PNG, "image/jpeg")})
    assert r.json()["cover_url"].startswith("data:image/png;")  # sent as a jpeg, stored as the png it is
