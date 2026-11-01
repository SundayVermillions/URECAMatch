"""Demo set-up: DEMO_FRESH empties the Deep Learning project, and AI match reads supporting documents. Not part of the SRS."""

from pathlib import Path

from app.db import seed_data
from app.services import document_text
from app.settings import get_settings

PORTFOLIO = Path(__file__).resolve().parents[2] / "web" / "public" / "demo" / "portfolio-student1.pdf"


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


def test_REQ_VRANK_4_the_demo_portfolio_has_words_for_ai_match_to_read():
    """The demo portfolio is read once, at upload, by document_text; the words must survive for AI match (REQ-VRANK-4)."""
    assert "APTOS" in document_text.extract_text(PORTFOLIO.read_bytes())