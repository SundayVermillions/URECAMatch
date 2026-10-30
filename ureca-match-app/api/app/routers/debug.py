"""Debug clock. Lets a developer jump "now" forward or back to test a cycle without waiting.

Gated by DEBUG_CLOCK=true on the server. When it is off every route here answers 404, so a
production deploy cannot be time-travelled by accident. Set and reset need a signed-in user.
"""

from __future__ import annotations

import time
from datetime import UTC

from fastapi import APIRouter

from app.deps import CurrentUser, SettingsDep, StoreDep
from app.errors import ApiError
from app.models import ClockSet, ClockState
from app.settings import Settings, set_clock_override

router = APIRouter(prefix="/debug", tags=["debug"])

_synced_at = 0.0
_seen: object = "unset"  # the clock value this process last saw, to notice when someone moves it
SYNC_SECONDS = 1.0  # one small read per second at most, however many requests come in


def sync_clock(store: StoreDep, settings: SettingsDep) -> None:
    """Runs before every request. In Supabase mode the fake clock lives in the database, so every API process (two
    laptops, or serverless instances) follows the same one. Off unless DEBUG_CLOCK=true."""
    global _synced_at, _seen
    if not settings.debug_clock or settings.api_mode != "supabase" or not hasattr(store, "client"):
        return  # only a store backed by the database has a shared clock
    if time.monotonic() - _synced_at < SYNC_SECONDS:
        return
    value = store.get_clock()
    if _seen != "unset" and value != _seen:
        store.last_activity.clear()  # time was moved: nobody was idle, so nobody is signed out
    _seen = value
    set_clock_override(value)
    _synced_at = time.monotonic()


def _state(settings: Settings) -> ClockState:
    from app.settings import _clock_override

    return ClockState(enabled=True, now=settings.now(), overridden=_clock_override is not None)


def _need_enabled(settings: Settings) -> None:
    if not settings.debug_clock:
        raise ApiError(404, "not_found", "The debug clock is switched off.")


@router.get("/clock", response_model=ClockState)
def get_clock(settings: SettingsDep) -> ClockState:
    """Current API time. `enabled` is false when DEBUG_CLOCK is off, so the UI can hide itself."""
    if not settings.debug_clock:
        return ClockState(enabled=False, now=settings.now(), overridden=False)
    return _state(settings)


@router.put("/clock", response_model=ClockState)
def put_clock(body: ClockSet, _: CurrentUser, store: StoreDep, settings: SettingsDep) -> ClockState:
    """Freeze the API clock at the given moment. Applies to every user, on every API process, until reset."""
    _need_enabled(settings)
    value = (body.now if body.now.tzinfo else body.now.replace(tzinfo=UTC)).astimezone(UTC)
    store.set_clock(value)
    store.last_activity.clear()
    set_clock_override(value)
    return _state(settings)


@router.delete("/clock", response_model=ClockState)
def reset_clock(_: CurrentUser, store: StoreDep, settings: SettingsDep) -> ClockState:
    """Go back to the real clock (or the fixed demo clock in mock mode), for everyone."""
    _need_enabled(settings)
    store.set_clock(None)
    store.last_activity.clear()
    set_clock_override(None)
    return _state(settings)
