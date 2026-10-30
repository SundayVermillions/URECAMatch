"""Storage service adapter.

Provides an abstraction for uploading files and generating signed URLs.
In mock mode, returns local preview URLs.
In supabase mode, uploads bytes and signs URLs via Supabase Storage.
"""

from typing import Protocol

from app.settings import get_settings


class StorageService(Protocol):
    def put(
        self,
        bucket: str,
        path: str,
        data: bytes,
        content_type: str = "application/pdf",
    ) -> str:
        """Uploads file data and returns the stored path or reference."""
        ...

    def signed_url(self, bucket: str, path: str, minutes: int = 10) -> str:
        """Generates a temporary read URL for a stored file."""
        ...


class MockStorageService:
    def __init__(self, base_url: str = "") -> None:
        self.base_url = base_url

    def put(
        self,
        bucket: str,
        path: str,
        data: bytes,
        content_type: str = "application/pdf",
    ) -> str:
        return f"{bucket}/{path.lstrip('/')}"

    def signed_url(self, bucket: str, path: str, minutes: int = 10) -> str:
        if bucket == "covers":
            return "/sample-cover.png"
        return "/sample-transcript.pdf"


class SupabaseStorageService:
    def __init__(self) -> None:
        from app.db.client import make_client

        s = get_settings()
        self.client = make_client(s.supabase_url, s.supabase_service_role_key)

    def put(
        self,
        bucket: str,
        path: str,
        data: bytes,
        content_type: str = "application/pdf",
    ) -> str:
        clean_path = path.lstrip("/")
        self.client.storage.from_(bucket).upload(
            clean_path,
            data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        return f"{bucket}/{clean_path}"

    def signed_url(self, bucket: str, path: str, minutes: int = 10) -> str:
        clean_path = path
        if clean_path.startswith(f"{bucket}/"):
            clean_path = clean_path[len(bucket) + 1 :]
        res = self.client.storage.from_(bucket).create_signed_url(clean_path, minutes * 60)
        return res.get("signedURL") or res.get("signedUrl") or ""


_storage: StorageService | None = None


def get_storage() -> StorageService:
    global _storage
    if _storage is None:
        settings = get_settings()
        if settings.api_mode == "supabase":
            _storage = SupabaseStorageService()
        else:
            _storage = MockStorageService()
    return _storage
