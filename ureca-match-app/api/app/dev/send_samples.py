"""Send one sample of every e-mail the app can send, to an address you give. Developer tool.

    uv run python -m app.dev.send_samples you@example.com

Needs EMAIL_MODE=smtp (with Mailpit running, see docs/SETUP.md) or EMAIL_MODE=log. It refuses to run in any other
mode, so it can never send real e-mail. The samples go through the same render and send code the app uses.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime

from app.models import AccountStatus, Notification, NotificationEvent, Role, User
from app.services import email
from app.settings import get_settings

ALLOWED_MODES = ("smtp", "log")
SAMPLE_TIME = datetime(2026, 9, 7, 10, 0, tzinfo=UTC)

# (event, title, message, link). Wording follows what the routers send. A proposal e-mail has two forms: the
# supervisor's link is /proposals, the student's is /my-applications.
SAMPLES: list[tuple[NotificationEvent, str, str, str | None]] = [
    (NotificationEvent.cycle_changed, "Application cycle dates changed", "The cycle now closes on 2 Oct, 5:00 pm SGT.", None),
    (NotificationEvent.round_opened, "Round 2 is open", "Applications for Round 2 close on 12 Sep, 5:00 pm SGT.", "/browse"),
    (
        NotificationEvent.matches_proposed,
        "Round 2: 3 students matched to your projects",
        "They are offered a place unless you decline them by 14 Sep, 5:00 pm SGT.",
        "/approvals",
    ),
    (
        NotificationEvent.match_approved,
        "A match was approved",
        "Your match to Deep Learning for Medical Images was approved.",
        None,
    ),
    (
        NotificationEvent.match_rejected,
        "Your project placement was withdrawn",
        "The URECA office removed your match to Deep Learning for Medical Images. Reason: the project is full.",
        "/my-applications",
    ),
    (
        NotificationEvent.offer_received,
        "You have a match offer",
        "Respond by 21 Sep, 5:00 pm SGT. You cannot apply to other projects while this offer is open.",
        "/my-applications",
    ),
    (
        NotificationEvent.results_published,
        "Round 2 results are out",
        "You were not matched to a project in Round 2. You can apply again in Round 3.",
        "/my-applications",
    ),
    (
        NotificationEvent.proposal_decided,
        "Your proposal was accepted",
        "Prof. Marcus Chua accepted Edge AI for Wearables. You are registered to the project.",
        "/my-applications",
    ),
    (
        NotificationEvent.proposal_decided,
        "New research proposal",
        "Wei Ling Tan sent you a proposal: Edge AI for Wearables.",
        "/proposals",
    ),
    (NotificationEvent.account_changed, "Your account was updated", "Your account is now inactive.", None),
]


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    settings = get_settings()
    if settings.email_mode not in ALLOWED_MODES or settings.is_production:
        print(f"Refusing to run: EMAIL_MODE is {settings.email_mode!r}. Set EMAIL_MODE=smtp (or log) in api/.env first.")
        return 1
    if len(args) != 1 or "@" not in args[0]:
        print("Usage: uv run python -m app.dev.send_samples you@example.com")
        return 2
    to = args[0]
    user = User(
        id="sample", email=to, name="Sample Tester", role=Role.student, status=AccountStatus.active, created_at=SAMPLE_TIME
    )

    messages = []
    for i, (event, title, message, link) in enumerate(SAMPLES, 1):
        n = Notification(
            id=f"sample-{i}", user_id=user.id, event=event, title=title, message=message, created_at=SAMPLE_TIME, link=link
        )
        subject, body, text = email.render(n, user)
        messages.append({"from": settings.email_from, "to": [to], "subject": subject, "html": body, "text": text})
    subject, body, text = email.render_verification_code(user.name, "123456")
    messages.append({"from": settings.email_from, "to": [to], "subject": subject, "html": body, "text": text})

    sent = email.deliver(messages)
    print(f"Sent {sent} of {len(messages)} sample e-mails to {to} (EMAIL_MODE={settings.email_mode}).")
    return 0 if sent == len(messages) else 1


if __name__ == "__main__":
    raise SystemExit(main())
