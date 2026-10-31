"""Pydantic models. This module IS the API contract: shared/openapi.json and
web/lib/api/types.ts are generated from it (npm run gen). Change a model here,
regenerate, commit both in the same PR.

Enums mirror the data dictionary in SRS Appendix A.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

# ---------------------------------------------------------------- enums


class Role(str, Enum):
    student = "student"
    supervisor = "supervisor"
    admin = "admin"


class AccountStatus(str, Enum):
    pending_verification = "pending_verification"
    active = "active"
    inactive = "inactive"


class CycleStatus(str, Enum):
    draft = "draft"
    pre_application = "pre_application"
    in_progress = "in_progress"
    closed = "closed"


class RoundStatus(str, Enum):
    scheduled = "scheduled"
    application_window = "application_window"
    review_window = "review_window"
    approval_window = "approval_window"  # matching has run; supervisors may decline until approval_end (REQ-APPRV-4)
    awaiting_publication = "awaiting_publication"
    published = "published"
    completed = "completed"


class Window(str, Enum):
    """What a user may do right now. Computed by services/windows.py."""

    before_cycle = "before_cycle"
    pre_application = "pre_application"
    application = "application"
    review = "review"
    approval = "approval"  # supervisors may decline matched students (REQ-APPRV-4)
    awaiting_results = "awaiting_results"
    results = "results"
    closed = "closed"


class ListingStatus(str, Enum):
    draft = "draft"
    published = "published"
    closed = "closed"


class ListingMode(str, Enum):
    on_site = "on_site"
    hybrid = "hybrid"
    remote = "remote"


class ApplicationStatus(str, Enum):
    submitted = "submitted"
    withdrawn = "withdrawn"
    matched = "matched"
    unmatched = "unmatched"


class ProposalStatus(str, Enum):
    submitted = "submitted"
    accepted = "accepted"
    declined = "declined"
    withdrawn = "withdrawn"  # by the student, or because they were placed or are no longer eligible


class MatchStatus(str, Enum):
    proposed = "proposed"  # produced by the algorithm; offered at the end of the approval window unless declined
    approved = "approved"  # supervisor approved (older rounds; supervisors now only decline)
    rejected = "rejected"  # supervisor declined in the approval window, slot returned (REQ-APPRV-2)
    reassigned = "reassigned"  # admin manual override (REQ-ASSIGN-1)
    published = "published"  # offer visible to student (REQ-PUB-1)
    accepted = "accepted"  # student accepted (REQ-OUTCOME-1)
    declined = "declined"  # student declined (REQ-OUTCOME-2)
    timed_out = "timed_out"  # decline due to timeout (REQ-OUTCOME-3)


class AssignmentStatus(str, Enum):
    """Where a student stands in the active cycle, on the Assignments page (REQ-ASSIGN-1..3)."""

    accepted = "accepted"  # registered on a project (REQ-OUTCOME-1)
    offered = "offered"  # holding an offer they have not answered yet (REQ-PUB-1)
    matched = "matched"  # placed in a round whose results are not out yet
    unassigned = "unassigned"


class NotificationEvent(str, Enum):
    cycle_changed = "cycle_changed"
    round_opened = "round_opened"
    results_published = "results_published"
    offer_received = "offer_received"
    proposal_decided = "proposal_decided"
    matches_proposed = "matches_proposed"  # matching ran; supervisors may decline until the approval window ends
    match_approved = "match_approved"
    match_rejected = "match_rejected"
    account_changed = "account_changed"


class AuditOperation(str, Enum):
    matching_executed = "matching_executed"
    manual_reassignment = "manual_reassignment"
    results_published = "results_published"
    user_updated = "user_updated"
    user_deactivated = "user_deactivated"
    cycle_updated = "cycle_updated"


# ---------------------------------------------------------------- shared


class ErrorBody(BaseModel):
    """Every non-2xx response uses this envelope. `field` names the offending input."""

    code: str
    message: str
    field: str | None = None


class Document(BaseModel):
    id: str
    owner_id: str
    file_name: str
    file_format: str = "pdf"
    kind: Literal["transcript", "supporting"] = "supporting"  # which profile slot owns the file (REQ-PROF-3)
    file_size: int
    uploaded_at: datetime
    url: str | None = None  # signed URL for in-app viewing (REQ-VRANK-3)
    storage_path: str | None = None  # path in Storage bucket (REQ-PROF-3)


# ---------------------------------------------------------------- users


class User(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Role
    status: AccountStatus
    created_at: datetime
    last_login_at: datetime | None = None


class StudentProfile(BaseModel):
    user_id: str
    school: str
    degree: str | None = None
    degree: str | None = None
    cgpa: float | None = Field(default=None, ge=0, le=5)
    year_of_study: int | None = Field(default=None, ge=1, le=5)
    completed_modules: list[str] = []
    research_interests: list[str] = []
    profile_complete: bool = False
    eligible_for_matching: bool = True  # false after decline or timeout (REQ-OUTCOME-2, 4)
    documents: list[Document] = []


class SupervisorProfile(BaseModel):
    user_id: str
    faculty: str
    title: str = ""  # "Prof.", "Assoc. Prof.", "Asst. Prof." or "Dr."; shown in front of the name, see services/titles.py
    organisation: str = "NTU"


class Phase(BaseModel):
    cycle_id: str | None
    round_id: str | None
    round_number: int | None
    window: Window
    window_ends_at: datetime | None
    label: str  # human copy, e.g. "Round 2 closes 29 Aug"
    now: datetime  # the API's clock (Settings.now()) this was worked out at, for screens that check dates themselves


class Me(BaseModel):
    user: User
    student: StudentProfile | None = None
    supervisor: SupervisorProfile | None = None
    phase: Phase
    unread_notifications: int = 0


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=8)
    role: Role
    title: str = ""  # supervisors only; ignored for students


class VerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class SignInRequest(BaseModel):
    email: EmailStr
    password: str


class Session(BaseModel):
    access_token: str
    expires_at: datetime
    user: User


class ProfileUpdate(BaseModel):
    school: str
    degree: str | None = None
    degree: str | None = None
    cgpa: float = Field(ge=0, le=5)
    year_of_study: int = Field(ge=1, le=5)
    completed_modules: list[str]
    research_interests: list[str]


class TranscriptParse(BaseModel):
    """What was read from an uploaded transcript. Empty values mean not found; nothing is saved (REQ-PROF-1)."""

    cgpa: float | None = None
    school: str = ""
    degree: str = ""
    year_of_study: int | None = None
    completed_modules: list[str] = []


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    role: Role
    title: str = ""  # supervisors only; ignored for other roles


class UserUpdate(BaseModel):
    name: str | None = None
    role: Role | None = None
    status: AccountStatus | None = None
    title: str | None = None  # supervisors only: "" clears it. Leaving it out keeps the title as it is.


class ActiveItemKind(str, Enum):
    listing = "listing"
    proposal = "proposal"
    application = "application"
    match = "match"


class ActiveItem(BaseModel):
    """Something that is still open for a user, shown before an admin deactivates them or changes their role."""

    kind: ActiveItemKind
    id: str
    title: str
    detail: str = ""  # who else is involved, e.g. "Student: Aisha Rahman"


class CleanupWarning(ErrorBody):
    """The 409 `has_active_items` body: nothing was changed. Resend with confirm_cleanup=true to close these first."""

    items: list[ActiveItem]


class UserListItem(BaseModel):
    user: User
    school: str | None = None
    title: str | None = None  # a supervisor's title; the name in `user` already includes it


# ---------------------------------------------------------------- cycle and rounds


class Round(BaseModel):
    id: str
    cycle_id: str
    number: int
    application_start: datetime
    application_end: datetime
    review_start: datetime
    review_end: datetime
    approval_end: datetime  # REQ-APPRV-4: the approval window runs from review_end to here
    status: RoundStatus
    executed_at: datetime | None = None
    published_at: datetime | None = None


class Cycle(BaseModel):
    id: str
    academic_year: str
    opening_date: datetime
    closing_date: datetime
    pre_application_days: int
    status: CycleStatus
    rounds: list[Round] = []
    rollover_unmatched: bool = True  # REQ-EXEC-3: unmatched students' applications carry into the next round


class CycleCreate(BaseModel):
    academic_year: str
    opening_date: datetime
    closing_date: datetime
    pre_application_days: int = Field(ge=0, le=60)


class CycleUpdate(BaseModel):
    opening_date: datetime | None = None
    closing_date: datetime | None = None
    pre_application_days: int | None = None


class RoundSpec(BaseModel):
    number: int = Field(ge=1, le=3)
    application_days: int = Field(ge=1, le=14)
    review_days: int = Field(ge=1, le=7)
    approval_days: int = Field(default=2, ge=1, le=7)  # REQ-APPRV-5: the admin sets how long supervisors have to decline
    start_date: datetime | None = None  # use case 1-2: the admin picks the start; empty means 2 days after the last round


class RoundsUpdate(BaseModel):
    """Admin defines up to three sequential rounds (REQ-ROUND-1)."""

    rounds: list[RoundSpec] = Field(max_length=3)
    rollover_unmatched: bool = True  # REQ-EXEC-3


class ScheduleUpdate(BaseModel):
    """Use case 1-1, 1-2: the cycle's dates and its rounds, checked as one schedule and saved together or not at all.
    A date left empty keeps its current value."""

    opening_date: datetime | None = None
    closing_date: datetime | None = None
    pre_application_days: int | None = None
    rounds: list[RoundSpec] = Field(max_length=3)
    rollover_unmatched: bool = True  # REQ-EXEC-3


# ---------------------------------------------------------------- listings


class Listing(BaseModel):
    supervisor_email: str = ""
    id: str
    supervisor_id: str
    supervisor_name: str
    title: str
    description: str
    prerequisites: list[str] = []
    topic_tags: list[str] = []
    available_slots: int
    filled_slots: int = 0
    offering_faculty: str
    research_location: str
    cover_url: str | None = None
    # Project details (all optional): what the student does and gains, time needed, where, photos, one video.
    outcomes: str = ""
    skills: str = ""
    hours_per_week: int | None = None
    mode: ListingMode | None = None
    gallery_urls: list[str] = []
    video_url: str | None = None  # YouTube or Vimeo, stored in canonical form
    status: ListingStatus
    created_at: datetime
    applicant_count: int = 0
    held_slots: int = 0  # slots held by matches or offers the student has not answered yet (REQ-PROJ-3)
    applied: bool = False  # for the current student, if any
    applied_rank: int | None = None


class FitParts(BaseModel):
    """How a recommendation's score is made up (REQ-BROWSE-4). Maximums: 50, 30, 20."""

    interests: int
    readiness: int
    chance: int


