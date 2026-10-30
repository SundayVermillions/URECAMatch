"""Slice D. Application cycle and round configuration on the seeded store.
REQ-CYCLE-1..4, REQ-ROUND-1..3, REQ-OUTCOME-3."""

from datetime import UTC, datetime

CYCLE_ID = "cyc-2627s1"
PAST_CYCLE_ID = "cyc-2526s2"
AFTER_CLOSE = datetime(2026, 10, 3, 9, tzinfo=UTC)  # the day after the seeded cycle closes


# ---------------------------------------------------------------- CYCLE-1: history, overlap


def test_REQ_CYCLE_1_history_lists_past_and_active(as_admin):
    cycles = as_admin.get("/admin/cycles").json()
    ids = [c["id"] for c in cycles]
    assert CYCLE_ID in ids and PAST_CYCLE_ID in ids  # closed cycles remain browsable
    assert ids == sorted(ids, key=lambda i: [c["opening_date"] for c in cycles if c["id"] == i][0], reverse=True)


def test_REQ_CYCLE_1_can_read_a_closed_cycle(as_admin):
    r = as_admin.get(f"/admin/cycles/{PAST_CYCLE_ID}")
    assert r.status_code == 200 and r.json()["status"] == "closed" and len(r.json()["rounds"]) == 3


def test_REQ_CYCLE_1_create_rejected_when_dates_overlap(as_admin, at):
    at(AFTER_CLOSE)
    # Overlaps the (now closed) AY26/27 cycle, which runs 18 Aug to 2 Oct 2026.
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
    assert as_admin.get(f"/admin/cycles/{CYCLE_ID}").json()["status"] != "closed"  # a refused create changes nothing


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


def test_REQ_CYCLE_1_next_cycle_created_once_the_current_one_has_closed(as_admin, at):
    body = {
        "academic_year": "AY27/28 Semester 1",
        "opening_date": "2027-08-01T09:00:00Z",
        "closing_date": "2027-11-01T09:00:00Z",
        "pre_application_days": 7,
    }
    assert as_admin.post("/admin/cycles", json=body).status_code == 409  # the seeded cycle is still open
    at(AFTER_CLOSE)
    created = as_admin.post("/admin/cycles", json=body)
    assert created.status_code == 201 and created.json()["status"] == "draft"
    # The old cycle moves to the history, and the new one is the active cycle.
    assert as_admin.get(f"/admin/cycles/{CYCLE_ID}").json()["status"] == "closed"
    assert as_admin.get("/cycle").json()["id"] == created.json()["id"]


def test_REQ_CYCLE_1_cycles_cannot_be_closed_or_reopened_by_hand(as_admin):
    # A cycle ends on its closing date. To end it sooner, an admin moves that date (REQ-CYCLE-2).
    assert as_admin.post(f"/admin/cycles/{CYCLE_ID}/close").status_code == 404
    assert as_admin.post(f"/admin/cycles/{PAST_CYCLE_ID}/reopen").status_code == 404


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


def test_REQ_ROUND_2_started_round_cannot_change(as_admin, fresh_store):
    before = [r.model_copy() for r in fresh_store.cycle.rounds]
    # Round 1 already started (before the demo clock), so new window lengths for it are refused, not ignored.
    body = {
        "rounds": [
            {"number": 1, "application_days": 1, "review_days": 1},
            {"number": 2, "application_days": 5, "review_days": 2},
            {"number": 3, "application_days": 3, "review_days": 2},
        ]
    }
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)
    assert r.status_code == 422 and r.json()["code"] == "round_started"
    assert fresh_store.cycle.rounds == before  # Round 3's new length was not saved either


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


# ---------------------------------------------------------------- regressions: date and round guards


def test_REQ_ROUND_2_started_round_cannot_be_removed(as_admin, fresh_store):
    # On 7 Sep Round 2 is open with applications; asking for one round used to delete it.
    body = {"rounds": [{"number": 1, "application_days": 5, "review_days": 2}]}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)
    assert r.status_code == 422 and r.json()["code"] == "round_started"
    assert [x.id for x in fresh_store.cycle.rounds] == ["rnd-1", "rnd-2", "rnd-3"]


