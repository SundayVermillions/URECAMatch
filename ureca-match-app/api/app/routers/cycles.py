"""Slice D: application cycle and matching rounds.  REQ-CYCLE-1..3, REQ-ROUND-1..3."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter

from app.deps import AdminUser, CurrentUser, SettingsDep, StoreDep
from app.errors import conflict, invalid, not_found
from app.models import (
    AuditOperation,
    Cycle,
    CycleCreate,
    CycleStatus,
    CycleUpdate,
    NotificationEvent,
    Role,
    Round,
    RoundStatus,
    RoundsUpdate,
)
from app.services.audit import audit
from app.services.notify import notify

router = APIRouter(tags=["admin: cycle"])


def _overlaps(c: Cycle, opening: datetime, closing: datetime) -> bool:
    return c.opening_date <= closing and opening <= c.closing_date


@router.get("/cycle", response_model=Cycle | None)
def current_cycle(user: CurrentUser, store: StoreDep) -> Cycle | None:
    return store.cycle


@router.get("/admin/cycles", response_model=list[Cycle])
def list_cycles(admin: AdminUser, store: StoreDep) -> list[Cycle]:
    """Cycle history, newest first, so admins can browse past cycles (REQ-CYCLE-1)."""
    return sorted(store.cycles, key=lambda c: c.opening_date, reverse=True)


@router.get("/admin/cycles/{cycle_id}", response_model=Cycle)
def get_cycle(cycle_id: str, admin: AdminUser, store: StoreDep) -> Cycle:
    c = store.cycle_by_id(cycle_id)
    if c is None:
        raise not_found("Cycle")
    return c


@router.post("/admin/cycles", response_model=Cycle, status_code=201)
def create_cycle(body: CycleCreate, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Cycle:
    if store.cycle is not None:  # REQ-CYCLE-1: at most one active cycle at a time
        raise conflict("cycle_active", "Close the current cycle before creating a new one.")
    if body.closing_date <= body.opening_date:
        raise invalid("bad_dates", "Closing date must be after the opening date.", "closing_date")
    clash = next((c for c in store.cycles if _overlaps(c, body.opening_date, body.closing_date)), None)
    if clash is not None:  # cycles must not overlap in time
        raise conflict("cycle_overlap", f"These dates overlap the {clash.academic_year} cycle. Cycles cannot overlap.")
    cycle = Cycle(
        id=store.next_id("cyc"),
        academic_year=body.academic_year,
        opening_date=body.opening_date,
        closing_date=body.closing_date,
        pre_application_days=body.pre_application_days,
        status=CycleStatus.draft,
        rounds=[],
    )
    store.cycles.append(cycle)
    audit(store, admin, AuditOperation.cycle_updated, [cycle.id], settings.now(), "created")
    return cycle


@router.post("/admin/cycles/{cycle_id}/close", response_model=Cycle)
def close_cycle(cycle_id: str, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Cycle:
    """Close a cycle. It stays in the history and can be reopened later (REQ-CYCLE-1)."""
    c = store.cycle_by_id(cycle_id)
    if c is None:
        raise not_found("Cycle")
    if c.status == CycleStatus.closed:
        raise conflict("already_closed", "This cycle is already closed.")
    c.status = CycleStatus.closed
    now = settings.now()
    audit(store, admin, AuditOperation.cycle_updated, [c.id], now, "closed")
    affected = [u.id for u in store.users if u.role in (Role.student, Role.supervisor)]
    notify(
        store,
        affected,
        NotificationEvent.cycle_changed,
        "Application cycle closed",
        f"The {c.academic_year} cycle is now closed.",
        now,
    )
    return c


@router.post("/admin/cycles/{cycle_id}/reopen", response_model=Cycle)
def reopen_cycle(cycle_id: str, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Cycle:
    """Reopen a closed cycle. Only one cycle may be active at a time (REQ-CYCLE-1)."""
    c = store.cycle_by_id(cycle_id)
    if c is None:
        raise not_found("Cycle")
    if c.status != CycleStatus.closed:
        raise conflict("not_closed", "This cycle is already open.")
    active = store.cycle
    if active is not None:
        raise conflict("cycle_active", f"Close the {active.academic_year} cycle before reopening another.")
    c.status = CycleStatus.in_progress
    now = settings.now()
    audit(store, admin, AuditOperation.cycle_updated, [c.id], now, "reopened")
    affected = [u.id for u in store.users if u.role in (Role.student, Role.supervisor)]
    notify(
        store,
        affected,
        NotificationEvent.cycle_changed,
        "Application cycle reopened",
        f"The {c.academic_year} cycle has reopened.",
        now,
    )
    return c


@router.put("/admin/cycles/{cycle_id}", response_model=Cycle)
def update_cycle(cycle_id: str, body: CycleUpdate, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Cycle:
    c = store.cycle_by_id(cycle_id)
    if c is None:
        raise not_found("Cycle")
    now = settings.now()
    if body.opening_date and c.opening_date <= now:  # REQ-CYCLE-2
        raise invalid("date_passed", "The opening date has passed and can no longer be changed.", "opening_date")
    if body.closing_date and c.closing_date <= now:
        raise invalid("date_passed", "The closing date has passed and can no longer be changed.", "closing_date")
    closing_changed = body.closing_date is not None and body.closing_date != c.closing_date
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(c, k, v)
    if closing_changed:  # REQ-CYCLE-3
        affected = [u.id for u in store.users if u.role in (Role.student, Role.supervisor)]
        notify(
            store,
            affected,
            NotificationEvent.cycle_changed,
            "Application cycle dates changed",
            f"The cycle now closes on {c.closing_date:%d %b %Y}.",
            now,
        )
    audit(store, admin, AuditOperation.cycle_updated, [c.id], now)
    return c


@router.put("/admin/cycles/{cycle_id}/rounds", response_model=Cycle)
def set_rounds(cycle_id: str, body: RoundsUpdate, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Cycle:
    """Derive round dates from the configured window lengths (REQ-ROUND-1) and validate (REQ-ROUND-3)."""
    c = store.cycle_by_id(cycle_id)
    if c is None:
        raise not_found("Cycle")
    now = settings.now()
    existing = {r.number: r for r in c.rounds}
    cursor = c.opening_date + timedelta(days=c.pre_application_days)
    rounds: list[Round] = []
    for spec in sorted(body.rounds, key=lambda s: s.number):
        old = existing.get(spec.number)
        if old and old.application_start <= now:  # REQ-ROUND-2: only future rounds change
            rounds.append(old)
            cursor = old.review_end + timedelta(days=4)
            continue
        app_start = cursor
        app_end = app_start + timedelta(days=spec.application_days) - timedelta(seconds=1)
        rev_start = app_start + timedelta(days=spec.application_days)
        rev_end = rev_start + timedelta(days=spec.review_days) - timedelta(seconds=1)
        if rev_end > c.closing_date:  # REQ-ROUND-3
            raise invalid("outside_cycle", f"Round {spec.number} would end after the cycle closes on {c.closing_date:%d %b}.")
        rounds.append(
            Round(
                id=old.id if old else store.next_id("rnd"),
                cycle_id=c.id,
                number=spec.number,
                application_start=app_start,
                application_end=app_end,
                review_start=rev_start,
                review_end=rev_end,
                status=RoundStatus.scheduled,
            )
        )
        cursor = rev_end + timedelta(days=4)
    c.rounds = rounds
    audit(store, admin, AuditOperation.cycle_updated, [c.id], now, "rounds configured")
    return c
