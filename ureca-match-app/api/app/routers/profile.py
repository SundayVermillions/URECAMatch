"""Slice A: student profile and documents.  REQ-PROF-1..3."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, UploadFile

from app.deps import SettingsDep, StoreDep, StudentUser
from app.errors import invalid, not_found
from app.models import Document, Ok, ProfileUpdate, StudentProfile
from app.services import catalog
from app.services.storage import get_storage

router = APIRouter(tags=["profile"])

MAX_PDF_BYTES = 5 * 1024 * 1024  # REQ-PROF-3
MAX_SUPPORTING = 5  # the transcript slot is separate and never counts toward this


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
    p.school, p.degree, p.cgpa, p.year_of_study = body.school, body.degree, body.cgpa, body.year_of_study
    p.completed_modules = catalog.clean_courses(body.completed_modules, "completed_modules")  # compared with prerequisites
    p.research_interests = catalog.clean_topics(body.research_interests, "research_interests")
    p.profile_complete = True  # REQ-PROF-1
    store.save_student(p)
    return p


@router.post("/me/documents", response_model=Document, status_code=201)
async def upload_document(
    user: StudentUser,
    store: StoreDep,
    settings: SettingsDep,
    file: Annotated[UploadFile, File()],
    kind: Annotated[Literal["transcript", "supporting"], Form()] = "supporting",
) -> Document:
    if (file.content_type or "") != "application/pdf" or not (file.filename or "").lower().endswith(".pdf"):
        raise invalid("not_pdf", "Upload a PDF file.", "file")
    data = await file.read()
    if len(data) > MAX_PDF_BYTES:
        raise invalid("too_large", "The file is larger than 5 MB.", "file")

    p = store.student(user.id)
    if kind == "supporting" and p and sum(d.kind == "supporting" for d in p.documents) >= MAX_SUPPORTING:
        raise invalid("max_documents", "You can upload a maximum of 5 supporting documents.", "file")

    doc_id = store.next_id("doc")
    storage = get_storage()
    path = storage.put("documents", f"{user.id}/{doc_id}.pdf", data, content_type="application/pdf")

    doc = Document(
        id=doc_id,
        owner_id=user.id,
        file_name=file.filename or "document.pdf",
        kind=kind,
        file_size=len(data),
        uploaded_at=settings.now(),
        storage_path=path,
    )
    p = store.student(user.id)
    if kind == "transcript" and p:  # one transcript only: the new file replaces the old one
        for old in [d for d in p.documents if d.kind == "transcript"]:
            _remove(store, p, old.id, user.id)
    store.save_document(doc.model_dump(mode="json", exclude={"url"}))
    p = store.student(user.id)
    if p:
        p.documents.append(doc)
    return doc


def _remove(store, p: StudentProfile, document_id: str, owner_id: str) -> None:
    p.documents = [d for d in p.documents if d.id != document_id]
    client = getattr(store, "client", None)
    if client:
        client.table("supporting_documents").delete().eq("id", document_id).eq("owner_id", owner_id).execute()


@router.delete("/me/documents/{document_id}", response_model=Ok)
def delete_document(document_id: str, user: StudentUser, store: StoreDep) -> Ok:
    p = store.student(user.id)
    if p is None:
        raise not_found("Profile")
    doc = next((d for d in p.documents if d.id == document_id), None)
    if not doc:
        raise not_found("Document")
    _remove(store, p, document_id, user.id)
    return Ok()