def test_REQ_ROUND_2_unstarted_round_can_be_removed(as_admin):
    spec = {"application_days": 5, "review_days": 2}
    body = {"rounds": [{"number": 1, **spec}, {"number": 2, **spec}]}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)
    assert r.status_code == 200 and [x["number"] for x in r.json()["rounds"]] == [1, 2]


def test_REQ_ROUND_1_round_numbers_must_run_from_one(as_admin):
    spec = {"application_days": 5, "review_days": 2}
    body = {"rounds": [{"number": 1, **spec}, {"number": 3, **spec}]}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)
    assert r.status_code == 422 and r.json()["code"] == "bad_rounds"


def test_REQ_ROUND_3_closing_date_cannot_cut_into_a_round(as_admin, fresh_store):
    before = fresh_store.cycle.closing_date
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}", json={"closing_date": "2026-09-08T09:00:00Z"})  # inside Round 2
    assert r.status_code == 422 and r.json()["code"] == "outside_cycle"
    assert fresh_store.cycle.closing_date == before  # nothing changed, nobody notified


def test_REQ_CYCLE_2_update_rejects_closing_before_opening(as_admin, fresh_store):
    from datetime import UTC, datetime

    c = fresh_store.cycle
    c.rounds, c.opening_date = [], datetime(2026, 10, 1, 9, tzinfo=UTC)  # an upcoming cycle, no rounds yet
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}", json={"closing_date": "2026-09-20T09:00:00Z"})
    assert r.status_code == 422 and r.json()["code"] == "bad_dates"


def test_REQ_CYCLE_2_update_rejects_a_date_in_the_past(as_admin, fresh_store):
    fresh_store.cycle.rounds = []  # isolate the date check from the round check
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}", json={"closing_date": "2026-08-01T09:00:00Z"})
    assert r.status_code == 422 and r.json()["code"] == "date_in_past"


def test_REQ_CYCLE_2_update_rejects_overlap_with_another_cycle(as_admin, fresh_store):
    fresh_store.cycle.closing_date = fresh_store.cycle.closing_date.replace(year=2027)  # pretend a long cycle
    nxt = fresh_store.cycles[0].model_copy(update={"id": "cyc-next", "academic_year": "AY27/28", "status": "closed"})
    nxt.opening_date, nxt.closing_date = nxt.opening_date.replace(year=2028), nxt.closing_date.replace(year=2028)
    fresh_store.cycles.append(nxt)
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}", json={"closing_date": nxt.closing_date.isoformat()})
    assert r.status_code == 409 and r.json()["code"] == "cycle_overlap"


def test_REQ_CYCLE_1_phase_between_rounds_follows_the_round_just_run(as_student, as_admin, monkeypatch):
    from datetime import UTC, datetime

    from app.settings import get_settings

    monkeypatch.setattr(get_settings(), "demo_now", datetime(2026, 9, 3, 10, tzinfo=UTC))  # gap after Round 1
    phase = as_student.get("/me").json()["phase"]
    assert phase["round_id"] == "rnd-1" and phase["window"] == "results"
    assert phase["label"] == "Round 1 results published"
    assert as_admin.get("/admin/dashboard").json()["applications_this_round"] == 0  # Round 1 has none open


# ---------------------------------------------------------------- REQ-APPRV-4, 5 the approval window


def _when(iso: str):
    from datetime import datetime

    return datetime.fromisoformat(iso)


def test_REQ_APPRV_5_admin_sets_the_approval_window_per_round(as_admin):
    from datetime import timedelta

    spec = {"application_days": 5, "review_days": 2}
    body = {"rounds": [{"number": 1, **spec}, {"number": 2, **spec}, {"number": 3, **spec, "approval_days": 1}]}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)
    assert r.status_code == 200
    r3 = next(x for x in r.json()["rounds"] if x["number"] == 3)
    assert _when(r3["approval_end"]) - _when(r3["review_end"]) == timedelta(days=1)


def test_REQ_APPRV_5_default_window_keeps_rounds_four_days_apart(as_admin):
    from datetime import timedelta

    spec = {"application_days": 5, "review_days": 2}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json={"rounds": [{"number": n, **spec} for n in (1, 2, 3)]})
    r2, r3 = sorted(r.json()["rounds"], key=lambda x: x["number"])[1:]
    assert _when(r2["approval_end"]) - _when(r2["review_end"]) == timedelta(days=2)  # two days to decline
    assert _when(r3["application_start"]) - _when(r2["review_end"]) == timedelta(days=4, seconds=1)


