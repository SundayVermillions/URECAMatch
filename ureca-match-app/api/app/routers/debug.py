"""Debug clock. Lets a developer jump "now" forward or back to test a cycle without waiting.

Gated by DEBUG_CLOCK=true on the server. When it is off every route here answers 404, so a
production deploy cannot be time-travelled by accident. Set and reset need a signed-in user.
"""

from __future__ import annotations

from datetime import UTC

from fastapi import APIRouter

from app.deps import CurrentUser, SettingsDep
from app.errors import ApiError
from app.models import ClockSet, ClockState
from app.settings import Settings, set_clock_override

router = APIRouter(prefix="/debug", tags=["debug"])


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
def put_clock(body: ClockSet, _: CurrentUser, settings: SettingsDep) -> ClockState:
    """Freeze the API clock at the given moment. Applies to every user until reset."""
    _need_enabled(settings)
    value = body.now if body.now.tzinfo else body.now.replace(tzinfo=UTC)
    set_clock_override(value.astimezone(UTC))
    return _state(settings)


@router.delete("/clock", response_model=ClockState)
def reset_clock(_: CurrentUser, settings: SettingsDep) -> ClockState:
    """Go back to the real clock (or the fixed demo clock in mock mode)."""
    _need_enabled(settings)
    set_clock_override(None)
    return _state(settings)
