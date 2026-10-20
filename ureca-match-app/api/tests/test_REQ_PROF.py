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
