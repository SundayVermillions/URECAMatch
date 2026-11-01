"use client";
/** ManageSelf-ProposedProjects (4.18). REQ-REVPROP-1..3. Screen: StudentProposalPage. */
import { DEMO_DECLINE_PROPOSAL } from "@/lib/demo-data";
import { typeText, useDemoFill } from "@/lib/demo-fill";
import { useState } from "react";
import { PageTitle } from "@/components/shell/app-shell";
import { refreshBadges } from "@/components/shell/badges";
import { I } from "@/components/shell/icons";
import { DocumentViewer } from "@/components/supervisor/document-viewer";
import { StudentSummary } from "@/components/supervisor/student-summary";
import { Avatar, Banner, Button, Card, Drawer, Empty, Field, Loading, Modal, Segmented, Status, Textarea, fmtDate } from "@/components/ui";
import { ApiError, type Document, type Proposal } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

const MIN_REASON = 10; // same minimum as the API (routers/proposals.py)
const fmtSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function Proposals() {
  const call = useCall();
  const { data, loading, reload } = useApi((api) => api.incomingProposals(), []);
  const [tab, setTab] = useState<"waiting" | "decided">("waiting");
  const [confirm, setConfirm] = useState<{ p: Proposal; accept: boolean } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [profile, setProfile] = useState<Proposal | null>(null); // REQ-REVPROP-1: proposal whose student is shown in the drawer
  const [reason, setReason] = useState(""); // REQ-REVPROP-2: why a proposal is declined; the student reads it
  const [reasonError, setReasonError] = useState<string | null>(null);
  const reasonOk = reason.trim().length >= MIN_REASON;
  useDemoFill(async () => { if (confirm && !confirm.accept) await typeText(setReason, DEMO_DECLINE_PROPOSAL); }); // demo only: the reason box of the open dialog
  const closeConfirm = () => { setConfirm(null); setReason(""); setReasonError(null); };
  async function decide() {
    if (!confirm || (!confirm.accept && !reasonOk)) return;
    setReasonError(null);
    try { await call((api) => api.decideProposal(confirm.p.id, confirm.accept, confirm.accept ? undefined : reason.trim())); reload(); refreshBadges(); closeConfirm(); }
    catch (e) {
      const err = e as ApiError;
      if (err.field === "note") { setReasonError(err.message); return; } // stay in the dialog, beside the box
      setError(err); closeConfirm();
    }
  }
  const pending = (data ?? []).filter((p) => p.status === "submitted");
  const decided = (data ?? []).filter((p) => p.status !== "submitted");

  return (
    <>
      <PageTitle title="Student proposals"
        right={<Segmented value={tab} onChange={setTab} options={[{ value: "waiting", label: "Waiting", count: pending.length }, { value: "decided", label: "Decided", count: decided.length }]} />} />
      {error && <div className="mb-5"><Banner tone="bad">{error.message}</Banner></div>}

      {loading && !data ? <Loading /> : tab === "waiting" ? (
        pending.length === 0 ? <Empty icon={<I.Bulb size={20} />} title="No proposals waiting" note="When a student proposes a project to you, it appears here." /> : (
          <div className="flex flex-col gap-4">
            {pending.map((p) => <ProposalCard key={p.id} p={p} onView={() => setProfile(p)} onDecide={(accept) => setConfirm({ p, accept })} />)}
          </div>
        )
      ) : (
        decided.length === 0 ? <Empty icon={<I.Check size={20} />} title="Nothing decided yet" note="Proposals you accept or decline are kept here." /> : (
          <Card padded={false} className="overflow-hidden">
            {decided.map((p, i) => (
              <div key={p.id} className={`flex items-center gap-3.5 px-5 py-3.5 ${i > 0 ? "border-t border-border" : ""}`}>
                <Avatar name={p.student_name} size={36} tone="auto" />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-text truncate">{p.title}</div>
                  <div className="text-[12.5px] text-muted">{p.student_name} · decided {fmtDate(p.decided_at)}</div>
                  {p.decision_note && <div className="mt-1 text-[12.5px] text-muted">Your reason: {p.decision_note}</div>}
                </div>
                <Status value={p.status} />
              </div>
            ))}
          </Card>
        )
      )}

      <Drawer open={!!profile} onClose={() => setProfile(null)} title="Student"
        footer={profile && (
          <>
            <Button variant="secondary" onClick={() => { setConfirm({ p: profile, accept: false }); setProfile(null); }}>Decline</Button>
            <Button onClick={() => { setConfirm({ p: profile, accept: true }); setProfile(null); }}>Accept and register</Button>
          </>
        )}>
        {profile && <StudentProfile p={profile} />}
      </Drawer>

      <Modal open={!!confirm} onClose={closeConfirm} title={confirm?.accept ? "Accept and register this student?" : "Decline this proposal?"}
        footer={<><Button variant="secondary" onClick={closeConfirm}>Cancel</Button><Button variant={confirm?.accept ? "primary" : "destructive"} disabled={!confirm?.accept && !reasonOk} onClick={decide}>{confirm?.accept ? "Accept and register" : "Decline"}</Button></>}>
        {confirm?.accept ? `${confirm.p.student_name} is registered to "${confirm.p.title}" under you. Their other applications, open offers and pending proposals are withdrawn.` : (
          <div className="flex flex-col gap-4">
            <div>{confirm?.p.student_name} will be told, and will read your reason. They can keep applying to listed projects.</div>
            <Field label="Reason for the student" error={reasonError} hint="Say what would make a proposal work, so they can improve it.">
              <Textarea rows={4} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} invalid={!!reasonError} autoFocus />
              <div className={`flex items-center gap-1.5 text-[12.5px] transition-colors ${reasonOk ? "text-good-ink" : "text-muted"}`}>
                <span aria-hidden className={`grid h-[14px] w-[14px] shrink-0 place-items-center rounded-full transition-colors ${reasonOk ? "bg-good text-white" : "shadow-[inset_0_0_0_1.5px_var(--border-strong)]"}`}>{reasonOk && <I.Tick size={9} />}</span>
                At least {MIN_REASON} characters
              </div>
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}

/** One waiting proposal. Reads top to bottom: who, what, why, then actions. */
function ProposalCard({ p, onView, onDecide }: { p: Proposal; onView: () => void; onDecide: (accept: boolean) => void }) {
  const docs = p.documents ?? [];
  return (
    <Card padded={false}>
      {/* Who */}
      <div className="flex items-center gap-3.5 px-6 pt-5 pb-4">
        <Avatar name={p.student_name} size={40} tone="navy" />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-text">{p.student_name}</div>
          {p.student?.email && (
            <div className="text-[12.5px] text-accent">
              <a href={`mailto:${p.student.email}`} className="hover:underline">
                {p.student.email}
              </a>
            </div>
          )}
          <div className="text-[13px] text-muted">
            {p.student ? <>{p.student.school} · Year {p.student.year_of_study ?? "-"} · CGPA <span className="font-semibold text-text tabular">{p.student.cgpa?.toFixed(2) ?? "-"}</span></> : "Profile not completed"}
          </div>
        </div>
        <span className="text-[12.5px] text-faint shrink-0">{fmtDate(p.submitted_at)}</span>
      </div>

      {/* What and why */}
      <div className="px-6 py-5 border-t border-border">
        <h3 className="text-[18px] leading-[1.3]">{p.title}</h3>
        {p.research_interests.length > 0 && <div className="text-[13px] text-muted mt-1">{p.research_interests.join(" · ")}</div>}
        <p className="text-[14px] leading-[1.65] text-text mt-3 max-w-[720px]">{p.description}</p>
        <div className="mt-4 pl-4 border-l-2 border-border max-w-[720px]">
          <div className="eyebrow mb-1">Why this supervisor</div>
          <p className="text-[14px] leading-[1.65] text-muted">{p.statement}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 px-6 py-3.5 border-t border-border bg-white/40">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {docs.map((d) => (
            <span key={d.id} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill bg-surface ring-1 ring-border text-[12.5px] text-muted max-w-[220px]">
              <I.File size={13} /><span className="truncate">{d.file_name}</span>
            </span>
          ))}
          <Button variant="text" size="sm" onClick={onView}>View profile</Button>
        </div>
        <Button variant="secondary" onClick={() => onDecide(false)}>Decline</Button>
        <Button onClick={() => onDecide(true)}>Accept and register</Button>
      </div>
    </Card>
  );
}

