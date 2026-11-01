"""REQ-VRANK-1. AI match sends the words inside an applicant's supporting documents, so evidence counts and not only CGPA."""

from app.models import Applicant, ApplicantStudent, Document
from app.services import ai_match
from app.services.storage import MockStorageService
from app.settings import get_settings


def _pdf(text: str) -> bytes:
    """A one-page PDF whose only content is `text`. Enough for pypdf to read."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = b"%PDF-1.4\n", []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (i, body)
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    return out + b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (len(objs) + 1, xref)


def _applicant(documents: list[Document]) -> Applicant:
    now = get_settings().now()
    stu = ApplicantStudent(
        id="stu-1", name="A", school="CCDS", year_of_study=3, cgpa=3.5, completed_modules=[], research_interests=[]
    )
    return Applicant(application_id="app-x", student=stu, statement="s", submitted_at=now, documents=documents)


def _doc(kind: str, path: str | None) -> Document:
    return Document(
        id="d",
        owner_id="stu-1",
        file_name="portfolio.pdf",
        kind=kind,
        file_size=1,
        uploaded_at=get_settings().now(),
        storage_path=path,
    )


def test_REQ_VRANK_1_the_words_of_a_supporting_document_reach_the_prompt(monkeypatch):
    storage = MockStorageService()
    storage.put("documents", "stu-1/d.pdf", _pdf("Graded retinal images on APTOS with kappa 0.89"))
    monkeypatch.setattr(ai_match, "get_storage", lambda: storage)
    sources, unread = ai_match._sources(_applicant([_doc("supporting", "documents/stu-1/d.pdf")]))
    assert "APTOS" in sources["d"][1] and unread == []


def test_REQ_VRANK_4_the_transcript_is_read_too(monkeypatch):
    storage = MockStorageService()
    storage.put("documents", "stu-1/d.pdf", _pdf("transcript text"))
    monkeypatch.setattr(ai_match, "get_storage", lambda: storage)
    sources, _ = ai_match._sources(_applicant([_doc("transcript", "documents/stu-1/d.pdf")]))
    assert "transcript text" in sources["d"][1]


def test_REQ_VRANK_4_missing_files_add_nothing_and_are_named(monkeypatch):
    storage = MockStorageService()
    monkeypatch.setattr(ai_match, "get_storage", lambda: storage)
    sources, unread = ai_match._sources(_applicant([_doc("supporting", None), _doc("supporting", "documents/stu-1/none.pdf")]))
    assert set(sources) == {"statement", "profile"} and unread == ["portfolio.pdf", "portfolio.pdf"]
