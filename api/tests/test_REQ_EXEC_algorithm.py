"""Slice D. Pure algorithm tests: no store, no dates."""

from app.services.matching.algorithm import ListingPrefs, StudentPrefs, match


def test_REQ_EXEC_1_simple_stable_outcome():
    students = [
        StudentPrefs("s1", ["p1", "p2"]),
        StudentPrefs("s2", ["p1", "p2"]),
        StudentPrefs("s3", ["p2", "p1"]),
    ]
    listings = [
        ListingPrefs("p1", 1, ["s2", "s1", "s3"]),
        ListingPrefs("p2", 1, ["s1", "s3", "s2"]),
    ]
    r = match(students, listings)
    assert r.pairs == {"s2": "p1", "s1": "p2"}
    assert r.unmatched == ["s3"]


def test_REQ_EXEC_1_capacity_respected():
    students = [StudentPrefs(f"s{i}", ["p1"]) for i in range(1, 6)]
    listings = [ListingPrefs("p1", 3, ["s5", "s4", "s3", "s2", "s1"])]
    r = match(students, listings)
    assert sorted(r.pairs) == ["s3", "s4", "s5"]
    assert len(r.unmatched) == 2


def test_REQ_EXEC_1_unranked_applicant_never_matched():
    students = [StudentPrefs("s1", ["p1"])]
    listings = [ListingPrefs("p1", 2, [])]
    r = match(students, listings)
    assert r.pairs == {} and r.unmatched == ["s1"]


def test_REQ_EXEC_3_zero_capacity_listing_skipped():
    students = [StudentPrefs("s1", ["p1", "p2"])]
    listings = [ListingPrefs("p1", 0, ["s1"]), ListingPrefs("p2", 1, ["s1"])]
    assert match(students, listings).pairs == {"s1": "p2"}
