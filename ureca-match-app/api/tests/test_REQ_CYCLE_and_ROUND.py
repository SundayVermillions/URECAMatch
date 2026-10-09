"""Slice D. Application cycle and round configuration on the seeded store.
REQ-CYCLE-1..3, REQ-ROUND-1..3."""

CYCLE_ID = "cyc-2627s1"
PAST_CYCLE_ID = "cyc-2526s2"


# ---------------------------------------------------------------- CYCLE-1: history, reopen, overlap


def test_REQ_CYCLE_1_history_lists_past_and_active(as_admin):
    cycles = as_admin.get("/admin/cycles").json()
    ids = [c["id"] for c in cycles]
    assert CYCLE_ID in ids and PAST_CYCLE_ID in ids  # closed cycles remain browsable
    assert ids == sorted(ids, key=lambda i: [c["opening_date"] for c in cycles if c["id"] == i][0], reverse=True)


def test_REQ_CYCLE_1_can_read_a_closed_cycle(as_admin):
    r = as_admin.get(f"/admin/cycles/{PAST_CYCLE_ID}")
    assert r.status_code == 200 and r.json()["status"] == "closed" and len(r.json()["rounds"]) == 3


def test_REQ_CYCLE_1_reopen_refused_while_another_active(as_admin):
    # The current cycle is active, so the past one cannot be reopened yet.
    r = as_admin.post(f"/admin/cycles/{PAST_CYCLE_ID}/reopen")
    assert r.status_code == 409 and r.json()["code"] == "cycle_active"


def test_REQ_CYCLE_1_close_then_reopen_restores_active_cycle(as_admin):
    assert as_admin.post(f"/admin/cycles/{CYCLE_ID}/close").status_code == 200
    assert as_admin.get("/cycle").json() is None  # no active cycle while all are closed
    reopened = as_admin.post(f"/admin/cycles/{PAST_CYCLE_ID}/reopen")
    assert reopened.status_code == 200 and reopened.json()["status"] == "in_progress"
    assert as_admin.get("/cycle").json()["id"] == PAST_CYCLE_ID
    # Reopening an already-open cycle is refused.
    assert as_admin.post(f"/admin/cycles/{PAST_CYCLE_ID}/reopen").status_code == 409


def test_REQ_CYCLE_1_create_rejected_when_dates_overlap(as_admin):
    assert as_admin.post(f"/admin/cycles/{CYCLE_ID}/close").status_code == 200
    # Overlaps the (now closed) AY26/27 cycle, which runs 18 Aug to 30 Sep 2026.
    r = as_admin.post(
        "/admin/cycles",
        json={
            "academic_year": "AY26/27 Semester 1 (dup)",
            "opening_date": "2026-09-01T09:00:00Z",
            "closing_date": "2026-12-01T09:00:00Z",
            "pre_application_days": 7,
        },
    )
    assert r.status_code == 409 and r.json()["code"] == "cycle_overlap"


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
    fresh_store.cycles = []
    body = {
        "academic_year": "AY27/28 Semester 1",
        "opening_date": "2027-08-01T09:00:00Z",
        "closing_date": "2027-11-01T09:00:00Z",
        "pre_application_days": 7,
    }
    r = as_admin.post("/admin/cycles", json=body)
    assert r.status_code == 201
    assert r.json()["status"] == "draft" and r.json()["rounds"] == []


def test_REQ_CYCLE_1_close_then_create_next_cycle(as_admin):
    # The seeded cycle is active, so creating is refused until it is closed.
    assert (
        as_admin.post(
            "/admin/cycles",
            json={
                "academic_year": "AY27/28 Semester 1",
                "opening_date": "2027-08-01T09:00:00Z",
                "closing_date": "2027-11-01T09:00:00Z",
                "pre_application_days": 7,
            },
        ).status_code
        == 409
    )
    closed = as_admin.post(f"/admin/cycles/{CYCLE_ID}/close")
    assert closed.status_code == 200 and closed.json()["status"] == "closed"
    # Closing twice is refused.
    assert as_admin.post(f"/admin/cycles/{CYCLE_ID}/close").status_code == 409
    # With the old cycle closed, a new one can now be created.
    created = as_admin.post(
        "/admin/cycles",
        json={
            "academic_year": "AY27/28 Semester 1",
            "opening_date": "2027-08-01T09:00:00Z",
            "closing_date": "2027-11-01T09:00:00Z",
            "pre_application_days": 7,
        },
    )
    assert created.status_code == 201 and created.json()["status"] == "draft"


def test_REQ_CYCLE_1_close_notifies_students(as_admin, as_student):
    assert as_admin.post(f"/admin/cycles/{CYCLE_ID}/close").status_code == 200
    events = [n["event"] for n in as_student.get("/me/notifications").json()]
    assert "cycle_changed" in events


def test_REQ_CYCLE_1_rejects_closing_before_opening(as_admin, fresh_store):
    fresh_store.cycles = []
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
    body = {
        "rounds": [
            {"number": 1, "application_days": 5, "review_days": 2},
            {"number": 2, "application_days": 5, "review_days": 2},
            {"number": 3, "application_days": 3, "review_days": 2},
        ]
    }
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
    body = {
        "rounds": [
            {"number": 1, "application_days": 1, "review_days": 1},
            {"number": 2, "application_days": 5, "review_days": 2},
            {"number": 3, "application_days": 3, "review_days": 2},
        ]
    }
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)
    assert r.status_code == 200
    after = {rd["number"]: rd for rd in r.json()["rounds"]}
    assert after[1]["application_end"] == before[1]["application_end"]
    assert after[1]["review_end"] == before[1]["review_end"]


def test_REQ_ROUND_3_round_past_cycle_close_rejected(as_admin):
    # Round 3 recomputed at the maximum window lengths would end after the cycle closes.
    body = {
        "rounds": [
            {"number": 1, "application_days": 5, "review_days": 2},
            {"number": 2, "application_days": 5, "review_days": 2},
            {"number": 3, "application_days": 14, "review_days": 7},
        ]
    }
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)
    assert r.status_code == 422 and r.json()["code"] == "outside_cycle"
