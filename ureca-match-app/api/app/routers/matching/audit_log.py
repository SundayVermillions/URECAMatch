"""Slice D: the audit log page. REQ-AUDIT-1..3. Entries are only ever written by services/audit.py."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.deps import AdminUser, StoreDep
from app.models import AuditEntry, AuditOperation

router = APIRouter(tags=["matching"])


@router.get("/admin/audit", response_model=list[AuditEntry])
def audit_log(
    admin: AdminUser,
    store: StoreDep,
    operation: AuditOperation | None = None,
    q: str | None = None,
    order: Literal["desc", "asc"] = "desc",
    limit: Annotated[int | None, Query(ge=1, le=500)] = None,
    cursor: str | None = None,
) -> list[AuditEntry]:
    """REQ-AUDIT-1: newest first (order=asc for oldest first), a page at a time: up to `limit` entries after the entry
    `cursor`, the id of the last one the page already shows. `q` searches the names, notes and who did it. Entries are
    never changed (REQ-AUDIT-2); readable names for the records they affect are added to the copies sent out, from one
    read of each table they come from, however long the log is."""
    entries = sorted(
        (e for e in store.audit if operation is None or e.operation == operation),
        key=lambda e: (e.timestamp, e.id),
        reverse=order == "desc",
    )
    describe = _describer(store)

    def labelled(e: AuditEntry) -> AuditEntry:
        return e.model_copy(update={"affected_labels": [describe(rid) for rid in e.affected_records]})

    needle = (q or "").strip().lower()
    rows = [x for x in map(labelled, entries) if needle in _audit_text(x)] if needle else entries
    if cursor is not None:
        at = next((i for i, e in enumerate(rows) if e.id == cursor), None)
        rows = rows[at + 1 :] if at is not None else []
    page = rows[:limit] if limit else rows
    return page if needle else [labelled(e) for e in page]  # only the page is labelled when nothing is searched


def _describer(store):
    """What an admin reads for a record id: "student → project" for a match, a round, a cycle, a person or a project,
    in that order of precedence. Each table is read once, here, not once per record."""
    cycles = store.cycles
    names = {lst.id: lst.title for lst in store.all_listings()}
    names |= {u.id: u.name for u in store.users}
    names |= {r.id: f"Round {r.number}, {c.academic_year}" for c in cycles for r in c.rounds}
    names |= {c.id: c.academic_year for c in cycles}
    names |= {m.id: f"{m.student_name} → {m.listing_title}" for m in store.matches}
    return lambda record_id: names.get(record_id, record_id)  # an unassigned match is gone; its note says what it was


def _audit_text(e: AuditEntry) -> str:
    """What the Audit Log search looks in: the names of the records, the note and who did it."""
    return " ".join([" ".join(e.affected_labels or e.affected_records), e.note or "", e.actor_name]).lower()
