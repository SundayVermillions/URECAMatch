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
