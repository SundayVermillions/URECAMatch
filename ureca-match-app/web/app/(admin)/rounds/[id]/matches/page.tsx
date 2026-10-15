"use client";
/** ReviewMatchingResults (4.4), PublishResults (4.5), ManualAssignStudent (4.6). Screen: MatchingAwaitPublishPage. */
import { useParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { Avatar, Banner, Button, Chip, Empty, Field, Loading, Modal, Progress, Select, Status, Textarea } from "@/components/ui";
import { ApiError, type Match, type MatchStatus } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

export default function ReviewMatches() {
  const { id } = useParams<{ id: string }>();
  const call = useCall();
  const [status, setStatus] = useState<MatchStatus | undefined>();
  const summary = useApi((api) => api.summary(id), [id]);
  const matches = useApi((api) => api.matches(id, status), [id, status]);
  const listings = useApi((api) => api.browse(), []);
  const [reassign, setReassign] = useState<Match | null>(null);
  const [target, setTarget] = useState("");
  const [why, setWhy] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const s = summary.data;
  const published = !!s?.round.published_at;
  const executed = !!s?.round.executed_at; // REQ-PUB-1: nothing to publish before matching runs

  async function doReassign() {
    if (!reassign) return; setError(null);
    try { await call((api) => api.reassign(reassign.id, { listing_id: target, justification: why })); setReassign(null); setWhy(""); setTarget(""); matches.reload(); summary.reload(); }
    catch (e) { setError(e as ApiError); }
  }
  async function publish() {
    setError(null);
    try { summary.setData(await call((api) => api.publish(id))); matches.reload(); } catch (e) { setError(e as ApiError); } finally { setConfirmPublish(false); }
  }

  return (
    <>
      <PageHeader title={`Round ${s?.round.number ?? ""} matches`} back={{ href: "/rounds", label: "Back to matching rounds" }} description={s ? `${s.matched} proposed · reassign any match before publishing` : ""}
        right={s && (
          <div className="flex items-center gap-3.5">
            <div className="w-56"><div className="flex justify-between text-[12px] mb-1"><span className="text-muted font-semibold">Supervisor decisions</span><span className="font-bold tabular">{s.approvals_done} / {s.approvals_total}</span></div><Progress value={s.approvals_done} max={s.approvals_total} /></div>
            {published ? <Status value="published" /> : <Button disabled={!executed} title={executed ? undefined : "Run matching for this round first"} onClick={() => setConfirmPublish(true)}>Publish results</Button>}
          </div>
        )} />
      {error && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <span className="eyebrow">Status</span>
        {[undefined, "proposed", "approved", "rejected", "reassigned", "published", "accepted", "declined", "timed_out"].map((v) => <Chip key={String(v)} active={status === v} onClick={() => setStatus(v as MatchStatus | undefined)}>{v ? (v[0].toUpperCase() + v.slice(1)).replace("_", " ") : "All"}</Chip>)}
      </div>
      {matches.loading && !matches.data ? <Loading /> : !matches.data?.length ? <Empty title="No matches" note={status ? "Nothing with this status." : "Run matching first."} /> : (
        <div className="bg-surface border border-border rounded-card overflow-hidden">
          <div className="flex items-center gap-3.5 px-4 py-2.5 border-b border-border eyebrow"><span className="flex-1">Student → project</span><span className="w-40">Status</span><span className="w-24" /></div>
          {matches.data.map((m) => (
            <div key={m.id} className="border-b border-border last:border-b-0">
              <div className="flex items-center gap-3.5 px-4 py-3">
                <Avatar name={m.student_name} size={32} tone="navy" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold">{m.student_name}{m.preference_rank ? <span className="text-faint font-normal"> · preference {m.preference_rank}</span> : null}</div>
                  <div className="text-[12.5px] text-muted truncate">→ <strong className="text-text">{m.listing_title}</strong> · {m.supervisor_name}</div>
                  {m.original_listing_id && <div className="text-[11.5px] text-warn-ink mt-0.5">Reassigned · {m.justification}</div>}
                  {m.status === "rejected" && <div className="text-[11.5px] text-bad-ink mt-0.5">Rejected by {m.supervisor_name}{m.supervisor_note ? ` · "${m.supervisor_note}"` : " · no reason given"}</div>}
                </div>
                <span className="w-40"><Status value={m.status} /></span>
                <span className="w-24 flex justify-end">{!published && <Button size="sm" variant="secondary" onClick={() => setReassign(m)}>Reassign</Button>}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!reassign} onClose={() => setReassign(null)} title={`Reassign ${reassign?.student_name}`} footer={<><Button variant="secondary" onClick={() => setReassign(null)}>Cancel</Button><Button disabled={!target || why.length < 10} onClick={doReassign}>Reassign</Button></>}>
        <div className="flex flex-col gap-3 text-text">
          {error && <Banner tone="bad">{error.message}</Banner>}
          <Field label="Move to project" error={error?.field === "listing_id" ? error.message : null}>
            <Select id="target" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose a project with an open slot</option>{(listings.data ?? []).filter((l) => l.id !== reassign?.listing_id && l.filled_slots < l.available_slots).map((l) => <option key={l.id} value={l.id}>{l.title} · {l.available_slots - l.filled_slots} open</option>)}</Select>
          </Field>
          <Field label="Justification" hint="Required. Recorded in the audit log with your name and the time." error={error?.field === "justification" ? error.message : null}>
            <Textarea id="why" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} />
          </Field>
        </div>
      </Modal>
      <Modal open={confirmPublish} onClose={() => setConfirmPublish(false)} title="Publish results?" footer={<><Button variant="secondary" onClick={() => setConfirmPublish(false)}>Not yet</Button><Button onClick={publish}>Publish</Button></>}>
        Every matched student receives their offer and the round is locked. Matches still awaiting a supervisor decision block publishing.
      </Modal>
    </>
  );
}
