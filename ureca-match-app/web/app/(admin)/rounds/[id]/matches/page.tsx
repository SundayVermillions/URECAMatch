"use client";
/** ReviewMatchingResults (4.4), PublishResults (4.5), ManualAssignStudent (4.6). Screen: MatchingAwaitPublishPage.
 *  Status chips filter the matches (REQ-REV-1); "Unmatched" lists the round's applicants without a match, each with
 *  Manual assign (REQ-ASSIGN-1). Unassign takes a student off a project so they can be placed again (REQ-ASSIGN-3).
 *  Results publish by themselves when the approval window closes (REQ-PUB-3), so there is no Publish button. */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PageTitle } from "@/components/shell/app-shell";
import { I } from "@/components/shell/icons";
import { CountUp } from "@/components/admin/charts";
import { Avatar, Banner, Button, Card, Empty, Field, FilterSelect, Loading, Modal, Pill, Segmented, Select, Skeleton, Status, Textarea, fmtDeadline, statusLabel } from "@/components/ui";
import { ApiError, type Match, type MatchStatus, type UserListItem } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

// The chips name each status exactly as its pill does (SRS 3.1.6): "Rejected" is the supervisor's, "Declined" the student's.
const STATUSES: MatchStatus[] = ["proposed", "rejected", "reassigned", "published", "accepted", "declined", "timed_out"];
const PLACES: MatchStatus[] = ["proposed", "approved", "reassigned", "published", "accepted"]; // a match that holds the student

