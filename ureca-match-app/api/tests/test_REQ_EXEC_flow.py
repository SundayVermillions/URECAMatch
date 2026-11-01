"""Slice D. Matching and publishing run by themselves as the clock passes each window; offers and their deadline.
REQ-EXEC-1..4, 6, REQ-PUB-1, 2, 4, REQ-APPRV-4, REQ-OUTCOME-2, 3, REQ-APPLY-5, REQ-AUDIT-3."""

import threading
from datetime import timedelta

from app.routers import matching
from app.services import windows
from app.settings import get_settings
from tests.conftest import APPROVAL_CLOSED, REVIEW_CLOSED

SECOND = timedelta(seconds=1)


def _round_2(store):
    return store.cycle.rounds[1]


def _system_entries(store, operation: str, round_id: str):
    return [e for e in store.audit if e.operation.value == operation and round_id in e.affected_records]


def test_REQ_EXEC_1_matching_waits_for_the_review_window_to_close(fresh_store, at):
    at(REVIEW_CLOSED - 2 * SECOND)  # 12 Sep, 4:59:58 pm SGT: rankings can still change
    assert _round_2(fresh_store).executed_at is None
    assert not [m for m in fresh_store.matches if m.round_id == "rnd-2"]


def test_REQ_EXEC_6_matching_runs_by_itself_when_the_review_window_closes(fresh_store, at):
    at(REVIEW_CLOSED)
    r = _round_2(fresh_store)
    assert r.executed_at == REVIEW_CLOSED and r.status.value == "approval_window"
    ms = [m for m in fresh_store.matches if m.round_id == "rnd-2"]
    assert ms and all(m.status.value == "proposed" for m in ms)
    (entry,) = _system_entries(fresh_store, "matching_executed", "rnd-2")
    assert (entry.actor_id, entry.actor_name) == ("system", "System")  # REQ-AUDIT-3
    told = {n.user_id for n in fresh_store.notifications if n.event.value == "matches_proposed"}
    assert {m.supervisor_id for m in ms} <= told and "adm-1" in told


def test_REQ_EXEC_2_matching_runs_once(fresh_store, at):
    at(REVIEW_CLOSED)
    n = len(fresh_store.matches)
    at(REVIEW_CLOSED + timedelta(hours=1))
    assert len(fresh_store.matches) == n
    assert len(_system_entries(fresh_store, "matching_executed", "rnd-2")) == 1


def test_REQ_PUB_4_results_publish_when_the_approval_window_closes(client_for, fresh_store, at):
    at(REVIEW_CLOSED)
    proposed = [m for m in fresh_store.matches if m.round_id == "rnd-2"]
    at(APPROVAL_CLOSED - 2 * SECOND)
    assert _round_2(fresh_store).published_at is None  # supervisors can still decline
    at(APPROVAL_CLOSED)
    r = _round_2(fresh_store)
    assert r.published_at == APPROVAL_CLOSED and r.status.value == "published"
    assert all(m.status.value == "published" for m in proposed)  # REQ-APPRV-4: accepted unless declined
    (entry,) = _system_entries(fresh_store, "results_published", "rnd-2")
    assert entry.actor_name == "System"  # REQ-AUDIT-3

    student = client_for(proposed[0].student_id)
    assert student.get("/me/match").json()["status"] == "published"
    assert student.post("/me/match/decline").json()["status"] == "declined"  # REQ-OUTCOME-2
    assert student.get("/me").json()["student"]["eligible_for_matching"] is False


def test_REQ_PUB_1_publishes_once(fresh_store, at):
    at(REVIEW_CLOSED)
    at(APPROVAL_CLOSED)
    sent = len(fresh_store.notifications)
    at(APPROVAL_CLOSED + timedelta(hours=1))
    assert len(fresh_store.notifications) == sent  # nobody is notified twice
    assert len(_system_entries(fresh_store, "results_published", "rnd-2")) == 1


def test_REQ_EXEC_6_a_clock_jump_runs_matching_before_publishing(fresh_store, at):
    at(APPROVAL_CLOSED + timedelta(days=1))  # nobody used the app for a week
    r = _round_2(fresh_store)
    assert r.executed_at and r.published_at and r.executed_at <= r.published_at
    assert [m for m in fresh_store.matches if m.round_id == "rnd-2" and m.status.value == "published"]


