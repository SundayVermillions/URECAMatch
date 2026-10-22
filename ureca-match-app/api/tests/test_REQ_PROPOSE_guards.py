"""Slice B. Guards on self-proposed projects.  REQ-PROPOSE-1, REQ-REVPROP-2, REQ-OUTCOME-2.

A student who declined or missed an offer is ineligible for the rest of the cycle, so they can neither propose nor
be registered through a proposal. A proposal is real text, never blank. Accepting one withdraws the student's others.

Seed: stu-3 has a pending proposal to sup-2 and stu-9 one to sup-1, so these tests use stu-1 and stu-2, who have none.
"""

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


# ---------------------------------------------------------------- ineligible students (REQ-OUTCOME-2)


def test_REQ_OUTCOME_2_ineligible_student_cannot_propose(client_for, fresh_store):
    fresh_store.student("stu-1").eligible_for_matching = False  # declined or missed an earlier offer
    before = len(fresh_store.proposals_for(student_id="stu-1"))
    r = client_for("stu-1").post("/proposals", json=body())
    assert r.status_code == 409 and r.json()["code"] == "not_eligible"
    assert len(fresh_store.proposals_for(student_id="stu-1")) == before  # nothing was stored


def test_REQ_OUTCOME_2_eligible_student_can_propose(client_for):
    assert client_for("stu-1").post("/proposals", json=body()).status_code == 201  # positive control


def test_REQ_OUTCOME_2_cannot_accept_a_proposal_after_the_student_became_ineligible(client_for, fresh_store):
    pid = client_for("stu-1").post("/proposals", json=body()).json()["id"]
    fresh_store.student("stu-1").eligible_for_matching = False  # then they decline an offer
    r = client_for("sup-1").post(f"/supervisor/proposals/{pid}/accept", json={})
    assert r.status_code == 409 and r.json()["code"] == "not_eligible"
    assert fresh_store.proposal(pid).status.value == "submitted"
    assert not [m for m in fresh_store.matches if m.student_id == "stu-1" and m.status.value == "accepted"]


def test_REQ_OUTCOME_2_that_proposal_can_still_be_declined(client_for, fresh_store):
    pid = client_for("stu-1").post("/proposals", json=body()).json()["id"]
    fresh_store.student("stu-1").eligible_for_matching = False
    assert client_for("sup-1").post(f"/supervisor/proposals/{pid}/decline", json={}).status_code == 200


# ---------------------------------------------------------------- no blank proposals (REQ-PROPOSE-1)


def test_REQ_PROPOSE_1_blank_title_refused(client_for):
    r = client_for("stu-1").post("/proposals", json=body(title="     "))
    assert r.status_code == 422 and r.json()["field"] == "title"


def test_REQ_PROPOSE_1_blank_description_refused(client_for):
    r = client_for("stu-1").post("/proposals", json=body(description=" " * 60))
    assert r.status_code == 422 and r.json()["field"] == "description"


def test_REQ_PROPOSE_1_blank_statement_refused(client_for):
    r = client_for("stu-1").post("/proposals", json=body(statement=" " * 60))
    assert r.status_code == 422 and r.json()["field"] == "statement"


def test_REQ_PROPOSE_1_text_is_saved_trimmed(client_for):
    r = client_for("stu-1").post("/proposals", json=body(title="  Graph Models for Protein Folding  "))
    assert r.status_code == 201 and r.json()["title"] == "Graph Models for Protein Folding"


def test_REQ_PROPOSE_1_absurdly_long_text_refused(client_for):
    assert client_for("stu-1").post("/proposals", json=body(title="T" * 151)).status_code == 422
    assert client_for("stu-1").post("/proposals", json=body(statement="s" * 3001)).status_code == 422


# ---------------------------------------------------------------- accepting withdraws the others (REQ-REVPROP-2)


def test_REQ_REVPROP_2_accepting_withdraws_the_students_other_pending_proposals(client_for, fresh_store):
    student = client_for("stu-1")
    first = student.post("/proposals", json=body(supervisor_id="sup-1")).json()["id"]
    second = student.post("/proposals", json=body(supervisor_id="sup-2", title="A different idea for sup two")).json()["id"]
    assert client_for("sup-1").post(f"/supervisor/proposals/{first}/accept", json={}).status_code == 200
    assert fresh_store.proposal(first).status.value == "accepted"
    assert fresh_store.proposal(second).status.value == "withdrawn"
    # the second supervisor is told, and can no longer act on it
    told = [n for n in fresh_store.notifications_for("sup-2") if n.title == "A proposal was withdrawn"]
    assert told and "A different idea for sup two" in told[-1].message
    assert client_for("sup-2").post(f"/supervisor/proposals/{second}/accept", json={}).status_code == 409


def test_REQ_REVPROP_2_other_students_proposals_are_untouched(client_for, fresh_store):
    mine = client_for("stu-1").post("/proposals", json=body(supervisor_id="sup-1")).json()["id"]
    theirs = client_for("stu-2").post("/proposals", json=body(supervisor_id="sup-2")).json()["id"]
    client_for("sup-1").post(f"/supervisor/proposals/{mine}/accept", json={})
    assert fresh_store.proposal(theirs).status.value == "submitted"