class Recommendation(BaseModel):
    listing: Listing
    score: int  # 0-100, the sum of parts
    parts: FitParts
    reasons: list[str] = []  # why it fits, e.g. "Matches your interest in Machine Learning"
    gaps: list[str] = []  # what to know, e.g. "Missing SC3020"


class TopicGroup(BaseModel):
    name: str
    topics: list[str]


class Course(BaseModel):
    code: str
    title: str
    au: float | None = None
    dept: str = ""
    last_offered: str = ""


class ListingCreate(BaseModel):
    title: str = Field(min_length=5, max_length=150)
    description: str = Field(min_length=20, max_length=5000)
    prerequisites: list[str] = []
    topic_tags: list[str] = []
    available_slots: int = Field(ge=1, le=20)
    offering_faculty: str = Field(min_length=1, max_length=40)
    research_location: str = Field(max_length=100)
    outcomes: str = Field(default="", max_length=2000)
    skills: str = Field(default="", max_length=1000)
    hours_per_week: int | None = Field(default=None, ge=1, le=40)
    mode: ListingMode | None = None
    video_url: str | None = None
    publish: bool = True


class ListingUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=150)
    description: str | None = Field(default=None, max_length=5000)
    prerequisites: list[str] | None = None
    topic_tags: list[str] | None = None
    available_slots: int | None = Field(default=None, ge=1, le=20)
    offering_faculty: str | None = Field(default=None, min_length=1, max_length=40)
    research_location: str | None = Field(default=None, max_length=100)
    outcomes: str | None = Field(default=None, max_length=2000)
    skills: str | None = Field(default=None, max_length=1000)
    hours_per_week: int | None = Field(default=None, ge=1, le=40)  # sending null clears it
    mode: ListingMode | None = None  # sending null clears it
    video_url: str | None = None  # sending null or "" clears it
    publish: bool | None = None  # True publishes a draft (REQ-PROJ-1). Closing has its own endpoint.