def test_REQ_EXEC_6_a_failed_run_leaves_nothing_half_done(fresh_store, anon, at, monkeypatch):
    real, lookups = fresh_store.ranking, []

    def unavailable_after_one(listing_id, round_id):
        lookups.append(listing_id)
        if len(lookups) > 1:
            raise RuntimeError("database unavailable")
        return real(listing_id, round_id)

    monkeypatch.setattr(fresh_store, "ranking", unavailable_after_one)  # fails with the round claimed and half read
    monkeypatch.setattr(get_settings(), "demo_now", REVIEW_CLOSED)
    assert anon.get("/health").status_code == 200  # the failure is logged, not passed on to this request
    assert _round_2(fresh_store).executed_at is None
    assert not [m for m in fresh_store.matches if m.round_id == "rnd-2"]
    monkeypatch.setattr(fresh_store, "ranking", real)
    at(REVIEW_CLOSED)  # the next request runs it in full
    students = [m.student_id for m in fresh_store.matches if m.round_id == "rnd-2"]
    assert students and len(students) == len(set(students))


def test_REQ_EXEC_6_requests_do_not_wait_on_the_scheduler_when_nothing_is_due(as_student):
    done = threading.Event()
    with matching._schedule_lock:  # as if another request were publishing and sending its e-mails
        threading.Thread(target=lambda: (as_student.get("/me"), done.set()), daemon=True).start()
        assert done.wait(5)


def test_REQ_EXEC_admins_no_longer_run_or_publish_by_hand(as_admin):
    assert as_admin.post("/admin/rounds/rnd-2/execute").status_code == 404
    assert as_admin.post("/admin/rounds/rnd-2/publish").status_code == 404


def test_REQ_PUB_2_every_application_gets_an_outcome(fresh_store, at):
    at(REVIEW_CLOSED)
    at(APPROVAL_CLOSED)
    statuses = {a.status.value for a in fresh_store.applications if a.round_id == "rnd-2"}
    assert "submitted" not in statuses and "unmatched" in statuses


def test_REQ_OUTCOME_2_declined_or_placed_students_are_not_matched_again(client_for, fresh_store, at):
    # stu-38 declined and stu-33 accepted in Round 1. Even if they apply in Round 2, matching must skip them.
    for sid in ("stu-33", "stu-38"):
        assert fresh_store.student(sid).eligible_for_matching  # the seed does not set the flag (slice B's seed)
    # A placed student is now refused at the door (one project per cycle, slice B)...
    r = client_for("stu-33").post("/applications", json={"listing_id": "lst-1", "statement": "s " * 30})
    assert r.status_code == 409 and r.json()["code"] == "already_placed"
    # ...so give stu-33 an application directly, as one made before placement would be: matching must still skip it.
    stray = fresh_store.application("app-1").model_copy(
        update={"id": "app-stray", "student_id": "stu-33", "listing_id": "lst-1", "round_id": "rnd-2", "status": "submitted"}
    )
    fresh_store.save_applications(stray)
    fresh_store.applicant_rankings["lst-1:rnd-2"].insert(0, stray.id)
    r = client_for("stu-38").post("/applications", json={"listing_id": "lst-1", "statement": "s " * 30})
    assert r.status_code == 201
    fresh_store.applicant_rankings["lst-1:rnd-2"].insert(0, r.json()["id"])  # ranked first, so only the rule can stop it
    at(REVIEW_CLOSED)  # matching runs by itself when the review window closes (REQ-EXEC-6)
    assert not [m for m in fresh_store.matches if m.round_id == "rnd-2" and m.student_id in ("stu-33", "stu-38")]


# ---------------------------------------------------------------- REQ-OUTCOME-3, REQ-APPLY-5 offers


def _an_offer(store, round_id="rnd-2"):
    return next(m for m in store.matches if m.round_id == round_id and m.status.value == "published")


def test_REQ_OUTCOME_3_offer_open_until_the_next_application_window_closes(fresh_store, at):
    at(REVIEW_CLOSED)
    at(APPROVAL_CLOSED)
    offer = _an_offer(fresh_store)
    r3 = fresh_store.cycle.rounds[2]
    assert offer.offer_expires_at == r3.application_end  # 21 Sep, 5:00 pm SGT
    at(r3.application_end)
    assert offer.status.value == "published"  # still open in its last second
    at(r3.application_end + SECOND)
    assert offer.status.value == "timed_out" and not fresh_store.student(offer.student_id).eligible_for_matching


def _rank_round_3(fresh_store, at):
    at(REVIEW_CLOSED)
    at(APPROVAL_CLOSED)  # Round 2 publishes; unmatched students carry over to Round 3
    for key in {f"{a.listing_id}:rnd-3" for a in fresh_store.applications_for(round_id="rnd-3")}:
        lid = key.split(":")[0]
        fresh_store.applicant_rankings[key] = [a.id for a in fresh_store.applications_for(listing_id=lid, round_id="rnd-3")]
    return fresh_store.cycle.rounds[2]


