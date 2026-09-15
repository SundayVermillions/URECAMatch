"""Audit log (REQ-AUDIT-1, 2). Owner: slice E, written by slice D.

Append only. The Supabase table has a trigger that rejects UPDATE and DELETE (supabase/schema.sql).
"""

from __future__ import annotations

from datetime import datetime

from app.db.store import Store
from app.models import AuditEntry, AuditOperation, User


def audit(
    store: Store, actor: User, operation: AuditOperation, affected: list[str], now: datetime, note: str | None = None
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
    store.audit.append(entry)
    return entry
