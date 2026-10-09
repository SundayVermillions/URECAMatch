"""Slice D. Application cycle and round configuration on the seeded store.
REQ-CYCLE-1..3, REQ-ROUND-1..3."""

CYCLE_ID = "cyc-2627s1"


# ---------------------------------------------------------------- CYCLE-1


def test_REQ_CYCLE_1_create_refused_while_cycle_active(as_admin):
    body = {
        "academic_year": "AY27/28 Semester 1",
        "opening_date": "2027-08-01T09:00:00Z",
        "closing_date": "2027-11-01T09:00:00Z",
        "pre_application_days": 7,
    }
    r = as_admin.post("/admin/cycles", json=body)
    assert r.status_code == 409 and r.json()["code"] == "cycle_active"


def test_REQ_CYCLE_1_create_new_cycle_when_none_active(as_admin, fresh_store):
    fresh_store.cycle = None
    body = {
        "academic_year": "AY27/28 Semester 1",
        "opening_date": "2027-08-01T09:00:00Z",
        "closing_date": "2027-11-01T09:00:00Z",
        "pre_application_days": 7,
    }
    r = as_admin.post("/admin/cycles", json=body)
    assert r.status_code == 201
    assert r.json()["status"] == "draft" and r.json()["rounds"] == []


def test_REQ_CYCLE_1_rejects_closing_before_opening(as_admin, fresh_store):
    fresh_store.cycle = None
    body = {
        "academic_year": "AY27/28 Semester 1",
        "opening_date": "2027-11-01T09:00:00Z",
        "closing_date": "2027-08-01T09:00:00Z",  # before opening
        "pre_application_days": 7,
    }
    r = as_admin.post("/admin/cycles", json=body)
    assert r.status_code == 422 and r.json()["code"] == "bad_dates"


# ---------------------------------------------------------------- CYCLE-2


def test_REQ_CYCLE_2_cannot_change_opening_after_it_passed(as_admin):
    # Seed opening date (18 Aug) is before the demo clock (7 Sep), so it is locked.
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}", json={"opening_date": "2026-08-20T09:00:00Z"})
    assert r.status_code == 422 and r.json()["code"] == "date_passed"


# ---------------------------------------------------------------- CYCLE-3


def test_REQ_CYCLE_3_closing_change_notifies_students(as_admin, as_student, as_supervisor):
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}", json={"closing_date": "2026-10-15T09:00:00Z"})
    assert r.status_code == 200 and r.json()["closing_date"].startswith("2026-10-15")
    events = [n["event"] for n in as_student.get("/me/notifications").json()]
    assert "cycle_changed" in events
    sup_events = [n["event"] for n in as_supervisor.get("/me/notifications").json()]
    assert "cycle_changed" in sup_events


# ---------------------------------------------------------------- ROUND-1..3


def test_REQ_ROUND_1_rounds_derived_sequentially(as_admin):
    body = {"rounds": [
        {"number": 1, "application_days": 5, "review_days": 2},
        {"number": 2, "application_days": 5, "review_days": 2},
        {"number": 3, "application_days": 3, "review_days": 2},
    ]}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)
    assert r.status_code == 200
    rounds = sorted(r.json()["rounds"], key=lambda x: x["number"])
    assert len(rounds) == 3
    # each round's application window starts after the previous round's review window
    for prev, nxt in zip(rounds, rounds[1:], strict=False):
        assert nxt["application_start"] > prev["review_end"]
    assert rounds[-1]["review_end"] <= r.json()["closing_date"]


def test_REQ_ROUND_2_only_future_rounds_change(as_admin):
    before = {rd["number"]: rd for rd in as_admin.get("/cycle").json()["rounds"]}
    # Round 1 already started (before the demo clock), so a new spec must not move its dates.
    body = {"rounds": [
        {"number": 1, "application_days": 1, "review_days": 1},
        {"number": 2, "application_days": 5, "review_days": 2},
        {"number": 3, "application_days": 3, "review_days": 2},
    ]}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)
    assert r.status_code == 200
    after = {rd["number"]: rd for rd in r.json()["rounds"]}
    assert after[1]["application_end"] == before[1]["application_end"]
    assert after[1]["review_end"] == before[1]["review_end"]


def test_REQ_ROUND_3_round_past_cycle_close_rejected(as_admin):
    # Round 3 recomputed at the maximum window lengths would end after the cycle closes.
    body = {"rounds": [
        {"number": 1, "application_days": 5, "review_days": 2},
        {"number": 2, "application_days": 5, "review_days": 2},
        {"number": 3, "application_days": 14, "review_days": 7},
    ]}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)
    assert r.status_code == 422 and r.json()["code"] == "outside_cycle"
