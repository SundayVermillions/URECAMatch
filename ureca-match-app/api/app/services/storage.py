"""Storage service adapter.

Provides an abstraction for uploading files and generating signed URLs.
In mock mode, returns local preview URLs.
In supabase mode, uploads bytes and signs URLs via Supabase Storage.
"""

import base64
from pathlib import Path
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

    def read(self, bucket: str, path: str) -> bytes | None:
        """The stored bytes, or None when there is no such file (a seeded document has none)."""
        ...


DEMO_DOCS = Path(__file__).resolve().parents[1] / "db" / "demo_docs"  # real files for the seeded documents that have one


class MockStorageService:
    def __init__(self, base_url: str = "") -> None:
        self.base_url = base_url
        self._files: dict[str, tuple[bytes, str]] = {}  # uploads live in memory, like the rest of mock mode

    def put(
        self,
        bucket: str,
        path: str,
        data: bytes,
        content_type: str = "application/pdf",
    ) -> str:
        key = f"{bucket}/{path.lstrip('/')}"
        self._files[key] = (data, content_type)
        return key

    def signed_url(self, bucket: str, path: str, minutes: int = 10) -> str:
        key = path if path.startswith(f"{bucket}/") else f"{bucket}/{path.lstrip('/')}"
        if key in self._files:  # show what was uploaded, not a stock file
            data, content_type = self._files[key]
            return f"data:{content_type};base64,{base64.b64encode(data).decode()}"
        seeded = DEMO_DOCS / Path(path).name
        if seeded.is_file():
            return f"data:application/pdf;base64,{base64.b64encode(seeded.read_bytes()).decode()}"
        if bucket == "covers":
            return "/sample-cover.png"
        return "/sample-transcript.pdf"

    def read(self, bucket: str, path: str) -> bytes | None:
        key = path if path.startswith(f"{bucket}/") else f"{bucket}/{path.lstrip('/')}"
        found = self._files.get(key)
        if found:
            return found[0]
        seeded = DEMO_DOCS / Path(path).name
        return seeded.read_bytes() if seeded.is_file() else None


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

    def read(self, bucket: str, path: str) -> bytes | None:
        clean_path = path[len(bucket) + 1 :] if path.startswith(f"{bucket}/") else path
        try:
            return self.client.storage.from_(bucket).download(clean_path)
        except Exception:  # no such file
            return None


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
