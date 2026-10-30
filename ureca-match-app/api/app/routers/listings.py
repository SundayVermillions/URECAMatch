"""Slice B: project listings.  REQ-BROWSE-1..4, REQ-PROJ-1..3."""

from __future__ import annotations

import re
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, File, Query, Request, Response, UploadFile

from app.deps import CurrentUser, SettingsDep, StoreDep, StudentUser, SupervisorUser
from app.errors import conflict, forbidden, invalid, not_found
from app.models import (
    AccountStatus,
    Application,
    ApplicationStatus,
    Listing,
    ListingCreate,
    ListingStatus,
    ListingUpdate,
    NotificationEvent,
    Ok,
    Recommendation,
    Role,
    SupervisorSummary,
    Window,
)
from app.services import catalog, listing_lifecycle, placement, recommend, windows
from app.services.notify import notify
from app.services.storage import MockStorageService, get_storage

router = APIRouter(tags=["listings"])


def _submitted_by_listing(store, settings) -> dict[str, list[Application]]:
    """Applications under review in the current round, grouped by project. Applications from an earlier round or
    cycle, and everything before Round 1 opens, do not count: a new cycle starts with no applicants and nobody
    marked as applied. Read through applications_for(), which is the database in Supabase mode (store.applications
    is only the in-memory seed there), and read once so Browse does not query once per card."""
    round_id = windows.phase(store.cycle, settings.now()).round_id
    out: dict[str, list[Application]] = {}
    if round_id is None:
        return out
    for a in store.applications_for(round_id=round_id):
        if a.status == ApplicationStatus.submitted:
            out.setdefault(a.listing_id, []).append(a)
    return out


def _held_by_listing(store) -> dict[str, int]:
    """Open matches and offers per project, counted in one pass (see _held_slots for one project)."""
    out: dict[str, int] = {}
    for m in store.matches:
        if m.status in placement.OPEN:
            out[m.listing_id] = out.get(m.listing_id, 0) + 1
    return out


def _decorate(lst: Listing, user, submitted: dict[str, list[Application]], held: dict[str, int]) -> Listing:
    """Attach per-viewer fields (applied, rank, applicant count, held slots) without mutating the stored row.
    `submitted` and `held` are read once per request, so decorating many projects costs no extra queries."""
    apps = submitted.get(lst.id, [])
    mine = next((a for a in apps if a.student_id == user.id), None) if user.role == Role.student else None
    return lst.model_copy(
        update={
            "applicant_count": len(apps),
            "held_slots": held.get(lst.id, 0),
            "applied": mine is not None,
            "applied_rank": mine.preference_rank if mine else None,
        }
    )


def _held_slots(lst: Listing, store) -> int:
    """Matches and offers on this project that the student has not answered yet. Each one holds a slot until the
    student accepts (it then counts in filled_slots) or it ends, so the supervisor cannot take that slot away."""
    return sum(1 for m in store.matches if m.listing_id == lst.id and m.status in placement.OPEN)


@router.get("/listings", response_model=list[Listing])
def browse(
    user: CurrentUser,
    store: StoreDep,
    settings: SettingsDep,
    q: str | None = None,
    school: str | None = None,
    tag: str | None = None,
    supervisor: str | None = None,
) -> list[Listing]:
    """REQ-BROWSE-1: open in every phase, including before the cycle opens.
    REQ-BROWSE-2: keyword, school, topic and supervisor filters, combined with AND, case-insensitive."""
    if store.cycle is not None and not listing_lifecycle.cycle_open(store.cycle, settings.now()):
        return []  # REQ-PROJ-4: past the closing date nothing is on offer, even before the schedule has closed the projects
    out = []
    submitted, held = _submitted_by_listing(store, settings), _held_by_listing(store)
    for lst in store.all_listings():
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
        out.append(_decorate(lst, user, submitted, held))
    return out


@router.get("/me/recommendations", response_model=list[Recommendation])
def recommendations(
    user: StudentUser, store: StoreDep, settings: SettingsDep, limit: int = Query(default=6, ge=1, le=50)
) -> list[Recommendation]:
    """REQ-BROWSE-4: published projects that fit the student, best first, each with a score and its reasons.
    Only during an application window, when a student can act on them: not before the cycle opens, in the
    pre-application period, between rounds or after the cycle.
    Empty when the student has no research interests yet, or cannot apply this cycle (placed or ineligible).
    Projects already applied to or with no open slot are left out."""
    if windows.phase(store.cycle, settings.now()).window != Window.application:
        return []
    sp = store.student(user.id)
    if sp is None or not sp.research_interests or not sp.eligible_for_matching or placement.is_placed(store, user.id):
        return []
    submitted, held = _submitted_by_listing(store, settings), _held_by_listing(store)
    open_listings = [
        d
        for d in (_decorate(lst, user, submitted, held) for lst in store.all_listings() if lst.status == ListingStatus.published)
        if not d.applied and d.filled_slots < d.available_slots
    ]
    return recommend.recommend(open_listings, sp, limit)


