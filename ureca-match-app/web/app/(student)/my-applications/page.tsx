"use client";
/** RankAppliedProjects (4.11) and ManageMatchingOutcome (4.13). REQ-SRANK-1..2, REQ-OUTCOME-1..4. Screen: MyApplicationPage. */
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Banner, Button, Card, DeadlineChip, Empty, IconButton, Loading, Modal, RankBadge, Status, fmtDate, fmtDeadline } from "@/components/ui";
import { ApiError } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

export default function MyApplications() {
  const { me, refresh } = useMe();
  const call = useCall();
  const apps = useApi((api) => api.myApplications(), []);
  const offer = useApi((api) => api.myMatch(), []);
  const cycle = useApi((api) => api.cycle(), []); // to name the round the offer came from
  const proposals = useApi((api) => api.myProposals(), []);
  const [confirm, setConfirm] = useState<"accept" | "decline" | "withdraw" | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  const canEdit = me?.phase.window === "application";
  const active = (apps.data ?? []).filter((a) => a.status === "submitted");
  const past = (apps.data ?? []).filter((a) => a.status !== "submitted");

  async function move(id: string, dir: -1 | 1) {
    const ids = active.map((a) => a.id); const i = ids.indexOf(id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { apps.setData(await call((api) => api.setRanking(ids))); setSaved(true); setError(null); } catch (e) { setError(e as ApiError); }
  }
  async function withdraw() {
    if (!target) return;
    try { await call((api) => api.withdraw(target)); apps.reload(); } catch (e) { setError(e as ApiError); } finally { setConfirm(null); }
  }
  async function respond(accept: boolean) {
    try { offer.setData(await call((api) => api.respondToOffer(accept))); await refresh(); } catch (e) { setError(e as ApiError); } finally { setConfirm(null); }
  }
  const m = offer.data;
  const offerRound = m && cycle.data?.rounds.find((r) => r.id === m.round_id)?.number;

  return (
    <>
      <PageHeader title="My applications" description="Your preference order is what the matching uses. 1 is your first choice." right={me && <DeadlineChip>{me.phase.label}</DeadlineChip>} />
      {error && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}

      {m && (
        <Card className="mb-5 border-accent-border">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="eyebrow mb-1">Match offer{offerRound ? ` · Round ${offerRound}` : ""}</div>
              <div className="font-display text-[17px] font-bold">{m.listing_title}</div>
              <div className="text-[13px] text-muted mt-0.5">{m.supervisor_name}{m.preference_rank ? ` · your preference ${m.preference_rank}` : ""}</div>
              {m.status === "published" && <div className="text-[12.5px] text-muted mt-2">Respond by <strong>{fmtDeadline(m.offer_expires_at)}</strong>. You cannot apply to other projects while this offer is open. Declining reopens the slot for others and makes you ineligible for later rounds this cycle. No response by the deadline counts as a decline.</div>}
              {m.status === "accepted" && <div className="mt-2"><Banner tone="good" title="Accepted.">You are registered to this project. Your other applications this cycle are withdrawn.</Banner></div>}
              {(m.status === "declined" || m.status === "timed_out") && <div className="mt-2"><Banner tone="bad" title={m.status === "declined" ? "Declined." : "Timed out."}>You are not eligible for further rounds this cycle.</Banner></div>}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <Status value={m.status} />
              {m.status === "published" && <><Button onClick={() => setConfirm("accept")}>Accept offer</Button><Button variant="secondary" onClick={() => setConfirm("decline")}>Decline</Button></>}
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2.5 mb-3">
        <h2>Preferences</h2>
        {saved && <span className="flex items-center gap-1.5 text-[12px] font-semibold text-good-ink"><I.CheckCircle size={14} /> Order saved</span>}
        {!canEdit && active.length > 0 && <span className="text-[12px] text-faint">Locked until the next application window</span>}
      </div>
      {apps.loading && !apps.data ? <Loading /> : active.length === 0 ? (
        <Empty title="No applications this round" note={canEdit ? "Browse projects and apply. Each application becomes a preference you can reorder here." : me?.phase.label}>
          {canEdit && <Link href="/browse"><Button variant="soft">Browse projects</Button></Link>}
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {active.map((a, i) => (
            <div key={a.id} className="bg-surface border border-accent-border rounded-row flex items-center gap-3 px-3 py-2.5">
              <RankBadge n={a.preference_rank ?? i + 1} />
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold truncate">{a.listing_title}</div>
                <div className="text-[12px] text-muted">{a.supervisor_name} · applied {fmtDate(a.submitted_at)}</div>
              </div>
              <Status value={a.status} />
              <IconButton disabled={!canEdit || i === 0} onClick={() => move(a.id, -1)} aria-label="Move up"><I.ArrowUp /></IconButton>
              <IconButton disabled={!canEdit || i === active.length - 1} onClick={() => move(a.id, 1)} aria-label="Move down"><I.ArrowDown /></IconButton>
              <Button size="sm" variant="secondary" disabled={!canEdit} onClick={() => { setTarget(a.id); setConfirm("withdraw"); }}>Withdraw</Button>
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mt-7 mb-3">Earlier</h2>
          <div className="flex flex-col gap-2">
            {past.map((a) => (
              <div key={a.id} className="bg-surface border border-border rounded-row flex items-center gap-3 px-3 py-2.5 text-muted">
                <div className="flex-1 min-w-0"><div className="text-[13.5px] font-semibold truncate text-text">{a.listing_title}</div><div className="text-[12px]">{a.supervisor_name}</div></div>
                <Status value={a.status} />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between mt-7 mb-3">
        <h2>Self-proposed projects</h2>
        {canEdit && <Link href="/propose"><Button size="sm" variant="soft"><I.Plus /> Propose a project</Button></Link>}
      </div>
      {(proposals.data ?? []).length === 0 ? <div className="text-[12.5px] text-faint">None yet.</div> : (
        <div className="flex flex-col gap-2">
          {proposals.data!.map((p) => (
            <div key={p.id} className="bg-surface border border-border rounded-row flex items-center gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0"><div className="text-[13.5px] font-semibold truncate">{p.title}</div><div className="text-[12px] text-muted">to {p.supervisor_name} · sent {fmtDate(p.submitted_at)}</div></div>
              <Status value={p.status} />
            </div>
          ))}
        </div>
      )}

      <Modal open={confirm === "accept"} onClose={() => setConfirm(null)} title="Accept this offer?"
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Not yet</Button><Button onClick={() => respond(true)}>Accept</Button></>}>
        You are registered to {m?.listing_title}. Your other open applications are withdrawn and you leave later rounds this cycle. This cannot be undone here.
      </Modal>
      <Modal open={confirm === "decline"} onClose={() => setConfirm(null)} title="Decline this offer?"
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Keep offer</Button><Button variant="destructive" onClick={() => respond(false)}>Decline</Button></>}>
        Your slot in {m?.listing_title} reopens for other students. You will not be eligible for any later round this cycle.
      </Modal>
      <Modal open={confirm === "withdraw"} onClose={() => setConfirm(null)} title="Withdraw this application?"
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="destructive" onClick={withdraw}>Withdraw</Button></>}>
        Your remaining preferences move up one place. You can apply again while the window is open.
      </Modal>
    </>
  );
}
