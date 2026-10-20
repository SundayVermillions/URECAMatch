"""Reference lists for pickers: standard topic tags and NTU course codes.  REQ-PROJ-1, REQ-PROF-1, REQ-PROPOSE-1."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.deps import CurrentUser
from app.models import Course, TopicGroup
from app.services import catalog

router = APIRouter(tags=["catalog"])


@router.get("/catalog/topics", response_model=list[TopicGroup])
def topics(_: CurrentUser) -> list[TopicGroup]:
    return catalog.topic_groups()


@router.get("/catalog/courses", response_model=list[Course])
def courses(_: CurrentUser, q: str = "", codes: str = "", limit: int = Query(default=20, ge=1, le=50)) -> list[Course]:
    """Search by code prefix ("SC40") or title words ("deep learning"),
    or look up exact codes ("SC4001,SC3020") to show their titles. Unknown codes are left out."""
    if codes:
        found = (catalog.courses().get(catalog.course_code(c)) for c in codes.split(","))
        return [c for c in found if c][:limit]
    return catalog.search_courses(q, limit)