class SupervisorSummary(BaseModel):
    id: str
    name: str
    faculty: str


# ---------------------------------------------------------------- applications and rankings


class Application(BaseModel):
    id: str
    student_id: str
    listing_id: str
    listing_title: str
    supervisor_name: str
    round_id: str
    statement: str
    submitted_at: datetime
    preference_rank: int | None = None
    status: ApplicationStatus
    document_ids: list[str] = []
    cover_url: str | None = None  # the project's photo, so My applications shows it after the cycle ends, when Browse is empty


class ApplicationCreate(BaseModel):
    listing_id: str
    statement: str = Field(min_length=50)
    document_ids: list[str] = []


class ApplicationUpdate(BaseModel):
    """Edit an application inside the application window (REQ-APPLY-1). The listing cannot change."""

    statement: str = Field(min_length=50)
    document_ids: list[str] = []


class PreferenceRankingUpdate(BaseModel):
    """Ordered application ids, most preferred first (REQ-SRANK-1, 2)."""

    application_ids: list[str]


class ApplicantStudent(BaseModel):
    email: str = ""
    id: str
    name: str
    school: str
    degree: str | None = None
    year_of_study: int | None
    cgpa: float | None
    completed_modules: list[str]
    research_interests: list[str]


class Applicant(BaseModel):
    application_id: str
    student: ApplicantStudent
    statement: str
    submitted_at: datetime
    documents: list[Document] = []
    meets_prerequisites: bool = True
    recommended: bool = False  # in the top-10 set for the current filters (REQ-VRANK-1)
    rank: int | None = None