def test_REQ_APPRV_5_next_round_cannot_start_inside_an_approval_window(as_admin):
    spec = {"application_days": 5, "review_days": 2}
    body = {"rounds": [{"number": 1, **spec}, {"number": 2, **spec}, {"number": 3, **spec, "start_date": "2026-09-13T09:00:00Z"}]}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)  # Round 2's approval window runs to 14 Sep
    assert r.status_code == 422 and r.json()["code"] == "rounds_overlap"


def test_REQ_APPRV_5_approval_window_must_end_before_the_cycle_closes(as_admin):
    spec = {"application_days": 5, "review_days": 2}
    late = {"number": 3, "application_days": 8, "review_days": 2, "approval_days": 7}  # 16 Sep + 8 + 2 + 7 days
    body = {"rounds": [{"number": 1, **spec}, {"number": 2, **spec}, late]}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)  # would run to 3 Oct; the cycle closes 2 Oct
    assert r.status_code == 422 and r.json()["code"] == "outside_cycle"


# ---------------------------------------------------------------- REQ-OUTCOME-3 time to answer last-round offers


def test_REQ_OUTCOME_3_cycle_closes_a_week_after_the_last_approval_window(as_admin):
    spec = {"application_days": 5, "review_days": 2}
    body = {"rounds": [{"number": 1, **spec}, {"number": 2, **spec}, {"number": 3, **spec, "approval_days": 3}]}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)  # ends 26 Sep, so offers would have 6 days
    assert r.status_code == 422 and r.json()["code"] == "outside_cycle"
    assert "on or after 3 Oct, 5:00 pm SGT" in r.json()["message"]


def test_REQ_OUTCOME_3_closing_date_cannot_cut_into_the_week_to_answer(as_admin):
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}", json={"closing_date": "2026-10-01T09:00:00Z"})  # Round 3 ends 25 Sep
    assert r.status_code == 422 and r.json()["code"] == "outside_cycle"


def test_REQ_OUTCOME_3_moving_the_opening_later_keeps_a_week_to_answer(as_admin, fresh_store):
    from datetime import timedelta

    c = _upcoming_cycle(fresh_store)  # 14 days between Round 3's approval window and the close
    later = c.opening_date + timedelta(days=8)  # every round moves 8 days closer to the close
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}", json={"opening_date": later.isoformat()})
    assert r.status_code == 422 and r.json()["code"] == "outside_cycle"


def test_REQ_APPRV_4_phase_during_the_approval_window(as_student, at):
    from tests.conftest import REVIEW_CLOSED

    at(REVIEW_CLOSED)
    phase = as_student.get("/me").json()["phase"]
    assert phase["window"] == "approval" and phase["round_id"] == "rnd-2"
    assert phase["window_ends_at"].startswith("2026-09-14T08:59:59")
    assert phase["label"] == "Round 2 results out 14 Sep, 5:00 pm SGT"


# ---------------------------------------------------------------- round start dates (use case 1-2) and moving the opening


def _upcoming_cycle(fresh_store):
    """Make the seeded cycle start in the future so its opening date and pre-application window can still change."""
    from datetime import timedelta

    c = fresh_store.cycle
    shift = timedelta(days=60)
    # a week more before the close, so tests can move the rounds later and still leave time to answer (REQ-OUTCOME-3)
    c.opening_date, c.closing_date = c.opening_date + shift, c.closing_date + shift + timedelta(days=7)
    for r in c.rounds:
        r.application_start, r.application_end = r.application_start + shift, r.application_end + shift
        r.review_start, r.review_end, r.approval_end = r.review_start + shift, r.review_end + shift, r.approval_end + shift
        r.status, r.executed_at, r.published_at = "scheduled", None, None
    return c


def test_REQ_ROUND_1_explicit_start_date_is_used(as_admin):
    assert as_admin.put(f"/admin/cycles/{CYCLE_ID}", json={"closing_date": "2026-10-15T09:00:00Z"}).status_code == 200
    spec = {"application_days": 5, "review_days": 2}
    body = {"rounds": [{"number": 1, **spec}, {"number": 2, **spec}, {"number": 3, **spec, "start_date": "2026-09-20T09:00:00Z"}]}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)
    assert r.status_code == 200
    assert next(x for x in r.json()["rounds"] if x["number"] == 3)["application_start"].startswith("2026-09-20T09:00")


