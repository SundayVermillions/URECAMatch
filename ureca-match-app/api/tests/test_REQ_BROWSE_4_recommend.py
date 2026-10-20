"""Slice B. Recommended projects on Browse.  REQ-BROWSE-4.

Seed: stu-1 likes Healthcare AI and Marine Biology and has passed SC3020 among others. stu-33 is placed
(accepted mt-1 in Round 1). Score = interests (40 for one shared topic, 50 for two or more) + readiness
(share of prerequisites passed, out of 30) + chance (fewer applicants per open slot, out of 20).
"""

from app.models import Listing, ListingStatus, StudentProfile
from app.services.recommend import fit


def _listing(**over) -> Listing:
    b = {
        "id": "x",
        "supervisor_id": "sup-1",
        "supervisor_name": "S",
        "title": "T",
        "description": "D" * 20,
        "prerequisites": [],
        "topic_tags": [],
        "available_slots": 2,
        "offering_faculty": "CCDS",
        "research_location": "",
        "status": ListingStatus.published,
        "created_at": "2026-08-01T00:00:00Z",
    }
    b.update(over)
    return Listing(**b)


def _student(interests, modules=()) -> StudentProfile:
    return StudentProfile(user_id="s", school="CCDS", research_interests=list(interests), completed_modules=list(modules))


# ---------------------------------------------------------------- the score


def test_REQ_BROWSE_4_one_shared_topic_40_two_or_more_50():
    one = fit(_listing(topic_tags=["Robotics", "Statistics"]), _student(["Robotics"]))
    two = fit(_listing(topic_tags=["Robotics", "Statistics"]), _student(["Robotics", "Statistics"]))
    assert (one.parts.interests, two.parts.interests) == (40, 50)


def test_REQ_BROWSE_4_readiness_is_share_of_prerequisites_passed():
    r = fit(_listing(prerequisites=["SC4001", "SC3020"]), _student([], ["SC3020"]))
    assert r.parts.readiness == 15 and "You have SC3020" in r.reasons and "Missing SC4001" in r.gaps
    assert fit(_listing(), _student([])).parts.readiness == 30  # no prerequisites


def test_REQ_BROWSE_4_fewer_applicants_per_slot_scores_higher():
    quiet = fit(_listing(applicant_count=0), _student([]))
    busy = fit(_listing(applicant_count=14), _student([]))
    assert quiet.parts.chance == 20 and busy.parts.chance < 5
    assert "No applicants yet" in quiet.reasons and any("High demand" in g for g in busy.gaps)


def test_REQ_BROWSE_4_score_is_the_sum_of_its_parts():
    r = fit(_listing(topic_tags=["Robotics"], prerequisites=["MA3005"], applicant_count=3), _student(["Robotics"], ["MA3005"]))
    assert r.score == r.parts.interests + r.parts.readiness + r.parts.chance <= 100


# ---------------------------------------------------------------- the endpoint


def test_REQ_BROWSE_4_best_first_and_only_shared_topics(as_student):
    rows = as_student.get("/me/recommendations").json()
    assert rows and [r["score"] for r in rows] == sorted((r["score"] for r in rows), reverse=True)
    mine = {"Healthcare AI", "Marine Biology"}
    assert all(mine & set(r["listing"]["topic_tags"]) for r in rows)


def test_REQ_BROWSE_4_leaves_out_applied_full_and_closed(as_student, fresh_store):
    applied = {a.listing_id for a in fresh_store.applications_for(student_id="stu-1") if a.status.value == "submitted"}
    shown = {r["listing"]["id"] for r in as_student.get("/me/recommendations", params={"limit": 50}).json()}
    closed = {lst.id for lst in fresh_store.all_listings() if lst.status != ListingStatus.published}
    full = {lst.id for lst in fresh_store.all_listings() if lst.filled_slots >= lst.available_slots}
    assert not shown & (applied | closed | full)


def test_REQ_BROWSE_4_limit(as_student):
    assert len(as_student.get("/me/recommendations", params={"limit": 2}).json()) <= 2


def test_REQ_BROWSE_4_nothing_without_interests(client_for, fresh_store):
    fresh_store.student("stu-1").research_interests = []
    assert client_for("stu-1").get("/me/recommendations").json() == []


def test_REQ_BROWSE_4_nothing_once_placed(client_for):
    assert client_for("stu-33").get("/me/recommendations").json() == []


def test_REQ_BROWSE_4_students_only(as_supervisor):
    assert as_supervisor.get("/me/recommendations").status_code == 403
