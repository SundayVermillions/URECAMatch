/** Friendly aliases over the generated contract. Add an alias here, never a hand-written shape. */
import type { components } from "./types";

type S = components["schemas"];

export type Role = S["Role"];
export type AccountStatus = S["AccountStatus"];
export type Window = S["Window"];
export type ListingStatus = S["ListingStatus"];
export type ListingMode = S["ListingMode"];
export type ApplicationStatus = S["ApplicationStatus"];
export type ProposalStatus = S["ProposalStatus"];
export type MatchStatus = S["MatchStatus"];
export type RoundStatus = S["RoundStatus"];
export type NotificationEvent = S["NotificationEvent"];
export type AuditOperation = S["AuditOperation"];

export type Document = S["Document"];
export type User = S["User"];
export type StudentProfile = S["StudentProfile"];
export type SupervisorProfile = S["SupervisorProfile"];
export type Phase = S["Phase"];
export type Me = S["Me"];
export type RegisterRequest = S["RegisterRequest"];
export type VerifyRequest = S["VerifyRequest"];
export type SignInRequest = S["SignInRequest"];
export type Session = S["Session"];
export type ProfileUpdate = S["ProfileUpdate"];
export type TranscriptParse = S["TranscriptParse"];
export type UserCreate = S["UserCreate"];
export type UserUpdate = S["UserUpdate"];
export type UserListItem = S["UserListItem"];
export type Round = S["Round"];
export type Cycle = S["Cycle"];
export type CycleCreate = S["CycleCreate"];
export type CycleUpdate = S["CycleUpdate"];
export type RoundSpec = S["RoundSpec"];
export type RoundsUpdate = S["RoundsUpdate"];
export type ScheduleUpdate = S["ScheduleUpdate"];
export type Listing = S["Listing"];
export type ListingCreate = S["ListingCreate"];
export type ListingUpdate = S["ListingUpdate"];
export type SupervisorSummary = S["SupervisorSummary"];
export type TopicGroup = S["TopicGroup"];
export type Course = S["Course"];
export type Recommendation = S["Recommendation"];
export type FitParts = S["FitParts"];
export type Application = S["Application"];
export type ApplicationCreate = S["ApplicationCreate"];
export type Applicant = S["Applicant"];
export type ApplicantStudent = S["ApplicantStudent"];
export type ApplicantRanking = S["ApplicantRanking"];
export type ApplicantScore = S["ApplicantScore"];
export type Proposal = S["Proposal"];
export type ProposalCreate = S["ProposalCreate"];
export type Match = S["Match"];
export type RoundSummary = S["RoundSummary"];
export type ReassignRequest = S["ReassignRequest"];
export type ManualAssignRequest = S["ManualAssignRequest"];
export type AssignmentStatus = S["AssignmentStatus"];
export type StudentAssignment = S["StudentAssignment"];
export type AssignmentsView = S["AssignmentsView"];
export type AuditEntry = S["AuditEntry"];
export type ActiveItem = S["ActiveItem"];
export type ActiveItemKind = S["ActiveItemKind"];
export type Notification = S["Notification"];
export type AdminDashboard = S["AdminDashboard"];
export type SupervisorDashboard = S["SupervisorDashboard"];
export type ClockState = S["ClockState"];

export type ListingFilters = { q?: string; school?: string; tag?: string; supervisor?: string };
export type ApplicantFilters = { school?: string; min_cgpa?: number; prerequisites_only?: boolean };
export type UserFilters = { role?: Role; status?: AccountStatus; q?: string };

/** Thrown by both clients. `field` lets forms highlight the input (style sheet 04). */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public field?: string | null, public items?: ActiveItem[]) {
    super(message);
  }
}
