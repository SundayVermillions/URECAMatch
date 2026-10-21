"""Slice B. Standard topic tags and NTU course codes.  REQ-PROJ-1, REQ-PROF-1, REQ-PROPOSE-1.

Listings, profiles and proposals take values from the catalogue only, so the topic filter and the
prerequisite check compare like with like. Pickers read GET /catalog/topics and GET /catalog/courses.
"""

from fastapi.testclient import TestClient

from app.main import app
from app.services import catalog
from tests.test_REQ_PROJ import new_listing
from tests.test_REQ_PROPOSE import body as proposal


def _profile(**over):
    b = {"school": "CCDS", "cgpa": 4.2, "year_of_study": 3}
    b |= {"completed_modules": ["SC2006"], "research_interests": ["Machine Learning"]}
    b.update(over)
    return b


# ---------------------------------------------------------------- the catalogue


def test_topics_are_grouped_and_unique(as_supervisor):
    groups = as_supervisor.get("/catalog/topics").json()
    flat = [t for g in groups for t in g["topics"]]
    assert groups and len(flat) == len(set(flat))
    assert "Machine Learning" in flat


def test_seed_uses_only_catalogue_values(fresh_store):
    for lst in fresh_store.all_listings():
        assert catalog.clean_topics(lst.topic_tags, "t") == lst.topic_tags
        assert catalog.clean_courses(lst.prerequisites, "p") == lst.prerequisites
    for s in fresh_store.students:
        assert catalog.clean_courses(s.completed_modules, "m") == s.completed_modules
        assert catalog.clean_topics(s.research_interests, "i") == s.research_interests


def test_course_search_by_code_prefix_then_title(as_supervisor):
    by_code = as_supervisor.get("/catalog/courses", params={"q": "sc40"}).json()
    assert by_code and all(c["code"].startswith("SC40") for c in by_code)
    by_title = as_supervisor.get("/catalog/courses", params={"q": "software engineering"}).json()
    assert "SC2006" in {c["code"] for c in by_title}
    newest = [c["last_offered"] for c in by_title]
    assert newest == sorted(newest, reverse=True)  # current codes before retired ones


def test_course_lookup_by_codes_keeps_order(as_supervisor):
    r = as_supervisor.get("/catalog/courses", params={"codes": "SC4001,xx9999,sc3020"}).json()
    assert [c["code"] for c in r] == ["SC4001", "SC3020"] and r[0]["title"] == "NEURAL NETWORK & DEEP LEARNING"


def test_course_search_respects_limit_and_blank_query(as_supervisor):
    assert len(as_supervisor.get("/catalog/courses", params={"q": "a", "limit": 5}).json()) == 5
    assert as_supervisor.get("/catalog/courses", params={"q": "  "}).json() == []


def test_catalogue_needs_sign_in():
    assert TestClient(app).get("/catalog/topics").status_code == 401


# ---------------------------------------------------------------- listings (REQ-PROJ-1)


def test_REQ_PROJ_1_unknown_topic_refused(as_supervisor):
    r = as_supervisor.post("/supervisor/listings", json=new_listing(topic_tags=["Cool Stuff"]))
    assert r.status_code == 422 and r.json()["code"] == "unknown_topic" and r.json()["field"] == "topic_tags"


def test_REQ_PROJ_1_unknown_course_refused(as_supervisor):
    r = as_supervisor.post("/supervisor/listings", json=new_listing(prerequisites=["XX9999"]))
    assert r.status_code == 422 and r.json()["code"] == "unknown_course" and r.json()["field"] == "prerequisites"


def test_REQ_PROJ_1_values_are_normalised(as_supervisor):
    r = as_supervisor.post(
        "/supervisor/listings", json=new_listing(topic_tags=["machine learning", "Machine Learning"], prerequisites=["sc 4001"])
    )
    assert r.status_code == 201
    assert r.json()["topic_tags"] == ["Machine Learning"] and r.json()["prerequisites"] == ["SC4001"]


def test_REQ_PROJ_2_edit_checks_the_catalogue_too(as_supervisor):
    r = as_supervisor.put("/supervisor/listings/lst-1", json={"topic_tags": ["Not A Topic"]})
    assert r.status_code == 422 and r.json()["code"] == "unknown_topic"


# ---------------------------------------------------------------- profile and proposal


def test_REQ_PROF_1_completed_modules_must_be_ntu_courses(client_for):
    r = client_for("stu-1").put("/me/profile", json=_profile(completed_modules=["SC2006", "FAKE101"]))
    assert r.status_code == 422 and r.json()["field"] == "completed_modules"


def test_REQ_PROF_1_research_interests_must_be_standard(client_for):
    r = client_for("stu-1").put("/me/profile", json=_profile(research_interests=["Vibes"]))
    assert r.status_code == 422 and r.json()["field"] == "research_interests"


def test_REQ_PROPOSE_1_research_interests_must_be_standard(as_student):
    r = as_student.post("/proposals", json=proposal(research_interests=["Machine Learning", "Vibes"]))
    assert r.status_code == 422 and r.json()["code"] == "unknown_topic"
