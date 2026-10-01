"""Slice B: project listings.  REQ-BROWSE-1..3, REQ-PROJ-1..3."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, UploadFile

from app.deps import CurrentUser, SettingsDep, StoreDep, SupervisorUser
from app.errors import forbidden, invalid, not_found
from app.models import AccountStatus, Listing, ListingCreate, ListingStatus, ListingUpdate, Ok, Role, SupervisorSummary
from app.services import windows

router = APIRouter(tags=["listings"])


def _decorate(lst: Listing, store, user) -> Listing:
    """Attach per-viewer fields (applied, rank, applicant count) without mutating the stored row."""
    apps = [a for a in store.applications if a.listing_id == lst.id and a.status.value == "submitted"]
    mine = next((a for a in apps if a.student_id == user.id), None) if user.role == Role.student else None
    return lst.model_copy(
        update={
            "applicant_count": len(apps),
            "applied": mine is not None,
            "applied_rank": mine.preference_rank if mine else None,
        }
    )


@router.get("/listings", response_model=list[Listing])
def browse(
    user: CurrentUser,
    store: StoreDep,
    q: str | None = None,
    school: str | None = None,
    tag: str | None = None,
    supervisor: str | None = None,
) -> list[Listing]:
    """REQ-BROWSE-1: open in every phase, including before the cycle opens.
    REQ-BROWSE-2: keyword, school, topic and supervisor filters, combined with AND, case-insensitive."""
    out = []
    for lst in store.listings:
        if lst.status != ListingStatus.published:  # REQ-BROWSE-3
            continue
        # Join fields with a separator so a keyword never matches across the end of one field and the start of the next.
        if q and q.lower() not in "\n".join([lst.title, lst.description, *lst.topic_tags]).lower():
            continue
        if school and lst.offering_faculty.lower() != school.lower():
            continue
        if tag and tag.lower() not in (t.lower() for t in lst.topic_tags):
            continue
        if supervisor and supervisor.lower() not in lst.supervisor_name.lower():
            continue
        out.append(_decorate(lst, store, user))
    return out


@router.get("/listings/{listing_id}", response_model=Listing)
def detail(listing_id: str, user: CurrentUser, store: StoreDep) -> Listing:
    lst = store.listing(listing_id)
    if lst is None or (lst.status != ListingStatus.published and user.id != lst.supervisor_id and user.role != Role.admin):
        raise not_found("Project")
    return _decorate(lst, store, user)


@router.get("/supervisors", response_model=list[SupervisorSummary])
def supervisors(user: CurrentUser, store: StoreDep) -> list[SupervisorSummary]:
    """Picker for proposals (REQ-PROPOSE-2): active supervisors only, sorted by name."""
    out = []
    for s in store.supervisors:
        u = store.user(s.user_id)
        if u and u.status == AccountStatus.active:
            out.append(SupervisorSummary(id=u.id, name=u.name, faculty=s.faculty))
    return sorted(out, key=lambda x: x.name.removeprefix("Assoc. ").removeprefix("Prof. ").removeprefix("Dr. "))


@router.get("/supervisor/listings", response_model=list[Listing])
def my_listings(user: SupervisorUser, store: StoreDep) -> list[Listing]:
    return [_decorate(lst, store, user) for lst in store.listings if lst.supervisor_id == user.id]


@router.post("/supervisor/listings", response_model=Listing, status_code=201)
def create(body: ListingCreate, user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> Listing:
    lst = Listing(
        id=store.next_id("lst"),
        supervisor_id=user.id,
        supervisor_name=user.name,
        title=body.title,
        description=body.description,
        prerequisites=body.prerequisites,
        topic_tags=body.topic_tags,
        available_slots=body.available_slots,
        offering_faculty=body.offering_faculty,
        research_location=body.research_location,
        created_at=settings.now(),
        status=ListingStatus.published if body.publish else ListingStatus.draft,
    )  # REQ-PROJ-1
    store.listings.append(lst)
    return lst


@router.put("/supervisor/listings/{listing_id}", response_model=Listing)
def update(listing_id: str, body: ListingUpdate, user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> Listing:
    lst = store.listing(listing_id)
    if lst is None:
        raise not_found("Project")
    if lst.supervisor_id != user.id:
        raise forbidden()
    if store.cycle and settings.now() > store.cycle.closing_date:  # REQ-PROJ-2
        raise invalid("cycle_closed", "The application cycle has closed. Listings can no longer be edited.")
    if body.available_slots is not None and body.available_slots < lst.filled_slots:  # REQ-PROJ-3
        raise invalid(
            "slots_below_matched",
            f"{lst.filled_slots} students are already matched. Slots cannot go below that.",
            "available_slots",
        )
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(lst, k, v)
    return lst


@router.post("/supervisor/listings/{listing_id}/close", response_model=Listing)
def close(listing_id: str, user: SupervisorUser, store: StoreDep) -> Listing:
    lst = store.listing(listing_id)
    if lst is None:
        raise not_found("Project")
    if lst.supervisor_id != user.id:
        raise forbidden()
    lst.status = ListingStatus.closed
    return lst


@router.post("/supervisor/listings/{listing_id}/cover", response_model=Listing)
async def cover(listing_id: str, user: SupervisorUser, store: StoreDep, file: Annotated[UploadFile, File()]) -> Listing:
    lst = store.listing(listing_id)
    if lst is None or lst.supervisor_id != user.id:
        raise not_found("Project")
    if (file.content_type or "") not in ("image/jpeg", "image/png"):
        raise invalid("not_image", "Upload a JPEG or PNG image.", "file")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise invalid("too_large", "The image is larger than 5 MB.", "file")
    # TODO(slice B): store in bucket `covers`, save the public URL.
    lst.cover_url = f"/covers/{listing_id}.jpg"
    return lst


@router.get("/phase-check", response_model=Ok, include_in_schema=False)
def _phase(store: StoreDep, settings: SettingsDep) -> Ok:
    windows.phase(store.cycle, settings.now())
    return Ok()
