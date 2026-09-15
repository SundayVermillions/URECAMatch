"""Slice A: student profile and documents.  REQ-PROF-1..3."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, UploadFile

from app.deps import SettingsDep, StoreDep, StudentUser
from app.errors import invalid, not_found
from app.models import Document, ProfileUpdate, StudentProfile

router = APIRouter(tags=["profile"])

MAX_PDF_BYTES = 5 * 1024 * 1024  # REQ-PROF-3


@router.get("/me/profile", response_model=StudentProfile)
def get_profile(user: StudentUser, store: StoreDep) -> StudentProfile:
    p = store.student(user.id)
    if p is None:
        raise not_found("Profile")
    return p


@router.put("/me/profile", response_model=StudentProfile)
def update_profile(body: ProfileUpdate, user: StudentUser, store: StoreDep) -> StudentProfile:
    p = store.student(user.id)
    if p is None:
        raise not_found("Profile")
    p.school, p.cgpa, p.year_of_study = body.school, body.cgpa, body.year_of_study
    p.completed_modules, p.research_interests = body.completed_modules, body.research_interests
    p.profile_complete = True  # REQ-PROF-1
    return p


@router.post("/me/documents", response_model=Document, status_code=201)
async def upload_document(
    user: StudentUser, store: StoreDep, settings: SettingsDep, file: Annotated[UploadFile, File()]
) -> Document:
    if (file.content_type or "") != "application/pdf" or not (file.filename or "").lower().endswith(".pdf"):
        raise invalid("not_pdf", "Upload a PDF file.", "file")
    data = await file.read()
    if len(data) > MAX_PDF_BYTES:
        raise invalid("too_large", "The file is larger than 5 MB.", "file")
    doc = Document(
        id=store.next_id("doc"),
        owner_id=user.id,
        file_name=file.filename or "document.pdf",
        file_size=len(data),
        uploaded_at=settings.now(),
    )
    # TODO(slice A): put bytes in Supabase Storage bucket `documents` and store the path.
    p = store.student(user.id)
    if p:
        p.documents.append(doc)
    return doc
