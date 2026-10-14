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
from dataclasses import dataclass

from app.db.store import Store
from app.models import Notification, NotificationEvent, User
from app.settings import get_settings

log = logging.getLogger(__name__)

BATCH_LIMIT = 100  # Resend accepts at most 100 e-mails per batch call

FOOTER = (
    "URECAMatch: NTU URECA project matching. You're getting this because you have a URECAMatch account; "
    "it's also under Notifications in the app. This is an automated message, so replies aren't read."
)


@dataclass(frozen=True)
class Copy:
    """Fixed wording around the notification's own message. `link` is used when the notification has none."""

    next_step: str
    button: str
    link: str = "/"
    lead: str | None = None
    extra: str | None = None


Template = Callable[[Notification], Copy]


def _cycle_changed(n: Notification) -> Copy:
    return Copy(
        next_step="This may change the deadlines for applications, rankings and approvals. Sign in to check the current dates.",
        button="Open URECAMatch",
    )


def _matches_proposed(n: Notification) -> Copy:
    return Copy(
        next_step=(
            "Please review the students proposed for your listings and approve or reject each match. "
            "Students only hear their result once matches are published, so a quick decision keeps the round on schedule."
        ),
        button="Review matches",
        link="/approvals",
    )


def _offer_received(n: Notification) -> Copy:
    return Copy(
        lead="Good news: you've been matched to a URECA project.",
        next_step=(
            "Sign in to see the project and supervisor, then accept or decline. "
            "If you don't respond by the deadline, the offer expires."
        ),
        button="View my offer",
        link="/my-applications",
    )


def _proposal_decided(n: Notification) -> Copy:
    if n.link == "/proposals":  # the same event tells a supervisor about a new submission
        return Copy(
            lead="A student has sent you a research proposal:",
            next_step="Sign in to read it and accept or decline.",
            button="Review proposal",
            link="/proposals",
        )
    return Copy(
        next_step="Sign in to see the details and your next steps.", button="View my applications", link="/my-applications"
    )


def _fallback(n: Notification) -> Copy:
    return Copy(next_step="Sign in to see the details.", button="Open URECAMatch")


def _account_changed(n: Notification) -> Copy:
    return Copy(
        next_step="Sign in to see the details.",
        button="Open URECAMatch",
        extra="If you didn't expect this change, contact your URECA administrator.",
    )


# One template per NotificationEvent. The subject is always the notification title.
TEMPLATES: dict[NotificationEvent, Template] = {
    NotificationEvent.cycle_changed: _cycle_changed,
    NotificationEvent.round_opened: _fallback,
    NotificationEvent.results_published: _fallback,
    NotificationEvent.offer_received: _offer_received,
    NotificationEvent.matches_proposed: _matches_proposed,
    NotificationEvent.match_approved: _fallback,
    NotificationEvent.match_rejected: _fallback,
    NotificationEvent.proposal_decided: _proposal_decided,
    NotificationEvent.account_changed: _account_changed,
}

BUTTON_STYLE = (
    "display:inline-block;padding:10px 18px;background:#1a56db;color:#ffffff;"
    "text-decoration:none;border-radius:6px;font-weight:600"
)
FOOTER_STYLE = "color:#6b7280;font-size:12px"


def render(n: Notification, user: User | None = None) -> tuple[str, str, str]:
    """Subject, HTML body and plain-text body for one notification."""
    copy = TEMPLATES[n.event](n)
    url = get_settings().app_url.rstrip("/") + (n.link or copy.link)
    name = user.name.strip() if user else ""
    lines = [f"Hi {name}," if name else "Hi,", copy.lead, n.message, copy.next_step, copy.extra]
    lines = [line for line in lines if line]

    paragraphs = [f"<p>{html.escape(line)}</p>" for line in lines]
    paragraphs.append(f'<p><a href="{html.escape(url)}" style="{BUTTON_STYLE}">{html.escape(copy.button)}</a></p>')
    paragraphs.append(f'<p style="{FOOTER_STYLE}">{html.escape(FOOTER)}</p>')
    text = "\n\n".join([*lines, f"{copy.button}: {url}", "--", FOOTER])
    return n.title, "\n".join(paragraphs), text


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
        subject, body, text = render(n, user)
        messages.append({"from": settings.email_from, "to": [user.email], "subject": subject, "html": body, "text": text})
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
