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

    def save_student(self, student: StudentProfile) -> StudentProfile:
        """Save or update student profile in mock store."""
        for i, s in enumerate(self.students):
            if s.user_id == student.user_id:
                self.students[i] = student
                return student
        self.students.append(student)
        return student

    def save_supervisor(self, supervisor: SupervisorProfile) -> SupervisorProfile:
        """Save or update supervisor profile in mock store."""
        for i, s in enumerate(self.supervisors):
            if s.user_id == supervisor.user_id:
                self.supervisors[i] = supervisor
                return supervisor
        self.supervisors.append(supervisor)
        return supervisor

    def save_document(self, doc_data: dict) -> dict:
        """Save document in mock store."""
        # In mock mode, the document is already appended to student.documents in memory
        return doc_data


class SupabaseStore(MockStore):
    """Real Supabase store. Slice A tables are persisted to Postgres."""

    def __init__(self) -> None:
        super().__init__()
        from supabase import create_client

        from app.settings import get_settings

        s = get_settings()
        self.client = create_client(s.supabase_url, s.supabase_service_role_key) if s.supabase_url else None

    def next_id(self, prefix: str) -> str:
        import uuid

        short_id = uuid.uuid4().hex[:8]
        return f"{prefix}-{short_id}"
    
    # --- Slice A: Users & Profiles Read ---

    def user(self, user_id: str) -> User | None:
        if not self.client:
            return super().user(user_id)
        res = self.client.table("users").select("*").eq("id", user_id).limit(1).execute()
        if not res.data:
            return None
        return User.model_validate(res.data[0])

    def user_by_email(self, email: str) -> User | None:
        if not self.client:
            return super().user_by_email(email)
        res = self.client.table("users").select("*").ilike("email", email.strip()).limit(1).execute()
        if not res.data:
            return None
        return User.model_validate(res.data[0])

    def student(self, user_id: str) -> StudentProfile | None:
        if not self.client:
            return super().student(user_id)
        res = self.client.table("student_profiles").select("*").eq("user_id", user_id).limit(1).execute()
        if not res.data:
            return None
        row = res.data[0]
        # Query supporting_documents by owner_id
        doc_res = self.client.table("supporting_documents").select("*").eq("owner_id", user_id).execute()
        row["documents"] = doc_res.data or []
        return StudentProfile.model_validate(row)

    def supervisor(self, user_id: str) -> SupervisorProfile | None:
        if not self.client:
            return super().supervisor(user_id)
        res = self.client.table("supervisor_profiles").select("*").eq("user_id", user_id).limit(1).execute()
        if not res.data:
            return None
        return SupervisorProfile.model_validate(res.data[0])

    # --- Slice A: Users & Profiles Write / Mutation ---

    def save_user(self, user: User) -> User:
        """Upsert a user record."""
        if not self.client:
            return user
        payload = user.model_dump(mode="json")
        self.client.table("users").upsert(payload).execute()
        return user

    def save_student(self, student: StudentProfile) -> StudentProfile:
        """Upsert a student profile record."""
        if not self.client:
            return student
        payload = student.model_dump(mode="json", exclude={"documents"})
        self.client.table("student_profiles").upsert(payload).execute()
        return student

    def save_supervisor(self, supervisor: SupervisorProfile) -> SupervisorProfile:
        """Upsert a supervisor profile record."""
        if not self.client:
            return supervisor
        payload = supervisor.model_dump(mode="json")
        self.client.table("supervisor_profiles").upsert(payload).execute()
        return supervisor

    def save_document(self, doc_data: dict) -> dict:
        """Insert a document record into Postgres."""
        if not self.client:
            return doc_data
        res = self.client.table("supporting_documents").insert(doc_data).execute()
        return res.data[0] if res.data else doc_data


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
