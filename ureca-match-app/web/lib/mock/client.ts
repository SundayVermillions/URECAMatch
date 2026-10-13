/** In-browser mock of the API. Same rules as api/app/routers, same seed (lib/mock/seed.json).
 *  State lives in memory for the tab; reload the page to reset.
 *  Sign in as any seeded user with password "password", or pick a demo user on the sign-in page. */
import type { ApiClient } from "../api/client";
import * as M from "../api/models";
import { getSession } from "../session";
import seedJson from "./seed.json";

type Seed = {
  users: M.User[]; students: M.StudentProfile[]; supervisors: M.SupervisorProfile[]; cycles: M.Cycle[];
  listings: M.Listing[]; applications: M.Application[]; matches: M.Match[]; proposals: M.Proposal[];
  notifications: M.Notification[]; audit: M.AuditEntry[]; applicant_rankings: Record<string, string[]>;
};

export const DEMO_NOW = new Date("2026-09-07T10:00:00Z");
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const sleep = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short" });

export class MockClient implements ApiClient {
  db: Seed = clone(seedJson as unknown as Seed);
  now = DEMO_NOW;
  private counter = 5000;
  private passwords: Record<string, string> = {};

  private id(p: string) { return `${p}-${++this.counter}`; }
  private iso() { return this.now.toISOString(); }
  private user(): M.User {
    const s = getSession();
    const u = s && this.db.users.find((u) => u.id === s.userId);
    if (!u) throw new M.ApiError(401, "unauthenticated", "Sign in to continue.");
    if (u.status !== "active") throw new M.ApiError(403, "account_inactive", "This account is not active. Contact the URECA office.");
    return u;
  }
  private need(role: M.Role) {
    const u = this.user();
    if (u.role !== role) throw new M.ApiError(403, "forbidden", `This action is only available to ${role} accounts.`);
    return u;
  }
  private student(id: string) { return this.db.students.find((s) => s.user_id === id); }
  private listingOr404(id: string) {
    const l = this.db.listings.find((l) => l.id === id);
    if (!l) throw new M.ApiError(404, "not_found", "Project was not found.");
    return l;
  }

  // ---- cycle history (mirror of store.cycles + the active-cycle accessor)
  private activeCycle(): M.Cycle | null { return this.db.cycles.find((c) => c.status !== "closed") ?? null; }
  private cycleById(id: string): M.Cycle | undefined { return this.db.cycles.find((c) => c.id === id); }

  // ---- phase (mirror of services/windows.py)
  phase(): M.Phase {
    const c = this.activeCycle(), t = this.now.getTime();
    if (!c) return { cycle_id: null, round_id: null, round_number: null, window: "before_cycle", window_ends_at: null, label: "No application cycle is open" };
    if (t < Date.parse(c.opening_date))
      return { cycle_id: c.id, round_id: null, round_number: null, window: "before_cycle", window_ends_at: null, label: "No application cycle is open" };
    if (t > Date.parse(c.closing_date))
      return { cycle_id: c.id, round_id: null, round_number: null, window: "closed", window_ends_at: null, label: "The application cycle has closed" };
    if (c.rounds.length === 0 || t < Date.parse(c.rounds[0].application_start)) {
      const ends = c.rounds.length ? c.rounds[0].application_start : c.closing_date;
      return { cycle_id: c.id, round_id: null, round_number: null, window: "pre_application", window_ends_at: ends, label: `Applications open ${fmt(ends)}` };
    }
    const r = c.rounds.find((r) => t >= Date.parse(r.application_start) && t <= Date.parse(r.review_end))
      ?? c.rounds.find((r) => Date.parse(r.application_start) > t) ?? c.rounds[c.rounds.length - 1];
    if (t >= Date.parse(r.application_start) && t <= Date.parse(r.application_end))
      return { cycle_id: c.id, round_id: r.id, round_number: r.number, window: "application", window_ends_at: r.application_end, label: `Round ${r.number} closes ${fmt(r.application_end)}` };
    if (t >= Date.parse(r.review_start) && t <= Date.parse(r.review_end))
      return { cycle_id: c.id, round_id: r.id, round_number: r.number, window: "review", window_ends_at: r.review_end, label: `Round ${r.number} rankings due ${fmt(r.review_end)}` };
    if (!r.published_at)
      return { cycle_id: c.id, round_id: r.id, round_number: r.number, window: "awaiting_results", window_ends_at: null, label: `Round ${r.number} results pending` };
    const nxt = c.rounds.find((x) => x.number === r.number + 1);
    return { cycle_id: c.id, round_id: r.id, round_number: r.number, window: "results", window_ends_at: nxt ? nxt.review_start : c.closing_date, label: `Round ${r.number} results published` };
  }
  private requireApplicationWindow() {
    if (this.phase().window !== "application") throw new M.ApiError(422, "window_closed", "Applications can only be changed during an application window.");
  }
  private decorate(l: M.Listing, u: M.User): M.Listing {
    const apps = this.db.applications.filter((a) => a.listing_id === l.id && a.status === "submitted");
    const mine = u.role === "student" ? apps.find((a) => a.student_id === u.id) : undefined;
    return { ...l, applicant_count: apps.length, applied: !!mine, applied_rank: mine?.preference_rank ?? null };
  }
  private notify(userIds: string[], event: M.NotificationEvent, title: string, message: string, link?: string) {
    for (const uid of userIds) this.db.notifications.push({ id: this.id("ntf"), user_id: uid, event, title, message, created_at: this.iso(), read: false, link: link ?? null });
  }
  private audit(actor: M.User, operation: M.AuditOperation, affected: string[], note?: string) {
    this.db.audit.push({ id: this.id("aud"), operation, actor_id: actor.id, actor_name: actor.name, timestamp: this.iso(), affected_records: affected, note: note ?? null });
  }

