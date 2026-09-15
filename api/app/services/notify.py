"""Notifications (REQ-NOTIF-1, 2). Owner: slice E.

Every slice calls `notify(...)`; nobody inserts into the notifications table directly.
TODO(slice E): persist to Supabase and dispatch e-mail (Resend) within 15 minutes (NFR 5.1.2).
"""

from __future__ import annotations

from datetime import datetime

from app.db.store import Store
from app.models import Notification, NotificationEvent


def notify(
    store: Store, user_ids: list[str], event: NotificationEvent, title: str, message: str, now: datetime, link: str | None = None
) -> list[Notification]:
    created = []
    for uid in user_ids:
        n = Notification(
            id=store.next_id("ntf"), user_id=uid, event=event, title=title, message=message, created_at=now, link=link
        )
        store.notifications.append(n)
        created.append(n)
    # TODO(slice E): queue e-mail delivery here.
    return created
