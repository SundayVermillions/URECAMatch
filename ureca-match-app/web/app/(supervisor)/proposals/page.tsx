"use client";
/** ManageSelf-ProposedProjects (4.18). REQ-REVPROP-1..3. Screen: StudentProposalPage. */
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { I } from "@/components/shell/icons";
import { DocumentViewer } from "@/components/supervisor/document-viewer";
import { Avatar, Banner, Button, Card, Drawer, Empty, Loading, Modal, Pill, Segmented, Status, fmtDate } from "@/components/ui";
import { ApiError, type Document, type Proposal } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

const fmtSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function Proposals() {
  const call = useCall();
  const { data, loading, reload } = useApi((api) => api.incomingProposals(), []);
  const [tab, setTab] = useState<"waiting" | "decided">("waiting");
  const [confirm, setConfirm] = useState<{ p: Proposal; accept: boolean } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [profile, setProfile] = useState<Proposal | null>(null); // REQ-REVPROP-1: proposal whose student is shown in the drawer
  async function decide() {
    if (!confirm) return;
    try { await call((api) => api.decideProposal(confirm.p.id, confirm.accept)); reload(); } catch (e) { setError(e as ApiError); } finally { setConfirm(null); }
  }
  const pending = (data ?? []).filter((p) => p.status === "submitted");
  const decided = (data ?? []).filter((p) => p.status !== "submitted");

  return (
    <>
      <PageHeader title="Student proposals" description="Projects students have proposed to you. Accepting registers the student to the project and removes them from matching."
        right={<Segmented value={tab} onChange={setTab} options={[{ value: "waiting", label: "Waiting", count: pending.length }, { value: "decided", label: "Decided", count: decided.length }]} />} />
      {error && <div className="mb-5"><Banner tone="bad">{error.message}</Banner></div>}

      {loading && !data ? <Loading /> : tab === "waiting" ? (
        pending.length === 0 ? <Empty title="No proposals waiting" note="When a student proposes a project to you, it appears here." /> : (
          <div className="flex flex-col gap-4">
            {pending.map((p) => <ProposalCard key={p.id} p={p} onView={() => setProfile(p)} onDecide={(accept) => setConfirm({ p, accept })} />)}
          </div>
        )
      ) : (
        decided.length === 0 ? <Empty title="Nothing decided yet" note="Proposals you accept or decline are kept here." /> : (
          <Card padded={false} className="overflow-hidden">
            {decided.map((p, i) => (
              <div key={p.id} className={`flex items-center gap-3.5 px-5 py-3.5 ${i > 0 ? "border-t border-border" : ""}`}>
                <Avatar name={p.student_name} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-text truncate">{p.title}</div>
                  <div className="text-[12.5px] text-muted">{p.student_name} · decided {fmtDate(p.decided_at)}</div>
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

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.accept ? "Accept and register this student?" : "Decline this proposal?"}
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button><Button variant={confirm?.accept ? "primary" : "destructive"} onClick={decide}>{confirm?.accept ? "Accept and register" : "Decline"}</Button></>}>
        {confirm?.accept ? `${confirm.p.student_name} is registered to "${confirm.p.title}" under you. Their other applications, open offers and pending proposals are withdrawn.` : `${confirm?.p.student_name} will be notified. They can keep applying to listed projects.`}
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
      <div className="flex items-center gap-3 px-6 py-3.5 border-t border-border bg-bg/60 rounded-b-card">
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
      <div className="flex flex-col items-center text-center pt-1">
        <Avatar name={p.student_name} size={64} tone="navy" />
        <div className="text-[20px] font-semibold tracking-[-0.015em] mt-3">{p.student_name}</div>
        <div className="text-[13.5px] text-muted mt-0.5">{s ? `${s.school} · Year ${s.year_of_study ?? "-"}` : "Student"} · proposed {fmtDate(p.submitted_at)}</div>
      </div>

      {s ? (
        <>
          <div className="grid grid-cols-3 bg-bg rounded-row py-3">
            <Stat label="CGPA" value={s.cgpa?.toFixed(2) ?? "-"} suffix="/ 5" />
            <Stat label="Year" value={String(s.year_of_study ?? "-")} divider />
            <Stat label="Modules" value={String(s.completed_modules.length)} divider />
          </div>
          <Section title="Completed modules">
            {s.completed_modules.length ? <div className="flex flex-wrap gap-1.5">{s.completed_modules.map((m) => <Pill key={m}>{m}</Pill>)}</div> : <Muted>None listed</Muted>}
          </Section>
          <Section title="Research interests">
            {s.research_interests.length ? <div className="flex flex-wrap gap-1.5">{s.research_interests.map((t) => <Pill key={t}>{t}</Pill>)}</div> : <Muted>None listed</Muted>}
          </Section>
        </>
      ) : (
        <Banner tone="warn">This student has not completed their profile yet.</Banner>
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

function Stat({ label, value, suffix, divider }: { label: string; value: string; suffix?: string; divider?: boolean }) {
  return (
    <div className={`text-center px-2 ${divider ? "border-l border-border" : ""}`}>
      <div className="text-[18px] font-semibold tabular text-text">{value}{suffix && <span className="text-[12px] font-normal text-faint ml-1">{suffix}</span>}</div>
      <div className="text-[12px] text-muted mt-0.5">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="eyebrow mb-2">{title}</div>{children}</div>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] text-muted">{children}</div>;
}