  // ---- slice A
  async register(b: M.RegisterRequest) {
    await sleep();
    const domain = b.email.split("@")[1]?.toLowerCase();
    if (!["e.ntu.edu.sg", "ntu.edu.sg"].includes(domain)) throw new M.ApiError(422, "email_domain", "Use your NTU e-mail address (@e.ntu.edu.sg or @ntu.edu.sg).", "email");
    if (this.db.users.some((u) => u.email.toLowerCase() === b.email.toLowerCase())) throw new M.ApiError(409, "email_taken", "An account with this e-mail already exists. Sign in instead.");
    const u: M.User = { id: this.id(b.role.slice(0, 3)), email: b.email, name: b.name, role: b.role, status: "pending_verification", created_at: this.iso(), last_login_at: null };
    this.db.users.push(u);
    this.passwords[b.email.toLowerCase()] = b.password;
    if (b.role === "student") this.db.students.push({ user_id: u.id, school: "", cgpa: null, year_of_study: null, completed_modules: [], research_interests: [], profile_complete: false, eligible_for_matching: true, documents: [] });
    else this.db.supervisors.push({ user_id: u.id, faculty: "", organisation: "NTU" });
  }
  async verify(b: M.VerifyRequest) {
    await sleep();
    const u = this.db.users.find((u) => u.email.toLowerCase() === b.email.toLowerCase());
    if (!u) throw new M.ApiError(422, "unknown_email", "No account found for this e-mail.", "email");
    if (b.code !== "000000") throw new M.ApiError(422, "bad_code", "That code is not correct. Check your e-mail and try again.", "code");
    u.status = "active";
  }
  async resendCode(email: string) {
    await sleep();
    const u = this.db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!u) throw new M.ApiError(422, "unknown_email", "No account found for this e-mail.", "email");
    if (u.status !== "pending_verification") throw new M.ApiError(409, "already_active", "This account is already active. Sign in instead.");
  }
  async signIn(b: M.SignInRequest): Promise<M.Session> {
    await sleep();
    const u = this.db.users.find((u) => u.email.toLowerCase() === b.email.toLowerCase());
    const expected = this.passwords[b.email.toLowerCase()] ?? "password";
    if (!u || b.password !== expected) throw new M.ApiError(401, "bad_credentials", "E-mail or password is incorrect.");
    if (u.status === "inactive") throw new M.ApiError(403, "account_inactive", "This account has been deactivated. Contact the URECA office.");
    if (u.status === "pending_verification") throw new M.ApiError(403, "not_verified", "Verify your e-mail before signing in.");
    u.last_login_at = this.iso();
    return { access_token: u.id, expires_at: new Date(this.now.getTime() + 30 * 60_000).toISOString(), user: u };
  }
  async me(): Promise<M.Me> {
    const u = this.user();
    return { user: u, student: this.student(u.id) ?? null, supervisor: this.db.supervisors.find((s) => s.user_id === u.id) ?? null,
      phase: this.phase(), unread_notifications: this.db.notifications.filter((n) => n.user_id === u.id && !n.read).length };
  }
  async getProfile() { const u = this.need("student"); return this.student(u.id)!; }
  async updateProfile(b: M.ProfileUpdate) {
    const u = this.need("student"); const p = this.student(u.id)!;
    Object.assign(p, b, { profile_complete: true });
    return p;
  }
  async uploadDocument(file: File): Promise<M.Document> {
    const u = this.need("student");
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) throw new M.ApiError(422, "not_pdf", "Upload a PDF file.", "file");
    if (file.size > 5 * 1024 * 1024) throw new M.ApiError(422, "too_large", "The file is larger than 5 MB.", "file");
    const d: M.Document = { id: this.id("doc"), owner_id: u.id, file_name: file.name, file_format: "pdf", file_size: file.size, uploaded_at: this.iso(), url: null };
    this.student(u.id)!.documents.push(d);
    return d;
  }
  async listUsers(f: M.UserFilters = {}) {
    this.need("admin");
    return this.db.users.filter((u) => (!f.role || u.role === f.role) && (!f.status || u.status === f.status)
      && (!f.q || (u.name + u.email).toLowerCase().includes(f.q.toLowerCase())))
      .map((u) => ({ user: u, school: this.student(u.id)?.school ?? this.db.supervisors.find((s) => s.user_id === u.id)?.faculty ?? null }));
  }
  async createUser(b: M.UserCreate) {
    const a = this.need("admin");
    if (this.db.users.some((u) => u.email.toLowerCase() === b.email.toLowerCase())) throw new M.ApiError(409, "email_taken", "An account with this e-mail already exists.");
    const u: M.User = { id: this.id(b.role.slice(0, 3)), email: b.email, name: b.name, role: b.role, status: "active", created_at: this.iso(), last_login_at: null };
    this.db.users.push(u);
    this.passwords[b.email.toLowerCase()] = "password"; this.audit(a, "user_updated", [u.id], "created");
    return u;
  }
  async updateUser(id: string, b: M.UserUpdate) {
    const a = this.need("admin"); const u = this.db.users.find((u) => u.id === id);
    if (!u) throw new M.ApiError(404, "not_found", "User was not found.");
    if (b.name) u.name = b.name; if (b.role) u.role = b.role; if (b.status) u.status = b.status;
    this.audit(a, "user_updated", [u.id]); return u;
  }
  async deactivateUser(id: string) {
    const a = this.need("admin"); const u = this.db.users.find((u) => u.id === id);
    if (!u) throw new M.ApiError(404, "not_found", "User was not found.");
    u.status = "inactive"; this.audit(a, "user_deactivated", [u.id]);
  }

  // ---- slice B
  async browse(f: M.ListingFilters = {}) {
    const u = this.user(); await sleep(80);
    // REQ-BROWSE-2: same rules as routers/listings.py. Fields are joined with a line break,
    // so a keyword never matches across the end of one field and the start of the next.
    const lc = (x?: string) => (x ?? "").toLowerCase();
    return this.db.listings.filter((l) => l.status === "published"
      && (!f.q || lc([l.title, l.description, ...l.topic_tags].join("\n")).includes(lc(f.q)))
      && (!f.school || lc(l.offering_faculty) === lc(f.school))
      && (!f.tag || l.topic_tags.some((t) => lc(t) === lc(f.tag)))
      && (!f.supervisor || lc(l.supervisor_name).includes(lc(f.supervisor))))
      .map((l) => this.decorate(l, u));
  }
  async listing(id: string) {
    const u = this.user(); const l = this.listingOr404(id);
    if (l.status !== "published" && u.id !== l.supervisor_id && u.role !== "admin") throw new M.ApiError(404, "not_found", "Project was not found.");
    return this.decorate(l, u);
  }
  async supervisors() { // REQ-PROPOSE-2 picker: active supervisors only, sorted by surname-ish name
    this.user();
    const bare = (n: string) => n.replace(/^(Assoc\. )?(Prof\. |Dr\. )/, "");
    return this.db.supervisors.map((s) => ({ s, u: this.db.users.find((u) => u.id === s.user_id) }))
      .filter((x) => x.u && x.u.status === "active")
      .map(({ s, u }) => ({ id: s.user_id, name: u!.name, faculty: s.faculty }))
      .sort((a, b) => bare(a.name).localeCompare(bare(b.name)));
  }
  async myListings() { const u = this.need("supervisor"); return this.db.listings.filter((l) => l.supervisor_id === u.id).map((l) => this.decorate(l, u)); }
  /** True once the cycle closing date has passed (REQ-PROJ-1, REQ-PROJ-2), as in routers/listings.py. */
  private cycleClosed() { const c = this.activeCycle(); return !c || this.now.getTime() > Date.parse(c.closing_date); }
  private checkListingText(title?: string | null, description?: string | null) {
    if (title != null && title.trim().length < 5) throw new M.ApiError(422, "title_too_short", "Give the project a title of at least 5 characters.", "title");
    if (description != null && description.trim().length < 20) throw new M.ApiError(422, "description_too_short", "Describe the project in at least 20 characters.", "description");
  }
  async createListing(b: M.ListingCreate) {
    const u = this.need("supervisor");
    if (b.publish !== false && this.cycleClosed()) throw new M.ApiError(422, "cycle_closed", "The application cycle has closed. Save this as a draft for the next cycle.");
    this.checkListingText(b.title, b.description);
    const l: M.Listing = { id: this.id("lst"), supervisor_id: u.id, supervisor_name: u.name, title: b.title, description: b.description,
      prerequisites: b.prerequisites ?? [], topic_tags: b.topic_tags ?? [], available_slots: b.available_slots, filled_slots: 0,
      offering_faculty: b.offering_faculty, research_location: b.research_location, cover_url: null, status: b.publish === false ? "draft" : "published",
      created_at: this.iso(), applicant_count: 0, applied: false, applied_rank: null };
    this.db.listings.push(l); return l;
  }
  async updateListing(id: string, b: M.ListingUpdate) {
    const u = this.need("supervisor"); const l = this.listingOr404(id);
    if (l.supervisor_id !== u.id) throw new M.ApiError(403, "forbidden", "You do not have access to this.");
    if (this.cycleClosed()) throw new M.ApiError(422, "cycle_closed", "The application cycle has closed. Listings can no longer be edited."); // REQ-PROJ-2
    this.checkListingText(b.title, b.description);
    if (b.available_slots != null && b.available_slots < l.filled_slots) throw new M.ApiError(422, "slots_below_matched", `${l.filled_slots} students are already matched. Slots cannot go below that.`, "available_slots");
    const { publish, ...changes } = b;
    if (publish && l.status === "draft") l.status = "published"; // REQ-PROJ-1: publish a draft
    for (const [k, v] of Object.entries(changes)) if (v != null) (l as unknown as Record<string, unknown>)[k] = typeof v === "string" ? v.trim() : v;
    return l;
  }
  async uploadCover(id: string, file: File) { // same rules as routers/listings.py cover()
    const u = this.need("supervisor"); const l = this.listingOr404(id);
    if (l.supervisor_id !== u.id) throw new M.ApiError(404, "not_found", "Project was not found.");
    if (this.cycleClosed()) throw new M.ApiError(422, "cycle_closed", "The application cycle has closed. Listings can no longer be edited.");
    if (!["image/jpeg", "image/png"].includes(file.type)) throw new M.ApiError(422, "not_image", "Upload a JPEG or PNG image.", "file");
    if (file.size > 5 * 1024 * 1024) throw new M.ApiError(422, "too_large", "The image is larger than 5 MB.", "file");
    l.cover_url = URL.createObjectURL(file); // lives as long as the tab, like the rest of the mock data
    return this.decorate(l, u);
  }
  async closeListing(id: string) { const u = this.need("supervisor"); const l = this.listingOr404(id); if (l.supervisor_id !== u.id) throw new M.ApiError(403, "forbidden", "No access."); l.status = "closed"; return l; }
  async propose(b: M.ProposalCreate) {
    const u = this.need("student"); this.requireApplicationWindow(); // REQ-PROPOSE-3
    // REQ-PROPOSE-2: an active project supervisor
    const sup = this.db.users.find((x) => x.id === b.supervisor_id);
    if (!sup || sup.role !== "supervisor" || sup.status !== "active") throw new M.ApiError(422, "unknown_supervisor", "Choose a project supervisor from the list.", "supervisor_id");
    // REQ-PROPOSE-1: at least one interest, word limits, own documents only (same rules as routers/proposals.py)
    const interests = (b.research_interests ?? []).map((t) => t.trim()).filter(Boolean);
    if (!interests.length) throw new M.ApiError(422, "interests_required", "Add at least one research interest.", "research_interests");
    const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
    if (words(b.description) > 500) throw new M.ApiError(422, "too_long", "Keep the description to 500 words or fewer.", "description");
    if (words(b.statement) > 300) throw new M.ApiError(422, "too_long", "Keep this to 300 words or fewer.", "statement");
    const own = new Set((this.student(u.id)?.documents ?? []).map((d) => d.id));
    if ((b.document_ids ?? []).some((d) => !own.has(d))) throw new M.ApiError(422, "unknown_document", "Attach documents from your own profile only.", "document_ids");
    const p: M.Proposal = { id: this.id("prp"), student_id: u.id, student_name: u.name, supervisor_id: sup.id, supervisor_name: sup.name, title: b.title,
      description: b.description, research_interests: interests, statement: b.statement, status: "submitted", submitted_at: this.iso(), decided_at: null, document_ids: b.document_ids ?? [], student: null, documents: [] };
    this.db.proposals.push(p); this.notify([sup.id], "proposal_decided", `New proposal from ${u.name}`, p.title, "/proposals"); return p;
  }
  async myProposals() { const u = this.need("student"); return this.db.proposals.filter((p) => p.student_id === u.id); }
  async incomingProposals() { // REQ-REVPROP-1: attach the student's profile and attached documents
    const u = this.need("supervisor");
    return this.db.proposals.filter((p) => p.supervisor_id === u.id).map((p): M.Proposal => {
      const su = this.db.users.find((x) => x.id === p.student_id), sp = this.student(p.student_id);
      if (!su || !sp) return p;
      const student: M.ApplicantStudent = { id: su.id, name: su.name, school: sp.school, year_of_study: sp.year_of_study ?? null, cgpa: sp.cgpa ?? null,
        completed_modules: sp.completed_modules ?? [], research_interests: sp.research_interests ?? [] };
      return { ...p, student, documents: (sp.documents ?? []).filter((d) => (p.document_ids ?? []).includes(d.id)) };
    });
  }
  async decideProposal(id: string, accept: boolean, note?: string) {
    const u = this.need("supervisor"); const p = this.db.proposals.find((p) => p.id === id);
    if (!p || p.supervisor_id !== u.id) throw new M.ApiError(404, "not_found", "Proposal was not found.");
    if (p.status !== "submitted") throw new M.ApiError(409, "already_decided", "This proposal has already been decided.");
    if (accept) { // REQ-REVPROP-3: registering a student needs an open cycle. Declining stays open.
      const c = this.activeCycle(); const t = this.now.getTime();
      if (!c || t < Date.parse(c.opening_date) || t > Date.parse(c.closing_date))
        throw new M.ApiError(422, "cycle_closed", "The application cycle is not open, so this proposal can no longer be accepted.");
    }
    p.status = accept ? "accepted" : "declined"; p.decided_at = this.iso();
    if (accept) {
      const l: M.Listing = { id: this.id("lst"), supervisor_id: u.id, supervisor_name: u.name, title: p.title, description: p.description, prerequisites: [], topic_tags: p.research_interests,
        available_slots: 1, filled_slots: 1, offering_faculty: this.db.supervisors.find((s) => s.user_id === u.id)?.faculty ?? "", research_location: "", cover_url: null, status: "closed", created_at: this.iso(), applicant_count: 0, applied: false, applied_rank: null };
      this.db.listings.push(l);
      this.db.matches.push({ id: this.id("mt"), round_id: this.phase().round_id ?? "", student_id: p.student_id, student_name: p.student_name, listing_id: l.id, listing_title: l.title, supervisor_id: u.id, supervisor_name: u.name,
        status: "accepted", preference_rank: null, supervisor_decided_at: this.iso(), published_at: this.iso(), offer_expires_at: null, student_responded_at: this.iso(), original_listing_id: null, justification: null });
      for (const a of this.db.applications) if (a.student_id === p.student_id && a.status === "submitted") a.status = "withdrawn";
      const sp = this.student(p.student_id); if (sp) sp.eligible_for_matching = false;
    }
    this.notify([p.student_id], "proposal_decided", accept ? "Your proposal was accepted" : "Your proposal was declined", `${u.name} ${accept ? "accepted" : "declined"} ${p.title}.${note ? ` Note: ${note}` : ""}`, "/my-applications");
    return p;
  }

  // ---- slice C
  async myApplications() { const u = this.need("student"); return this.db.applications.filter((a) => a.student_id === u.id).sort((a, b) => (a.preference_rank ?? 99) - (b.preference_rank ?? 99)); }
  async apply(b: M.ApplicationCreate) {
    const u = this.need("student"); this.requireApplicationWindow(); const l = this.listingOr404(b.listing_id);
    const sp = this.student(u.id);
    if (sp && !sp.profile_complete) throw new M.ApiError(409, "profile_incomplete", "Complete your profile before applying. Go to My Profile to finish it.");
    if (sp && !sp.eligible_for_matching) throw new M.ApiError(409, "not_eligible", "You declined an earlier offer, so you cannot apply again this cycle.");
    if (l.filled_slots >= l.available_slots) throw new M.ApiError(409, "fully_allocated", "All slots on this project are filled.");
    const own = new Set((sp?.documents ?? []).map((d) => d.id)); // REQ-APPLY-2: own documents only
    if ((b.document_ids ?? []).some((d) => !own.has(d))) throw new M.ApiError(422, "unknown_document", "Attach documents from your own profile only.", "document_ids");
    if (b.statement.length < 50) throw new M.ApiError(422, "invalid", "Write at least 50 characters.", "statement");
    const round = this.phase().round_id ?? "";
    const active = this.db.applications.filter((a) => a.student_id === u.id && a.round_id === round && a.status === "submitted");
    if (active.some((a) => a.listing_id === l.id)) throw new M.ApiError(409, "already_applied", "You have already applied to this project. See My Applications.");
    const a: M.Application = { id: this.id("app"), student_id: u.id, listing_id: l.id, listing_title: l.title, supervisor_name: l.supervisor_name, round_id: round, statement: b.statement,
      submitted_at: this.iso(), preference_rank: active.length + 1, status: "submitted", document_ids: b.document_ids ?? [] };
    this.db.applications.push(a); return a;
  }
  async withdraw(id: string) {
    const u = this.need("student"); this.requireApplicationWindow();
    const a = this.db.applications.find((a) => a.id === id && a.student_id === u.id);
    if (!a) throw new M.ApiError(404, "not_found", "Application was not found.");
    if (a.status !== "submitted") throw new M.ApiError(409, "not_withdrawable", "Only applications still under review can be withdrawn.");
    a.status = "withdrawn"; a.preference_rank = null;
    this.db.applications.filter((x) => x.student_id === u.id && x.round_id === a.round_id && x.status === "submitted")
      .sort((x, y) => (x.preference_rank ?? 99) - (y.preference_rank ?? 99)).forEach((x, i) => (x.preference_rank = i + 1));
  }
  async setRanking(ids: string[]) {
    const u = this.need("student"); this.requireApplicationWindow(); const round = this.phase().round_id;
    const active = this.db.applications.filter((a) => a.student_id === u.id && a.round_id === round && a.status === "submitted");
    if ([...ids].sort().join() !== active.map((a) => a.id).sort().join()) throw new M.ApiError(422, "ranking_incomplete", "Rank every active application exactly once.", "application_ids");
    ids.forEach((id, i) => (active.find((a) => a.id === id)!.preference_rank = i + 1));
    return this.myApplications();
  }
  private applicantRows(listingId: string, roundId: string | null): M.Applicant[] {
    const l = this.listingOr404(listingId);
    return this.db.applications.filter((a) => a.listing_id === listingId && a.status === "submitted" && (!roundId || a.round_id === roundId)).flatMap((a) => {
      const u = this.db.users.find((u) => u.id === a.student_id), sp = this.student(a.student_id);
      if (!u || !sp) return [];
      return [{ application_id: a.id, student: { id: u.id, name: u.name, school: sp.school, year_of_study: sp.year_of_study ?? null, cgpa: sp.cgpa ?? null, completed_modules: sp.completed_modules, research_interests: sp.research_interests },
        statement: a.statement, submitted_at: a.submitted_at, documents: sp.documents, meets_prerequisites: l.prerequisites.every((m) => sp.completed_modules.includes(m)), recommended: false, rank: null }];
    });
  }
  async applicants(listingId: string, f: M.ApplicantFilters = {}) {
    const u = this.need("supervisor"); const l = this.listingOr404(listingId);
    if (l.supervisor_id !== u.id) throw new M.ApiError(403, "forbidden", "You do not have access to this.");
    const round = this.phase().round_id;
    let rows = this.applicantRows(listingId, round);
    if (f.school) rows = rows.filter((r) => r.student.school === f.school);
    if (f.min_cgpa != null) rows = rows.filter((r) => (r.student.cgpa ?? 0) >= f.min_cgpa!);
    if (f.prerequisites_only) rows = rows.filter((r) => r.meets_prerequisites);
    [...rows].sort((a, b) => Number(!a.meets_prerequisites) - Number(!b.meets_prerequisites) || (b.student.cgpa ?? 0) - (a.student.cgpa ?? 0)).slice(0, 10).forEach((r) => (r.recommended = true));
    const ranking = this.db.applicant_rankings[`${listingId}:${round}`] ?? [];
    for (const r of rows) r.rank = ranking.includes(r.application_id) ? ranking.indexOf(r.application_id) + 1 : null;
    return rows;
  }
  async applicant(applicationId: string) {
    this.need("supervisor"); const a = this.db.applications.find((a) => a.id === applicationId);
    if (!a) throw new M.ApiError(404, "not_found", "Application was not found.");
    const row = this.applicantRows(a.listing_id, null).find((r) => r.application_id === applicationId);
    if (!row) throw new M.ApiError(404, "not_found", "Application was not found.");
    return row;
  }
  async getRanking(listingId: string) {
    const u = this.need("supervisor"); if (this.listingOr404(listingId).supervisor_id !== u.id) throw new M.ApiError(403, "forbidden", "You do not have access to this.");
    const round = this.phase().round_id ?? ""; return { listing_id: listingId, round_id: round, application_ids: this.db.applicant_rankings[`${listingId}:${round}`] ?? [], submitted_at: null }; }
  async putRanking(listingId: string, ids: string[]) {
    const u = this.need("supervisor"); const l = this.listingOr404(listingId);
    if (l.supervisor_id !== u.id) throw new M.ApiError(403, "forbidden", "You do not have access to this.");
    const w = this.phase().window; if (w !== "application" && w !== "review") throw new M.ApiError(422, "ranking_closed", "Rankings for this round are closed.");
    const round = this.phase().round_id ?? "";
    this.db.applicant_rankings[`${listingId}:${round}`] = [...ids];
    return { listing_id: listingId, round_id: round, application_ids: ids, submitted_at: this.iso() };
  }
  async documentUrl(id: string) {
    const u = this.user();
    for (const s of this.db.students) {
      const d = s.documents.find((d) => d.id === id); if (!d) continue;
      // REQ-VRANK-3: owner, admins, and the supervisor of any listing the owner applied to
      const ok = u.id === s.user_id || u.role === "admin" || (u.role === "supervisor" && this.db.applications.some((a) => a.student_id === s.user_id && this.db.listings.find((l) => l.id === a.listing_id)?.supervisor_id === u.id));
      if (!ok) throw new M.ApiError(403, "forbidden", "You do not have access to this.");
      return { ...d, url: "/sample-transcript.pdf" };
    }
    throw new M.ApiError(404, "not_found", "Document was not found.");
  }

  // ---- slice D
  async cycle() { this.user(); return this.activeCycle(); }
  async listCycles() { this.need("admin"); return [...this.db.cycles].sort((x, y) => Date.parse(y.opening_date) - Date.parse(x.opening_date)); }
  async getCycle(id: string) { this.need("admin"); const c = this.cycleById(id); if (!c) throw new M.ApiError(404, "not_found", "Cycle was not found."); return c; }
  async createCycle(b: M.CycleCreate) {
    const a = this.need("admin");
    if (this.activeCycle()) throw new M.ApiError(409, "cycle_active", "Close the current cycle before creating a new one.");
    if (Date.parse(b.closing_date) <= Date.parse(b.opening_date)) throw new M.ApiError(422, "bad_dates", "Closing date must be after the opening date.");
    const clash = this.db.cycles.find((c) => Date.parse(c.opening_date) <= Date.parse(b.closing_date) && Date.parse(b.opening_date) <= Date.parse(c.closing_date));
    if (clash) throw new M.ApiError(409, "cycle_overlap", `These dates overlap the ${clash.academic_year} cycle. Cycles cannot overlap.`);
    const c: M.Cycle = { id: this.id("cyc"), academic_year: b.academic_year, opening_date: b.opening_date, closing_date: b.closing_date, pre_application_days: b.pre_application_days ?? 7, status: "draft", rounds: [] };
    this.db.cycles.push(c); this.audit(a, "cycle_updated", [c.id], "created"); return c;
  }
  async closeCycle(id: string) {
    const a = this.need("admin"); const c = this.cycleById(id);
    if (!c) throw new M.ApiError(404, "not_found", "Cycle was not found.");
    if (c.status === "closed") throw new M.ApiError(409, "already_closed", "This cycle is already closed.");
    c.status = "closed";
    this.notify(this.db.users.filter((u) => u.role !== "admin").map((u) => u.id), "cycle_changed", "Application cycle closed", `The ${c.academic_year} cycle is now closed.`);
    this.audit(a, "cycle_updated", [c.id], "closed"); return c;
  }
  async reopenCycle(id: string) {
    const a = this.need("admin"); const c = this.cycleById(id);
    if (!c) throw new M.ApiError(404, "not_found", "Cycle was not found.");
    if (c.status !== "closed") throw new M.ApiError(409, "not_closed", "This cycle is already open.");
    const active = this.activeCycle();
    if (active) throw new M.ApiError(409, "cycle_active", `Close the ${active.academic_year} cycle before reopening another.`);
    c.status = "in_progress";
    this.notify(this.db.users.filter((u) => u.role !== "admin").map((u) => u.id), "cycle_changed", "Application cycle reopened", `The ${c.academic_year} cycle has reopened.`);
    this.audit(a, "cycle_updated", [c.id], "reopened"); return c;
  }
  async updateCycle(id: string, b: M.CycleUpdate) {
    const a = this.need("admin"); const c = this.cycleById(id);
    if (!c) throw new M.ApiError(404, "not_found", "Cycle was not found.");
    const closingChanged = !!b.closing_date && b.closing_date !== c.closing_date;
    Object.assign(c, Object.fromEntries(Object.entries(b).filter(([, v]) => v != null)));
    if (closingChanged) this.notify(this.db.users.filter((u) => u.role !== "admin").map((u) => u.id), "cycle_changed", "Application cycle dates changed", `The cycle now closes on ${fmt(c.closing_date)}.`);
    this.audit(a, "cycle_updated", [c.id]); return c;
  }
  async setRounds(cycleId: string, b: M.RoundsUpdate) {
    const a = this.need("admin"); const c = this.cycleById(cycleId); const day = 86_400_000;
    if (!c) throw new M.ApiError(404, "not_found", "Cycle was not found.");
    let cursor = Date.parse(c.opening_date) + c.pre_application_days * day;
    const rounds: M.Round[] = [];
    for (const spec of [...b.rounds].sort((x, y) => x.number - y.number)) {
      const old = c.rounds.find((r) => r.number === spec.number);
      if (old && Date.parse(old.application_start) <= this.now.getTime()) { rounds.push(old); cursor = Date.parse(old.review_end) + 4 * day; continue; }
      const appStart = cursor, appEnd = appStart + spec.application_days * day - 1000, revStart = appStart + spec.application_days * day, revEnd = revStart + spec.review_days * day - 1000;
      if (revEnd > Date.parse(c.closing_date)) throw new M.ApiError(422, "outside_cycle", `Round ${spec.number} would end after the cycle closes on ${fmt(c.closing_date)}.`);
      rounds.push({ id: old?.id ?? this.id("rnd"), cycle_id: c.id, number: spec.number, application_start: new Date(appStart).toISOString(), application_end: new Date(appEnd).toISOString(),
        review_start: new Date(revStart).toISOString(), review_end: new Date(revEnd).toISOString(), status: "scheduled", executed_at: null, published_at: null, eligible_students: 0, open_slots: 0, reopened_slots: 0 });
      cursor = revEnd + 4 * day;
    }
    c.rounds = rounds; this.audit(a, "cycle_updated", [c.id], "rounds configured"); return c;
  }
  private round(id: string) { const r = (this.activeCycle()?.rounds ?? []).find((r) => r.id === id); if (!r) throw new M.ApiError(404, "not_found", "Round was not found."); return r; }
  async execute(roundId: string) {
    const a = this.need("admin"); const r = this.round(roundId);
    if (this.now.getTime() <= Date.parse(r.review_end)) throw new M.ApiError(409, "review_open", `Matching can run after the review window closes on ${fmt(r.review_end)}.`);
    if (r.executed_at) throw new M.ApiError(409, "already_executed", "Matching has already been run for this round.");
    const apps = this.db.applications.filter((x) => x.round_id === roundId && x.status === "submitted");
    // student-proposing deferred acceptance (mirror of services/matching/algorithm.py)
    const prefs = new Map<string, string[]>();
    for (const x of apps) { const sp = this.student(x.student_id); if (sp && !sp.eligible_for_matching) continue; prefs.set(x.student_id, [...(prefs.get(x.student_id) ?? []), x.listing_id]); }
    for (const [sid, lids] of prefs) prefs.set(sid, lids.sort((p, q) => (apps.find((x) => x.student_id === sid && x.listing_id === p)!.preference_rank ?? 99) - (apps.find((x) => x.student_id === sid && x.listing_id === q)!.preference_rank ?? 99)));
    const rankOf = new Map<string, Map<string, number>>(), cap = new Map<string, number>(), held = new Map<string, string[]>();
    for (const l of this.db.listings.filter((l) => l.status === "published")) {
      const ranked = (this.db.applicant_rankings[`${l.id}:${roundId}`] ?? []).map((aid) => apps.find((x) => x.id === aid)?.student_id).filter(Boolean) as string[];
      rankOf.set(l.id, new Map(ranked.map((s, i) => [s, i]))); cap.set(l.id, Math.max(l.available_slots - l.filled_slots, 0)); held.set(l.id, []);
    }
    const next = new Map<string, number>(); const free = [...prefs.keys()];
    while (free.length) {
      const sid = free.pop()!; const choices = prefs.get(sid)!; const i = next.get(sid) ?? 0;
      if (i >= choices.length) continue;
      next.set(sid, i + 1); const lid = choices[i];
      const rk = rankOf.get(lid); if (!rk || !rk.has(sid) || (cap.get(lid) ?? 0) === 0) { free.push(sid); continue; }
      const h = held.get(lid)!; h.push(sid); h.sort((p, q) => rk.get(p)! - rk.get(q)!);
      if (h.length > cap.get(lid)!) free.push(h.pop()!);
    }
    for (const [lid, sids] of held) for (const sid of sids) {
      const l = this.listingOr404(lid);
      this.db.matches.push({ id: this.id("mt"), round_id: roundId, student_id: sid, student_name: this.db.users.find((u) => u.id === sid)!.name, listing_id: lid, listing_title: l.title, supervisor_id: l.supervisor_id, supervisor_name: l.supervisor_name,
        status: "proposed", preference_rank: apps.find((x) => x.student_id === sid && x.listing_id === lid)?.preference_rank ?? null, supervisor_decided_at: null, published_at: null, offer_expires_at: null, student_responded_at: null, original_listing_id: null, justification: null });
    }
    r.executed_at = this.iso(); r.status = "awaiting_publication";
    this.audit(a, "matching_executed", [roundId], `${[...held.values()].flat().length} matched`);
    return this.summary(roundId);
  }
  async summary(roundId: string): Promise<M.RoundSummary> {
    this.need("admin"); const r = this.round(roundId);
    const ms = this.db.matches.filter((m) => m.round_id === roundId);
    const applied = new Set(this.db.applications.filter((a) => a.round_id === roundId && a.status === "submitted").map((a) => a.student_id));
    const excluded = [...applied].filter((sid) => this.student(sid)?.eligible_for_matching === false).length;
    const prefs = ms.map((m) => m.preference_rank).filter((p): p is number => !!p);
    const decided = ms.filter((m) => m.status !== "proposed" && m.status !== "rejected").length;
    return { round: r, matched: ms.length, unmatched: Math.max(applied.size - excluded - ms.length, 0), excluded, avg_preference: prefs.length ? Math.round((prefs.reduce((s, p) => s + p, 0) / prefs.length) * 100) / 100 : null, approvals_done: decided, approvals_total: ms.length };
  }
  async matches(roundId: string, status?: M.MatchStatus) { this.need("admin"); return this.db.matches.filter((m) => m.round_id === roundId && (!status || m.status === status)); }
  async reassign(id: string, b: M.ReassignRequest) {
    const a = this.need("admin"); const m = this.db.matches.find((m) => m.id === id);
    if (!m) throw new M.ApiError(404, "not_found", "Match was not found.");
    if (["published", "accepted", "declined", "timed_out"].includes(m.status)) throw new M.ApiError(409, "already_published", "Published matches cannot be reassigned.");
    if (b.justification.length < 10) throw new M.ApiError(422, "invalid", "Give a justification of at least 10 characters.", "justification");
    const l = this.listingOr404(b.listing_id);
    if (l.filled_slots >= l.available_slots) throw new M.ApiError(422, "no_slot", "That project has no open slot.", "listing_id");
    m.original_listing_id = m.original_listing_id ?? m.listing_id;
    Object.assign(m, { listing_id: l.id, listing_title: l.title, supervisor_id: l.supervisor_id, supervisor_name: l.supervisor_name, status: "reassigned", justification: b.justification });
    this.audit(a, "manual_reassignment", [m.id], b.justification); return m;
  }
  async manualAssign(roundId: string, b: M.ManualAssignRequest) {
    const a = this.need("admin"); this.round(roundId);
    if (this.db.matches.some((m) => m.student_id === b.student_id && !["rejected", "declined", "timed_out"].includes(m.status))) throw new M.ApiError(409, "already_assigned", "This student already has a project. Unassign it first.");
    const l = this.listingOr404(b.listing_id);
    const m: M.Match = { id: this.id("mt"), round_id: roundId, student_id: b.student_id, student_name: this.db.users.find((u) => u.id === b.student_id)?.name ?? b.student_id, listing_id: l.id, listing_title: l.title, supervisor_id: l.supervisor_id, supervisor_name: l.supervisor_name,
      status: "reassigned", preference_rank: null, supervisor_decided_at: null, published_at: null, offer_expires_at: null, student_responded_at: null, original_listing_id: null, justification: b.justification };
    this.db.matches.push(m); this.audit(a, "manual_reassignment", [m.id], b.justification); return m;
  }
  async publish(roundId: string) {
    const a = this.need("admin"); const r = this.round(roundId); const ms = this.db.matches.filter((m) => m.round_id === roundId);
    if (ms.some((m) => m.status === "proposed")) throw new M.ApiError(409, "approvals_pending", "Some matches are still awaiting supervisor approval.");
    const c = this.activeCycle()!; const nxt = c.rounds.find((x) => x.number === r.number + 1);
    const expires = nxt ? nxt.review_start : c.closing_date;
    for (const m of ms) if (m.status === "approved" || m.status === "reassigned") {
      m.status = "published"; m.published_at = this.iso(); m.offer_expires_at = expires;
      for (const x of this.db.applications) if (x.student_id === m.student_id && x.round_id === roundId) x.status = x.listing_id === m.listing_id ? "matched" : "unmatched";
    }
    r.published_at = this.iso(); r.status = "published";
    this.audit(a, "results_published", [roundId]);
    this.notify(ms.filter((m) => m.status === "published").map((m) => m.student_id), "offer_received", "You have a match offer", `Respond by ${fmt(expires)}.`, "/my-applications");
    return this.summary(roundId);
  }
  async auditLog() { this.need("admin"); return [...this.db.audit].sort((a, b) => b.timestamp.localeCompare(a.timestamp)); }
  async supervisorMatches() { const u = this.need("supervisor"); return this.db.matches.filter((m) => m.supervisor_id === u.id); }
  async decideMatch(id: string, approve: boolean) {
    const u = this.need("supervisor"); const m = this.db.matches.find((m) => m.id === id);
    if (!m || m.supervisor_id !== u.id) throw new M.ApiError(404, "not_found", "Match was not found.");
    const r = this.round(m.round_id);
    if (!r.executed_at) throw new M.ApiError(409, "not_executed", "Matching has not been run for this round yet.");
    if (r.published_at) throw new M.ApiError(409, "already_published", "Results are published; this match can no longer be changed.");
    m.status = approve ? "approved" : "rejected"; m.supervisor_decided_at = this.iso(); return m;
  }
  async myMatch() {
    const u = this.need("student");
    const visible = this.db.matches.filter((m) => m.student_id === u.id && ["published", "accepted", "declined", "timed_out"].includes(m.status));
    return visible[visible.length - 1] ?? null;
  }
  async respondToOffer(accept: boolean) {
    const u = this.need("student"); const m = await this.myMatch();
    if (!m || m.status !== "published") throw new M.ApiError(409, "no_offer", "There is no open offer to respond to.");
    m.status = accept ? "accepted" : "declined"; m.student_responded_at = this.iso();
    if (accept) { const l = this.db.listings.find((l) => l.id === m.listing_id); if (l) l.filled_slots += 1; }
    else { const sp = this.student(u.id); if (sp) sp.eligible_for_matching = false; }
    return m;
  }
  async tick() {
    for (const m of this.db.matches) if (m.status === "published" && m.offer_expires_at && this.now.getTime() > Date.parse(m.offer_expires_at)) { m.status = "timed_out"; const sp = this.student(m.student_id); if (sp) sp.eligible_for_matching = false; }
  }

  // ---- debug clock (mirror of routers/debug.py; the mock has no env flag, the UI hides the widget instead)
  private clockState(): M.ClockState { return { enabled: true, now: this.iso(), overridden: this.now.getTime() !== DEMO_NOW.getTime() }; }
  async clock() { return this.clockState(); }
  async setClock(nowIso: string) { this.user(); this.now = new Date(nowIso); return this.clockState(); }
  async resetClock() { this.user(); this.now = DEMO_NOW; return this.clockState(); }

  // ---- slice E
  async notifications() { const u = this.user(); return this.db.notifications.filter((n) => n.user_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at)); }
  async markRead(id: string) { const u = this.user(); const n = this.db.notifications.find((n) => n.id === id && n.user_id === u.id); if (!n) throw new M.ApiError(404, "not_found", "Notification was not found."); n.read = true; } // REQ-NOTIF-2: someone else's reads as not found
  async adminDashboard(): Promise<M.AdminDashboard> {
    this.need("admin"); const round = this.phase().round_id;
    const pending = this.db.matches.filter((m) => m.status === "proposed").length;
    const incomplete = this.db.students.filter((s) => !s.profile_complete).length;
    return { cycle: this.activeCycle(), students: this.db.users.filter((u) => u.role === "student").length, supervisors: this.db.users.filter((u) => u.role === "supervisor").length,
      listings_published: this.db.listings.filter((l) => l.status === "published").length, applications_this_round: this.db.applications.filter((a) => a.round_id === round && a.status === "submitted").length,
      pending_approvals: pending, alerts: [pending ? `${pending} proposed matches await supervisor approval` : "", incomplete ? `${incomplete} students have not completed their profile` : ""].filter(Boolean) };
  }
  async supervisorDashboard(): Promise<M.SupervisorDashboard> {
    const u = this.need("supervisor");
    return { listings: this.db.listings.filter((l) => l.supervisor_id === u.id).map((l) => this.decorate(l, u)), pending_proposals: this.db.proposals.filter((p) => p.supervisor_id === u.id && p.status === "submitted").length,
      pending_approvals: this.db.matches.filter((m) => m.supervisor_id === u.id && m.status === "proposed").length, phase: this.phase() };
  }
}
