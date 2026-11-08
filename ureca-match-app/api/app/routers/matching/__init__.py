"""Slice D: matching, approval window, review, reassign, publish, offers, audit, scheduler.
REQ-EXEC-1..4, REQ-REV-1, REQ-PUB-1..3, REQ-ASSIGN-1..3, REQ-APPRV-1..4, REQ-OUTCOME-1..4, REQ-AUDIT-1..3.

One router for main.py, made of one module per screen or user and joined in this order, which is the order the API
contract lists the routes in:
  rounds.py       an admin's view of a round: summary, matches, unmatched students (REQ-REV-1)
  assignments.py  placing a student by hand: reassign, assign, unassign, the Assignments page (REQ-ASSIGN-1..3)
  audit_log.py    the audit log page (REQ-AUDIT-1..3)
  supervisor.py   a supervisor's matches and declining one (REQ-APPRV-1..4)
  student.py      a student's match result and answering an offer (REQ-OUTCOME-1..4)
  scheduler.py    when the schedule runs: before each request and on /internal/tick (REQ-EXEC-6, REQ-PUB-4)

What the schedule does is in app/services: schedule.py, matching/run.py, matching/publish.py and offers.py.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.routers.matching import assignments, audit_log, rounds, scheduler, student, supervisor
from app.routers.matching.scheduler import keep_schedule

router = APIRouter()
for _module in (rounds, assignments, audit_log, supervisor, student, scheduler):
    router.include_router(_module.router)

__all__ = ["keep_schedule", "router"]
