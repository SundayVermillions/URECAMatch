"use client";
/** ApproveMatchingResults (4.17). REQ-APPRV-1..3. Screen: MatchApprovalsPage. */
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { Avatar, Banner, Button, Empty, Field, Loading, Modal, Status, Textarea } from "@/components/ui";
import { ApiError, type Match } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

export default function Approvals() {
  const { me } = useMe();
  const call = useCall();
  const { data, loading, reload } = useApi((api) => api.supervisorMatches(), []);
  const [reject, setReject] = useState<Match | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  async function decide(m: Match, approve: boolean, note?: string) {
    try { await call((api) => api.decideMatch(m.id, approve, note)); reload(); } catch (e) { setError(e as ApiError); } finally { setReject(null); setReason(""); }
  }
  const pending = (data ?? []).filter((m) => m.status === "proposed");
  const rest = (data ?? []).filter((m) => m.status !== "proposed");
  return (
    <>
      <PageHeader title="Match approvals" description="Approve or reject each student the matching proposed for your projects. Rejecting returns the slot to the pool." />
      {error && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      {loading && !data ? <Loading /> : pending.length === 0 ? (
        <Empty title="Nothing to approve" note={me?.phase.window === "awaiting_results" ? "Nothing is waiting for you. If matching has not run yet, proposed matches appear here as soon as it does." : "Proposed matches appear here as soon as the admin runs matching for the round."} />
      ) : (
        <div className="flex flex-col gap-2">
          {pending.map((m) => (
            <div key={m.id} className="bg-surface border border-border rounded-row flex items-center gap-3.5 px-4 py-3">
              <Avatar name={m.student_name} size={32} tone="navy" />
              <div className="flex-1 min-w-0"><div className="text-[13.5px] font-semibold">{m.student_name}</div><div className="text-[12.5px] text-muted truncate">→ <strong className="text-text">{m.listing_title}</strong>{m.preference_rank ? ` · their preference ${m.preference_rank}` : ""}</div></div>
              <Status value={m.status} />
              <Button size="sm" onClick={() => decide(m, true)}>Approve</Button>
              <Button size="sm" variant="secondary" onClick={() => setReject(m)}>Reject</Button>
            </div>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <>
          <h2 className="mt-7 mb-3">Decided</h2>
          <div className="flex flex-col gap-2">
            {rest.map((m) => (
              <div key={m.id} className="bg-surface border border-border rounded-row flex items-center gap-3.5 px-4 py-3">
                <Avatar name={m.student_name} size={32} />
                <div className="flex-1 min-w-0"><div className="text-[13.5px] font-semibold">{m.student_name}</div><div className="text-[12.5px] text-muted truncate">→ {m.listing_title}</div></div>
                <Status value={m.status} />
              </div>
            ))}
          </div>
        </>
      )}
      <Modal open={!!reject} onClose={() => { setReject(null); setReason(""); }} title="Reject this match?" footer={<><Button variant="secondary" onClick={() => { setReject(null); setReason(""); }}>Cancel</Button><Button variant="destructive" onClick={() => reject && decide(reject, false, reason)}>Reject</Button></>}>
        <div className="flex flex-col gap-3">
          <div>{reject?.student_name} will not be placed on {reject?.listing_title}. The slot returns to the pool and the admin is notified for review.</div>
          <Field label="Reason for the admin" hint="Optional. Helps the admin decide where to reassign the student.">
            <Textarea id="reject-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
