"""Audit log (REQ-AUDIT-1, 2, 3). Owner: slice E, written by slice D.

Append only. The Supabase table has a trigger that rejects UPDATE and DELETE (supabase/schema.sql).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, NamedTuple

from app.models import AuditEntry, AuditOperation, User

if TYPE_CHECKING:  # the seed imports SYSTEM, and the store imports the seed
    from app.db.store import Store


class Actor(NamedTuple):
    id: str
    name: str


# REQ-AUDIT-3: actions the system takes on its own, such as running matching when a review window ends.
# Not a sign-in account: schema.sql adds an inactive "system" row only so audit_log.actor_id has a user to point at.
SYSTEM = Actor("system", "System")


def audit(
    store: Store, actor: User | Actor, operation: AuditOperation, affected: list[str], now: datetime, note: str | None = None
) -> AuditEntry:
    entry = AuditEntry(
        id=store.next_id("aud"),
        operation=operation,
        actor_id=actor.id,
        actor_name=actor.name,
        timestamp=now,
        affected_records=affected,
        note=note,
    )
    store.add_audit(entry)
    return entry
