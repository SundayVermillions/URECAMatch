"""Fixed mock-demo timeline. These settings do not move dates in a live database."""

from datetime import UTC, datetime

# REQ-CYCLE-1, REQ-ROUND-1: start the demo when Round 2 applications open, 3 Nov at 17:00 SGT.
DEMO_NOW = datetime(2026, 11, 3, 9, tzinfo=UTC)
DEMO_OFFSET = DEMO_NOW - datetime(2026, 9, 5, 9, tzinfo=UTC)
