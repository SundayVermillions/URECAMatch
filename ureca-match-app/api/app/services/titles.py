"""Academic titles for project supervisors (SRS 4.8: Project Supervisor accounts).

A supervisor picks a title when the account is created. The title is kept on the supervisor profile and the user's
display name is "<title> <name>", so every screen that shows a name keeps showing the title. Students and admins have
no title: a supervisor who becomes a student drops it.
"""

from __future__ import annotations

import re

from app.errors import invalid

TITLES = ("Prof.", "Assoc. Prof.", "Asst. Prof.", "Dr.")

_PREFIX = re.compile(r"^(?:(?P<level>Assoc|Asst)\.?\s+)?(?P<kind>Prof(?:essor)?|Dr)\.?\s+", re.IGNORECASE)


def check_title(title: str | None) -> str:
    """Return the title, or "" for none. Anything outside TITLES is refused."""
    title = (title or "").strip()
    if title and title not in TITLES:
        raise invalid("invalid_title", f"Choose a title from the list: {', '.join(TITLES)}.", "title")
    return title


def compose(title: str, name: str) -> str:
    return f"{title} {name.strip()}" if title else name.strip()


def split_title(name: str) -> tuple[str, str]:
    """'Assoc. Prof. Mei Lin Tan' -> ('Assoc. Prof.', 'Mei Lin Tan'). A name with no title gives ('', name)."""
    name = name.strip()
    m = _PREFIX.match(name)
    if not m:
        return "", name
    rest = name[m.end() :].strip()
    if not rest:
        return "", name
    kind = "Dr." if m.group("kind").lower() == "dr" else "Prof."
    level = m.group("level")
    return (f"{level.capitalize()}. {kind}" if level else kind), rest