def test_REQ_ROUND_3_explicit_start_inside_previous_round_rejected(as_admin):
    spec = {"application_days": 5, "review_days": 2}
    body = {"rounds": [{"number": 1, **spec}, {"number": 2, **spec}, {"number": 3, **spec, "start_date": "2026-09-11T09:00:00Z"}]}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body)  # Round 2 reviews until 12 Sep
    assert r.status_code == 422 and r.json()["code"] == "rounds_overlap"


def test_REQ_ROUND_2_start_date_in_the_past_rejected(as_admin, fresh_store):
    _upcoming_cycle(fresh_store)
    spec = {"application_days": 5, "review_days": 2}
    r = as_admin.put(
        f"/admin/cycles/{CYCLE_ID}/rounds", json={"rounds": [{"number": 1, **spec, "start_date": "2026-09-01T09:00:00Z"}]}
    )
    assert r.status_code == 422 and r.json()["code"] == "date_in_past"


def test_REQ_ROUND_3_start_before_pre_application_ends_rejected(as_admin, fresh_store):
    c = _upcoming_cycle(fresh_store)
    spec = {"application_days": 5, "review_days": 2}
    early = (c.opening_date.replace(hour=9)).isoformat()  # pre-application lasts 7 days from here
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json={"rounds": [{"number": 1, **spec, "start_date": early}]})
    assert r.status_code == 422 and r.json()["code"] == "outside_cycle"


def test_REQ_EXEC_3_rollover_setting_is_saved(as_admin, fresh_store):
    spec = {"application_days": 5, "review_days": 2}
    body = {"rounds": [{"number": n, **spec} for n in (1, 2, 3)], "rollover_unmatched": False}
    assert as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body).json()["rollover_unmatched"] is False
    assert fresh_store.cycle.rollover_unmatched is False


def test_REQ_CYCLE_2_moving_the_opening_moves_rounds_that_have_not_started(as_admin, fresh_store):
    from datetime import timedelta

    c = _upcoming_cycle(fresh_store)
    before = [r.application_start for r in c.rounds]
    later = c.opening_date + timedelta(days=3)
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}", json={"opening_date": later.isoformat()})
    assert r.status_code == 200
    assert [x.application_start for x in fresh_store.cycle.rounds] == [b + timedelta(days=3) for b in before]


def test_REQ_CYCLE_2_longer_pre_application_moves_round_1(as_admin, fresh_store):
    from datetime import timedelta

    c = _upcoming_cycle(fresh_store)
    first = c.rounds[0].application_start
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}", json={"pre_application_days": 9})
    assert r.status_code == 200
    assert fresh_store.cycle.rounds[0].application_start == first + timedelta(days=2)


def test_REQ_CYCLE_2_pre_application_locked_once_round_1_started(as_admin):
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}", json={"pre_application_days": 9})  # 7 Sep: Round 2 is running
    assert r.status_code == 422 and r.json()["code"] == "date_passed"


def test_REQ_ROUND_1_derived_round_starts_on_the_hour(as_admin):
    spec = {"application_days": 5, "review_days": 2}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json={"rounds": [{"number": n, **spec} for n in (1, 2, 3)]})
    third = next(x for x in r.json()["rounds"] if x["number"] == 3)
    assert third["application_start"].startswith("2026-09-16T09:00:00")  # 4 days after Round 2's review window


def test_REQ_ROUND_1_deadlines_read_in_singapore_time(as_student):
    # Round 2's application window ends 10 Sep 08:59:59 UTC, which students know as 5:00 pm in Singapore.
    assert as_student.get("/me").json()["phase"]["label"] == "Round 2 closes 10 Sep, 5:00 pm SGT"


# ---------------------------------------------------------------- schedule safety (use case 1-1, 1-2)

SPEC = {"application_days": 5, "review_days": 2}  # the seeded rounds' windows, so Rounds 1 and 2 stay as they are


def _cycle_notes(client):
    return [n for n in client.get("/me/notifications").json() if n["title"] == "Application cycle dates changed"]


