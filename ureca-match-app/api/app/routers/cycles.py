"""Slice D: application cycle and matching rounds.  REQ-CYCLE-1..3, REQ-ROUND-1..3."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

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
from app.services.windows import when

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
    opening = body.opening_date or c.opening_date
    closing = body.closing_date or c.closing_date
    pre_days = c.pre_application_days if body.pre_application_days is None else body.pre_application_days
    started = [r for r in c.rounds if r.application_start <= now]
    if pre_days != c.pre_application_days and started:
        raise invalid(
            "date_passed", "Round 1 has started, so the pre-application window can no longer change.", "pre_application_days"
        )
    # NFR 5.4.3: rounds that have not started move with the opening date and pre-application window, keeping their spacing.
    shift = (opening + timedelta(days=pre_days)) - (c.opening_date + timedelta(days=c.pre_application_days))
    rounds = [r if r.application_start <= now or not shift else _shifted(r, shift) for r in c.rounds]
    _check_new_dates(store, c, body, opening, closing, pre_days, rounds, now)
    changes = []
    if closing != c.closing_date:  # REQ-CYCLE-3
        changes.append(f"The cycle now closes on {when(closing)}.")
    if shift and rounds:  # use case 1-2: affected users hear about moved rounds too
        changes.append(f"Round 1 now opens {when(rounds[0].application_start)}.")
    c.opening_date, c.closing_date, c.pre_application_days, c.rounds = opening, closing, pre_days, rounds
    if changes:
        affected = [u.id for u in store.users if u.role in (Role.student, Role.supervisor)]
        notify(store, affected, NotificationEvent.cycle_changed, "Application cycle dates changed", " ".join(changes), now)
    audit(store, admin, AuditOperation.cycle_updated, [c.id], now)
    return c


def _shifted(r: Round, by: timedelta) -> Round:
    return r.model_copy(
        update={
            "application_start": r.application_start + by,
            "application_end": r.application_end + by,
            "review_start": r.review_start + by,
            "review_end": r.review_end + by,
        }
    )


def _check_new_dates(store, c: Cycle, body: CycleUpdate, opening, closing, pre_days: int, rounds: list[Round], now) -> None:
    """Validate the cycle as it would be after the update, before anything changes (use case 1-1 E1, E2; REQ-ROUND-3)."""
    for field, new in (("opening_date", body.opening_date), ("closing_date", body.closing_date)):
        if new is not None and new <= now:
            raise invalid("date_in_past", "Pick a date that has not passed yet.", field)
    if not 0 <= pre_days <= 60:
        raise invalid("bad_pre_application", "The pre-application window must be 0 to 60 days.", "pre_application_days")
    if closing <= opening:
        raise invalid("bad_dates", "Closing date must be after the opening date.", "closing_date")
    clash = next((o for o in store.cycles if o.id != c.id and _overlaps(o, opening, closing)), None)
    if clash is not None:
        raise conflict("cycle_overlap", f"These dates overlap the {clash.academic_year} cycle. Cycles cannot overlap.")
    if not rounds:
        return
    first = min(rounds, key=lambda r: r.application_start)
    last = max(rounds, key=lambda r: r.review_end)
    if first.application_start < opening + timedelta(days=pre_days):
        raise invalid(
            "outside_cycle",
            f"Round {first.number} starts {first.application_start:%d %b}, before the pre-application window ends. "
            "Change the rounds first.",
        )
    if last.review_end > closing:
        raise invalid(
            "outside_cycle",
            f"Round {last.number} ends {last.review_end:%d %b}, after this closing date. "
            "Pick a later date or shorten the rounds first.",
            "closing_date",
        )


GAP = timedelta(days=4)  # default gap between rounds when no start date is given
SECOND = timedelta(seconds=1)  # windows end one second before the hour, so the next start adds it back


@router.put("/admin/cycles/{cycle_id}/rounds", response_model=Cycle)
def set_rounds(cycle_id: str, body: RoundsUpdate, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Cycle:
    """Build the rounds from their window lengths and optional start dates (REQ-ROUND-1, use case 1-2), and reject
    rounds that overlap or fall outside the cycle (REQ-ROUND-3). A round without a start date opens 4 days after
    the previous one ends; Round 1 opens when the pre-application window ends."""
    c = store.cycle_by_id(cycle_id)
    if c is None:
        raise not_found("Cycle")
    now = settings.now()
    numbers = sorted(s.number for s in body.rounds)
    if numbers != list(range(1, len(numbers) + 1)):
        raise invalid("bad_rounds", "Number the rounds 1, 2, 3 in order, with no gaps or repeats.", "rounds")
    dropped = [r for r in c.rounds if r.number not in numbers and r.application_start <= now]
    if dropped:  # REQ-ROUND-2: a round that has started keeps its applications, so it cannot be removed
        raise invalid("round_started", f"Round {dropped[0].number} has already started, so it cannot be removed.", "rounds")
    existing = {r.number: r for r in c.rounds}
    earliest = c.opening_date + timedelta(days=c.pre_application_days)
    cursor, prev = earliest, None
    rounds: list[Round] = []
    for spec in sorted(body.rounds, key=lambda s: s.number):
        old = existing.get(spec.number)
        if old and old.application_start <= now:  # REQ-ROUND-2: only future rounds change
            rounds.append(old)
            cursor, prev = old.review_end + SECOND + GAP, old
            continue
        app_start = cursor
        if spec.start_date is not None:
            app_start = spec.start_date if spec.start_date.tzinfo else spec.start_date.replace(tzinfo=UTC)
            if app_start <= now:
                raise invalid("date_in_past", f"Round {spec.number} would start in the past. Pick a later start date.", "rounds")
        if app_start < earliest:
            raise invalid(
                "outside_cycle", f"Round {spec.number} would start before the pre-application window ends on {earliest:%d %b}."
            )
        if prev is not None and app_start <= prev.review_end:  # REQ-ROUND-3: rounds must not overlap
            raise invalid(
                "rounds_overlap",
                f"Round {spec.number} would start before Round {prev.number} ends on {prev.review_end:%d %b}.",
                "rounds",
            )
        app_end = app_start + timedelta(days=spec.application_days) - timedelta(seconds=1)
        rev_start = app_start + timedelta(days=spec.application_days)
        rev_end = rev_start + timedelta(days=spec.review_days) - timedelta(seconds=1)
        if rev_end > c.closing_date:  # REQ-ROUND-3
            raise invalid("outside_cycle", f"Round {spec.number} would end after the cycle closes on {c.closing_date:%d %b}.")
        prev = Round(
            id=old.id if old else store.next_id("rnd"),
            cycle_id=c.id,
            number=spec.number,
            application_start=app_start,
            application_end=app_end,
            review_start=rev_start,
            review_end=rev_end,
            status=RoundStatus.scheduled,
        )
        rounds.append(prev)
        cursor = rev_end + SECOND + GAP
    c.rounds = rounds
    c.rollover_unmatched = body.rollover_unmatched  # REQ-EXEC-3
    audit(store, admin, AuditOperation.cycle_updated, [c.id], now, "rounds configured")
    return c
