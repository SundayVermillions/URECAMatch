"""Slice D: application cycle and matching rounds.  REQ-CYCLE-1..4, REQ-ROUND-1..3, REQ-APPRV-5.

Every change to a cycle's dates or rounds goes through _save(), which checks the whole schedule as it would be after
the change before changing anything. A refused change leaves the cycle as it was and tells nobody.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter

from app.deps import AdminUser, CurrentUser, SettingsDep, StoreDep
from app.errors import conflict, invalid, not_found
from app.models import (
    ApplicationStatus,
    AuditOperation,
    Cycle,
    CycleCreate,
    CycleStatus,
    CycleUpdate,
    NotificationEvent,
    Role,
    Round,
    RoundSpec,
    RoundStatus,
    RoundsUpdate,
    ScheduleUpdate,
    User,
)
from app.routers.matching import _schedule_lock, moved_offer_deadlines
from app.services import cycle_end, listing_lifecycle
from app.services.audit import audit
from app.services.notify import notify
from app.services.windows import cycle_closed, when

router = APIRouter(tags=["admin: cycle"])

GAP = timedelta(days=2)  # default gap after a round's approval window when the next round has no start date
SECOND = timedelta(seconds=1)  # windows end one second before the hour, so the next start adds it back
DAY = timedelta(days=1)
RESPOND = timedelta(days=7)  # REQ-OUTCOME-3: last-round offers are open until the cycle closes, so leave time to answer


def _overlaps(c: Cycle, opening: datetime, closing: datetime) -> bool:
    return c.opening_date <= closing and opening <= c.closing_date


def _utc(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=UTC)


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
    """REQ-CYCLE-1, use case 1-1. One cycle at a time: the next one can be created once the current one has closed,
    and creating it moves that one to the history. A cycle cannot be closed early; to end it sooner, an admin moves
    its closing date (REQ-CYCLE-2)."""
    opening, closing, now = _utc(body.opening_date), _utc(body.closing_date), settings.now()
    old = store.cycle
    if old is not None and not cycle_closed(old, now):  # use case 1-1: only one cycle is active at a time
        raise conflict("cycle_active", "An existing application cycle is still active.")
    if closing <= opening:  # use case 1-1 E1
        raise invalid("bad_dates", "Closing date must be after the opening date.", "closing_date")
    if closing <= now:  # use case 1-1 E3
        raise invalid("date_in_past", "This closing date has already passed. Pick a later one.", "closing_date")
    clash = next((c for c in store.cycles if _overlaps(c, opening, closing)), None)
    if clash is not None:  # use case 1-1 E2: cycles must not overlap in time
        raise conflict("cycle_overlap", f"These dates overlap the {clash.academic_year} cycle. Cycles cannot overlap.")
    if old is not None:  # it has closed, so it moves to the history (REQ-CYCLE-4), and nothing from it carries over
        old.status = CycleStatus.closed
        store.save_cycle(old)
        listing_lifecycle.close_published(store)  # REQ-PROJ-4: in case the schedule has not run since it closed
        cycle_end.close_out(store, old, now)  # lapsed offers, waiting proposals, students' eligibility
        audit(store, admin, AuditOperation.cycle_updated, [old.id], now, "closed")
    cycle = Cycle(
        id=store.next_id("cyc"),
        academic_year=body.academic_year,
        opening_date=opening,
        closing_date=closing,
        pre_application_days=body.pre_application_days,
        status=CycleStatus.draft,
        rounds=[],
    )
    store.save_cycle(cycle)
    audit(store, admin, AuditOperation.cycle_updated, [cycle.id], now, "created")
    return cycle


@router.put("/admin/cycles/{cycle_id}", response_model=Cycle)
def update_cycle(cycle_id: str, body: CycleUpdate, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Cycle:
    """REQ-CYCLE-2, 3: change the cycle's dates. Rounds that have not started move with the opening date and the
    pre-application window, keeping their spacing (NFR 5.4.3)."""
    c = store.cycle_by_id(cycle_id)
    if c is None:
        raise not_found("Cycle")
    now = settings.now()
    opening = _utc(body.opening_date) if body.opening_date else c.opening_date
    closing = _utc(body.closing_date) if body.closing_date else c.closing_date
    pre_days = c.pre_application_days if body.pre_application_days is None else body.pre_application_days
    shift = (opening + timedelta(days=pre_days)) - (c.opening_date + timedelta(days=c.pre_application_days))
    specs = [_spec(r, r.application_start + shift if r.application_start > now else r.application_start) for r in c.rounds]
    return _save(store, c, admin, now, opening, closing, pre_days, specs, c.rollover_unmatched)


@router.put("/admin/cycles/{cycle_id}/rounds", response_model=Cycle)
def set_rounds(cycle_id: str, body: RoundsUpdate, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Cycle:
    """REQ-ROUND-1..3, use case 1-2: replace the rounds and keep the cycle's dates."""
    c = store.cycle_by_id(cycle_id)
    if c is None:
        raise not_found("Cycle")
    return _save(
        store,
        c,
        admin,
        settings.now(),
        c.opening_date,
        c.closing_date,
        c.pre_application_days,
        body.rounds,
        body.rollover_unmatched,
        "rounds configured",
    )


