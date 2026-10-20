/** HTTP implementation. Sends the session token; maps the error envelope to ApiError. */
import type { ApiClient } from "./client";
import * as M from "./models";
import { getSession } from "../session";

export class LiveClient implements ApiClient {
  constructor(private base: string) {}

  private async req<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
    const s = getSession();
    const headers: Record<string, string> = {};
    if (s?.token) headers.Authorization = `Bearer ${s.token}`;
    if (s?.userId) headers["X-Demo-User"] = s.userId; // ignored outside API_MODE=mock on the server
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(this.base + path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new M.ApiError(res.status, data.code ?? "error", data.message ?? "Something went wrong.", data.field);
    return data as T;
  }
  private q(params: Record<string, unknown>) {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "" && v !== null) u.set(k, String(v));
    const s = u.toString();
    return s ? `?${s}` : "";
  }

  register = (b: M.RegisterRequest) => this.req<void>("POST", "/auth/register", b);
  verify = (b: M.VerifyRequest) => this.req<void>("POST", "/auth/verify", b);
  resendCode = (email: string) => this.req<void>("POST", "/auth/resend", { email });
  signIn = (b: M.SignInRequest) => this.req<M.Session>("POST", "/auth/sign-in", b);
  me = () => this.req<M.Me>("GET", "/me");
  getProfile = () => this.req<M.StudentProfile>("GET", "/me/profile");
  updateProfile = (b: M.ProfileUpdate) => this.req<M.StudentProfile>("PUT", "/me/profile", b);
  uploadDocument = (file: File) => { const f = new FormData(); f.append("file", file); return this.req<M.Document>("POST", "/me/documents", undefined, f); };
  listUsers = (f: M.UserFilters = {}) => this.req<M.UserListItem[]>("GET", "/admin/users" + this.q(f));
  createUser = (b: M.UserCreate) => this.req<M.User>("POST", "/admin/users", b);
  updateUser = (id: string, b: M.UserUpdate) => this.req<M.User>("PATCH", `/admin/users/${id}`, b);
  deactivateUser = (id: string) => this.req<void>("POST", `/admin/users/${id}/deactivate`);

  browse = (f: M.ListingFilters = {}) => this.req<M.Listing[]>("GET", "/listings" + this.q(f));
  listing = (id: string) => this.req<M.Listing>("GET", `/listings/${id}`);
  supervisors = () => this.req<M.SupervisorSummary[]>("GET", "/supervisors");
  myListings = () => this.req<M.Listing[]>("GET", "/supervisor/listings");
  createListing = (b: M.ListingCreate) => this.req<M.Listing>("POST", "/supervisor/listings", b);
  updateListing = (id: string, b: M.ListingUpdate) => this.req<M.Listing>("PUT", `/supervisor/listings/${id}`, b);
  closeListing = (id: string) => this.req<M.Listing>("POST", `/supervisor/listings/${id}/close`);
  uploadCover = (id: string, file: File) => { const f = new FormData(); f.append("file", file); return this.req<M.Listing>("POST", `/supervisor/listings/${id}/cover`, undefined, f); };
  propose = (b: M.ProposalCreate) => this.req<M.Proposal>("POST", "/proposals", b);
  myProposals = () => this.req<M.Proposal[]>("GET", "/me/proposals");
  incomingProposals = () => this.req<M.Proposal[]>("GET", "/supervisor/proposals");
  decideProposal = (id: string, accept: boolean, note?: string) =>
    this.req<M.Proposal>("POST", `/supervisor/proposals/${id}/${accept ? "accept" : "decline"}`, { note });

  myApplications = () => this.req<M.Application[]>("GET", "/me/applications");
  apply = (b: M.ApplicationCreate) => this.req<M.Application>("POST", "/applications", b);
  withdraw = (id: string) => this.req<void>("DELETE", `/applications/${id}`);
  setRanking = (ids: string[]) => this.req<M.Application[]>("PUT", "/me/ranking", { application_ids: ids });
  applicants = (id: string, f: M.ApplicantFilters = {}) => this.req<M.Applicant[]>("GET", `/supervisor/listings/${id}/applicants` + this.q(f));
  applicant = (id: string) => this.req<M.Applicant>("GET", `/supervisor/applicants/${id}`);
  getRanking = (id: string) => this.req<M.ApplicantRanking>("GET", `/supervisor/listings/${id}/ranking`);
  putRanking = (id: string, ids: string[]) => this.req<M.ApplicantRanking>("PUT", `/supervisor/listings/${id}/ranking`, { application_ids: ids });
  aiMatch = (id: string) => this.req<M.ApplicantScore[]>("POST", `/supervisor/listings/${id}/applicants/ai-match`);
  documentUrl = (id: string) => this.req<M.Document>("GET", `/documents/${id}/view`);

  cycle = () => this.req<M.Cycle | null>("GET", "/cycle");
  listCycles = () => this.req<M.Cycle[]>("GET", "/admin/cycles");
  getCycle = (id: string) => this.req<M.Cycle>("GET", `/admin/cycles/${id}`);
  createCycle = (b: M.CycleCreate) => this.req<M.Cycle>("POST", "/admin/cycles", b);
  closeCycle = (id: string) => this.req<M.Cycle>("POST", `/admin/cycles/${id}/close`);
  reopenCycle = (id: string) => this.req<M.Cycle>("POST", `/admin/cycles/${id}/reopen`);
  updateCycle = (id: string, b: M.CycleUpdate) => this.req<M.Cycle>("PUT", `/admin/cycles/${id}`, b);
  setRounds = (id: string, b: M.RoundsUpdate) => this.req<M.Cycle>("PUT", `/admin/cycles/${id}/rounds`, b);
  execute = (id: string) => this.req<M.RoundSummary>("POST", `/admin/rounds/${id}/execute`);
  summary = (id: string) => this.req<M.RoundSummary>("GET", `/admin/rounds/${id}/summary`);
  matches = (id: string, status?: M.MatchStatus) => this.req<M.Match[]>("GET", `/admin/rounds/${id}/matches` + this.q({ status }));
  reassign = (id: string, b: M.ReassignRequest) => this.req<M.Match>("POST", `/admin/matches/${id}/reassign`, b);
  manualAssign = (id: string, b: M.ManualAssignRequest) => this.req<M.Match>("POST", `/admin/rounds/${id}/assign`, b);
  unassign = (id: string, note: string) => this.req<void>("POST", `/admin/matches/${id}/unassign`, { note });
  unmatched = (id: string) => this.req<M.UserListItem[]>("GET", `/admin/rounds/${id}/unmatched`);
  publish = (id: string) => this.req<M.RoundSummary>("POST", `/admin/rounds/${id}/publish`);
  auditLog = () => this.req<M.AuditEntry[]>("GET", "/admin/audit");
  supervisorMatches = () => this.req<M.Match[]>("GET", "/supervisor/matches");
  decideMatch = (id: string, approve: boolean, note?: string) =>
    this.req<M.Match>("POST", `/supervisor/matches/${id}/${approve ? "approve" : "reject"}`, { note });
  matchStudent = (id: string) => this.req<M.Applicant>("GET", `/supervisor/matches/${id}/student`);
  myMatch = () => this.req<M.Match | null>("GET", "/me/match");
  respondToOffer = (accept: boolean) => this.req<M.Match>("POST", `/me/match/${accept ? "accept" : "decline"}`);
  tick = () => this.req<void>("POST", "/internal/tick");

  clock = () => this.req<M.ClockState>("GET", "/debug/clock");
  setClock = (now: string) => this.req<M.ClockState>("PUT", "/debug/clock", { now });
  resetClock = () => this.req<M.ClockState>("DELETE", "/debug/clock");

  notifications = () => this.req<M.Notification[]>("GET", "/me/notifications");
  markRead = (id: string) => this.req<void>("POST", `/me/notifications/${id}/read`);
  adminDashboard = () => this.req<M.AdminDashboard>("GET", "/admin/dashboard");
  supervisorDashboard = () => this.req<M.SupervisorDashboard>("GET", "/supervisor/dashboard");
  
}
