"""Slice B. Optional project details on a listing: what the student will do, skills, hours, mode,
a gallery of up to 4 photos and one YouTube or Vimeo video.  REQ-PROJ-1, REQ-PROJ-2.

sup-1 owns lst-1..3; lst-1 is seeded with every detail and 3 photos. lst-4 belongs to sup-2.
"""

from datetime import UTC, datetime

import pytest

from app.settings import get_settings
from tests.test_REQ_PROJ import new_listing

PNG = ("photo.png", b"\x89PNG\r\n\x1a\n" + b"0" * 64, "image/png")


def test_REQ_PROJ_1_details_are_saved_and_shown_to_students(as_supervisor, as_student):
    r = as_supervisor.post(
        "/supervisor/listings",
        json=new_listing(outcomes=" Build a model. ", skills="PyTorch", hours_per_week=8, mode="hybrid"),
    )
    assert r.status_code == 201
    seen = as_student.get(f"/listings/{r.json()['id']}").json()
    assert (seen["outcomes"], seen["skills"], seen["hours_per_week"], seen["mode"]) == ("Build a model.", "PyTorch", 8, "hybrid")


def test_REQ_PROJ_1_details_are_optional(as_supervisor):
    r = as_supervisor.post("/supervisor/listings", json=new_listing())
    assert r.status_code == 201
    assert r.json()["outcomes"] == "" and r.json()["hours_per_week"] is None and r.json()["gallery_urls"] == []


@pytest.mark.parametrize("hours", [0, 41])
def test_REQ_PROJ_1_hours_per_week_between_1_and_40(as_supervisor, hours):
    r = as_supervisor.post("/supervisor/listings", json=new_listing(hours_per_week=hours))
    assert r.status_code == 422 and r.json()["field"] == "hours_per_week"


@pytest.mark.parametrize(
    "url, stored",
    [
        ("https://www.youtube.com/watch?v=aircAruvnKk&t=30s", "https://www.youtube.com/watch?v=aircAruvnKk"),
        ("youtu.be/aircAruvnKk", "https://www.youtube.com/watch?v=aircAruvnKk"),
        ("https://youtube.com/shorts/aircAruvnKk", "https://www.youtube.com/watch?v=aircAruvnKk"),
        ("https://vimeo.com/76979871", "https://vimeo.com/76979871"),
    ],
)
def test_REQ_PROJ_1_video_link_stored_in_one_form(as_supervisor, url, stored):
    r = as_supervisor.post("/supervisor/listings", json=new_listing(video_url=url))
    assert r.status_code == 201 and r.json()["video_url"] == stored


@pytest.mark.parametrize("url", ["https://example.com/video.mp4", "javascript:alert(1)", "https://youtube.com/watch?v=short"])
def test_REQ_PROJ_1_only_youtube_or_vimeo(as_supervisor, url):
    r = as_supervisor.post("/supervisor/listings", json=new_listing(video_url=url))
    assert r.status_code == 422 and r.json()["code"] == "video_not_supported"


def test_REQ_PROJ_2_null_clears_hours_mode_and_video(as_supervisor):
    r = as_supervisor.put("/supervisor/listings/lst-1", json={"hours_per_week": None, "mode": None, "video_url": ""})
    assert r.status_code == 200
    assert (r.json()["hours_per_week"], r.json()["mode"], r.json()["video_url"]) == (None, None, None)


def test_REQ_PROJ_2_leaving_details_out_keeps_them(as_supervisor):
    r = as_supervisor.put("/supervisor/listings/lst-1", json={"title": "A new title for the project"})
    assert r.json()["hours_per_week"] == 8 and r.json()["video_url"]


# ---------------------------------------------------------------- gallery


def test_REQ_PROJ_2_add_and_remove_photos(as_supervisor):
    before = as_supervisor.get("/listings/lst-2").json()["gallery_urls"]
    r = as_supervisor.post("/supervisor/listings/lst-2/gallery", files={"file": PNG})
    assert r.status_code == 200 and r.json()["gallery_urls"][:-1] == before  # added at the end
    added = r.json()["gallery_urls"][-1]
    r = as_supervisor.delete("/supervisor/listings/lst-2/gallery/0")
    assert r.status_code == 200 and r.json()["gallery_urls"] == [*before[1:], added]


def test_REQ_PROJ_2_at_most_four_photos(as_supervisor):
    assert as_supervisor.post("/supervisor/listings/lst-1/gallery", files={"file": PNG}).status_code == 200  # 4th
    r = as_supervisor.post("/supervisor/listings/lst-1/gallery", files={"file": PNG})
    assert r.status_code == 422 and r.json()["code"] == "gallery_full"


def test_REQ_PROJ_7_photos_must_be_images(as_supervisor):
    r = as_supervisor.post("/supervisor/listings/lst-2/gallery", files={"file": ("notes.pdf", b"%PDF", "application/pdf")})
    assert r.status_code == 422 and r.json()["code"] == "not_image"


def test_REQ_PROJ_2_only_the_owner_changes_photos(client_for):
    other = client_for("sup-2")
    assert other.post("/supervisor/listings/lst-1/gallery", files={"file": PNG}).status_code == 404
    assert other.delete("/supervisor/listings/lst-1/gallery/0").status_code == 404


def test_REQ_PROJ_2_removing_a_missing_photo_is_404(as_supervisor):
    assert as_supervisor.delete("/supervisor/listings/lst-1/gallery/9").status_code == 404


def test_REQ_PROJ_2_no_photo_changes_after_cycle_closes(as_supervisor, monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_now", datetime(2026, 10, 5, 9, tzinfo=UTC))
    r = as_supervisor.post("/supervisor/listings/lst-1/gallery", files={"file": PNG})
    assert r.status_code == 422 and r.json()["code"] == "cycle_closed"


def test_REQ_PROJ_mock_mode_uploaded_images_still_show(as_supervisor):
    """The mock API stores nothing, so a path like /covers/x.jpg would be a broken image. It carries the picture instead."""
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    r = as_supervisor.post("/supervisor/listings/lst-1/cover", files={"file": ("c.png", png, "image/png")})
    assert r.status_code == 200 and r.json()["cover_url"].startswith("data:image/png;base64,")
    r = as_supervisor.post("/supervisor/listings/lst-1/gallery", files={"file": ("g.png", png, "image/png")})
    assert r.json()["gallery_urls"][-1].startswith("data:image/png;base64,")
