"""E-mail for notifications (NFR 5.1.2: delivered within 15 minutes). Owner: slice E.

Only `notify()` calls this. EMAIL_MODE decides what happens:
  off   nothing (default; tests and local dev)
  log   print what would be sent
  send  deliver through Resend (production only)
A failed send is logged and never fails the request: the in-app notification is already stored.
"""

from __future__ import annotations

import html
import logging
from collections.abc import Callable

from app.db.store import Store
from app.models import Notification, NotificationEvent
from app.settings import get_settings

log = logging.getLogger(__name__)

BATCH_LIMIT = 100  # Resend accepts at most 100 e-mails per batch call

Template = Callable[[Notification], tuple[str, str]]  # notification -> (subject, plain-text body)


def _placeholder(n: Notification) -> tuple[str, str]:
    return f"URECAMatch: {n.title}", n.message


# One template per NotificationEvent. Placeholder copy until each owner supplies the final wording.
TEMPLATES: dict[NotificationEvent, Template] = {
    NotificationEvent.cycle_changed: _placeholder,  # TODO copy from slice D (Nicholas)
    NotificationEvent.round_opened: _placeholder,  # TODO copy from slice D (Nicholas)
    NotificationEvent.results_published: _placeholder,  # TODO copy from slice D (Nicholas)
    NotificationEvent.offer_received: _placeholder,  # TODO copy from slice D (Nicholas)
    NotificationEvent.matches_proposed: _placeholder,  # TODO copy from slice D (Nicholas)
    NotificationEvent.match_approved: _placeholder,  # TODO copy from slice D (Nicholas)
    NotificationEvent.match_rejected: _placeholder,  # TODO copy from slice D (Nicholas)
    NotificationEvent.proposal_decided: _placeholder,  # TODO copy from slice B (Robin)
    NotificationEvent.account_changed: _placeholder,  # TODO copy from slice A (Edwin)
}


def render(n: Notification) -> tuple[str, str]:
    """Subject and HTML body for one notification."""
    settings = get_settings()
    subject, text = TEMPLATES[n.event](n)
    body = f"<p>{html.escape(text)}</p>"
    if n.link:
        url = settings.app_url.rstrip("/") + n.link
        body += f'<p><a href="{html.escape(url)}">Open in URECAMatch</a></p>'
    return subject, body


def send_for(store: Store, notifications: list[Notification]) -> int:
    """E-mail each notification to its recipient. Returns how many e-mails were handed over."""
    settings = get_settings()
    if settings.email_mode == "off" or not notifications:
        return 0
    messages = []
    for n in notifications:
        user = store.user(n.user_id)
        if user is None:
            continue
        subject, body = render(n)
        messages.append({"from": settings.email_from, "to": [user.email], "subject": subject, "html": body})
    if settings.email_mode == "log":
        for m in messages:
            log.info("email (EMAIL_MODE=log) to=%s subject=%s", m["to"][0], m["subject"])
        return len(messages)
    if settings.email_mode != "send":
        log.warning("Unknown EMAIL_MODE %r; no e-mail sent", settings.email_mode)
        return 0
    if not settings.resend_api_key:
        log.error("EMAIL_MODE=send but RESEND_API_KEY is empty; no e-mail sent")
        return 0

    import resend

    resend.api_key = settings.resend_api_key
    sent = 0
    for i in range(0, len(messages), BATCH_LIMIT):
        chunk = messages[i : i + BATCH_LIMIT]
        try:
            resend.Batch.send(chunk)
            sent += len(chunk)
        except Exception:  # the in-app notification still stands
            log.exception("Resend batch of %d e-mails failed", len(chunk))
    return sent
