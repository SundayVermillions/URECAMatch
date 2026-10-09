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
    CycleStatus,
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
    cycles: list[Cycle]  # history; at most one is not closed
    cycle: Cycle | None  # the active (not closed) cycle, or None
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
    def cycle_by_id(self, cycle_id: str) -> Cycle | None: ...  # slice D: any cycle in the history
    def all_listings(self) -> list[Listing]: ...  # slice B: every listing, any status
    def save_listing(self, listing: Listing) -> Listing: ...  # slice B: insert or update
    def proposals_for(self, student_id: str | None = None, supervisor_id: str | None = None) -> list[Proposal]: ...  # slice B
    def proposal(self, proposal_id: str) -> Proposal | None: ...  # slice B
    def save_proposal(self, proposal: Proposal) -> Proposal: ...  # slice B: insert or update
    def applications_for(
        self, student_id: str | None = None, listing_id: str | None = None, round_id: str | None = None
    ) -> list[Application]: ...  # slice C: None means "any"
    def application(self, application_id: str) -> Application | None: ...  # slice C
    def save_applications(self, *apps: Application) -> None: ...  # slice C: insert or update
    def ranking(self, listing_id: str, round_id: str | None) -> list[str]: ...  # slice C: ordered application ids
    def save_ranking(  # slice C
        self, listing_id: str, round_id: str | None, application_ids: list[str], submitted_at: datetime
    ) -> None: ...
    def next_id(self, prefix: str) -> str: ...


