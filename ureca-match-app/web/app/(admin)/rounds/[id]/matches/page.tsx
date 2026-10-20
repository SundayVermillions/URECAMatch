"use client";
/** ReviewMatchingResults (4.4), PublishResults (4.5), ManualAssignStudent (4.6). Screen: MatchingAwaitPublishPage.
 *  Status chips filter the matches (REQ-REV-1); "Unmatched" lists the round's applicants without a match, each with
 *  Manual assign (REQ-ASSIGN-1). Unassign takes a student off a project so they can be placed again (REQ-ASSIGN-3).
 *  Results publish by themselves when the approval window closes (REQ-PUB-3), so there is no Publish button. */
import { useParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { Avatar, Banner, Button, Chip, Empty, Field, Loading, Modal, Select, Status, Textarea, fmtDeadline } from "@/components/ui";
import { ApiError, type Match, type MatchStatus, type UserListItem } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

// "declined" is used by both sides, so the chips say whose decline it was
const STATUSES: [MatchStatus, string][] = [["proposed", "Proposed"], ["rejected", "Declined by supervisor"], ["reassigned", "Reassigned"],
  ["published", "Offer sent"], ["accepted", "Accepted"], ["declined", "Declined by student"], ["timed_out", "Timed out"]];
const PLACES: MatchStatus[] = ["proposed", "approved", "reassigned", "published", "accepted"]; // a match that holds the student

export default function ReviewMatches() {
  const { id } = useParams<{ id: string }>();
  const call = useCall();
  const [status, setStatus] = useState<MatchStatus | "unmatched" | undefined>();
  const summary = useApi((api) => api.summary(id), [id]);
  const matches = useApi((api) => api.matches(id, status === "unmatched" ? undefined : status), [id, status]);
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
      <PageHeader title={`Round ${s?.round.number ?? ""} matches`} back={{ href: "/rounds", label: "Back to matching rounds" }} description={s ? (published ? `${s.matched} matches · results published; unassign or assign students here if needed` : `${s.matched} matched · supervisors can decline until ${fmtDeadline(s.round.approval_end)}`) : ""}
        right={s && (
          <div className="flex items-center gap-3.5">
            {!published && <div className="text-right"><div className="text-[12px] text-muted font-semibold">Declined by supervisors</div><div className="font-bold tabular">{s.declined}</div></div>}
            {published ? <Status value="published" kind="round" /> : <span className="text-[12.5px] text-muted max-w-[200px]">Publishes automatically at {fmtDeadline(s.round.approval_end)}</span>}
          </div>
        )} />
      {error && !reassign && !assign && !unassign && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <span className="eyebrow">Status</span>
        <Chip active={status === undefined} onClick={() => setStatus(undefined)}>All</Chip>
        {STATUSES.map(([v, text]) => <Chip key={v} active={status === v} onClick={() => setStatus(v)}>{text}</Chip>)}
        <Chip active={status === "unmatched"} onClick={() => setStatus("unmatched")}>Unmatched{unmatched.data ? ` (${unmatched.data.length})` : ""}</Chip>
      </div>

      {status === "unmatched" ? (
        unmatched.loading && !unmatched.data ? <Loading /> : !unmatched.data?.length ? <Empty title="No unmatched students" note="Everyone who applied in this round has a match, or was excluded after declining or timing out earlier." /> : (
          <div className="bg-surface border border-border rounded-card overflow-hidden">
            <div className="flex items-center gap-3.5 px-4 py-2.5 border-b border-border eyebrow"><span className="flex-1">Applied, no match</span><span className="w-32" /></div>
            {unmatched.data.map((u) => (
              <div key={u.user.id} className="flex items-center gap-3.5 px-4 py-3 border-b border-border last:border-b-0">
                <Avatar name={u.user.name} size={32} />
                <div className="flex-1 min-w-0"><div className="text-[13.5px] font-semibold">{u.user.name}</div><div className="text-[12.5px] text-muted truncate">{[u.school, u.user.email].filter(Boolean).join(" · ")}</div></div>
                <span className="w-32 flex justify-end"><Button size="sm" variant="secondary" onClick={() => { closeModals(); setAssign(u); }}>Manual assign</Button></span>
              </div>
            ))}
          </div>
        )
      ) : matches.loading && !matches.data ? <Loading /> : !matches.data?.length ? <Empty title="No matches" note={status ? "Nothing with this status." : "Matching runs automatically when the round's review window closes."} /> : (
        <div className="bg-surface border border-border rounded-card overflow-hidden">
          <div className="flex items-center gap-3.5 px-4 py-2.5 border-b border-border eyebrow"><span className="flex-1">Student → project</span><span className="w-32">Status</span><span className="w-44" /></div>
          {matches.data.map((m) => (
            <div key={m.id} className="border-b border-border last:border-b-0">
              <div className="flex items-center gap-3.5 px-4 py-3">
                <Avatar name={m.student_name} size={32} tone="navy" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold">{m.student_name}{m.preference_rank ? <span className="text-faint font-normal"> · preference {m.preference_rank}</span> : null}</div>
                  <div className="text-[12.5px] text-muted truncate">→ <strong className="text-text">{m.listing_title}</strong> · {m.supervisor_name}</div>
                  {m.original_listing_id && <div className="text-[11.5px] text-warn-ink mt-0.5">Reassigned · {m.justification}</div>}
                  {m.status === "rejected" && <div className="text-[11.5px] text-bad-ink mt-0.5">Declined by {m.supervisor_name}{m.supervisor_note ? ` · "${m.supervisor_note}"` : " · no reason given"}</div>}
                </div>
                <span className="w-32"><Status value={m.status} /></span>
                <span className="w-44 flex justify-end gap-2">
                  {!["published", "accepted", "declined", "timed_out"].includes(m.status) && <Button size="sm" variant="secondary" onClick={() => { closeModals(); setReassign(m); }}>Reassign</Button>}
                  {PLACES.includes(m.status) && <Button size="sm" variant="text" className="text-muted hover:text-bad-ink" onClick={() => { closeModals(); setUnassign(m); }}>Unassign</Button>}
                </span>
              </div>
            </div>
          ))}
        </div>
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
