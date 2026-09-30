"""Slice B. Self-proposed project review rules.  REQ-REVPROP-3.

The seeded cycle runs 18 Aug to 30 Sep 2026. prp-2 is submitted to sup-1.
"""

from datetime import UTC, datetime

from app.settings import get_settings


def _set_now(monkeypatch, when: datetime) -> None:
    monkeypatch.setattr(get_settings(), "demo_now", when)


def test_REQ_REVPROP_3_cannot_accept_after_cycle_closes(as_supervisor, monkeypatch):
    _set_now(monkeypatch, datetime(2026, 10, 1, 9, tzinfo=UTC))
    r = as_supervisor.post("/supervisor/proposals/prp-2/accept", json={})
    assert r.status_code == 422 and r.json()["code"] == "cycle_closed"


def test_REQ_REVPROP_3_cannot_accept_before_cycle_opens(as_supervisor, monkeypatch):
    _set_now(monkeypatch, datetime(2026, 8, 1, 9, tzinfo=UTC))
    r = as_supervisor.post("/supervisor/proposals/prp-2/accept", json={})
    assert r.status_code == 422 and r.json()["code"] == "cycle_closed"


def test_REQ_REVPROP_3_accept_allowed_inside_cycle(as_supervisor):
    """Positive control: the guard must not block a supervisor during the cycle."""
    r = as_supervisor.post("/supervisor/proposals/prp-2/accept", json={})
    assert r.status_code == 200 and r.json()["status"] == "accepted"


def test_REQ_REVPROP_3_decline_still_allowed_after_close(as_supervisor, monkeypatch):
    """SRS 4.18.3 restricts accepting only. Declining is not a registration action."""
    _set_now(monkeypatch, datetime(2026, 10, 1, 9, tzinfo=UTC))
    r = as_supervisor.post("/supervisor/proposals/prp-2/decline", json={})
    assert r.status_code == 200 and r.json()["status"] == "declined"