class ApplicantRanking(BaseModel):
    listing_id: str
    round_id: str
    application_ids: list[str]
    submitted_at: datetime | None = None


class ApplicantRankingUpdate(BaseModel):
    application_ids: list[str]


class ApplicantScore(BaseModel):
    """AI match fit score for one applicant (REQ-VRANK-1). source says whether Gemini or the local formula scored it."""

    application_id: str
    student_id: str
    score: int = Field(ge=0, le=100)
    reason: str
    source: Literal["ai", "local"]


# ---------------------------------------------------------------- proposals


class Proposal(BaseModel):
    id: str
    student_id: str
    student_name: str
    supervisor_id: str
    supervisor_name: str
    title: str
    description: str
    research_interests: list[str] = []
    statement: str
    status: ProposalStatus
    submitted_at: datetime
    decided_at: datetime | None = None
    decision_note: str | None = None  # why a supervisor declined it (REQ-REVPROP-2); the student sees it
    document_ids: list[str] = []
    # Filled in only when a supervisor reads their proposals (REQ-REVPROP-1). Not stored.
    student: ApplicantStudent | None = None
    documents: list[Document] = []


class ProposalCreate(BaseModel):
    supervisor_id: str
    title: str = Field(min_length=5, max_length=150)
    description: str = Field(min_length=50, max_length=6000)  # 500 words
    research_interests: list[str] = []
    statement: str = Field(min_length=50, max_length=3000)  # 300 words
    document_ids: list[str] = []


# ---------------------------------------------------------------- matching


class Match(BaseModel):
    id: str
    round_id: str
    student_id: str
    student_name: str
    listing_id: str
    listing_title: str
    supervisor_id: str
    supervisor_name: str
    status: MatchStatus
    preference_rank: int | None = None
    supervisor_decided_at: datetime | None = None
    published_at: datetime | None = None
    offer_expires_at: datetime | None = None
    student_responded_at: datetime | None = None
    original_listing_id: str | None = None
    justification: str | None = None
    supervisor_note: str | None = None  # the supervisor's reason, kept for admin review (REQ-APPRV-2)


class RoundSummary(BaseModel):
    round: Round
    eligible: int  # students in the round's pool: they applied, and no earlier round placed or excluded them
    open_slots: int  # slots on published projects that nobody holds right now, so matching can fill them
    matched: int  # students the round places; a student a supervisor declined counts as unmatched until placed again
    unmatched: int
    excluded: int
    avg_preference: float | None
    declined: int  # matches a supervisor declined in this round and nobody has reassigned since (REQ-APPRV-2)


class ReassignRequest(BaseModel):
    listing_id: str
    justification: str = Field(min_length=10)  # REQ-ASSIGN-2


class ManualAssignRequest(BaseModel):
    student_id: str
    listing_id: str
    justification: str = Field(min_length=10)


class StudentAssignment(BaseModel):
    user: User
    school: str | None = None
    status: AssignmentStatus
    match: Match | None = None  # the match that places the student; None when unassigned
    round_number: int | None = None  # the round that match belongs to
    reason: str | None = None  # why an unassigned student has no project, e.g. "Declined an offer"
    eligible: bool = True  # false once they declined or let an offer lapse, so matching skips them (REQ-OUTCOME-2, 4)


class AssignmentsView(BaseModel):
    """The Assignments page (REQ-ASSIGN-1..3, use case 1-6): every active student, and where a new assignment goes."""

    round: Round | None = None  # the round a new assignment joins; None when no cycle is open or it has no rounds
    offer_deadline: datetime | None = None  # set once that round's results are out: the offer goes at once, answer by this
    students: list[StudentAssignment]


class MatchDecision(BaseModel):
    note: str | None = None


class AuditEntry(BaseModel):
    id: str
    operation: AuditOperation
    actor_id: str
    actor_name: str
    timestamp: datetime
    affected_records: list[str] = []
    note: str | None = None
    affected_labels: list[str] = []  # readable names for affected_records, added when the log is read; not stored


# ---------------------------------------------------------------- notifications and dashboards


class Notification(BaseModel):
    id: str
    user_id: str
    event: NotificationEvent
    title: str
    message: str
    created_at: datetime
    read: bool = False
    link: str | None = None


class AdminDashboard(BaseModel):
    cycle: Cycle | None
    students: int
    supervisors: int
    listings_published: int
    applications_this_round: int
    pending_approvals: int
    alerts: list[str] = []


class SupervisorDashboard(BaseModel):
    listings: list[Listing]
    pending_proposals: int
    pending_approvals: int
    phase: Phase


class ClockState(BaseModel):
    """Debug clock (developer tool). `enabled` is false when the server has DEBUG_CLOCK off."""

    enabled: bool
    now: datetime
    overridden: bool = False


class ClockSet(BaseModel):
    now: datetime


class Ok(BaseModel):
    ok: bool = True
