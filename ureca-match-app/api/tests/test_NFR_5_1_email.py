"""Slice E. NFR 5.1.2: every notification is also e-mailed. The Resend client is mocked; nothing is sent."""

import pytest
import resend

from app.models import NotificationEvent
from app.services import email
from app.services.notify import notify
from app.settings import get_settings


@pytest.fixture
def sent(monkeypatch):
    calls: list[list[dict]] = []
    monkeypatch.setattr(resend.Batch, "send", lambda params, options=None: calls.append(params))
    monkeypatch.setattr(get_settings(), "resend_api_key", "test-key")
    return calls


def test_NFR_5_1_2_email_dispatched_on_notify(fresh_store, sent, monkeypatch):
    monkeypatch.setattr(get_settings(), "email_mode", "send")
    created = notify(
        fresh_store,
        ["stu-1", "sup-1"],
        NotificationEvent.round_opened,
        "Round 2 open",
        "Apply by 14 Sep.",
        get_settings().now(),
        link="/browse",
    )
    assert len(created) == 2 and len(sent) == 1
    to = [m["to"][0] for m in sent[0]]
    assert to == [fresh_store.user("stu-1").email, fresh_store.user("sup-1").email]
    assert "Round 2 open" in sent[0][0]["subject"]
    assert "/browse" in sent[0][0]["html"]


@pytest.mark.parametrize("mode", ["off", "log"])
def test_NFR_5_1_2_no_send_unless_mode_is_send(fresh_store, sent, monkeypatch, mode):
    monkeypatch.setattr(get_settings(), "email_mode", mode)
    notify(fresh_store, ["stu-1"], NotificationEvent.cycle_changed, "t", "m", get_settings().now())
    assert sent == []


def test_NFR_5_1_2_failed_send_keeps_notification(fresh_store, monkeypatch, as_student):
    def boom(params, options=None):
        raise RuntimeError("Resend down")

    monkeypatch.setattr(resend.Batch, "send", boom)
    monkeypatch.setattr(get_settings(), "resend_api_key", "test-key")
    monkeypatch.setattr(get_settings(), "email_mode", "send")
    notify(fresh_store, ["stu-1"], NotificationEvent.cycle_changed, "Still stored", "m", get_settings().now())
    assert any(n["title"] == "Still stored" for n in as_student.get("/me/notifications").json())


def test_NFR_5_1_2_every_event_has_a_template():
    assert set(email.TEMPLATES) == set(NotificationEvent)
