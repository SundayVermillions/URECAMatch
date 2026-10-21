import io

from app.routers.profile import MAX_PDF_BYTES


def test_REQ_PROF_3_upload_pdf_stores_path(client_for):
    client = client_for("stu-1")
    pdf_content = b"%PDF-1.4 mock transcript content"
    files = {"file": ("transcript.pdf", io.BytesIO(pdf_content), "application/pdf")}

    resp = client.post("/me/documents", files=files)
    assert resp.status_code == 201
    data = resp.json()
    assert data["storage_path"] == f"documents/stu-1/{data['id']}.pdf"
    assert data["file_name"] == "transcript.pdf"
    assert data["file_size"] == len(pdf_content)


def test_REQ_PROF_3_non_pdf_rejected(client_for):
    client = client_for("stu-1")
    txt_content = b"Not a PDF document"
    files = {"file": ("notes.txt", io.BytesIO(txt_content), "text/plain")}

    resp = client.post("/me/documents", files=files)
    assert resp.status_code == 422
    body = resp.json()
    message = body.get("message") or body.get("detail", {}).get("message", "")
    assert "PDF" in str(message)


def test_REQ_PROF_3_over_5mb_rejected(client_for):
    client = client_for("stu-1")
    oversized_data = b"0" * (MAX_PDF_BYTES + 100)
    files = {"file": ("large.pdf", io.BytesIO(oversized_data), "application/pdf")}

    resp = client.post("/me/documents", files=files)
    assert resp.status_code == 422
    body = resp.json()
    message = body.get("message") or body.get("detail", {}).get("message", "")
    assert "5 MB" in str(message)


def test_REQ_PROF_1_profile_marked_complete_after_save(client_for):
    client = client_for("stu-1")
    resp = client.get("/me/profile")
    assert resp.status_code == 200

    payload = {
        "school": "SCSE",
        "cgpa": 4.5,
        "year_of_study": 3,
        "completed_modules": ["SC2006", "SC2001"],
        "research_interests": ["Machine Learning", "Software Engineering"],
    }
    put_resp = client.put("/me/profile", json=payload)
    assert put_resp.status_code == 200
    data = put_resp.json()
    assert data["profile_complete"] is True


def test_REQ_PROF_2_fields_saved(client_for):
    """Saving profile updates all fields correctly (REQ-PROF-2)."""
    client = client_for("stu-1")
    payload = {
        "school": "SCSE",
        "cgpa": 4.85,
        "year_of_study": 2,
        "completed_modules": ["SC1003", "SC1007"],
        "research_interests": ["Algorithms and Theory", "Distributed Systems"],
    }
    put_resp = client.put("/me/profile", json=payload)
    assert put_resp.status_code == 200

    get_resp = client.get("/me/profile")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["school"] == "SCSE"
    assert data["cgpa"] == 4.85
    assert data["year_of_study"] == 2
    assert data["completed_modules"] == ["SC1003", "SC1007"]
    assert data["research_interests"] == ["Algorithms and Theory", "Distributed Systems"]


def _pdf(name: str):
    return {"file": (name, io.BytesIO(b"%PDF-1.4 x"), "application/pdf")}


def _docs(client):
    return client.get("/me/profile").json()["documents"]


def test_REQ_PROF_3_transcript_kind_ignores_file_name(client_for):
    client = client_for("stu-1")
    resp = client.post("/me/documents", files=_pdf("abcd.pdf"), data={"kind": "transcript"})
    assert resp.status_code == 201
    assert resp.json()["kind"] == "transcript"
    transcripts = [d for d in _docs(client) if d["kind"] == "transcript"]
    assert [d["file_name"] for d in transcripts] == ["abcd.pdf"]  # replaced the seeded transcript


def test_REQ_PROF_3_default_kind_is_supporting(client_for):
    client = client_for("stu-1")
    resp = client.post("/me/documents", files=_pdf("transcript.pdf"))
    assert resp.json()["kind"] == "supporting"


def test_REQ_PROF_3_transcript_does_not_use_supporting_cap(client_for):
    client = client_for("stu-1")
    while sum(d["kind"] == "supporting" for d in _docs(client)) < 5:
        assert client.post("/me/documents", files=_pdf("s.pdf")).status_code == 201
    assert client.post("/me/documents", files=_pdf("s.pdf")).status_code == 422
    assert client.post("/me/documents", files=_pdf("t.pdf"), data={"kind": "transcript"}).status_code == 201


def test_REQ_PROF_3_delete_transcript_empties_slot(client_for):
    client = client_for("stu-1")
    tid = next(d["id"] for d in _docs(client) if d["kind"] == "transcript")
    assert client.delete(f"/me/documents/{tid}").status_code == 200
    assert not [d for d in _docs(client) if d["kind"] == "transcript"]
