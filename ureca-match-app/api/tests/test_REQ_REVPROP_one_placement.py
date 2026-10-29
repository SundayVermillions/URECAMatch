"""Slice B. A student holds at most one project per cycle, whichever path places them.  REQ-REVPROP-2, REQ-OUTCOME-1.

Seed: stu-33 has accepted a Round 1 offer (mt-1). prp-2 is stu-9's pending proposal to sup-1.
The demo clock (7 Sep) is inside the Round 2 application window.
"""

from app.models import Match, MatchStatus, Proposal, ProposalStatus


def _proposal_body():
    return {
        "supervisor_id": "sup-1",
        "title": "Graph models for protein folding",
        "description": "Train a graph neural network on public protein structures and compare it with a CNN baseline.",
        "research_interests": ["Machine Learning"],
        "statement": "I completed SC4001 and built a small graph network myself; this project matches my interests.",
    }


def _offer(store, student_id: str, listing_id: str = "lst-3", round_id: str = "rnd-2") -> Match:
    m = Match(
        id=store.next_id("mt"),
        round_id=round_id,
        student_id=student_id,
        student_name=student_id,
        listing_id=listing_id,
        listing_title="Test listing",
        supervisor_id="sup-1",
        supervisor_name="Prof. Marcus Chua",
        status=MatchStatus.published,
    )
    store.matches.append(m)
    return m


def _pending_proposal(store, student_id: str) -> Proposal:
    p = store.proposal("prp-2").model_copy(update={"id": store.next_id("prp"), "student_id": student_id})
    store.save_proposal(p)
    return p


def test_REQ_REVPROP_2_placed_student_cannot_propose(client_for):
    r = client_for("stu-33").post("/proposals", json=_proposal_body())
    assert r.status_code == 409 and r.json()["code"] == "already_placed"


def test_REQ_REVPROP_2_unplaced_student_can_still_propose(client_for):
    """Positive control: the rule must not block students who hold no project."""
    r = client_for("stu-1").post("/proposals", json=_proposal_body())
    assert r.status_code == 201


def test_REQ_REVPROP_2_cannot_accept_proposal_of_placed_student(as_supervisor, fresh_store):
    p = _pending_proposal(fresh_store, "stu-33")  # proposed before accepting the Round 1 offer
    r = as_supervisor.post(f"/supervisor/proposals/{p.id}/accept", json={})
    assert r.status_code == 409 and r.json()["code"] == "already_placed"
    accepted = [m for m in fresh_store.matches if m.student_id == "stu-33" and m.status == MatchStatus.accepted]
    assert len(accepted) == 1  # still exactly one project


def test_REQ_REVPROP_2_placed_student_proposal_can_still_be_declined(as_supervisor, fresh_store):
    p = _pending_proposal(fresh_store, "stu-33")
    r = as_supervisor.post(f"/supervisor/proposals/{p.id}/decline", json={"note": "Not a fit this semester."})
    assert r.status_code == 200 and r.json()["status"] == "declined"


def test_REQ_OUTCOME_1_accepting_offer_withdraws_pending_proposals(client_for, fresh_store):
    _offer(fresh_store, "stu-9")
    r = client_for("stu-9").post("/me/match/accept")
    assert r.status_code == 200
    assert fresh_store.proposal("prp-2").status == ProposalStatus.withdrawn
    told = [n for n in fresh_store.notifications if n.user_id == "sup-1" and n.title == "A proposal was withdrawn"]
    assert len(told) == 1


def test_REQ_REVPROP_2_accepting_proposal_withdraws_open_offer(as_supervisor, fresh_store):
    offer = _offer(fresh_store, "stu-9")
    r = as_supervisor.post("/supervisor/proposals/prp-2/accept", json={})
    assert r.status_code == 200
    assert offer.status == MatchStatus.declined  # releases the slot it held
    accepted = [m for m in fresh_store.matches if m.student_id == "stu-9" and m.status == MatchStatus.accepted]
    assert len(accepted) == 1


def test_REQ_REVPROP_2_accepting_proposal_withdraws_unpublished_match(as_supervisor, fresh_store):
    """A match not yet published must not be offered later to a student who is already placed."""
    m = _offer(fresh_store, "stu-9")
    m.status = MatchStatus.approved
    assert as_supervisor.post("/supervisor/proposals/prp-2/accept", json={}).status_code == 200
    assert m.status == MatchStatus.declined


def test_REQ_OUTCOME_1_cannot_accept_offer_when_placed_by_proposal(as_supervisor, client_for, fresh_store):
    """Reverse order: the proposal is accepted first, then the student tries an offer that slipped through."""
    assert as_supervisor.post("/supervisor/proposals/prp-2/accept", json={}).status_code == 200
    _offer(fresh_store, "stu-9")
    r = client_for("stu-9").post("/me/match/accept")
    assert r.status_code == 409 and r.json()["code"] == "already_placed"


def test_REQ_APPLY_placed_by_proposal_cannot_apply(as_supervisor, client_for):
    """After a supervisor accepts stu-9's proposal, applying is refused with the reason that is true."""
    assert as_supervisor.post("/supervisor/proposals/prp-2/accept", json={}).status_code == 200
    r = client_for("stu-9").post("/applications", json={"listing_id": "lst-3", "statement": "x" * 60})
    assert r.status_code == 409 and r.json()["code"] == "already_placed"
    assert "declined" not in r.json()["message"]


def test_REQ_APPLY_placed_by_offer_cannot_apply(client_for):
    r = client_for("stu-33").post("/applications", json={"listing_id": "lst-3", "statement": "x" * 60})
    assert r.status_code == 409 and r.json()["code"] == "already_placed"
