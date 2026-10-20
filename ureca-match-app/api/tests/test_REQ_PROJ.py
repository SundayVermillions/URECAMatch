"""Slice B. Supervisor listings.  REQ-PROJ-1..3.

Seeded cycle: opens 18 Aug 2026, closes 2 Oct 2026. Demo clock 7 Sep (inside the cycle).
sup-1 owns lst-1..3. lst-4 belongs to sup-2. lst-6 (sup-3) has 2 of 3 slots filled.
"""

from datetime import UTC, datetime

from app.settings import get_settings

BEFORE_CYCLE = datetime(2026, 8, 1, 9, tzinfo=UTC)
AFTER_CLOSE = datetime(2026, 10, 5, 9, tzinfo=UTC)


def _at(monkeypatch, when: datetime) -> None:
    monkeypatch.setattr(get_settings(), "demo_now", when)


def new_listing(**over):
    b = {
        "title": "Graph Learning for Traffic Forecasting",
        "description": "Build a spatio-temporal graph model on Singapore traffic data and compare it with baselines.",
        "prerequisites": ["SC4001"],
        "topic_tags": ["Machine Learning"],
        "available_slots": 2,
        "offering_faculty": "CCDS",
        "research_location": "N4-02c",
        "publish": True,
    }
    b.update(over)
    return b


# ---------------------------------------------------------------- REQ-PROJ-1


def test_REQ_PROJ_1_publish_during_cycle_is_visible_to_students(as_supervisor, as_student):
    r = as_supervisor.post("/supervisor/listings", json=new_listing())
    assert r.status_code == 201 and r.json()["status"] == "published"
    assert r.json()["id"] in {lst["id"] for lst in as_student.get("/listings").json()}


def test_REQ_PROJ_1_publish_before_cycle_opens(as_supervisor, monkeypatch):
    _at(monkeypatch, BEFORE_CYCLE)
    r = as_supervisor.post("/supervisor/listings", json=new_listing())
    assert r.status_code == 201 and r.json()["status"] == "published"


def test_REQ_PROJ_1_cannot_publish_after_cycle_closes(as_supervisor, monkeypatch):
    _at(monkeypatch, AFTER_CLOSE)
    r = as_supervisor.post("/supervisor/listings", json=new_listing())
    assert r.status_code == 422 and r.json()["code"] == "cycle_closed"


def test_REQ_PROJ_1_draft_is_hidden_from_students(as_supervisor, as_student):
    r = as_supervisor.post("/supervisor/listings", json=new_listing(publish=False))
    assert r.status_code == 201 and r.json()["status"] == "draft"
    assert r.json()["id"] not in {lst["id"] for lst in as_student.get("/listings").json()}


def test_REQ_PROJ_1_draft_can_be_published_later(as_supervisor, as_student):
    lid = as_supervisor.post("/supervisor/listings", json=new_listing(publish=False)).json()["id"]
    r = as_supervisor.put(f"/supervisor/listings/{lid}", json={"publish": True})
    assert r.status_code == 200 and r.json()["status"] == "published"
    assert lid in {lst["id"] for lst in as_student.get("/listings").json()}


def test_REQ_PROJ_1_students_cannot_create_listings(as_student):
    assert as_student.post("/supervisor/listings", json=new_listing()).status_code == 403


# ---------------------------------------------------------------- REQ-PROJ-2


def test_REQ_PROJ_2_update_before_closing_date(as_supervisor):
    r = as_supervisor.put("/supervisor/listings/lst-2", json={"title": "A clearer title for this project"})
    assert r.status_code == 200 and r.json()["title"] == "A clearer title for this project"


def test_REQ_PROJ_2_update_after_closing_date_rejected(as_supervisor, monkeypatch):
    _at(monkeypatch, AFTER_CLOSE)
    r = as_supervisor.put("/supervisor/listings/lst-2", json={"title": "A clearer title for this project"})
    assert r.status_code == 422 and r.json()["code"] == "cycle_closed"


def test_REQ_PROJ_2_title_cannot_be_blanked(as_supervisor):
    r = as_supervisor.put("/supervisor/listings/lst-2", json={"title": "  "})
    assert r.status_code == 422 and r.json()["field"] == "title"


def test_REQ_PROJ_2_cannot_edit_another_supervisors_listing(as_supervisor):
    assert as_supervisor.put("/supervisor/listings/lst-4", json={"title": "Not my project at all"}).status_code == 403


# ---------------------------------------------------------------- REQ-PROJ-3


def test_REQ_PROJ_3_slots_cannot_go_below_matched_students(client_for):
    sup3 = client_for("sup-3")
    r = sup3.put("/supervisor/listings/lst-6", json={"available_slots": 1})
    assert r.status_code == 422 and r.json()["code"] == "slots_below_matched"
    assert sup3.put("/supervisor/listings/lst-6", json={"available_slots": 2}).status_code == 200


# ---------------------------------------------------------------- cover images (part of editing a listing)

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def test_REQ_PROJ_2_cover_upload_sets_cover_url(as_supervisor):
    r = as_supervisor.post("/supervisor/listings/lst-2/cover", files={"file": ("cover.png", PNG, "image/png")})
    assert r.status_code == 200, r.text
    assert "lst-2.png" in r.json()["cover_url"]


def test_REQ_PROJ_2_cover_must_be_jpeg_or_png(as_supervisor):
    r = as_supervisor.post("/supervisor/listings/lst-2/cover", files={"file": ("cover.gif", b"GIF89a", "image/gif")})
    assert r.status_code == 422 and r.json()["field"] == "file"


def test_REQ_PROJ_2_cover_over_5mb_rejected(as_supervisor):
    big = PNG + b"0" * (5 * 1024 * 1024)
    r = as_supervisor.post("/supervisor/listings/lst-2/cover", files={"file": ("cover.png", big, "image/png")})
    assert r.status_code == 422 and r.json()["code"] == "too_large"


def test_REQ_PROJ_2_cover_only_for_own_listing(as_supervisor):
    r = as_supervisor.post("/supervisor/listings/lst-4/cover", files={"file": ("cover.png", PNG, "image/png")})
    assert r.status_code == 404


def test_REQ_PROJ_2_cover_change_after_closing_date_rejected(as_supervisor, monkeypatch):
    _at(monkeypatch, AFTER_CLOSE)
    r = as_supervisor.post("/supervisor/listings/lst-2/cover", files={"file": ("cover.png", PNG, "image/png")})
    assert r.status_code == 422 and r.json()["code"] == "cycle_closed"