@router.get("/listings/{listing_id}", response_model=Listing)
def detail(listing_id: str, user: CurrentUser, store: StoreDep, settings: SettingsDep) -> Listing:
    lst = store.listing(listing_id)
    if lst is None or (lst.status != ListingStatus.published and user.id != lst.supervisor_id and user.role != Role.admin):
        raise not_found("Project")
    return _decorate(lst, user, _submitted_by_listing(store, settings), _held_by_listing(store))


@router.get("/supervisors", response_model=list[SupervisorSummary])
def supervisors(user: CurrentUser, store: StoreDep) -> list[SupervisorSummary]:
    """Picker for proposals (REQ-PROPOSE-2): active supervisors only, sorted by name."""
    out = []
    for s in store.supervisors:
        u = store.user(s.user_id)
        if u and u.status == AccountStatus.active and u.role == Role.supervisor:  # an old profile is kept after a role change
            out.append(SupervisorSummary(id=u.id, name=u.name, faculty=s.faculty))
    return sorted(out, key=lambda x: x.name.removeprefix("Assoc. ").removeprefix("Prof. ").removeprefix("Dr. "))


@router.get("/supervisor/listings", response_model=list[Listing])
def my_listings(user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> list[Listing]:
    submitted, held = _submitted_by_listing(store, settings), _held_by_listing(store)
    return [_decorate(lst, user, submitted, held) for lst in store.all_listings() if lst.supervisor_id == user.id]


@router.post("/supervisor/listings", response_model=Listing, status_code=201)
def create(body: ListingCreate, user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> Listing:
    # REQ-PROJ-1: publish before the cycle opens or during it, not after it closes. Drafts are always allowed.
    if body.publish and _cycle_closed(store, settings):
        raise invalid("cycle_closed", "The application cycle has closed. Save this as a draft for the next cycle.")
    _check_text(body.title, body.description)
    _check_faculty(body.offering_faculty)
    lst = Listing(
        id=store.next_id("lst"),
        supervisor_id=user.id,
        supervisor_name=user.name,
        title=body.title,
        description=body.description,
        prerequisites=catalog.clean_courses(body.prerequisites, "prerequisites"),  # NTU course codes only
        topic_tags=catalog.clean_topics(body.topic_tags, "topic_tags"),  # standard topics only
        available_slots=body.available_slots,
        offering_faculty=body.offering_faculty,
        research_location=body.research_location,
        outcomes=body.outcomes.strip(),
        skills=body.skills.strip(),
        hours_per_week=body.hours_per_week,
        mode=body.mode,
        video_url=_video_url(body.video_url),
        created_at=settings.now(),
        status=ListingStatus.published if body.publish else ListingStatus.draft,
    )  # REQ-PROJ-1
    return store.save_listing(lst)


@router.put("/supervisor/listings/{listing_id}", response_model=Listing)
def update(listing_id: str, body: ListingUpdate, user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> Listing:
    lst = store.listing(listing_id)
    if lst is None:
        raise not_found("Project")
    if lst.supervisor_id != user.id:
        raise forbidden()
    if _cycle_closed(store, settings):  # REQ-PROJ-2: first, since the schedule closes every project when the cycle ends
        raise invalid("cycle_closed", "The application cycle has closed. Listings can no longer be edited.")
    if lst.status == ListingStatus.closed:
        raise conflict("listing_closed", "This project is closed, so it can no longer be edited.")
    _check_text(body.title, body.description)
    _check_faculty(body.offering_faculty)
    # REQ-PROJ-3: never below the students who accepted plus the offers still open. Otherwise those offers could be
    # accepted into a project that has no room, leaving it over capacity.
    floor = lst.filled_slots + _held_slots(lst, store)
    if body.available_slots is not None and body.available_slots < floor:
        raise invalid(
            "slots_below_matched",
            f"{floor} students are already matched or have an open offer. Slots cannot go below that.",
            "available_slots",
        )
    changes = body.model_dump(exclude_none=True)
    if body.prerequisites is not None:
        changes["prerequisites"] = catalog.clean_courses(body.prerequisites, "prerequisites")
    if body.topic_tags is not None:
        changes["topic_tags"] = catalog.clean_topics(body.topic_tags, "topic_tags")
    for k in ("hours_per_week", "mode", "video_url"):  # optional details: an explicit null clears them
        if k in body.model_fields_set:
            changes[k] = getattr(body, k)
    if "video_url" in changes:
        changes["video_url"] = _video_url(changes["video_url"])
    if changes.pop("publish", False) and lst.status == ListingStatus.draft:  # REQ-PROJ-1: publish a draft
        lst.status = ListingStatus.published
    for k, v in changes.items():
        setattr(lst, k, v.strip() if isinstance(v, str) else v)
    return store.save_listing(lst)


def _cycle_closed(store, settings) -> bool:
    """True once the cycle's closing date has passed (REQ-PROJ-1, REQ-PROJ-2). No cycle yet counts as open."""
    return bool(store.cycle and settings.now() > store.cycle.closing_date)


def _check_faculty(faculty: str | None) -> None:
    if faculty is not None and not faculty.strip():
        raise invalid("faculty_required", "Choose the faculty that offers this project.", "offering_faculty")


def _check_text(title: str | None, description: str | None) -> None:
    """Same minimums as ListingCreate, checked after trimming spaces so a title of spaces is rejected too."""
    if title is not None and len(title.strip()) < 5:
        raise invalid("title_too_short", "Give the project a title of at least 5 characters.", "title")
    if description is not None and len(description.strip()) < 20:
        raise invalid("description_too_short", "Describe the project in at least 20 characters.", "description")


@router.post("/supervisor/listings/{listing_id}/reopen", response_model=Listing)
def reopen(listing_id: str, user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> Listing:
    """REQ-PROJ-4: a closed project goes back on Browse for the open cycle, with its content kept. Only while a cycle is
    open, from its pre-application period to its closing date. The slot count restarts from this cycle's accepted
    students, so last cycle's students do not fill it."""
    lst = store.listing(listing_id)
    if lst is None:
        raise not_found("Project")
    if lst.supervisor_id != user.id:
        raise forbidden()
    if lst.status != ListingStatus.closed:
        raise conflict("not_closed", "This project is not closed.")
    cycle = store.cycle
    if not listing_lifecycle.cycle_open(cycle, settings.now()):
        raise invalid("cycle_not_open", "No cycle is open. Reopen this project once the next cycle is created.")
    lst.filled_slots = listing_lifecycle.accepted_in_cycle(store, lst.id, cycle)
    lst.status = ListingStatus.published
    return store.save_listing(lst)


@router.post("/supervisor/listings/{listing_id}/close", response_model=Listing)
def close(listing_id: str, user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> Listing:
    """Closing hides the project from students and keeps its matches. Applications still under review are withdrawn
    (a closed project cannot be matched), each affected student's remaining preferences move up, and they are told."""
    lst = store.listing(listing_id)
    if lst is None:
        raise not_found("Project")
    if lst.supervisor_id != user.id:
        raise forbidden()
    if lst.status == ListingStatus.closed:
        return lst
    lst.status = ListingStatus.closed
    store.save_listing(lst)
    now = settings.now()
    stranded = [a for a in store.applications_for(listing_id=lst.id) if a.status == ApplicationStatus.submitted]
    for a in stranded:
        a.status, a.preference_rank = ApplicationStatus.withdrawn, None
    changed = list(stranded)
    for student_id, round_id in {(a.student_id, a.round_id) for a in stranded}:
        active = [
            x for x in store.applications_for(student_id=student_id, round_id=round_id) if x.status == ApplicationStatus.submitted
        ]
        left = sorted(active, key=lambda x: x.preference_rank or 99)
        for i, x in enumerate(left, start=1):
            x.preference_rank = i
        changed += left
    if changed:
        store.save_applications(*changed)
    for a in stranded:
        notify(
            store,
            [a.student_id],
            NotificationEvent.proposal_decided,
            "A project you applied to was closed",
            f"{lst.supervisor_name} closed {lst.title}, so your application was withdrawn. Your other preferences moved up.",
            now,
            "/my-applications",
        )
    return lst


@router.post("/supervisor/listings/{listing_id}/cover", response_model=Listing)
async def cover(
    listing_id: str, request: Request, user: SupervisorUser, store: StoreDep, settings: SettingsDep, file: Annotated[UploadFile, File()]
) -> Listing:
    """Upload or replace a listing's cover image. Changing the cover is an edit, so REQ-PROJ-2 applies."""
    lst = _editable(listing_id, user, store, settings)
    data, content_type = await _read_image(file)
    path = get_storage().put("covers", f"{listing_id}.{IMAGE_TYPES[content_type]}", data, content_type=content_type)
    lst.cover_url = _public_cover_url(path, settings, request)
    return store.save_listing(lst)


@router.post("/supervisor/listings/{listing_id}/gallery", response_model=Listing)
async def add_photo(
    listing_id: str, request: Request, user: SupervisorUser, store: StoreDep, settings: SettingsDep, file: Annotated[UploadFile, File()]
) -> Listing:
    """Add a photo to the listing's gallery (lab, equipment, sample results). Same rules as the cover."""
    lst = _editable(listing_id, user, store, settings)
    if len(lst.gallery_urls) >= MAX_GALLERY:
        raise invalid("gallery_full", f"A project can show up to {MAX_GALLERY} photos. Remove one first.", "file")
    data, content_type = await _read_image(file)
    name = f"gallery/{listing_id}-{uuid4().hex[:8]}.{IMAGE_TYPES[content_type]}"  # a new name, so no cache-busting needed
    path = get_storage().put("covers", name, data, content_type=content_type)
    lst.gallery_urls = [*lst.gallery_urls, _public_cover_url(path, settings, request)]
    return store.save_listing(lst)


@router.get("/mock-files/{path:path}", include_in_schema=False)
def mock_file(path: str) -> Response:
    """Serves an image uploaded in mock mode, which has no storage bucket. Not found in any other mode."""
    storage = get_storage()
    found = storage.files.get(path) if isinstance(storage, MockStorageService) else None
    if found is None:
        raise not_found("File")
    return Response(content=found[0], media_type=found[1])


@router.delete("/supervisor/listings/{listing_id}/gallery/{index}", response_model=Listing)
def remove_photo(listing_id: str, index: int, user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> Listing:
    lst = _editable(listing_id, user, store, settings)
    if not 0 <= index < len(lst.gallery_urls):
        raise not_found("Photo")
    lst.gallery_urls = [u for i, u in enumerate(lst.gallery_urls) if i != index]
    return store.save_listing(lst)


def _editable(listing_id: str, user, store, settings) -> Listing:
    """The supervisor's own listing, while the cycle is open (REQ-PROJ-2)."""
    lst = store.listing(listing_id)
    if lst is None or lst.supervisor_id != user.id:
        raise not_found("Project")
    if _cycle_closed(store, settings):
        raise invalid("cycle_closed", "The application cycle has closed. Listings can no longer be edited.")
    if lst.status == ListingStatus.closed:
        raise conflict("listing_closed", "This project is closed, so it can no longer be edited.")
    return lst


def _sniff_image(data: bytes) -> str | None:
    """What the bytes really are, whatever the upload says. The covers bucket is public, so only real images go in."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


async def _read_image(file: UploadFile) -> tuple[bytes, str]:
    data = await file.read(MAX_IMAGE_BYTES + 1)  # never read more than the limit allows
    if len(data) > MAX_IMAGE_BYTES:
        raise invalid("too_large", "The image is larger than 5 MB.", "file")
    content_type = _sniff_image(data)
    if content_type is None:
        raise invalid("not_image", "Upload a JPEG or PNG image.", "file")
    return data, content_type


IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_GALLERY = 4

_YOUTUBE = re.compile(r"^(?:https?://)?(?:www\.|m\.)?(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/)|youtu\.be/)([\w-]{11})")
_VIMEO = re.compile(r"^(?:https?://)?(?:www\.)?vimeo\.com/(?:video/)?(\d+)")


def _video_url(url: str | None) -> str | None:
    """YouTube or Vimeo only, stored in one canonical form so the page can embed it. Blank clears it."""
    url = (url or "").strip()
    if not url:
        return None
    if m := _YOUTUBE.match(url):
        return f"https://www.youtube.com/watch?v={m.group(1)}"
    if m := _VIMEO.match(url):
        return f"https://vimeo.com/{m.group(1)}"
    raise invalid("video_not_supported", "Paste a YouTube or Vimeo link.", "video_url")


def _public_cover_url(path: str, settings, request: Request) -> str:
    """The `covers` bucket is public, so a plain URL works (no signing, unlike private transcripts).
    `?v=` changes on every upload: the file name stays the same, so without it browsers would keep the old image."""
    version = int(settings.now().timestamp())
    if settings.api_mode == "supabase":
        return f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/{path}?v={version}"
    return f"{str(request.base_url).rstrip('/')}/mock-files/{path}?v={version}"


@router.get("/phase-check", response_model=Ok, include_in_schema=False)
def _phase(store: StoreDep, settings: SettingsDep) -> Ok:
    windows.phase(store.cycle, settings.now())
    return Ok()
