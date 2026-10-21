"""Reference lists: standard topic tags and NTU course codes.

Topics are curated in app/db/catalog/topics.json. Courses are NTU's public Content of Courses
(wish.wis.ntu.edu.sg), saved in app/db/catalog/ntu_courses.json by app.db.scrape_courses.
Listings, profiles and proposals may only use values from these lists, so filters and the
prerequisite check compare like with like."""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path

from app.errors import invalid
from app.models import Course, TopicGroup

DIR = Path(__file__).resolve().parents[1] / "db" / "catalog"


@cache
def topic_groups() -> list[TopicGroup]:
    raw = json.loads((DIR / "topics.json").read_text(encoding="utf-8"))
    return [TopicGroup(name=k, topics=v) for k, v in raw.items()]


@cache
def _topics() -> dict[str, str]:
    """Lower-cased topic to its standard spelling."""
    return {t.lower(): t for g in topic_groups() for t in g.topics}


@cache
def courses() -> dict[str, Course]:
    raw = json.loads((DIR / "ntu_courses.json").read_text(encoding="utf-8"))
    return {c["code"]: Course(**c) for c in raw}


def course_code(text: str) -> str:
    return "".join(text.split()).upper()


def clean_topics(values: list[str], field: str) -> list[str]:
    """Standard spelling, duplicates dropped. Unknown topics are refused."""
    out: list[str] = []
    for v in values:
        t = _topics().get(v.strip().lower())
        if t is None:
            raise invalid("unknown_topic", f'"{v.strip()}" is not a standard topic. Choose one from the list.', field)
        if t not in out:
            out.append(t)
    return out


def clean_courses(values: list[str], field: str) -> list[str]:
    """Upper-cased NTU course codes, duplicates dropped. Unknown codes are refused."""
    out: list[str] = []
    for v in values:
        code = course_code(v)
        if code not in courses():
            raise invalid("unknown_course", f'"{v.strip()}" is not an NTU course code. Choose one from the list.', field)
        if code not in out:
            out.append(code)
    return out


def search_courses(q: str, limit: int) -> list[Course]:
    """Codes starting with the query first, then titles containing every word of it,
    most recently offered first so current codes (SC4001) come before retired ones (CZ4042)."""
    q = q.strip()
    if not q:
        return []
    code, words = course_code(q), q.lower().split()
    by_code = [c for c in courses().values() if c.code.startswith(code)]
    by_title = [c for c in courses().values() if not c.code.startswith(code) and all(w in c.title.lower() for w in words)]
    by_title.sort(key=lambda c: c.last_offered, reverse=True)  # stable, so codes stay in order within a semester
    return (by_code + by_title)[:limit]