@router.put("/admin/cycles/{cycle_id}/schedule", response_model=Cycle)
def save_schedule(cycle_id: str, body: ScheduleUpdate, admin: AdminUser, store: StoreDep, settings: SettingsDep) -> Cycle:
    """Use case 1-1 step 5, 1-2: Cycle settings sends the cycle's dates and its rounds in one request, so they are
    checked as one schedule and either all of it is saved or, if a check fails, none of it."""
    c = store.cycle_by_id(cycle_id)
    if c is None:
        raise not_found("Cycle")
    opening = _utc(body.opening_date) if body.opening_date else c.opening_date
    closing = _utc(body.closing_date) if body.closing_date else c.closing_date
    pre_days = c.pre_application_days if body.pre_application_days is None else body.pre_application_days
    return _save(
        store, c, admin, settings.now(), opening, closing, pre_days, body.rounds, body.rollover_unmatched, "schedule saved"
    )


def _save(
    store,
    c: Cycle,
    admin: User,
    now: datetime,
    opening: datetime,
    closing: datetime,
    pre_days: int,
    specs: list[RoundSpec],
    rollover: bool,
    note: str | None = None,
) -> Cycle:
    """Check the cycle as it would be after the change, then change it and tell the people it affects
    (REQ-CYCLE-2, 3, REQ-ROUND-1..3, REQ-APPRV-5, REQ-OUTCOME-3). Nothing changes if a check fails."""
    if c.status == CycleStatus.closed:  # REQ-CYCLE-4: a closed cycle keeps its dates and results
        raise conflict("cycle_closed", "This cycle is closed. Reopen it to change its dates or rounds.")
    with _schedule_lock:  # matching, publishing and offer timeouts wait until the new schedule is in place
        _check_dates(store, c, opening, closing, pre_days, now)
        rounds = _plan_rounds(store, c, opening, closing, pre_days, specs, now)
        planned = c.model_copy(
            update={"opening_date": opening, "closing_date": closing, "pre_application_days": pre_days, "rounds": rounds}
        )
        moved = moved_offer_deadlines(store, planned, now)  # REQ-OUTCOME-3
        news = _news(c, planned)
        c.opening_date, c.closing_date, c.pre_application_days, c.rounds = opening, closing, pre_days, rounds
        c.rollover_unmatched = rollover  # REQ-EXEC-3
        store.save_cycle(c)  # the cycle and its rounds; a round dropped from it is deleted
        for m, deadline in moved:
            m.offer_expires_at = deadline
            store.save_match(m)  # in Supabase mode the store hands out copies, so each change is saved
        audit(store, admin, AuditOperation.cycle_updated, [c.id], now, note)
    if news:  # REQ-CYCLE-3, use case 1-2: students and supervisors hear about every moved date
        affected = [u.id for u in store.users if u.role in (Role.student, Role.supervisor)]
        notify(store, affected, NotificationEvent.cycle_changed, "Application cycle dates changed", " ".join(news), now)
    for m, deadline in moved:
        notify(
            store,
            [m.student_id],
            NotificationEvent.cycle_changed,
            "Your offer deadline has changed",
            f"Respond to your offer for {m.listing_title} by {when(deadline)}.",
            now,
            "/my-applications",
        )
    return c


