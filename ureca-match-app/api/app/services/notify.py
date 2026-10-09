"""Notifications (REQ-NOTIF-1, 2). Owner: slice E.

Every slice calls `notify(...)`; nobody inserts into the notifications table directly.
After storing, each notification is e-mailed to its recipient (services/email.py, NFR 5.1.2).
"""

from __future__ import annotations

from datetime import datetime

from app.db.store import Store
from app.models import Notification, NotificationEvent
from app.services import email


def notify(
    store: Store, user_ids: list[str], event: NotificationEvent, title: str, message: str, now: datetime, link: str | None = None
) -> list[Notification]:
    created = [
        Notification(id=store.next_id("ntf"), user_id=uid, event=event, title=title, message=message, created_at=now, link=link)
        for uid in user_ids
    ]
    store.save_notifications(*created)
    email.send_for(store, created)
    return created
