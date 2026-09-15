"""Slice D: application cycle and matching rounds.  REQ-CYCLE-1..3, REQ-ROUND-1..3."""

from __future__ import annotations

from datetime import timedelta

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


@router.get("/cycle", response_model=Cycle | None)
def current_cycle(user: CurrentUser, store: StoreDep) -> Cycle | None:
    return store.cycle


@router.post("/admin/cycles", response_model=Cycle, status_code=201)
def create_cycle(body: CycleCreate, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Cycle:
    if store.cycle and store.cycle.status != CycleStatus.closed:
        raise conflict("cycle_active", "Close the current cycle before creating a new one.")
    if body.closing_date <= body.opening_date:
        raise invalid("bad_dates", "Closing date must be after the opening date.", "closing_date")
    store.cycle = Cycle(
        id=store.next_id("cyc"),
        academic_year=body.academic_year,
        opening_date=body.opening_date,
        closing_date=body.closing_date,
        pre_application_days=body.pre_application_days,
        status=CycleStatus.draft,
        rounds=[],
    )  # REQ-CYCLE-1
    audit(store, admin, AuditOperation.cycle_updated, [store.cycle.id], settings.now(), "created")
    return store.cycle


@router.put("/admin/cycles/{cycle_id}", response_model=Cycle)
def update_cycle(cycle_id: str, body: CycleUpdate, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Cycle:
    c = store.cycle
    if c is None or c.id != cycle_id:
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
            f"The cycle now closes on {c.closing_date:%-d %b %Y}.",
            now,
        )
    audit(store, admin, AuditOperation.cycle_updated, [c.id], now)
    return c


@router.put("/admin/cycles/{cycle_id}/rounds", response_model=Cycle)
def set_rounds(cycle_id: str, body: RoundsUpdate, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Cycle:
    """Derive round dates from the configured window lengths (REQ-ROUND-1) and validate (REQ-ROUND-3)."""
    c = store.cycle
    if c is None or c.id != cycle_id:
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
            raise invalid("outside_cycle", f"Round {spec.number} would end after the cycle closes on {c.closing_date:%-d %b}.")
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
