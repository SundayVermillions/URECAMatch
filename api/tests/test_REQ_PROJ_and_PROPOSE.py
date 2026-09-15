"""Slice B. Listing and proposal rules."""


def test_REQ_BROWSE_3_closed_listing_hidden_from_students(as_student, as_supervisor):
    ids = {lst["id"] for lst in as_student.get("/listings").json()}
    assert "lst-9" not in ids  # seeded closed
    assert as_student.get("/listings/lst-9").status_code == 404


def test_REQ_PROJ_3_cannot_reduce_slots_below_matched(as_supervisor):
    r = as_supervisor.put("/supervisor/listings/lst-1", json={"available_slots": 0})
    assert r.status_code == 422  # model minimum is 1; filled_slots is 1 for lst-1
    r = as_supervisor.put("/supervisor/listings/lst-1", json={"available_slots": 5})
    assert r.status_code == 200 and r.json()["available_slots"] == 5


def test_REQ_REVPROP_2_accepting_registers_student(as_supervisor, client_for):
    r = as_supervisor.post("/supervisor/proposals/prp-2/accept", json={})
    assert r.status_code == 200 and r.json()["status"] == "accepted"
    me = client_for("stu-9").get("/me").json()
    assert me["student"]["eligible_for_matching"] is False