export default function ReviewMatches() {
  const { id } = useParams<{ id: string }>();
  const call = useCall();
  const [tab, setTab] = useState<"matches" | "unmatched">("matches");
  const [status, setStatus] = useState<MatchStatus | undefined>();
  const [shown, setShown] = useState(12); // unmatched rows shown before "Show more"
  const summary = useApi((api) => api.summary(id), [id]);
  const matches = useApi((api) => api.matches(id, status), [id, status]);
  const unmatched = useApi((api) => api.unmatched(id), [id]);
  const listings = useApi((api) => api.browse(), []);
  const [reassign, setReassign] = useState<Match | null>(null);
  const [assign, setAssign] = useState<UserListItem | null>(null);
  const [unassign, setUnassign] = useState<Match | null>(null);
  const [target, setTarget] = useState("");
  const [why, setWhy] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const s = summary.data;
  const published = !!s?.round.published_at;

  const reloadAll = () => { matches.reload(); summary.reload(); unmatched.reload(); listings.reload(); };
  const closeModals = () => { setReassign(null); setAssign(null); setUnassign(null); setWhy(""); setTarget(""); setError(null); };
  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); closeModals(); reloadAll(); } catch (e) { setError(e as ApiError); }
  }
  const doReassign = () => reassign && run(() => call((api) => api.reassign(reassign.id, { listing_id: target, justification: why })));
  const doAssign = () => assign && run(() => call((api) => api.manualAssign(id, { student_id: assign.user.id, listing_id: target, justification: why })));
  const doUnassign = () => unassign && run(() => call((api) => api.unassign(unassign.id, why)));
  // The API also counts slots held by pending matches and open offers; this list is a first filter.
  const projectOptions = (exclude?: string) => (listings.data ?? []).filter((l) => l.id !== exclude && l.filled_slots < l.available_slots)
    .map((l) => <option key={l.id} value={l.id}>{l.title} · {l.available_slots - l.filled_slots} open</option>);
  const modalError = error && <Banner tone="bad">{error.message}</Banner>;
  const whyField = (hint: string) => (
    <Field label="Justification" hint={hint} error={error?.field === "justification" || error?.field === "note" ? error.message : null}>
      <Textarea id="why" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} />
    </Field>
  );

  return (
    <>
      <Link href="/rounds" className="mb-3 inline-flex items-center gap-1 text-[13.5px] font-medium"><I.ChevronLeft /> Back to matching rounds</Link>
      <PageTitle title={`Round ${s?.round.number ?? ""} matches`} />

      <Card padded={false} className="mb-5 overflow-hidden">
        {!s ? <div className="px-8 py-6"><Skeleton className="h-12 w-full" /></div> : (
          <div className="grid grid-cols-[repeat(3,auto)_1fr] items-center divide-x divide-border">
            {[
              { label: "Matched", value: s.matched },
              ...(published ? [] : [{ label: "Rejected by supervisors", value: s.declined }]),
              { label: "Unmatched", value: unmatched.data?.length ?? s.unmatched },
            ].map((f, i) => (
              <div key={f.label} className={`py-5 ${i === 0 ? "pl-8 pr-7" : "px-7"}`}>
                <div className="text-[12.5px] font-medium text-muted">{f.label}</div>
                <div className="mt-1 font-display text-[30px] font-semibold leading-none tracking-[-0.03em]"><CountUp value={f.value} /></div>
              </div>
            ))}
            <div className="flex items-center gap-3 py-5 pl-7 pr-8">
              {published ? (
                <>
                  <Status value="published" kind="round" />
                  <span className="text-[12.5px] leading-snug text-muted">Results are published. Unassign or assign students here if needed.</span>
                </>
              ) : (
                <>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-ink"><I.Clock size={16} /></span>
                  <span className="text-[12.5px] leading-snug text-muted">Supervisors can decline until {fmtDeadline(s.round.approval_end)}. Results publish by themselves.</span>
                </>
              )}
            </div>
          </div>
        )}
      </Card>

      {error && !reassign && !assign && !unassign && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: "matches", label: "Matches" }, { value: "unmatched", label: "Unmatched", count: unmatched.data?.length }]} />
        {tab === "matches" && (
          <FilterSelect label="Status" value={status ? statusLabel(status) : undefined} options={STATUSES.map(statusLabel)} align="left" anyLabel="All"
            onChange={(v) => setStatus(v ? STATUSES.find((k) => statusLabel(k) === v) : undefined)} />
        )}
      </div>

      {tab === "unmatched" ? (
        unmatched.loading && !unmatched.data ? <Loading /> : !unmatched.data?.length ? <Empty icon={<I.CheckCircle size={20} />} title="No unmatched students" note="Everyone who applied in this round has a match, or was excluded after declining or timing out earlier." /> : (
          <Card padded={false} className="overflow-hidden">
            <div className="flex items-center gap-4 border-b border-border px-6 py-3 text-[12px] font-medium text-faint"><span className="flex-1">Applied, no match</span><span className="w-32" /></div>
            <ul className="divide-y divide-border">
              {unmatched.data.slice(0, shown).map((u) => (
                <li key={u.user.id} className="flex items-center gap-4 px-6 py-3.5">
                  <Avatar name={u.user.name} size={36} tone="auto" />
                  <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold">{u.user.name}</div><div className="truncate text-[12.5px] text-muted">{[u.school, u.user.email].filter(Boolean).join(" · ")}</div></div>
                  <span className="flex w-32 justify-end"><Button size="sm" variant="soft" onClick={() => { closeModals(); setAssign(u); }}>Manual assign</Button></span>
                </li>
              ))}
            </ul>
            {unmatched.data.length > shown && (
              <div className="flex items-center justify-between border-t border-border bg-white/40 px-6 py-3">
                <span className="text-[12.5px] tabular text-faint">Showing {shown} of {unmatched.data.length}</span>
                <Button size="sm" variant="soft" onClick={() => setShown((n) => n + 12)}>Show more</Button>
              </div>
            )}
          </Card>
        )
      ) : matches.loading && !matches.data ? <Loading /> : !matches.data?.length ? <Empty icon={<I.Users size={20} />} title="No matches" note={status ? "Nothing with this status." : "Matching runs automatically when the round's review window closes."} /> : (
        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center gap-4 border-b border-border px-6 py-3 text-[12px] font-medium text-faint"><span className="flex-1">Student and project</span><span className="w-32">Status</span><span className="w-44" /></div>
          <ul className="divide-y divide-border">
            {matches.data.map((m) => (
              <li key={m.id} className="flex items-center gap-4 px-6 py-3.5">
                <Avatar name={m.student_name} size={36} tone="navy" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[14px] font-semibold">{m.student_name}{m.preference_rank ? <Pill>Choice {m.preference_rank}</Pill> : null}</div>
                  <div className="truncate text-[12.5px] text-muted">→ <strong className="font-semibold text-text">{m.listing_title}</strong> · {m.supervisor_name}</div>
                  {m.original_listing_id && <div className="mt-0.5 text-[12px] text-warn-ink">Reassigned · {m.justification}</div>}
                  {m.status === "rejected" && <div className="mt-0.5 text-[12px] text-bad-ink">Rejected by {m.supervisor_name}{m.supervisor_note ? ` · "${m.supervisor_note}"` : " · no reason given"}</div>}
                </div>
                <span className="w-32"><Status value={m.status} /></span>
                <span className="flex w-44 justify-end gap-1.5">
                  {!["published", "accepted", "declined", "timed_out"].includes(m.status) && <Button size="sm" variant="soft" onClick={() => { closeModals(); setReassign(m); }}>Reassign</Button>}
                  {PLACES.includes(m.status) && <Button size="sm" variant="text" className="text-muted hover:text-bad-ink" onClick={() => { closeModals(); setUnassign(m); }}>Unassign</Button>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={!!reassign} onClose={closeModals} title={`Reassign ${reassign?.student_name}`} footer={<><Button variant="secondary" onClick={closeModals}>Cancel</Button><Button disabled={!target || why.trim().length < 10} onClick={doReassign}>Reassign</Button></>}>
        <div className="flex flex-col gap-3 text-text">
          {modalError}
          <Field label="Move to project" error={error?.field === "listing_id" ? error.message : null}>
            <Select id="target" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose a project with an open slot</option>{projectOptions(reassign?.listing_id)}</Select>
          </Field>
          {whyField("Required, at least 10 characters. Recorded in the audit log with your name and the time.")}
        </div>
      </Modal>
      <Modal open={!!assign} onClose={closeModals} title={`Manually assign ${assign?.user.name}`} footer={<><Button variant="secondary" onClick={closeModals}>Cancel</Button><Button disabled={!target || why.trim().length < 10} onClick={doAssign}>Assign</Button></>}>
        <div className="flex flex-col gap-3 text-text">
          {modalError}
          <div className="text-[13px] text-muted">{published ? "Results are already published, so the student gets the offer straight away." : "The student is offered this project with the rest of the round when the approval window closes."} The supervisor cannot decline a manual assignment.</div>
          <Field label="Project" error={error?.field === "listing_id" ? error.message : null}>
            <Select id="assign-target" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose a project with an open slot</option>{projectOptions()}</Select>
          </Field>
          {whyField("Required, at least 10 characters. Manual assignment is for exceptional cases and is recorded in the audit log.")}
        </div>
      </Modal>
      <Modal open={!!unassign} onClose={closeModals} title={`Unassign ${unassign?.student_name}?`} footer={<><Button variant="secondary" onClick={closeModals}>Cancel</Button><Button variant="destructive" disabled={why.trim().length < 10} onClick={doUnassign}>Unassign</Button></>}>
        <div className="flex flex-col gap-3 text-text">
          {modalError}
          <div className="text-[13px] text-muted">{unassign?.student_name} is taken off {unassign?.listing_title} and the slot opens again. {unassign?.status === "accepted" ? "They had accepted, so they return to the pool and can be assigned elsewhere. " : ""}The student and supervisor are told.</div>
          {whyField("Required, at least 10 characters. Recorded in the audit log.")}
        </div>
      </Modal>
    </>
  );
}
