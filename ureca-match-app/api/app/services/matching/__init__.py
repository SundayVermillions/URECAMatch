"""Slice D: matching. algorithm.py is the stable-matching algorithm itself, a pure function. run.py runs it for a round
once the review window has closed (REQ-EXEC-1..4), and publish.py publishes the round's results once the approval
window has closed (REQ-PUB-1..3). services/schedule.py decides when each one runs. This module holds what they share.
"""

from __future__ import annotations

from app.models import AccountStatus, NotificationEvent, Role

# notify() arguments queued by a scheduled step and sent once the lock is released, so other requests do not wait on
# e-mail: (user ids, event, title, message, link).
Outbox = list[tuple[list[str], NotificationEvent, str, str, str]]


def active_admins(users: list) -> list[str]:
    return [u.id for u in users if u.role == Role.admin and u.status == AccountStatus.active]