def _check_dates(store, c: Cycle, opening: datetime, closing: datetime, pre_days: int, now: datetime) -> None:
    """The cycle's own dates (REQ-CYCLE-2, use case 1-1 E1, E2): a date that has passed stays as it is, a new date
    must not have passed, and the cycle must not overlap another."""
    if opening != c.opening_date and c.opening_date <= now:
        raise invalid("date_passed", "The opening date has passed and can no longer be changed.", "opening_date")
    if closing != c.closing_date and c.closing_date <= now:
        raise invalid("date_passed", "The closing date has passed and can no longer be changed.", "closing_date")
    if pre_days != c.pre_application_days and any(r.application_start <= now for r in c.rounds):
        raise invalid(
            "date_passed", "Round 1 has started, so the pre-application window can no longer change.", "pre_application_days"
        )
    for field, new, old in (("opening_date", opening, c.opening_date), ("closing_date", closing, c.closing_date)):
        if new != old and new <= now:
            raise invalid("date_in_past", "Pick a date that has not passed yet.", field)
    if not 0 <= pre_days <= 60:
        raise invalid("bad_pre_application", "The pre-application window must be 0 to 60 days.", "pre_application_days")
    if closing <= opening:
        raise invalid("bad_dates", "Closing date must be after the opening date.", "closing_date")
    clash = next((o for o in store.cycles if o.id != c.id and _overlaps(o, opening, closing)), None)
    if clash is not None:
        raise conflict("cycle_overlap", f"These dates overlap the {clash.academic_year} cycle. Cycles cannot overlap.")


def _plan_rounds(
    store, c: Cycle, opening: datetime, closing: datetime, pre_days: int, specs: list[RoundSpec], now: datetime
) -> list[Round]:
    """Build the rounds from their window lengths and optional start dates (REQ-ROUND-1, use case 1-2). A round that
    has started stays exactly as it is (REQ-ROUND-2). A round without a start date opens 2 days after the previous
    round ends, and Round 1 when the pre-application window ends. A round must not start in the past, overlap the one
    before or end after the cycle closes (REQ-ROUND-3); it ends when its approval window does (REQ-APPRV-5)."""
    numbers = sorted(s.number for s in specs)
    if numbers != list(range(1, len(numbers) + 1)):
        raise invalid("bad_rounds", "Number the rounds 1, 2, 3 in order, with no gaps or repeats.", "rounds")
    dropped = [r for r in c.rounds if r.number not in numbers]
    started = next((r for r in dropped if r.application_start <= now), None)
    if started is not None:  # REQ-ROUND-2: a round that has started keeps its applications, so it cannot be removed
        raise invalid("round_started", f"Round {started.number} has already started, so it cannot be removed.", "rounds")
    existing = {r.number: r for r in c.rounds}
    earliest = opening + timedelta(days=pre_days)
    rounds: list[Round] = []
    for spec in sorted(specs, key=lambda s: s.number):
        old, prev = existing.get(spec.number), rounds[-1] if rounds else None
        if old is not None and old.application_start <= now:  # REQ-ROUND-2: only rounds that have not started change
            if not _unchanged(spec, old):
                raise invalid(
                    "round_started", f"Round {old.number} has already started, so its dates can no longer change.", "rounds"
                )
            r = old
        else:
            default = earliest if prev is None else prev.approval_end + SECOND + GAP
            start = default if spec.start_date is None else _utc(spec.start_date)
            if start <= now:  # typed or by default, an upcoming round cannot open in the past
                raise invalid(
                    "date_in_past",
                    f"Round {spec.number} would start in the past. Pick a later start date."
                    if spec.start_date is not None
                    else f"Round {spec.number} would start {when(start)} by default, which has passed. Pick a start date.",
                    "rounds",
                )
            if start < earliest:
                raise invalid(
                    "outside_cycle",
                    f"Round {spec.number} would start before the pre-application window ends on {earliest:%d %b}.",
                )
            if prev is not None and start <= prev.approval_end:  # REQ-ROUND-3: rounds must not overlap
                raise invalid(
                    "rounds_overlap",
                    f"Round {spec.number} would start before Round {prev.number} ends on {prev.approval_end:%d %b}.",
                    "rounds",
                )
            r = _round(store, c, spec, start, old)
        if r.approval_end > closing:  # REQ-ROUND-3: the cycle holds every round, approval window included
            fix = "Pick a later closing date." if r is old else "Shorten the round or pick a later closing date."
            raise invalid(
                "outside_cycle", f"Round {r.number} ends {when(r.approval_end)}, after the cycle closes on {when(closing)}. {fix}"
            )
        rounds.append(r)
    for r in dropped:  # an upcoming round can go, unless students have already been moved into it
        if held := _held(store, r):
            raise invalid("round_in_use", f"Round {r.number} already holds {held}, so it cannot be removed.", "rounds")
    _check_time_to_respond(rounds, closing)
    return rounds


