/** The one interface every screen uses. Two implementations: mock (default) and live.
 *  Method names mirror the API routers so a slice owner can find their endpoint in seconds. */
import type * as M from "./models";

export interface ApiClient {
  // slice A
  register(body: M.RegisterRequest): Promise<void>;
  verify(body: M.VerifyRequest): Promise<void>;
  resendCode(email: string): Promise<void>;
  signIn(body: M.SignInRequest): Promise<M.Session>;
  me(): Promise<M.Me>;
  getProfile(): Promise<M.StudentProfile>;
  updateProfile(body: M.ProfileUpdate): Promise<M.StudentProfile>;
  uploadDocument(file: File, kind?: M.Document["kind"]): Promise<M.Document>;
  deleteDocument(id: string): Promise<void>;
  listUsers(f?: M.UserFilters): Promise<M.UserListItem[]>;
  createUser(body: M.UserCreate): Promise<M.User>;
  updateUser(id: string, body: M.UserUpdate): Promise<M.User>;
  deactivateUser(id: string): Promise<void>;
  // slice B
  browse(f?: M.ListingFilters): Promise<M.Listing[]>;
  listing(id: string): Promise<M.Listing>;
  supervisors(): Promise<M.SupervisorSummary[]>;
  topics(): Promise<M.TopicGroup[]>;
  courses(q: string, limit?: number): Promise<M.Course[]>;
  coursesByCode(codes: string[]): Promise<M.Course[]>;
  recommendations(limit?: number): Promise<M.Recommendation[]>;
  myListings(): Promise<M.Listing[]>;
  createListing(body: M.ListingCreate): Promise<M.Listing>;
  updateListing(id: string, body: M.ListingUpdate): Promise<M.Listing>;
  closeListing(id: string): Promise<M.Listing>;
  uploadCover(id: string, file: File): Promise<M.Listing>;
  addGalleryPhoto(id: string, file: File): Promise<M.Listing>;
  removeGalleryPhoto(id: string, index: number): Promise<M.Listing>;
  propose(body: M.ProposalCreate): Promise<M.Proposal>;
  myProposals(): Promise<M.Proposal[]>;
  incomingProposals(): Promise<M.Proposal[]>;
  decideProposal(id: string, accept: boolean, note?: string): Promise<M.Proposal>;
  // slice C
  myApplications(): Promise<M.Application[]>;
  apply(body: M.ApplicationCreate): Promise<M.Application>;
  withdraw(id: string): Promise<void>;
  setRanking(applicationIds: string[]): Promise<M.Application[]>;
  applicants(listingId: string, f?: M.ApplicantFilters): Promise<M.Applicant[]>;
  applicant(applicationId: string): Promise<M.Applicant>;
  getRanking(listingId: string): Promise<M.ApplicantRanking>;
  putRanking(listingId: string, applicationIds: string[]): Promise<M.ApplicantRanking>;
  aiMatch(listingId: string): Promise<M.ApplicantScore[]>;
  documentUrl(documentId: string): Promise<M.Document>;
  // slice D
  cycle(): Promise<M.Cycle | null>;
  listCycles(): Promise<M.Cycle[]>;
  getCycle(id: string): Promise<M.Cycle>;
  createCycle(body: M.CycleCreate): Promise<M.Cycle>;
  closeCycle(id: string): Promise<M.Cycle>;
  reopenCycle(id: string): Promise<M.Cycle>;
  updateCycle(id: string, body: M.CycleUpdate): Promise<M.Cycle>;
  setRounds(cycleId: string, body: M.RoundsUpdate): Promise<M.Cycle>;
  execute(roundId: string): Promise<M.RoundSummary>;
  summary(roundId: string): Promise<M.RoundSummary>;
  matches(roundId: string, status?: M.MatchStatus): Promise<M.Match[]>;
  reassign(matchId: string, body: M.ReassignRequest): Promise<M.Match>;
  manualAssign(roundId: string, body: M.ManualAssignRequest): Promise<M.Match>;
  unassign(matchId: string, note: string): Promise<void>;
  unmatched(roundId: string): Promise<M.UserListItem[]>;
  publish(roundId: string): Promise<M.RoundSummary>;
  auditLog(): Promise<M.AuditEntry[]>;
  supervisorMatches(): Promise<M.Match[]>;
  decideMatch(id: string, approve: boolean, note?: string): Promise<M.Match>;
  matchStudent(matchId: string): Promise<M.Applicant>;
  myMatch(): Promise<M.Match | null>;
  respondToOffer(accept: boolean): Promise<M.Match>;
  tick(): Promise<void>;
  // developer tool: debug clock (needs DEBUG_CLOCK=true on the API; always on in mock mode)
  clock(): Promise<M.ClockState>;
  setClock(nowIso: string): Promise<M.ClockState>;
  resetClock(): Promise<M.ClockState>;
  // slice E
  notifications(): Promise<M.Notification[]>;
  markRead(id: string): Promise<void>;
  adminDashboard(): Promise<M.AdminDashboard>;
  supervisorDashboard(): Promise<M.SupervisorDashboard>;
}

export const API_MODE = (process.env.NEXT_PUBLIC_API_MODE ?? "mock") as "mock" | "live";

let _client: ApiClient | null = null;
export async function getClient(): Promise<ApiClient> {
  if (_client) return _client;
  if (API_MODE === "live") {
    const { LiveClient } = await import("./live");
    _client = new LiveClient(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000");
  } else {
    const { MockClient } = await import("../mock/client");
    _client = new MockClient();
  }
  return _client;
}
