"""Slice C: supervisor applicant review and ranking.  REQ-VRANK-1..3."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import CurrentUser, SettingsDep, StoreDep, SupervisorUser
from app.errors import forbidden, invalid, not_found
from app.models import (
    Applicant,
    ApplicantRanking,
    ApplicantRankingUpdate,
    ApplicantScore,
    ApplicantStudent,
    ApplicationStatus,
    Document,
)
from app.services import ai_match as ai_match_service
from app.services import windows
from app.services.storage import get_storage

router = APIRouter(tags=["rankings"])

TOP_N = 10  # REQ-VRANK-1


def _applicants(store, listing_id: str, round_id: str | None) -> list[Applicant]:
    lst = store.listing(listing_id)
    out = []
    for a in store.applications_for(listing_id=listing_id, round_id=round_id or None):
        if a.status != ApplicationStatus.submitted:
            continue
        u, sp = store.user(a.student_id), store.student(a.student_id)
        if u is None or sp is None:
            continue
        out.append(
            Applicant(
                application_id=a.id,
                student=ApplicantStudent(
                    id=u.id,
                    name=u.name,
                    school=sp.school,
                    year_of_study=sp.year_of_study,
                    cgpa=sp.cgpa,
                    completed_modules=sp.completed_modules,
                    research_interests=sp.research_interests,
                ),
                statement=a.statement,
                submitted_at=a.submitted_at,
                documents=sp.documents,
                meets_prerequisites=all(m in sp.completed_modules for m in lst.prerequisites) if lst else True,
            )
        )
    return out


@router.get("/supervisor/listings/{listing_id}/applicants", response_model=list[Applicant])
def applicants(
    listing_id: str,
    user: SupervisorUser,
    store: StoreDep,
    settings: SettingsDep,
    school: str | None = None,
    min_cgpa: float | None = None,
    prerequisites_only: bool = False,
) -> list[Applicant]:
    lst = store.listing(listing_id)
    if lst is None:
        raise not_found("Project")
    if lst.supervisor_id != user.id:
        raise forbidden()
    phase = windows.phase(store.cycle, settings.now())
    rows = _applicants(store, listing_id, phase.round_id)
    if school:
        rows = [r for r in rows if r.student.school == school]
    if min_cgpa is not None:
        rows = [r for r in rows if (r.student.cgpa or 0) >= min_cgpa]
    if prerequisites_only:
        rows = [r for r in rows if r.meets_prerequisites]
    # top-10 recommendation: prerequisites met first, then CGPA (REQ-VRANK-1)
    for r in sorted(rows, key=lambda r: (not r.meets_prerequisites, -(r.student.cgpa or 0)))[:TOP_N]:
        r.recommended = True
    ranking = store.ranking(listing_id, phase.round_id)
    for r in rows:
        r.rank = ranking.index(r.application_id) + 1 if r.application_id in ranking else None
    return rows


@router.post("/supervisor/listings/{listing_id}/applicants/ai-match", response_model=list[ApplicantScore])
def ai_match(listing_id: str, user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> list[ApplicantScore]:
    """Fit score and reason for each applicant this round (REQ-VRANK-1). Gemini when GEMINI_API_KEY is set, else local.
    Only the listing's own supervisor: the scores are built from applicants' personal data (SRS 5.3.3)."""
    lst = store.listing(listing_id)
    if lst is None:
        raise not_found("Project")
    if lst.supervisor_id != user.id:
        raise forbidden()
    phase = windows.phase(store.cycle, settings.now())
    return ai_match_service.score_applicants(settings, lst, _applicants(store, listing_id, phase.round_id))


@router.get("/supervisor/applicants/{application_id}", response_model=Applicant)
def applicant(application_id: str, user: SupervisorUser, store: StoreDep) -> Applicant:
    a = store.application(application_id)
    if a is None:
        raise not_found("Application")
    lst = store.listing(a.listing_id)
    if lst is None or lst.supervisor_id != user.id:
        raise forbidden()
    row = next((r for r in _applicants(store, a.listing_id, None) if r.application_id == application_id), None)
    if row is None:  # withdrawn or already matched: no longer under review
        raise not_found("Application")
    return row


@router.get("/supervisor/listings/{listing_id}/ranking", response_model=ApplicantRanking)
def get_ranking(listing_id: str, user: SupervisorUser, store: StoreDep, settings: SettingsDep) -> ApplicantRanking:
    lst = store.listing(listing_id)
    if lst is None or lst.supervisor_id != user.id:
        raise forbidden()
    phase = windows.phase(store.cycle, settings.now())
    return ApplicantRanking(
        listing_id=listing_id,
        round_id=phase.round_id or "",
        application_ids=store.ranking(listing_id, phase.round_id),
    )


@router.put("/supervisor/listings/{listing_id}/ranking", response_model=ApplicantRanking)
def put_ranking(
    listing_id: str, body: ApplicantRankingUpdate, user: SupervisorUser, store: StoreDep, settings: SettingsDep
) -> ApplicantRanking:
    lst = store.listing(listing_id)
    if lst is None or lst.supervisor_id != user.id:
        raise forbidden()
    now = settings.now()
    phase = windows.phase(store.cycle, now)
    if phase.window.value not in ("application", "review"):  # REQ-VRANK-2: until the round's ranking deadline
        raise invalid("ranking_closed", "Rankings for this round are closed.")
    valid = {a.application_id for a in _applicants(store, listing_id, phase.round_id)}
    if any(aid not in valid for aid in body.application_ids) or len(set(body.application_ids)) != len(body.application_ids):
        raise invalid("bad_ranking", "Ranking must list applicants to this project, each once.", "application_ids")
    store.save_ranking(listing_id, phase.round_id, body.application_ids, now)
    return ApplicantRanking(
        listing_id=listing_id, round_id=phase.round_id or "", application_ids=body.application_ids, submitted_at=now
    )


def _may_view(store, user, owner_id: str, document_id: str) -> bool:
    """Owner, admins, the supervisor of any listing the owner applied to (REQ-VRANK-3), and the
    supervisor a proposal with this document attached was sent to (REQ-REVPROP-1). SRS 5.3.3."""
    if user.id == owner_id or user.role.value == "admin":
        return True
    if user.role.value != "supervisor":
        return False
    applied = any(
        (lst := store.listing(a.listing_id)) is not None and lst.supervisor_id == user.id
        for a in store.applications_for(student_id=owner_id)
    )
    return applied or any(document_id in p.document_ids for p in store.proposals_for(student_id=owner_id, supervisor_id=user.id))


@router.get("/documents/{document_id}/view", response_model=Document)
def view_document(document_id: str, user: CurrentUser, store: StoreDep, settings: SettingsDep) -> Document:
    """Returns a 10-minute signed URL for the in-app PDF viewer (REQ-VRANK-3).
    url is null when no file was ever uploaded for the document."""
    for sp in store.students:
        for d in sp.documents:
            if d.id == document_id:
                if not _may_view(store, user, sp.user_id, d.id):
                    raise forbidden()
                # Mock storage serves a sample PDF for every document; live storage needs the uploaded file.
                has_file = d.storage_path is not None or settings.api_mode == "mock"
                url = get_storage().signed_url("documents", d.storage_path or "", minutes=10) if has_file else None
                return d.model_copy(update={"url": url})
    raise not_found("Document")
