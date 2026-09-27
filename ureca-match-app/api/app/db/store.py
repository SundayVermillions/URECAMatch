"""Data access.

`Store` is the interface every service talks to. `MockStore` keeps the seed in
memory (API_MODE=mock) so the whole app runs without Supabase. `SupabaseStore`
is the real implementation; each slice fills in the methods for its own tables.

Rule: routers never query directly. They call a service, the service calls the store.
"""

from __future__ import annotations

from datetime import datetime
from typing import Protocol

from app.db import seed_data
from app.models import (
    Application,
    AuditEntry,
    Cycle,
    Listing,
    Match,
    Notification,
    Proposal,
    StudentProfile,
    SupervisorProfile,
    User,
)


class Store(Protocol):
    users: list[User]
    students: list[StudentProfile]
    supervisors: list[SupervisorProfile]
    cycle: Cycle | None
    listings: list[Listing]
    applications: list[Application]
    matches: list[Match]
    proposals: list[Proposal]
    notifications: list[Notification]
    audit: list[AuditEntry]
    applicant_rankings: dict[str, list[str]]  # f"{listing_id}:{round_id}" -> ordered application ids
    verification_codes: dict[str, tuple[str, datetime]]  # email -> (code, expiry)

    def user(self, user_id: str) -> User | None: ...
    def user_by_email(self, email: str) -> User | None: ...
    def student(self, user_id: str) -> StudentProfile | None: ...
    def supervisor(self, user_id: str) -> SupervisorProfile | None: ...
    def listing(self, listing_id: str) -> Listing | None: ...
    def next_id(self, prefix: str) -> str: ...


class MockStore:
    """In-memory store seeded from seed_data. State resets on process restart."""

    def __init__(self) -> None:
        data = seed_data.build()
        self.users: list[User] = data["users"]
        self.students: list[StudentProfile] = data["students"]
        self.supervisors: list[SupervisorProfile] = data["supervisors"]
        self.cycle: Cycle | None = data["cycle"]
        self.listings: list[Listing] = data["listings"]
        self.applications: list[Application] = data["applications"]
        self.matches: list[Match] = data["matches"]
        self.proposals: list[Proposal] = data["proposals"]
        self.notifications: list[Notification] = data["notifications"]
        self.audit: list[AuditEntry] = data["audit"]
        self.applicant_rankings: dict[str, list[str]] = {
            # Prof. Chua has started ranking lst-1 for Round 2
            "lst-1:rnd-2": [a.id for a in self.applications if a.listing_id == "lst-1" and a.round_id == "rnd-2"][:4],
        }
        self.verification_codes: dict[str, tuple[str, datetime]] = {}
        self._counter = 1000

    def user(self, user_id: str) -> User | None:
        return next((u for u in self.users if u.id == user_id), None)

    def user_by_email(self, email: str) -> User | None:
        return next((u for u in self.users if u.email.lower() == email.lower()), None)

    def student(self, user_id: str) -> StudentProfile | None:
        return next((s for s in self.students if s.user_id == user_id), None)

    def supervisor(self, user_id: str) -> SupervisorProfile | None:
        return next((s for s in self.supervisors if s.user_id == user_id), None)

    def listing(self, listing_id: str) -> Listing | None:
        return next((lst for lst in self.listings if lst.id == listing_id), None)

    def next_id(self, prefix: str) -> str:
        self._counter += 1
        return f"{prefix}-{self._counter}"


class SupabaseStore(MockStore):
    """TODO(all slices): replace the in-memory lists with Supabase queries table by table."""

    def __init__(self) -> None:
        super().__init__()
        from supabase import create_client  # noqa: F401

        from app.settings import get_settings

        s = get_settings()
        self.client = create_client(s.supabase_url, s.supabase_service_role_key) if s.supabase_url else None


_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        from app.settings import get_settings

        _store = SupabaseStore() if get_settings().api_mode == "supabase" else MockStore()
    return _store


def reset_store() -> None:
    """Tests call this to get a fresh seed."""
    global _store
    _store = None
