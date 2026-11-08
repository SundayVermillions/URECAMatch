"""Slice D: when the schedule runs. REQ-EXEC-6, REQ-PUB-4.

keep_schedule() runs it before every request (main.py) while SCHEDULER_ON_REQUEST is on, and /internal/tick runs it
for the daily cron and the admin's Matching Rounds page. What it does is services/schedule.advance().
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Header

from app.deps import SettingsDep, StoreDep, current_user
from app.errors import forbidden
from app.models import Ok, Role
from app.services.schedule import advance

router = APIRouter(tags=["matching"])
log = logging.getLogger(__name__)


def keep_schedule(store: StoreDep, settings: SettingsDep) -> None:
    """Runs before every request (main.py), so the first request after a window closes acts on it. A failing step
    must not fail an unrelated request: it is logged, and the next request tries it again.
    Off by default in Supabase mode (SCHEDULER_ON_REQUEST), where /internal/tick drives the schedule and the round
    claim keeps each step to one run."""
    if not settings.runs_scheduler_on_request():
        return
    try:
        advance(store, settings.now())
    except Exception:
        log.exception("A scheduled step failed; the next request tries it again")


@router.get("/internal/tick", response_model=Ok, include_in_schema=False)  # Vercel Cron only sends GET
@router.post("/internal/tick", response_model=Ok)
def tick(store: StoreDep, settings: SettingsDep, authorization: Annotated[str | None, Header()] = None) -> Ok:
    """Called by Vercel Cron daily at 5:05 pm SGT, just after windows open and close, and whenever an admin opens
    Matching Rounds. In Supabase mode this is what moves the schedule. Unlike keep_schedule, a failing step fails this
    call, so the cron log shows it."""
    # Cron sends `Bearer <CRON_SECRET>`. The admin page sends the admin's own session token.
    if settings.api_mode != "mock" and authorization != f"Bearer {settings.cron_secret}":
        if current_user(store, settings, authorization=authorization).role != Role.admin:  # 401 if no valid session
            raise forbidden("Only the scheduler or an admin can advance rounds.")
    advance(store, settings.now())
    return Ok()
