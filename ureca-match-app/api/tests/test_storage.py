from app.services.storage import MockStorageService


def test_mock_storage_put_returns_path():
    svc = MockStorageService()
    path = svc.put("documents", "user-1/transcript.pdf", b"%PDF-mock-bytes")
    assert path == "documents/user-1/transcript.pdf"


def test_mock_storage_signed_url():
    svc = MockStorageService()
    doc_url = svc.signed_url("documents", "user-1/transcript.pdf")
    cover_url = svc.signed_url("covers", "listing-1/banner.png")

    assert "pdf" in doc_url
    assert "cover" in cover_url or "sample" in cover_url
