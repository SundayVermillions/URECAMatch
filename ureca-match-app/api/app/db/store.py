"""Data access.

`Store` is the interface every service talks to. `MockStore` keeps the seed in
memory (API_MODE=mock) so the whole app runs without Supabase. `SupabaseStore`
is the real implementation; each slice fills in the methods for its own tables.

Rule: routers never query directly. They call a service, the service calls the store.
"""

from __future__ import annotations

import hashlib
import hmac
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
    Round,
    StudentProfile,
    SupervisorProfile,
    User,
)

# Steps a round is claimed for, one column each (REQ-EXEC-2: set once).
CLAIM_STEPS = ("executed_at", "published_at")


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
    passwords: dict[str, str]  # email -> password (mock mode)
    last_activity: dict[str, datetime] = {}  # user_id -> timestamp of last request (SRS 5.3.1)

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
    def notifications_for(self, user_id: str) -> list[Notification]: ...  # slice E: any order; the router sorts
    def save_notifications(self, *notifications: Notification) -> None: ...  # slice E: insert. Only services/notify.py
    def mark_notification_read(self, notification_id: str, user_id: str) -> bool: ...  # slice E: False if not theirs
    def unread_notification_count(self, user_id: str) -> int: ...  # slice E: the sidebar badge on GET /me
    def next_id(self, prefix: str) -> str: ...

    # Slice D: cycles, rounds, matches. A read may return copies, so every change is saved explicitly.
    def save_cycle(self, cycle: Cycle) -> None: ...  # insert or update the cycle and its rounds
    def save_round(self, round: Round) -> None: ...
    def add_matches(self, *matches: Match) -> None: ...  # insert
    def save_match(self, match: Match) -> None: ...  # update
    def remove_match(self, match: Match) -> None: ...
    def claim_round(self, round: Round, step: str, now: datetime) -> bool: ...  # atomic: True for exactly one caller
    def release_round(self, round: Round, step: str) -> None: ...  # give a claim back after the step failed
    def publish_outcomes(self, matches: list[Match], applications: list[Application]) -> None: ...  # all or nothing
    # Slice E: the audit log is append only. There is no update or delete.
    def add_audit(self, entry: AuditEntry) -> None: ...
    # Slice A: e-mail verification codes, readable by any server that shares the database.
    def issue_code(self, email: str, code: str, expires_at: datetime) -> None: ...
    def check_code(self, email: str, code: str, now: datetime) -> str: ...  # "ok" | "none" | "expired" | "wrong"
    def clear_code(self, email: str) -> None: ...


class MockStore:
    """In-memory store seeded from seed_data. State resets on process restart."""

    def __init__(self, seed: bool = True) -> None:
        if seed:
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
        self.passwords: dict[str, str] = {}
        self.last_activity: dict[str, datetime] = {}
        self._counter = 1000

    def save_user(self, user: User) -> User:
        for i, u in enumerate(self.users):
            if u.id == user.id:
                self.users[i] = user
                return user
        self.users.append(user)
        return user

    def save_student(self, student: StudentProfile) -> StudentProfile:
        for i, s in enumerate(self.students):
            if s.user_id == student.user_id:
                self.students[i] = student
                return student
        self.students.append(student)
        return student

    def save_supervisor(self, supervisor: SupervisorProfile) -> SupervisorProfile:
        for i, s in enumerate(self.supervisors):
            if s.user_id == supervisor.user_id:
                self.supervisors[i] = supervisor
                return supervisor
        self.supervisors.append(supervisor)
        return supervisor

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
            p
            for p in self.proposals
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

    # --- Slice E: notifications
    def notifications_for(self, user_id: str) -> list[Notification]:
        return [n for n in self.notifications if n.user_id == user_id]

    def save_notifications(self, *notifications: Notification) -> None:
        self.notifications.extend(notifications)

    def mark_notification_read(self, notification_id: str, user_id: str) -> bool:
        n = next((n for n in self.notifications if n.id == notification_id and n.user_id == user_id), None)
        if n is None:
            return False
        n.read = True
        return True

    def unread_notification_count(self, user_id: str) -> int:
        return sum(1 for n in self.notifications if n.user_id == user_id and not n.read)

    # --- Slice D: cycles, rounds, matches. In memory, an object is already "saved" once it is in the list.
    def save_cycle(self, cycle: Cycle) -> None:
        if all(c.id != cycle.id for c in self.cycles):
            self.cycles.append(cycle)

    def save_round(self, round: Round) -> None:
        pass

    def add_matches(self, *matches: Match) -> None:
        self.matches.extend(matches)

    def save_match(self, match: Match) -> None:
        pass

    def remove_match(self, match: Match) -> None:
        self.matches.remove(match)

    def claim_round(self, round: Round, step: str, now: datetime) -> bool:
        if getattr(round, step) is not None:
            return False
        setattr(round, step, now)
        return True

    def release_round(self, round: Round, step: str) -> None:
        setattr(round, step, None)

    def publish_outcomes(self, matches: list[Match], applications: list[Application]) -> None:
        self.save_applications(*applications)
        for updated in matches:  # in place: callers hold the objects the list holds
            current = next(m for m in self.matches if m.id == updated.id)
            for name in type(updated).model_fields:
                setattr(current, name, getattr(updated, name))

    # --- Slice E: audit log. Append only.
    def add_audit(self, entry: AuditEntry) -> None:
        self.audit.append(entry)

    # --- Slice A: verification codes. Kept as the plain code here; tests and the mock sign-up read them.
    def issue_code(self, email: str, code: str, expires_at: datetime) -> None:
        self.verification_codes[email.lower()] = (code, expires_at)

    def check_code(self, email: str, code: str, now: datetime) -> str:
        stored = self.verification_codes.get(email.lower())
        if not stored:
            return "none"
        if now > stored[1]:
            return "expired"
        return "ok" if hmac.compare_digest(code, stored[0]) else "wrong"

    def clear_code(self, email: str) -> None:
        self.verification_codes.pop(email.lower(), None)