/** Drawer body: contact-card layout. REQ-REVPROP-1: profile plus the documents attached to this proposal. */
function StudentProfile({ p }: { p: Proposal }) {
  const s = p.student;
  return (
    <>
      {s ? (
        <StudentSummary name={p.student_name} email={s.email} school={s.school} year={s.year_of_study} cgpa={s.cgpa}
          modules={s.completed_modules} interests={s.research_interests} note={`proposed ${fmtDate(p.submitted_at)}`} />
      ) : (
        <>
          <div className="flex flex-col items-center pt-1 text-center">
            <Avatar name={p.student_name} size={64} tone="navy" />
            <div className="mt-3 text-[20px] font-semibold tracking-[-0.015em]">{p.student_name}</div>
            <div className="mt-0.5 text-[13.5px] text-muted">Student · proposed {fmtDate(p.submitted_at)}</div>
          </div>
          <Banner tone="warn">This student has not completed their profile yet.</Banner>
        </>
      )}

      <Section title="Proposal">
        <div className="text-[14.5px] font-medium text-text leading-[1.4]">{p.title}</div>
      </Section>

      <Section title="Attached documents">
        {(p.documents ?? []).length === 0 ? <Muted>No documents attached to this proposal.</Muted> : (
          <div className="rounded-row ring-1 ring-border overflow-hidden">
            {(p.documents ?? []).map((d, i) => <DocumentRow key={d.id} d={d} first={i === 0} />)}
          </div>
        )}
      </Section>
    </>
  );
}

function DocumentRow({ d, first }: { d: Document; first: boolean }) {
  const [opened, setOpened] = useState(false); // load the signed link on first open only
  return (
    <details className={`group ${first ? "" : "border-t border-border"}`} onToggle={(e) => { if (e.currentTarget.open) setOpened(true); }}>
      <summary className="flex items-center gap-3 px-3.5 py-3 cursor-pointer list-none hover:bg-bg transition-colors">
        <span className="w-8 h-8 rounded-[8px] bg-bad-soft text-bad-ink inline-flex items-center justify-center shrink-0"><I.File size={15} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-medium text-text truncate">{d.file_name}</span>
          <span className="block text-[12px] text-faint uppercase">{d.file_format} · {fmtSize(d.file_size)}</span>
        </span>
        <span className="text-faint -rotate-90 group-open:rotate-0 transition-transform"><I.ChevronDown size={15} /></span>
      </summary>
      {opened && <DocumentViewer id={d.id} name={d.file_name} />}
    </details>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="eyebrow mb-2">{title}</div>{children}</div>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] text-muted">{children}</div>;
}