def test_REQ_OUTCOME_3_last_round_offers_run_to_the_end_of_the_cycle(fresh_store, at):
    r3 = _rank_round_3(fresh_store, at)
    at(r3.approval_end + SECOND)
    assert _an_offer(fresh_store, "rnd-3").offer_expires_at == fresh_store.cycle.closing_date


def test_REQ_OUTCOME_3_a_late_publish_leaves_last_round_offers_open(fresh_store, at):
    r3 = _rank_round_3(fresh_store, at)
    at(r3.approval_end + timedelta(hours=6))  # nobody used the app until the evening
    offer = _an_offer(fresh_store, "rnd-3")  # still an open offer, not timed out
    assert offer.offer_expires_at - offer.published_at > timedelta(days=6)


def test_REQ_OUTCOME_3_a_late_offer_gets_the_next_window_still_open(fresh_store):
    c = fresh_store.cycle
    r1, r2, r3 = c.rounds
    assert windows.offer_deadline(c, r1, r2.application_end - timedelta(days=1)) == r2.application_end
    assert windows.offer_deadline(c, r1, r2.application_end + SECOND) == r3.application_end
    assert windows.offer_deadline(c, r3, r3.approval_end) == c.closing_date
    assert windows.offer_deadline(c, r3, c.closing_date) is None  # the cycle has closed: no offer can be made


def test_REQ_APPLY_5_student_with_an_open_offer_cannot_apply(client_for, fresh_store, at):
    at(REVIEW_CLOSED)
    at(APPROVAL_CLOSED)
    offer = _an_offer(fresh_store)
    fresh_store.student(offer.student_id).profile_complete = True
    at(fresh_store.cycle.rounds[2].application_start)  # Round 3 opens while the offer is still open
    target = next(x.id for x in fresh_store.listings if x.status.value == "published" and x.id != offer.listing_id)
    r = client_for(offer.student_id).post("/applications", json={"listing_id": target, "statement": "s " * 30})
    assert r.status_code == 409 and r.json()["code"] == "offer_open"


# ---------------------------------------------------------------- REQ-EXEC-3 rollover of unmatched students


def _publish_round_2(at):
    at(REVIEW_CLOSED)
    at(APPROVAL_CLOSED)


def test_REQ_EXEC_3_unmatched_applications_carry_into_the_next_round(fresh_store, at):
    _publish_round_2(at)
    loser = next(a.student_id for a in fresh_store.applications if a.round_id == "rnd-2" and a.status.value == "unmatched")
    old = sorted(
        (a for a in fresh_store.applications_for(student_id=loser, round_id="rnd-2")), key=lambda a: a.preference_rank or 99
    )
    new = sorted(fresh_store.applications_for(student_id=loser, round_id="rnd-3"), key=lambda a: a.preference_rank)
    assert [a.listing_id for a in new] == [a.listing_id for a in old]  # same projects, same order
    assert [a.preference_rank for a in new] == list(range(1, len(new) + 1))
    assert all(a.status.value == "submitted" for a in new)
    note = fresh_store.notifications_for(loser)[-1]
    assert "carry over to Round 3" in note.message


def test_REQ_EXEC_3_rollover_off_leaves_students_to_apply_again(fresh_store, at):
    fresh_store.cycle.rollover_unmatched = False
    _publish_round_2(at)
    assert not fresh_store.applications_for(round_id="rnd-3")
    loser = next(a.student_id for a in fresh_store.applications if a.round_id == "rnd-2" and a.status.value == "unmatched")
    assert fresh_store.notifications_for(loser)[-1].message.endswith("You can apply again in Round 3.")


def test_REQ_EXEC_3_placed_and_excluded_students_do_not_roll_over(fresh_store, at):
    _publish_round_2(at)
    offered = {m.student_id for m in fresh_store.matches if m.round_id == "rnd-2"}
    rolled = {a.student_id for a in fresh_store.applications_for(round_id="rnd-3")}
    assert rolled and not rolled & offered


def test_REQ_EXEC_3_rollover_skips_projects_that_are_full(fresh_store, at):
    full = fresh_store.listing("lst-2")
    full.filled_slots = full.available_slots  # as apply() would say: "All slots on this project are filled"
    _publish_round_2(at)
    assert all(a.listing_id != "lst-2" for a in fresh_store.applications_for(round_id="rnd-3"))
