"""Demo set-up: DEMO_FRESH empties the Deep Learning project, and AI match reads supporting documents. Not part of the SRS."""

from app.db import seed_data
from app.settings import get_settings


def test_DEMO_fresh_leaves_the_demo_project_with_no_applicants(monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_fresh", True)
    data = seed_data.build()
    demo = next(lst for lst in data["listings"] if lst.id == "lst-1")
    assert (demo.available_slots, demo.filled_slots) == (1, 0)
    assert not [a for a in data["applications"] if a.listing_id == "lst-1"]
    assert not [m for m in data["matches"] if m.listing_id == "lst-1"]
    assert any(m.student_id == "stu-33" for m in data["matches"])  # the account that has an offer history keeps it


def test_DEMO_fresh_starts_with_no_student_proposals(monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_fresh", True)
    data = seed_data.build()
    assert data["proposals"] == []
    assert not [n for n in data["notifications"] if n.link == "/proposals"]


def test_DEMO_fresh_keeps_every_students_preferences_numbered_without_gaps(monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_fresh", True)
    ranks: dict[tuple[str, str], list[int]] = {}
    for a in seed_data.build()["applications"]:
        if a.status.value == "submitted":
            ranks.setdefault((a.student_id, a.round_id), []).append(a.preference_rank)
    assert all(sorted(v) == list(range(1, len(v) + 1)) for v in ranks.values())


def test_DEMO_the_seed_is_unchanged_without_the_switch():
    data = seed_data.build()
    assert [a for a in data["applications"] if a.listing_id == "lst-1" and a.round_id == "rnd-2"]


def test_DEMO_wei_ling_documents_are_read_from_their_real_files():
    """Her CV and transcript are real PDFs. Seeding must not give them made-up text (or a 'scan' with none), or AI match
    and the application tips say the CV cannot be read."""
    from app.services import ai_match

    student = seed_data.build()["students"][0]
    assert student.user_id == "stu-1"
    for d in student.documents:
        assert d.extracted_text is None, d.file_name
        assert len(ai_match.document_text(d)) > 500, d.file_name
