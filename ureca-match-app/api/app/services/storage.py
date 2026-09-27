"""Storage service adapter.

Provides an abstraction for uploading files and generating signed URLs.
In mock mode (or when Supabase storage is unconfigured), returns local preview URLs.
"""

from typing import Protocol


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


storage: StorageService = MockStorageService()


def get_storage() -> StorageService:
    return storage
