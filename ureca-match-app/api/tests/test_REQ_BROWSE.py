"""Slice B. Browsing and searching listings.  REQ-BROWSE-1..2 (BROWSE-3 is in test_REQ_PROJ_and_PROPOSE.py).

Seeded cycle: opens 18 Aug 2026, pre-application window until Round 1 opens on 25 Aug.
"""

from datetime import UTC, datetime

from app.settings import get_settings


def _at(monkeypatch, when: datetime) -> None:
    monkeypatch.setattr(get_settings(), "demo_now", when)


def _ids(client, **params) -> set[str]:
    r = client.get("/listings", params=params)
    assert r.status_code == 200, r.text
    return {lst["id"] for lst in r.json()}


def _all(client) -> list[dict]:
    return client.get("/listings").json()


# ---------------------------------------------------------------- REQ-BROWSE-1


def test_REQ_BROWSE_1_listings_visible_before_the_cycle_opens(as_student, monkeypatch):
    _at(monkeypatch, datetime(2026, 8, 1, 9, tzinfo=UTC))
    assert len(_ids(as_student)) > 0


def test_REQ_BROWSE_1_listings_visible_in_pre_application_window(as_student, monkeypatch):
    _at(monkeypatch, datetime(2026, 8, 20, 9, tzinfo=UTC))
    r = as_student.get("/me")
    assert r.json()["phase"]["window"] == "pre_application"
    assert len(_ids(as_student)) > 0


# ---------------------------------------------------------------- REQ-BROWSE-2


def test_REQ_BROWSE_2_keyword_matches_title_case_insensitive(as_student):
    lst = _all(as_student)[0]
    word = lst["title"].split()[0].upper()
    assert lst["id"] in _ids(as_student, q=word)


def test_REQ_BROWSE_2_keyword_matches_topic_tag(as_student):
    lst = _all(as_student)[0]
    assert lst["id"] in _ids(as_student, q=lst["topic_tags"][0].lower())


def test_REQ_BROWSE_2_keyword_does_not_match_across_fields(as_student):
    """Title and description are separate fields: the end of one plus the start of the other is not a match."""
    lst = _all(as_student)[0]
    glued = lst["title"][-3:] + lst["description"][:3]
    assert lst["id"] not in _ids(as_student, q=glued)


def test_REQ_BROWSE_2_school_filter_case_insensitive(as_student):
    rows = as_student.get("/listings", params={"school": "ccds"}).json()
    assert rows and all(r["offering_faculty"] == "CCDS" for r in rows)


def test_REQ_BROWSE_2_topic_filter(as_student):
    tag = _all(as_student)[0]["topic_tags"][0]
    rows = as_student.get("/listings", params={"tag": tag}).json()
    assert rows and all(tag in r["topic_tags"] for r in rows)


def test_REQ_BROWSE_2_supervisor_filter_partial_name(as_student):
    rows = as_student.get("/listings", params={"supervisor": "chua"}).json()
    assert rows and all(r["supervisor_name"] == "Prof. Marcus Chua" for r in rows)


def test_REQ_BROWSE_2_filters_combine_with_and(as_student):
    tag = "Machine Learning"
    both = _ids(as_student, school="CCDS", tag=tag)
    assert both == _ids(as_student, school="CCDS") & _ids(as_student, tag=tag)


def test_REQ_BROWSE_2_no_match_returns_empty_list(as_student):
    assert _ids(as_student, q="zzz-no-such-project") == set()
