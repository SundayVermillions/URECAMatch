"""Slice B. Withdrawing a self-proposed project, and what makes proposals withdraw by themselves.
REQ-PROPOSE-1, REQ-REVPROP-2, REQ-OUTCOME-1, REQ-OUTCOME-2, REQ-OUTCOME-4.

A student can take back a proposal until the supervisor answers it; after that it is final. A student can hold only one
waiting proposal per supervisor. A student who is placed or can no longer be matched has no proposals left waiting:
they become withdrawn and the supervisors are told.

Seed: prp-2 is stu-9's pending proposal to sup-1; prp-1 is stu-3's to sup-2; prp-3 (accepted) and prp-4 (declined) are decided.
"""

from datetime import timedelta

from app.models import Match, MatchStatus, ProposalStatus
from app.routers.matching import _expire_offers
from app.settings import get_settings

LONG = "I will build a dataset, a baseline model and an evaluation report over one semester, then write it up."


def body(**over):
    b = {
        "supervisor_id": "sup-1",
        "title": "Graph Models for Protein Folding",
        "description": LONG,
        "research_interests": ["Machine Learning"],
        "statement": LONG,
        "document_ids": [],
    }
    b.update(over)
    return b


def _offer(store, student_id, **over) -> Match:
    m = Match(
        id=store.next_id("mt"),
        round_id="rnd-2",
        student_id=student_id,
        student_name=student_id,
        listing_id="lst-3",
        listing_title="Test listing",
        supervisor_id="sup-1",
        supervisor_name="Prof. Marcus Chua",
        status=MatchStatus.published,
        **over,
    )
    store.matches.append(m)
    return m


# ---------------------------------------------------------------- the student withdraws


def test_REQ_PROPOSE_withdraw_pending_proposal(client_for, fresh_store):
    r = client_for("stu-9").post("/me/proposals/prp-2/withdraw")
    assert r.status_code == 200 and r.json()["status"] == "withdrawn"
    assert fresh_store.proposal("prp-2").status == ProposalStatus.withdrawn
    told = [n for n in fresh_store.notifications_for("sup-1") if n.title == "A proposal was withdrawn"]
    assert told and "withdrew" in told[-1].message


def test_REQ_PROPOSE_supervisor_cannot_answer_a_withdrawn_proposal(client_for):
    client_for("stu-9").post("/me/proposals/prp-2/withdraw")
    assert client_for("sup-1").post("/supervisor/proposals/prp-2/accept", json={}).status_code == 409
    assert client_for("sup-1").post("/supervisor/proposals/prp-2/decline", json={}).status_code == 409


def test_REQ_PROPOSE_cannot_withdraw_after_the_supervisor_accepted(client_for, fresh_store):
    client_for("sup-1").post("/supervisor/proposals/prp-2/accept", json={})
    r = client_for("stu-9").post("/me/proposals/prp-2/withdraw")
    assert r.status_code == 409 and r.json()["code"] == "already_decided" and "accepted" in r.json()["message"]
    assert fresh_store.proposal("prp-2").status == ProposalStatus.accepted


def test_REQ_PROPOSE_cannot_withdraw_after_the_supervisor_declined(client_for):
    client_for("sup-1").post("/supervisor/proposals/prp-2/decline", json={})
    assert client_for("stu-9").post("/me/proposals/prp-2/withdraw").status_code == 409


def test_REQ_PROPOSE_cannot_withdraw_someone_elses_proposal(client_for, fresh_store):
    assert client_for("stu-1").post("/me/proposals/prp-2/withdraw").status_code == 404
    assert fresh_store.proposal("prp-2").status == ProposalStatus.submitted


def test_REQ_PROPOSE_only_students_withdraw(as_supervisor):
    assert as_supervisor.post("/me/proposals/prp-2/withdraw").status_code == 403


# ---------------------------------------------------------------- one waiting proposal per supervisor


def test_REQ_PROPOSE_one_waiting_proposal_per_supervisor(client_for):
    student = client_for("stu-1")
    assert student.post("/proposals", json=body()).status_code == 201
    again = student.post("/proposals", json=body(title="Same supervisor, another idea"))
    assert again.status_code == 409 and again.json()["code"] == "already_proposed"


def test_REQ_PROPOSE_different_supervisors_are_fine(client_for):
    student = client_for("stu-1")
    assert student.post("/proposals", json=body(supervisor_id="sup-1")).status_code == 201
    assert student.post("/proposals", json=body(supervisor_id="sup-2")).status_code == 201


def test_REQ_PROPOSE_can_propose_again_after_withdrawing_or_a_decline(client_for):
    student = client_for("stu-1")
    first = student.post("/proposals", json=body()).json()["id"]
    student.post(f"/me/proposals/{first}/withdraw")
    second = student.post("/proposals", json=body(title="A second try after withdrawing")).json()["id"]
    client_for("sup-1").post(f"/supervisor/proposals/{second}/decline", json={})
    assert student.post("/proposals", json=body(title="A third try after a decline")).status_code == 201


# ---------------------------------------------------------------- proposals withdraw by themselves


def test_REQ_OUTCOME_1_accepting_an_offer_withdraws_waiting_proposals(client_for, fresh_store):
    _offer(fresh_store, "stu-9")
    assert client_for("stu-9").post("/me/match/accept").status_code == 200
    assert fresh_store.proposal("prp-2").status == ProposalStatus.withdrawn


def test_REQ_OUTCOME_2_declining_an_offer_withdraws_waiting_proposals(client_for, fresh_store):
    _offer(fresh_store, "stu-9")
    assert client_for("stu-9").post("/me/match/decline").status_code == 200
    assert fresh_store.proposal("prp-2").status == ProposalStatus.withdrawn
    assert fresh_store.student("stu-9").eligible_for_matching is False
    told = [n for n in fresh_store.notifications_for("sup-1") if n.title == "A proposal was withdrawn"]
    assert told and "declined a match offer" in told[-1].message


def test_REQ_OUTCOME_4_an_offer_that_times_out_withdraws_waiting_proposals(fresh_store):
    now = get_settings().now()
    _offer(fresh_store, "stu-9", offer_expires_at=now - timedelta(hours=1))
    _expire_offers(fresh_store, now)
    assert fresh_store.proposal("prp-2").status == ProposalStatus.withdrawn
    assert fresh_store.student("stu-9").eligible_for_matching is False


def test_REQ_OUTCOME_2_decided_proposals_stay_as_they_were(client_for, fresh_store):
    _offer(fresh_store, "stu-14")  # prp-3 of stu-14 was accepted long ago
    client_for("stu-14").post("/me/match/decline")
    assert fresh_store.proposal("prp-3").status == ProposalStatus.accepted


def test_REQ_OUTCOME_2_an_ineligible_student_has_nothing_left_to_do(client_for, fresh_store):
    _offer(fresh_store, "stu-9")
    student = client_for("stu-9")
    student.post("/me/match/decline")
    assert student.post("/proposals", json=body(supervisor_id="sup-2")).status_code == 409
    assert student.post("/applications", json={"listing_id": "lst-2", "statement": "s " * 30}).status_code == 409
    assert student.get("/me/recommendations").json() == []