def _round(store, c: Cycle, spec: RoundSpec, start: datetime, old: Round | None) -> Round:
    """The round `spec` describes, opening at `start`: its windows back to back, each ending one second before the hour."""
    review_start = start + spec.application_days * DAY
    review_end = review_start + spec.review_days * DAY - SECOND
    return Round(
        id=old.id if old else store.next_id("rnd"),  # an existing round keeps its id, and so the applications carried into it
        cycle_id=c.id,
        number=spec.number,
        application_start=start,
        application_end=review_start - SECOND,
        review_start=review_start,
        review_end=review_end,
        approval_end=review_end + spec.approval_days * DAY,  # REQ-APPRV-5
        status=RoundStatus.scheduled,
    )


def _held(store, r: Round) -> str:
    """What removing upcoming round `r` would strand (REQ-EXEC-3, REQ-ASSIGN-1): applications carried into it from an
    earlier round, or students the URECA office assigned to it. Empty if nothing."""
    carried = sum(1 for a in store.applications_for(round_id=r.id) if a.status == ApplicationStatus.submitted)
    if carried:
        return f"{carried} application{'' if carried == 1 else 's'} carried over from an earlier round"
    assigned = sum(1 for m in store.matches if m.round_id == r.id)
    if assigned:
        return f"{assigned} student{'' if assigned == 1 else 's'} assigned by the URECA office"
    return ""


def _lengths(r: Round) -> tuple[int, int, int]:
    """A round's application, review and approval window lengths, in days."""
    return (
        round((r.application_end + SECOND - r.application_start) / DAY),
        round((r.review_end + SECOND - r.review_start) / DAY),
        round((r.approval_end - r.review_end) / DAY),
    )


def _spec(r: Round, start: datetime) -> RoundSpec:
    """The spec that rebuilds round `r` with the same windows, opening at `start`. Built without validation, so a round
    saved before a rule changed passes through as it is."""
    application, review, approval = _lengths(r)
    return RoundSpec.model_construct(
        number=r.number, application_days=application, review_days=review, approval_days=approval, start_date=start
    )


def _unchanged(spec: RoundSpec, r: Round) -> bool:
    """Whether `spec` describes round `r` as it is: the same window lengths, and its own start date or none."""
    same_start = spec.start_date is None or _utc(spec.start_date) == r.application_start
    return same_start and (spec.application_days, spec.review_days, spec.approval_days) == _lengths(r)


def _news(old: Cycle, new: Cycle) -> list[str]:
    """What students and supervisors are told about a schedule change (REQ-CYCLE-3, use case 1-2)."""
    news = [f"The cycle now closes on {when(new.closing_date)}."] if new.closing_date != old.closing_date else []
    before = {r.number: r for r in old.rounds}
    for r in new.rounds:
        o = before.get(r.number)
        if o is None or _dates(o) != _dates(r):
            news.append(
                f"Round {r.number}: applications {when(r.application_start)} to {when(r.application_end)}; "
                f"rankings due {when(r.review_end)}; results out {when(r.approval_end)}."
            )
    news += [f"Round {n} has been removed." for n in sorted(set(before) - {r.number for r in new.rounds})]
    return news


def _dates(r: Round) -> tuple[datetime, datetime, datetime, datetime]:
    return r.application_start, r.application_end, r.review_end, r.approval_end


def _check_time_to_respond(rounds: list[Round], closing: datetime) -> None:
    """REQ-OUTCOME-3: the cycle closes at least RESPOND after the last approval window, so students offered a place
    in the last round have time to answer before their offers lapse at the close."""
    if not rounds:
        return
    last = max(rounds, key=lambda r: r.approval_end)
    if last.approval_end + RESPOND > closing:
        raise invalid(
            "outside_cycle",
            f"Round {last.number}'s approval window ends {when(last.approval_end)}. Students need {RESPOND.days} days "
            f"after that to answer their offers, so the cycle must close on or after {when(last.approval_end + RESPOND)}.",
            "closing_date",
        )