class MockStore:
    """In-memory store seeded from seed_data. State resets on process restart."""

    def __init__(self) -> None:
        data = seed_data.build()
        self.users: list[User] = data["users"]
        self.students: list[StudentProfile] = data["students"]
        self.supervisors: list[SupervisorProfile] = data["supervisors"]
        self.cycles: list[Cycle] = data["cycles"]
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

    @property
    def cycle(self) -> Cycle | None:
        """The one active (not closed) cycle, or None. At most one cycle is active at a time."""
        return next((c for c in self.cycles if c.status != CycleStatus.closed), None)

    def cycle_by_id(self, cycle_id: str) -> Cycle | None:
        return next((c for c in self.cycles if c.id == cycle_id), None)

    # --- Slice B: listings. In memory, an object is already "saved" once it is in the list.
    def all_listings(self) -> list[Listing]:
        return list(self.listings)

    def save_listing(self, listing: Listing) -> Listing:
        if all(x.id != listing.id for x in self.listings):
            self.listings.append(listing)
        return listing

    # --- Slice B: self-proposed projects
    def proposals_for(self, student_id: str | None = None, supervisor_id: str | None = None) -> list[Proposal]:
        return [
            p for p in self.proposals
            if (student_id is None or p.student_id == student_id) and (supervisor_id is None or p.supervisor_id == supervisor_id)
        ]

    def proposal(self, proposal_id: str) -> Proposal | None:
        return next((p for p in self.proposals if p.id == proposal_id), None)

    def save_proposal(self, proposal: Proposal) -> Proposal:
        if all(x.id != proposal.id for x in self.proposals):
            self.proposals.append(proposal)
        return proposal

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

    # --- Slice C: applications and rankings. In memory, an object is already "saved" once it is in the list.
    def applications_for(
        self, student_id: str | None = None, listing_id: str | None = None, round_id: str | None = None
    ) -> list[Application]:
        return [
            a
            for a in self.applications
            if (student_id is None or a.student_id == student_id)
            and (listing_id is None or a.listing_id == listing_id)
            and (round_id is None or a.round_id == round_id)
        ]

    def application(self, application_id: str) -> Application | None:
        return next((a for a in self.applications if a.id == application_id), None)

    def save_applications(self, *apps: Application) -> None:
        for app in apps:
            if all(a.id != app.id for a in self.applications):
                self.applications.append(app)

    def ranking(self, listing_id: str, round_id: str | None) -> list[str]:
        return list(self.applicant_rankings.get(f"{listing_id}:{round_id}", []))

    def save_ranking(self, listing_id: str, round_id: str | None, application_ids: list[str], submitted_at: datetime) -> None:
        self.applicant_rankings[f"{listing_id}:{round_id}"] = list(application_ids)


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


    # --- Slice B: listings (table project_listings) ---

    # Columns that exist in project_listings. Other Listing fields are computed per request
    # (supervisor_name is joined from users; applicant_count, applied, applied_rank by the router).
    _LISTING_COLUMNS = {
        "id", "supervisor_id", "title", "description", "prerequisites", "topic_tags", "available_slots",
        "filled_slots", "offering_faculty", "research_location", "cover_url", "status", "created_at",
    }

    @staticmethod
    def _listing_from_row(row: dict) -> Listing:
        joined = row.pop("users", None) or {}
        return Listing.model_validate({**row, "supervisor_name": joined.get("name", "")})

    def all_listings(self) -> list[Listing]:
        if not self.client:
            return super().all_listings()
        res = self.client.table("project_listings").select("*, users(name)").order("created_at").execute()
        return [self._listing_from_row(r) for r in res.data or []]

    def listing(self, listing_id: str) -> Listing | None:
        if not self.client:
            return super().listing(listing_id)
        res = self.client.table("project_listings").select("*, users(name)").eq("id", listing_id).limit(1).execute()
        return self._listing_from_row(res.data[0]) if res.data else None

    def save_listing(self, listing: Listing) -> Listing:
        if not self.client:
            return super().save_listing(listing)
        payload = listing.model_dump(mode="json", include=self._LISTING_COLUMNS)
        self.client.table("project_listings").upsert(payload).execute()
        return listing

    # --- Slice B: self-proposed projects (table self_proposed_applications) ---

    _PROPOSAL_COLUMNS = {
        "id", "student_id", "supervisor_id", "title", "description", "research_interests", "statement",
        "status", "submitted_at", "decided_at", "document_ids",
    }
    # Two foreign keys point at users, so each join names the constraint it follows.
    _PROPOSAL_SELECT = (
        "*, student:users!self_proposed_applications_student_id_fkey(name),"
        " supervisor:users!self_proposed_applications_supervisor_id_fkey(name)"
    )

    @staticmethod
    def _proposal_from_row(row: dict) -> Proposal:
        student = row.pop("student", None) or {}
        supervisor = row.pop("supervisor", None) or {}
        names = {"student_name": student.get("name", ""), "supervisor_name": supervisor.get("name", "")}
        return Proposal.model_validate({**row, **names})

    def proposals_for(self, student_id: str | None = None, supervisor_id: str | None = None) -> list[Proposal]:
        if not self.client:
            return super().proposals_for(student_id, supervisor_id)
        q = self.client.table("self_proposed_applications").select(self._PROPOSAL_SELECT)
        if student_id is not None:
            q = q.eq("student_id", student_id)
        if supervisor_id is not None:
            q = q.eq("supervisor_id", supervisor_id)
        return [self._proposal_from_row(r) for r in q.order("submitted_at").execute().data or []]

    def proposal(self, proposal_id: str) -> Proposal | None:
        if not self.client:
            return super().proposal(proposal_id)
        table = self.client.table("self_proposed_applications")
        res = table.select(self._PROPOSAL_SELECT).eq("id", proposal_id).limit(1).execute()
        return self._proposal_from_row(res.data[0]) if res.data else None

    def save_proposal(self, proposal: Proposal) -> Proposal:
        if not self.client:
            return super().save_proposal(proposal)
        payload = proposal.model_dump(mode="json", include=self._PROPOSAL_COLUMNS)
        self.client.table("self_proposed_applications").upsert(payload).execute()
        return proposal
    # --- Slice C: applications (table listing_applications) and rankings (table applicant_rankings) ---

    _APPLICATION_COLUMNS = {
        "id", "student_id", "listing_id", "round_id", "statement", "submitted_at", "preference_rank", "status",
        "document_ids",
    }
    # listing_title and supervisor_name are not columns: they come from the listing and its supervisor.
    _APPLICATION_SELECT = "*, project_listings(title, users(name))"

    @staticmethod
    def _application_from_row(row: dict) -> Application:
        listing = row.pop("project_listings", None) or {}
        supervisor = listing.get("users") or {}
        names = {"listing_title": listing.get("title", ""), "supervisor_name": supervisor.get("name", "")}
        return Application.model_validate({**row, **names})

    def applications_for(
        self, student_id: str | None = None, listing_id: str | None = None, round_id: str | None = None
    ) -> list[Application]:
        if not self.client:
            return super().applications_for(student_id, listing_id, round_id)
        q = self.client.table("listing_applications").select(self._APPLICATION_SELECT)
        for column, value in (("student_id", student_id), ("listing_id", listing_id), ("round_id", round_id)):
            if value is not None:
                q = q.eq(column, value)
        return [self._application_from_row(r) for r in q.order("submitted_at").execute().data or []]

    def application(self, application_id: str) -> Application | None:
        if not self.client:
            return super().application(application_id)
        table = self.client.table("listing_applications")
        res = table.select(self._APPLICATION_SELECT).eq("id", application_id).limit(1).execute()
        return self._application_from_row(res.data[0]) if res.data else None

    def save_applications(self, *apps: Application) -> None:
        if not self.client:
            return super().save_applications(*apps)
        if not apps:
            return
        rows = [a.model_dump(mode="json", include=self._APPLICATION_COLUMNS) for a in apps]
        table = self.client.table("listing_applications")
        # REQ-SRANK-2: a unique index allows one rank per student per round, so clear the ranks first.
        # Otherwise swapping ranks 1 and 2 would clash halfway through the update.
        if any(r["preference_rank"] is not None for r in rows):
            table.upsert([{**r, "preference_rank": None} for r in rows]).execute()
        table.upsert(rows).execute()

    def ranking(self, listing_id: str, round_id: str | None) -> list[str]:
        if not self.client:
            return super().ranking(listing_id, round_id)
        if round_id is None:
            return []
        table = self.client.table("applicant_rankings")
        res = table.select("application_ids").eq("listing_id", listing_id).eq("round_id", round_id).limit(1).execute()
        return list(res.data[0]["application_ids"]) if res.data else []

    def save_ranking(self, listing_id: str, round_id: str | None, application_ids: list[str], submitted_at: datetime) -> None:
        if not self.client:
            return super().save_ranking(listing_id, round_id, application_ids, submitted_at)
        row = {
            "listing_id": listing_id,
            "round_id": round_id,
            "application_ids": list(application_ids),
            "submitted_at": submitted_at.isoformat(),
        }
        self.client.table("applicant_rankings").upsert(row).execute()


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
