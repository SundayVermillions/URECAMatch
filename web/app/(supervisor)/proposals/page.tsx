"use client";
/** ManageSelf-ProposedProjects (4.18). REQ-REVPROP-1..3. Screen: StudentProposalPage. */
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { Avatar, Banner, Button, Card, Empty, Loading, Modal, Pill, Status, fmtDate } from "@/components/ui";
import { ApiError, type Proposal } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

export default function Proposals() {
  const call = useCall();
  const { data, loading, reload } = useApi((api) => api.incomingProposals(), []);
  const [confirm, setConfirm] = useState<{ p: Proposal; accept: boolean } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  async function decide() {
    if (!confirm) return;
    try { await call((api) => api.decideProposal(confirm.p.id, confirm.accept)); reload(); } catch (e) { setError(e as ApiError); } finally { setConfirm(null); }
  }
  const pending = (data ?? []).filter((p) => p.status === "submitted");
  const decided = (data ?? []).filter((p) => p.status !== "submitted");
  return (
    <>
      <PageHeader title="Proposals from students" description="Accepting registers the student to the project and removes them from the matching pool." />
      {error && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      {loading && !data ? <Loading /> : pending.length === 0 ? <Empty title="No proposals waiting" note="Student proposals addressed to you will appear here." /> : (
        <div className="flex flex-col gap-3">
          {pending.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start gap-4">
                <Avatar name={p.student_name} size={36} tone="navy" />
                <div className="flex-1 min-w-0">
                  <div className="font-display text-[15px] font-bold">{p.title}</div>
                  <div className="text-[12.5px] text-muted">{p.student_name} · sent {fmtDate(p.submitted_at)}</div>
                  <div className="flex gap-1.5 mt-2">{p.research_interests.map((t) => <Pill key={t} tone="accent">{t}</Pill>)}</div>
                  <p className="text-[13px] leading-[1.6] mt-3">{p.description}</p>
                  <div className="overline mt-3 mb-1">Why this supervisor</div>
                  <p className="text-[13px] leading-[1.6] text-muted">{p.statement}</p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button onClick={() => setConfirm({ p, accept: true })}>Accept and register</Button>
                  <Button variant="secondary" onClick={() => setConfirm({ p, accept: false })}>Decline</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {decided.length > 0 && (
        <>
          <h2 className="mt-7 mb-3">Decided</h2>
          <div className="flex flex-col gap-2">
            {decided.map((p) => (
              <div key={p.id} className="bg-surface border border-border rounded-row flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0"><div className="text-[13.5px] font-semibold truncate">{p.title}</div><div className="text-[12px] text-muted">{p.student_name} · decided {fmtDate(p.decided_at)}</div></div>
                <Status value={p.status} />
              </div>
            ))}
          </div>
        </>
      )}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.accept ? "Accept and register this student?" : "Decline this proposal?"}
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button><Button variant={confirm?.accept ? "primary" : "destructive"} onClick={decide}>{confirm?.accept ? "Accept and register" : "Decline"}</Button></>}>
        {confirm?.accept ? `${confirm.p.student_name} is registered to "${confirm.p.title}" under you. Their other applications this round are withdrawn.` : `${confirm?.p.student_name} will be notified. They can keep applying to listed projects.`}
      </Modal>
    </>
  );
}