def test_REQ_ROUND_1_schedule_saves_cycle_dates_and_rounds_together(as_admin, as_student, fresh_store):
    # Round 3 gets its own, longer windows. It fits only with the later closing date sent in the same request.
    r3 = {"number": 3, "application_days": 7, "review_days": 3, "approval_days": 3, "start_date": "2026-09-18T09:00:00Z"}
    body = {"closing_date": "2026-10-09T09:00:00Z", "rounds": [{"number": 1, **SPEC}, {"number": 2, **SPEC}, r3]}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/schedule", json=body)
    assert r.status_code == 200
    saved = fresh_store.cycle.rounds[2]
    assert saved.review_end.isoformat().startswith("2026-09-28T08:59:59") and saved.approval_end.day == 1
    notes = _cycle_notes(as_student)  # one notice with the dates as saved
    assert len(notes) == 1 and notes[0]["message"].startswith("The cycle now closes on 9 Oct, 5:00 pm SGT. Round 3:")


def test_REQ_ROUND_3_refused_schedule_changes_nothing(as_admin, as_student, fresh_store):
    before = fresh_store.cycle.model_copy(deep=True)
    late = {"number": 3, **SPEC, "start_date": "2026-09-13T09:00:00Z"}  # inside Round 2's approval window
    body = {"closing_date": "2026-10-09T09:00:00Z", "rounds": [{"number": 1, **SPEC}, {"number": 2, **SPEC}, late]}
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/schedule", json=body)
    assert r.status_code == 422 and r.json()["code"] == "rounds_overlap"
    assert fresh_store.cycle == before  # the new closing date was not saved on its own
    assert _cycle_notes(as_student) == []


def test_REQ_CYCLE_2_schedule_announces_the_dates_it_saves(as_admin, as_student, fresh_store):
    from datetime import timedelta

    from app.services.windows import when

    c = _upcoming_cycle(fresh_store)
    start = c.rounds[0].application_start + timedelta(days=5)  # Round 1 keeps its own start while the opening moves
    body = {
        "opening_date": (c.opening_date - timedelta(days=2)).isoformat(),
        "rounds": [{"number": 1, **SPEC, "start_date": start.isoformat()}, {"number": 2, **SPEC}, {"number": 3, **SPEC}],
    }
    assert as_admin.put(f"/admin/cycles/{CYCLE_ID}/schedule", json=body).status_code == 200
    assert fresh_store.cycle.rounds[0].application_start == start
    assert f"Round 1: applications {when(start)} to" in _cycle_notes(as_student)[0]["message"]


def test_REQ_ROUND_2_changing_a_round_notifies_students_and_supervisors(as_admin, as_student, as_supervisor):
    body = {"rounds": [{"number": 1, **SPEC}, {"number": 2, **SPEC}, {"number": 3, "application_days": 3, "review_days": 2}]}
    assert as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body).status_code == 200
    expected = (
        "Round 3: applications 16 Sep, 5:00 pm SGT to 19 Sep, 5:00 pm SGT; rankings due 21 Sep, 5:00 pm SGT; "
        "results out 23 Sep, 5:00 pm SGT."
    )
    for client in (as_student, as_supervisor):
        assert [n["message"] for n in _cycle_notes(client)] == [expected]  # Rounds 1 and 2 did not move


def test_REQ_ROUND_1_default_start_in_the_past_rejected(as_admin, fresh_store):
    fresh_store.cycle.rounds = []  # the cycle opened 18 Aug, so Round 1 would default to 25 Aug
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json={"rounds": [{"number": 1, **SPEC}]})
    assert r.status_code == 422 and r.json()["code"] == "date_in_past"
    assert "25 Aug, 5:00 pm SGT by default" in r.json()["message"]


def test_REQ_ROUND_1_clearing_a_start_date_cannot_move_a_round_into_the_past(as_admin, at):
    from datetime import UTC, datetime

    early = [{"number": 1, **SPEC}, {"number": 2, **SPEC}]
    assert as_admin.put(f"/admin/cycles/{CYCLE_ID}", json={"closing_date": "2026-10-15T09:00:00Z"}).status_code == 200
    late = {"number": 3, **SPEC, "start_date": "2026-09-22T09:00:00Z"}
    assert as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json={"rounds": [*early, late]}).status_code == 200
    at(datetime(2026, 9, 18, 9, tzinfo=UTC))  # past Round 3's default start of 16 Sep, before its chosen one
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json={"rounds": [*early, {"number": 3, **SPEC}]})
    assert r.status_code == 422 and r.json()["code"] == "date_in_past"


