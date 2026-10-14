"""Slice E. E-mail copy for each notification event (REQ-NOTIF-1, NFR 5.1.2). Nothing is sent."""

import html

import pytest
import resend

from app.models import AccountStatus, Notification, NotificationEvent, Role, User
from app.services import email
from app.services.notify import notify
from app.settings import get_settings

APP_URL = "https://ureca-match-web.vercel.app"


@pytest.fixture(autouse=True)
def app_url(monkeypatch):
    monkeypatch.setattr(get_settings(), "app_url", APP_URL + "/")  # trailing slash must not double up


def note(event: NotificationEvent, title="Title", message="Message", link: str | None = None) -> Notification:
    return Notification(
        id="ntf-t", user_id="stu-1", event=event, title=title, message=message, created_at=get_settings().now(), link=link
    )


def person(name: str) -> User:
    return User(
        id="stu-1",
        email="a@e.ntu.edu.sg",
        name=name,
        role=Role.student,
        status=AccountStatus.active,
        created_at=get_settings().now(),
    )


def button(html_body: str, label: str, url: str) -> bool:
    return f'href="{url}"' in html_body and f">{label}</a>" in html_body


CASES = [
    # event, router link, button label, expected path, wording that must appear
    (NotificationEvent.cycle_changed, None, "Open URECAMatch", "/", "Sign in to check the current dates."),
    (NotificationEvent.matches_proposed, "/approvals", "Review matches", "/approvals", "approve or reject each match"),
    (NotificationEvent.offer_received, "/my-applications", "View my offer", "/my-applications", "the offer expires"),
    (
        NotificationEvent.proposal_decided,
        "/proposals",
        "Review proposal",
        "/proposals",
        "Sign in to read it and accept or decline.",
    ),
    (
        NotificationEvent.proposal_decided,
        "/my-applications",
        "View my applications",
        "/my-applications",
        "Sign in to see the details and your next steps.",
    ),
    (NotificationEvent.round_opened, "/browse", "Open URECAMatch", "/browse", "Sign in to see the details."),
    (NotificationEvent.account_changed, None, "Open URECAMatch", "/", "contact your URECA administrator"),
]


@pytest.mark.parametrize(("event", "link", "label", "path", "wording"), CASES)
def test_REQ_NOTIF_email_template_per_event(event, link, label, path, wording):
    subject, body, text = email.render(note(event, title="The title", link=link), person("Tan Wei Ming"))
    assert subject == "The title"
    assert button(body, label, APP_URL + path)
    assert html.escape(wording) in body and wording in text
    assert f"{label}: {APP_URL}{path}" in text
    assert html.escape(email.FOOTER) in body and email.FOOTER in text


def test_REQ_NOTIF_email_leads():
    _, offer, _ = email.render(note(NotificationEvent.offer_received, link="/my-applications"))
    assert html.escape("Good news: you've been matched to a URECA project.") in offer
    _, proposal, _ = email.render(note(NotificationEvent.proposal_decided, link="/proposals"))
    assert "A student has sent you a research proposal:" in proposal
    _, decision, _ = email.render(note(NotificationEvent.proposal_decided, link="/my-applications"))
    assert "research proposal" not in decision


def test_REQ_NOTIF_email_cycle_changed_links_to_home():
    _, body, text = email.render(note(NotificationEvent.cycle_changed, link=None))
    assert f'href="{APP_URL}/"' in body
    assert f"Open URECAMatch: {APP_URL}/" in text


def test_REQ_NOTIF_email_greeting_with_and_without_name():
    _, body, text = email.render(note(NotificationEvent.cycle_changed), person("Tan Wei Ming"))
    assert "<p>Hi Tan Wei Ming,</p>" in body and text.startswith("Hi Tan Wei Ming,")
    for nobody in (None, person("  ")):
        _, body, text = email.render(note(NotificationEvent.cycle_changed), nobody)
        assert "<p>Hi,</p>" in body and text.startswith("Hi,\n")


def test_REQ_NOTIF_email_escapes_dynamic_values():
    message = "Prof. Chua declined Robots. Note: <script>alert(1)</script>"  # same shape as proposals.decline
    _, body, text = email.render(
        note(NotificationEvent.proposal_decided, title="Your proposal was declined", message=message, link='/x"><b>'),
        person("<b>Eve</b>"),
    )
    assert "<script>" not in body and "&lt;script&gt;alert(1)&lt;/script&gt;" in body
    assert "<b>" not in body and "Hi &lt;b&gt;Eve&lt;/b&gt;," in body
    assert f'href="{APP_URL}/x&quot;&gt;&lt;b&gt;"' in body
    assert message in text  # plain text is not HTML, so it stays as written


def test_REQ_NOTIF_email_sends_html_and_text(fresh_store, monkeypatch):
    calls: list[list[dict]] = []
    monkeypatch.setattr(resend.Batch, "send", lambda params, options=None: calls.append(params))
    monkeypatch.setattr(get_settings(), "resend_api_key", "test-key")
    monkeypatch.setattr(get_settings(), "email_mode", "send")
    notify(
        fresh_store,
        ["stu-1"],
        NotificationEvent.offer_received,
        "You have a match offer",
        "Respond by 21 Sep.",
        get_settings().now(),
        "/my-applications",
    )
    [m] = calls[0]
    assert m["subject"] == "You have a match offer"
    assert m["html"].startswith(f"<p>Hi {fresh_store.user('stu-1').name},</p>")
    assert (
        m["text"].startswith(f"Hi {fresh_store.user('stu-1').name},") and f"View my offer: {APP_URL}/my-applications" in m["text"]
    )