def _hash_code(code: str) -> str:
    """Keyed hash of a verification code, so a copy of the table does not reveal live codes."""
    from app.settings import get_settings

    key = (get_settings().supabase_service_role_key or "dev").encode()
    return hmac.new(key, code.encode(), hashlib.sha256).hexdigest()


class SupabaseStore(MockStore):
    """Real Supabase store. Every entity is read from and written to Postgres; nothing is seeded in memory.
    The database is filled by the explicit script in app/db/seed_db.py, never on server start.
    `passwords` and `last_activity` stay per process: sign-in uses Supabase Auth, and the idle timer is soft."""

    def __init__(self) -> None:
        super().__init__(seed=False)
        from supabase import create_client

        from app.settings import get_settings

        s = get_settings()
        if not s.supabase_url:
            raise RuntimeError("API_MODE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
        self.client = create_client(s.supabase_url, s.supabase_service_role_key)

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
        "id",
        "supervisor_id",
        "title",
        "description",
        "prerequisites",
        "topic_tags",
        "available_slots",
        "filled_slots",
        "offering_faculty",
        "research_location",
        "cover_url",
        "outcomes",
        "skills",
        "hours_per_week",
        "mode",
        "gallery_urls",
        "video_url",
        "status",
        "created_at",
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
        "id",
        "student_id",
        "supervisor_id",
        "title",
        "description",
        "research_interests",
        "statement",
        "status",
        "submitted_at",
        "decided_at",
        "document_ids",
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
        "id",
        "student_id",
        "listing_id",
        "round_id",
        "statement",
        "submitted_at",
        "preference_rank",
        "status",
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

    # --- Slice E: notifications (table notifications). Columns match the Notification model one to one.

    def notifications_for(self, user_id: str) -> list[Notification]:
        if not self.client:
            return super().notifications_for(user_id)
        table = self.client.table("notifications")
        res = table.select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return [Notification.model_validate(r) for r in res.data or []]

    def save_notifications(self, *notifications: Notification) -> None:
        if not self.client:
            return super().save_notifications(*notifications)
        if notifications:
            self.client.table("notifications").insert([n.model_dump(mode="json") for n in notifications]).execute()

    def mark_notification_read(self, notification_id: str, user_id: str) -> bool:
        if not self.client:
            return super().mark_notification_read(notification_id, user_id)
        table = self.client.table("notifications")
        # update() returns the matched rows (Prefer: return=representation), so 0 rows means not theirs.
        res = table.update({"read": True}).eq("id", notification_id).eq("user_id", user_id).execute()
        return bool(res.data)

    def unread_notification_count(self, user_id: str) -> int:
        if not self.client:
            return super().unread_notification_count(user_id)
        from postgrest.types import CountMethod

        table = self.client.table("notifications")
        res = table.select("id", count=CountMethod.exact, head=True).eq("user_id", user_id).eq("read", False).execute()
        return res.count or 0

    # --- Whole-table reads. The routers still count and filter these lists; each access queries the database, so
    # a change to a returned object is lost unless it is saved (save_user, save_match, save_round, ...).

    PAGE = 1000  # PostgREST returns at most this many rows per request

    def _all(self, table: str, order: str = "id", columns: str = "*", desc: bool = False) -> list[dict]:
        rows: list[dict] = []
        while True:
            q = self.client.table(table).select(columns).order(order, desc=desc).range(len(rows), len(rows) + self.PAGE - 1)
            page = q.execute().data or []
            rows.extend(page)
            if len(page) < self.PAGE:
                return rows

    @property
    def users(self) -> list[User]:
        return [User.model_validate(r) for r in self._all("users", "created_at")]

    @property
    def students(self) -> list[StudentProfile]:
        docs: dict[str, list[dict]] = {}
        for d in self._all("supporting_documents", "uploaded_at"):
            docs.setdefault(d["owner_id"], []).append(d)
        rows = self._all("student_profiles", "user_id")
        return [StudentProfile.model_validate({**r, "documents": docs.get(r["user_id"], [])}) for r in rows]

    @property
    def supervisors(self) -> list[SupervisorProfile]:
        return [SupervisorProfile.model_validate(r) for r in self._all("supervisor_profiles", "user_id")]

    @property
    def listings(self) -> list[Listing]:
        return self.all_listings()

    @property
    def proposals(self) -> list[Proposal]:
        return self.proposals_for()

    @property
    def applications(self) -> list[Application]:
        return self.applications_for()

    @property
    def notifications(self) -> list[Notification]:
        return [Notification.model_validate(r) for r in self._all("notifications", "created_at")]

    @property
    def applicant_rankings(self) -> dict[str, list[str]]:
        return {
            f"{r['listing_id']}:{r['round_id']}": list(r["application_ids"])
            for r in self._all("applicant_rankings", "listing_id")
        }

    # --- Slice D: cycles and rounds (tables application_cycles and matching_rounds)

    _CYCLE_COLUMNS = {
        "id",
        "academic_year",
        "opening_date",
        "closing_date",
        "pre_application_days",
        "status",
        "rollover_unmatched",
    }
    _ROUND_COLUMNS = {
        "id",
        "cycle_id",
        "number",
        "application_start",
        "application_end",
        "review_start",
        "review_end",
        "status",
        "executed_at",
        "published_at",
    }

    @property
    def cycles(self) -> list[Cycle]:
        rounds: dict[str, list[Round]] = {}
        for r in self._all("matching_rounds", "number"):
            rounds.setdefault(r["cycle_id"], []).append(Round.model_validate(r))
        return [
            Cycle.model_validate({**c, "rounds": rounds.get(c["id"], [])})
            for c in self._all("application_cycles", "opening_date")
        ]

    def save_cycle(self, cycle: Cycle) -> None:
        self.client.table("application_cycles").upsert(cycle.model_dump(mode="json", include=self._CYCLE_COLUMNS)).execute()
        # Rounds dropped from the cycle go first: (cycle_id, number) is unique, so a replacement must not clash with one.
        kept = {r.id for r in cycle.rounds}
        stored = self.client.table("matching_rounds").select("id").eq("cycle_id", cycle.id).execute().data or []
        for row in stored:
            if row["id"] not in kept:
                self.client.table("matching_rounds").delete().eq("id", row["id"]).execute()
        if cycle.rounds:
            rows = [r.model_dump(mode="json", include=self._ROUND_COLUMNS) for r in cycle.rounds]
            self.client.table("matching_rounds").upsert(rows).execute()

    def save_round(self, round: Round) -> None:
        self.client.table("matching_rounds").upsert(round.model_dump(mode="json", include=self._ROUND_COLUMNS)).execute()

    def claim_round(self, round: Round, step: str, now: datetime) -> bool:
        """REQ-EXEC-2: one UPDATE ... WHERE step IS NULL. Postgres lets only one of several servers change the row,
        and update() returns the rows it changed, so only that server gets data back."""
        if step not in CLAIM_STEPS:
            raise ValueError(f"Unknown step {step!r}")
        table = self.client.table("matching_rounds")
        res = table.update({step: now.isoformat()}).eq("id", round.id).is_(step, "null").execute()
        if not res.data:
            return False
        setattr(round, step, now)
        return True

    def release_round(self, round: Round, step: str) -> None:
        if step not in CLAIM_STEPS:
            raise ValueError(f"Unknown step {step!r}")
        self.client.table("matching_rounds").update({step: None}).eq("id", round.id).execute()
        setattr(round, step, None)

    # --- Slice D: match results (table match_results)

    _MATCH_COLUMNS = {
        "id",
        "round_id",
        "student_id",
        "listing_id",
        "status",
        "preference_rank",
        "supervisor_decided_at",
        "published_at",
        "offer_expires_at",
        "student_responded_at",
        "original_listing_id",
        "justification",
        "supervisor_note",
    }

    @property
    def matches(self) -> list[Match]:
        # student_name, listing_title, supervisor_id and supervisor_name are not columns: they come from users and listings.
        names = {u["id"]: u["name"] for u in self._all("users", "id", "id,name")}
        listings = {x["id"]: x for x in self._all("project_listings", "id", "id,title,supervisor_id")}
        out = []
        for row in self._all("match_results", "id"):
            lst = listings.get(row["listing_id"], {})
            sup = lst.get("supervisor_id", "")
            extra = {
                "student_name": names.get(row["student_id"], ""),
                "listing_title": lst.get("title", ""),
                "supervisor_id": sup,
                "supervisor_name": names.get(sup, ""),
            }
            out.append(Match.model_validate({**row, **extra}))
        return out

    def add_matches(self, *matches: Match) -> None:
        if matches:
            self.client.table("match_results").insert(
                [m.model_dump(mode="json", include=self._MATCH_COLUMNS) for m in matches]
            ).execute()

    def save_match(self, match: Match) -> None:
        self.client.table("match_results").upsert(match.model_dump(mode="json", include=self._MATCH_COLUMNS)).execute()

    def remove_match(self, match: Match) -> None:
        self.client.table("match_results").delete().eq("id", match.id).execute()

    def publish_outcomes(self, matches: list[Match], applications: list[Application]) -> None:
        """REQ-PUB-1: the offers and the applications' outcomes change in one transaction (the SQL function
        publish_outcomes), so an application is only "matched" if its match row was saved with it."""
        match_rows = [m.model_dump(mode="json", include={"id", "status", "published_at", "offer_expires_at"}) for m in matches]
        app_rows = [a.model_dump(mode="json", include={"id", "status"}) for a in applications]
        self.client.rpc("publish_outcomes", {"p_matches": match_rows, "p_applications": app_rows}).execute()

    # --- Slice E: audit log (table audit_log). Insert and read only; the table also rejects UPDATE and DELETE.

    _AUDIT_COLUMNS = {"id", "operation", "actor_id", "timestamp", "affected_records", "note"}

    @property
    def audit(self) -> list[AuditEntry]:
        names = {u["id"]: u["name"] for u in self._all("users", "id", "id,name")}
        return [
            AuditEntry.model_validate({**r, "actor_name": names.get(r["actor_id"], "")})
            for r in self._all("audit_log", "timestamp")
        ]

    def add_audit(self, entry: AuditEntry) -> None:
        self.client.table("audit_log").insert(entry.model_dump(mode="json", include=self._AUDIT_COLUMNS)).execute()

    # --- Slice A: verification codes (table verification_codes). Saved as a keyed hash with an expiry, so any server
    # that shares the database can check a code another server issued.

    def _pending_codes(self, email: str):
        user = self.user_by_email(email)
        table = self.client.table("verification_codes")
        return user, table.select("*").eq("user_id", user.id).eq("used", False) if user else None

    def issue_code(self, email: str, code: str, expires_at: datetime) -> None:
        user = self.user_by_email(email)
        if user is None:
            raise RuntimeError("A verification code needs an existing account.")
        table = self.client.table("verification_codes")
        table.update({"used": True}).eq("user_id", user.id).eq("used", False).execute()  # a new code replaces the old one
        table.insert({"user_id": user.id, "code": _hash_code(code), "expires_at": expires_at.isoformat()}).execute()

    def check_code(self, email: str, code: str, now: datetime) -> str:
        user, query = self._pending_codes(email)
        if user is None:
            return "none"
        rows = query.order("expires_at", desc=True).limit(1).execute().data or []
        if not rows:
            return "none"
        if now > datetime.fromisoformat(rows[0]["expires_at"]):
            return "expired"
        return "ok" if hmac.compare_digest(_hash_code(code), rows[0]["code"]) else "wrong"

    def clear_code(self, email: str) -> None:
        user = self.user_by_email(email)
        if user is not None:
            self.client.table("verification_codes").update({"used": True}).eq("user_id", user.id).eq("used", False).execute()


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