def test_REQ_ROUND_2_round_holding_carried_applications_cannot_be_removed(as_admin, fresh_store, at):
    from tests.conftest import APPROVAL_CLOSED, REVIEW_CLOSED

    at(REVIEW_CLOSED)
    at(APPROVAL_CLOSED)  # Round 2 publishes, and its unmatched students' applications carry into Round 3 (REQ-EXEC-3)
    assert fresh_store.applications_for(round_id="rnd-3")
    r = as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json={"rounds": [{"number": 1, **SPEC}, {"number": 2, **SPEC}]})
    assert r.status_code == 422 and r.json()["code"] == "round_in_use" and "carried over" in r.json()["message"]
    assert [x.number for x in fresh_store.cycle.rounds] == [1, 2, 3]


def test_REQ_CYCLE_4_closed_cycle_cannot_be_edited(as_admin):
    r = as_admin.put(f"/admin/cycles/{PAST_CYCLE_ID}/rounds", json={"rounds": [{"number": n, **SPEC} for n in (1, 2, 3)]})
    assert r.status_code == 409 and r.json()["code"] == "cycle_closed"
    r = as_admin.put(f"/admin/cycles/{PAST_CYCLE_ID}", json={"closing_date": "2026-10-15T09:00:00Z"})
    assert r.status_code == 409 and r.json()["code"] == "cycle_closed"


def test_REQ_CYCLE_1_create_rejected_when_closing_date_has_passed(as_admin, fresh_store):
    fresh_store.cycles = []
    body = {
        "academic_year": "AY26/27 Special Term",
        "opening_date": "2026-08-01T09:00:00Z",
        "closing_date": "2026-09-01T09:00:00Z",  # before the demo clock, 7 Sep (use case 1-1 E3)
        "pre_application_days": 7,
    }
    r = as_admin.post("/admin/cycles", json=body)
    assert r.status_code == 422 and r.json()["code"] == "date_in_past" and fresh_store.cycles == []


def test_REQ_OUTCOME_3_moving_the_next_round_moves_open_offers(as_admin, fresh_store, at):
    from tests.conftest import APPROVAL_CLOSED, REVIEW_CLOSED

    at(REVIEW_CLOSED)
    at(APPROVAL_CLOSED)  # Round 2's offers are open until Round 3's applications close on 21 Sep
    offers = [m for m in fresh_store.matches if m.round_id == "rnd-2" and m.status.value == "published"]
    assert offers
    sooner = {"number": 3, "application_days": 3, "review_days": 2, "start_date": "2026-09-17T09:00:00Z"}
    body = {"rounds": [{"number": 1, **SPEC}, {"number": 2, **SPEC}, sooner]}
    assert as_admin.put(f"/admin/cycles/{CYCLE_ID}/rounds", json=body).status_code == 200
    closes = fresh_store.cycle.rounds[2].application_end
    assert closes.isoformat().startswith("2026-09-20T08:59:59")
    assert all(m.offer_expires_at == closes for m in offers)
    note = fresh_store.notifications_for(offers[0].student_id)[-1]
    assert note.title == "Your offer deadline has changed" and note.message.endswith("by 20 Sep, 5:00 pm SGT.")


def test_REQ_OUTCOME_3_moving_the_closing_date_moves_last_round_offers(as_admin, fresh_store, at):
    from datetime import timedelta

    from tests.conftest import APPROVAL_CLOSED, REVIEW_CLOSED

    at(REVIEW_CLOSED)
    at(APPROVAL_CLOSED)
    for lid in {a.listing_id for a in fresh_store.applications_for(round_id="rnd-3")}:  # supervisors rank Round 3
        apps = fresh_store.applications_for(listing_id=lid, round_id="rnd-3")
        fresh_store.applicant_rankings[f"{lid}:rnd-3"] = [a.id for a in apps]
    at(fresh_store.cycle.rounds[2].approval_end + timedelta(seconds=1))  # Round 3's offers are open until the close
    offer = next(m for m in fresh_store.matches if m.round_id == "rnd-3" and m.status.value == "published")
    assert as_admin.put(f"/admin/cycles/{CYCLE_ID}", json={"closing_date": "2026-10-09T09:00:00Z"}).status_code == 200
    assert offer.offer_expires_at == fresh_store.cycle.closing_date and offer.offer_expires_at.day == 9
