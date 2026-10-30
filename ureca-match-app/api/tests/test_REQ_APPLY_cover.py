"""Slice C. A student's lists belong to the running cycle, and each application carries its project's photo.  REQ-SRANK-1.

Seed: stu-1 has two applications in Round 2; stu-3 sent a proposal this cycle. The cycle closes on 30 Nov 2026.
"""

from datetime import UTC, datetime

import pytest

from app.settings import get_settings, set_clock_override

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


@pytest.fixture
def clock(monkeypatch):
    """Move the debug clock, and put it back afterwards."""
    monkeypatch.setattr(get_settings(), "debug_clock", True)
    yield lambda when: set_clock_override(when)
    set_clock_override(None)


def test_REQ_SRANK_my_applications_carry_the_project_cover(as_student, as_supervisor):
    applied = as_student.get("/me/applications").json()[0]["listing_id"]
    as_supervisor.post(f"/supervisor/listings/{applied}/cover", files={"file": ("c.png", PNG, "image/png")})
    rows = {r["listing_id"]: r for r in as_student.get("/me/applications").json()}
    assert rows[applied]["cover_url"] is not None


def test_REQ_SRANK_applications_and_proposals_are_listed_during_the_cycle(as_student, client_for):
    assert as_student.get("/me/applications").json() != []
    assert client_for("stu-3").get("/me/proposals").json() != []


def test_REQ_SRANK_applications_and_proposals_are_cleared_after_the_cycle(as_student, client_for, clock):
    clock(datetime(2027, 3, 1, tzinfo=UTC))  # long after the cycle closed
    assert as_student.get("/me/applications").json() == []
    assert client_for("stu-3").get("/me/proposals").json() == []


def test_REQ_SRANK_a_new_cycle_starts_with_nothing_carried_over(as_student, client_for, as_admin, clock):
    clock(datetime(2027, 3, 1, tzinfo=UTC))  # the cycle has closed, so the next one can be created
    made = as_admin.post(
        "/admin/cycles",
        json={
            "academic_year": "AY27/28 Semester 1",
            "opening_date": "2027-03-02T09:00:00Z",
            "closing_date": "2027-05-30T09:00:00Z",
            "pre_application_days": 7,
        },
    )
    assert made.status_code == 201, made.text
    clock(datetime(2027, 3, 3, tzinfo=UTC))
    assert as_student.get("/me/applications").json() == []
    assert client_for("stu-3").get("/me/proposals").json() == []
