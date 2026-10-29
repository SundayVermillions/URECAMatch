"use client";
/** RankAppliedProjects (4.11) and ManageMatchingOutcome (4.13). REQ-SRANK-1..2, REQ-OUTCOME-1..4. Screen: MyApplicationPage. */
import Link from "next/link";
import { useState } from "react";
import { PageTitle } from "@/components/shell/app-shell";
import { CycleTimeline } from "@/components/student/cycle-timeline";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Banner, Button, Empty, IconButton, Loading, Modal, Status, fmtDate, fmtDeadline } from "@/components/ui";
import { ApiError, type Match } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";
import { useStanding } from "@/lib/use-standing";

export default function MyApplications() {
  const { me, refresh } = useMe();
  const call = useCall();
  const standing = useStanding();
  const apps = useApi((api) => api.myApplications(), []);
  const offer = useApi((api) => api.myMatch(), []);
  const cycle = useApi((api) => api.cycle(), []); // to name the round the offer came from
  const proposals = useApi((api) => api.myProposals(), []);
  const listings = useApi((api) => api.browse({}), []); // for each project's photo
  const cover = (id: string) => listings.data?.find((l) => l.id === id)?.cover_url ?? null;
  const [confirm, setConfirm] = useState<"accept" | "decline" | "withdraw" | "withdraw-proposal" | null>(null);
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
  async function withdrawProposal() {
    if (!target) return;
    try { await call((api) => api.withdrawProposal(target)); proposals.reload(); } catch (e) { setError(e as ApiError); } finally { setConfirm(null); }
  }
  async function respond(accept: boolean) {
    try { offer.setData(await call((api) => api.respondToOffer(accept))); await refresh(); } catch (e) { setError(e as ApiError); } finally { setConfirm(null); }
  }
  const m = offer.data;
  const offerRound = m ? cycle.data?.rounds.find((r) => r.id === m.round_id)?.number : undefined;
  const proposalList = proposals.data ?? [];
  // REQ-OUTCOME-3: an offer can be answered until its deadline while the cycle is open. The server may not have timed a
  // lapsed offer out yet, so the card compares the deadline with the server's clock (phase.now), not the browser's.
  const lapsed = m?.status === "published" && !!me && !!m.offer_expires_at && Date.parse(me.phase.now) > Date.parse(m.offer_expires_at);
  const cycleOver = me?.phase.window === "closed" || me?.phase.window === "before_cycle";
  const answerable = m?.status === "published" && !lapsed && !cycleOver;

  return (
    <>
      <PageTitle title="My applications" status={me?.phase.label} open={canEdit} right={<CycleTimeline />} />
      {error && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}

      {m && <OfferCard m={m} round={offerRound} cover={cover(m.listing_id)} answerable={answerable} lapsed={lapsed} onAccept={() => setConfirm("accept")} onDecline={() => setConfirm("decline")} />}

      {/* A student who has a project has nothing left to rank, so the section is left out. */}
      {!standing.placedIn && <>
      <SectionHead title="Preferences" count={active.length} first={!m}>
        {saved && <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-good-ink"><I.CheckCircle size={14} /> Order saved</span>}
        {!canEdit && active.length > 0 && (
          <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-black/[0.05] text-[12.5px] font-medium text-muted"><I.Lock size={12} /> Locked</span>
        )}
      </SectionHead>
      {apps.loading && !apps.data ? <Loading /> : active.length === 0 ? (
        <Empty title="No applications this round" note={canEdit ? "Browse projects and apply. Each application becomes a preference you can reorder here." : me?.phase.label}>
          {canEdit && <Link href="/browse"><Button variant="soft">Browse projects</Button></Link>}
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((a, i) => (
            <Row key={a.id}
              lead={<Thumb url={cover(a.listing_id)} rank={a.preference_rank ?? i + 1} first={i === 0} />}
              title={a.listing_title} meta={`${a.supervisor_name} · applied ${fmtDate(a.submitted_at)}`}>
              <span className="inline-flex rounded-pill bg-black/[0.04] p-0.5">
                <IconButton disabled={!canEdit || i === 0} onClick={() => move(a.id, -1)} aria-label="Move up"><I.ArrowUp /></IconButton>
                <IconButton disabled={!canEdit || i === active.length - 1} onClick={() => move(a.id, 1)} aria-label="Move down"><I.ArrowDown /></IconButton>
              </span>
              <TrashButton disabled={!canEdit} label="Withdraw application" onClick={() => { setTarget(a.id); setConfirm("withdraw"); }} />
            </Row>
          ))}
        </div>
      )}
      </>}

      {past.length > 0 && (
        <>
          <SectionHead title="Earlier" count={past.length} />
          <div className="flex flex-col gap-3">
            {past.map((a) => (
              <Row key={a.id} muted lead={<Thumb url={cover(a.listing_id)} />} title={a.listing_title} meta={a.supervisor_name}><Status value={a.status} /></Row>
            ))}
          </div>
        </>
      )}

      <SectionHead title="Self-proposed projects" count={proposalList.length}>
        {canEdit && !standing.viewOnly && <Link href="/propose"><Button size="sm" variant="soft"><I.Plus /> Propose a project</Button></Link>}
      </SectionHead>
      {proposalList.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-border-strong px-5 py-6 text-[13.5px] text-faint text-center">No proposals yet</div>
      ) : (
        <div className="flex flex-col gap-3">
          {proposalList.map((p) => (
            <Row key={p.id} lead={<Thumb url={null} />} title={p.title} meta={`to ${p.supervisor_name} · sent ${fmtDate(p.submitted_at)}`}>
              <Status value={p.status} />
              {p.status === "submitted" && ( // only until the supervisor answers
                <TrashButton label="Withdraw proposal" onClick={() => { setTarget(p.id); setConfirm("withdraw-proposal"); }} />
              )}
            </Row>
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
      <Modal open={confirm === "withdraw-proposal"} onClose={() => setConfirm(null)} title="Withdraw this proposal?"
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Keep it</Button><Button variant="destructive" onClick={withdrawProposal}>Withdraw</Button></>}>
        The supervisor has not answered yet, so you can still take it back. Once they accept it, it cannot be changed or withdrawn. You can send a new proposal while the window is open.
      </Modal>
      <Modal open={confirm === "withdraw"} onClose={() => setConfirm(null)} title="Withdraw this application?"
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="destructive" onClick={withdraw}>Withdraw</Button></>}>
        Your remaining preferences move up one place. You can apply again while the window is open.
      </Modal>
    </>
  );
}

/** A section heading with its count, and room on the right for a note or an action. */
function SectionHead({ title, count, first, children }: { title: string; count?: number; first?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`flex items-center justify-between gap-4 mb-4 px-1 ${first ? "mt-2" : "mt-10"}`}>
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] flex items-center gap-2.5">
        {title}
        {!!count && <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-black/[0.05] text-[12.5px] font-medium text-muted tabular">{count}</span>}
      </h2>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}

/** One application, proposal or past result: a soft card with a lead, the title and who it is with, and actions. */
function Row({ lead, title, meta, muted, children }: { lead?: React.ReactNode; title: string; meta: string; muted?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-4 rounded-[18px] bg-surface ring-1 ring-black/[0.05] shadow-[var(--shadow-card)] px-5 py-4 ${muted ? "opacity-75" : ""}`}>
      {lead}
      <div className="flex-1 min-w-0">
        <div className="text-[15.5px] font-semibold tracking-[-0.01em] truncate">{title}</div>
        <div className="text-[13px] text-muted mt-0.5 truncate">{meta}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}

/** The match offer, first thing on the page: pale blue while it waits for an answer, green once accepted. */
function OfferCard({ m, round, cover, answerable, lapsed, onAccept, onDecline }: { m: Match; round?: number; cover: string | null; answerable: boolean; lapsed: boolean; onAccept: () => void; onDecline: () => void }) {
  const waiting = m.status === "published", accepted = m.status === "accepted";
  const tint = accepted ? "from-[#eaf8ef] via-white to-[#f1fbf5]" : waiting ? "from-[#e8f1ff] via-white to-[#f1ebff]" : "from-[#f3f3f5] via-white to-[#f7f7f9]";
  return (
    <section className={`relative mb-2 rounded-[26px] bg-gradient-to-br ${tint} ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-28px_rgba(40,60,130,0.35)] p-7`}>
      <div className="flex items-start gap-6">
        <div className="hidden sm:block w-[148px] h-[112px] rounded-[18px] overflow-hidden bg-black/[0.05] shrink-0 shadow-[0_10px_24px_-14px_rgba(0,0,0,0.4)]">
          {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full grid place-items-center text-faint"><I.Bulb size={26} /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-white/80 ring-1 ring-black/[0.05] text-[12.5px] font-semibold text-accent-ink">
            {accepted ? <I.CheckCircle size={13} /> : <I.Bulb size={13} />} {accepted ? "Your project" : "Match offer"}{round ? ` · Round ${round}` : ""}
          </span>
          <h2 className="mt-4 text-[26px] leading-[1.2] font-semibold tracking-[-0.025em]">{m.listing_title}</h2>
          <div className="mt-1.5 text-[14.5px] text-muted">{m.supervisor_name}{m.preference_rank ? ` · your choice number ${m.preference_rank}` : ""}</div>
        </div>
        <Status value={m.status} />
      </div>

      {waiting && answerable && (
        <>
          <div className="mt-5 inline-flex items-center gap-2 text-[14px] font-medium text-text"><I.Calendar size={15} /> Respond by {fmtDeadline(m.offer_expires_at)}</div>
          <div className="mt-5 flex items-center gap-3">
            <Button onClick={onAccept} className="rounded-pill px-6 h-11">Accept offer</Button>
            <Button variant="secondary" onClick={onDecline} className="rounded-pill px-6 h-11">Decline</Button>
          </div>
          <p className="mt-4 text-[12.5px] leading-[1.5] text-faint max-w-[560px]">You cannot apply to other projects while this offer is open. Declining reopens the slot and ends your applications this cycle. No reply by the deadline counts as a decline.</p>
        </>
      )}
      {waiting && !answerable && (
        <p className="mt-4 text-[14px] text-muted">{lapsed ? <>The deadline to respond passed on <strong>{fmtDeadline(m.offer_expires_at)}</strong>, so this offer can no longer be answered.</> : "The application cycle has closed, so this offer can no longer be answered."}</p>
      )}
      {accepted && <p className="mt-4 text-[14px] text-good-ink">You are registered to this project. Your other applications this cycle are withdrawn.</p>}
      {(m.status === "declined" || m.status === "timed_out") && (
        <p className="mt-4 text-[14px] text-bad-ink">{m.status === "declined" ? "You declined this offer." : "This offer timed out."} You are not eligible for further rounds this cycle.</p>
      )}
    </section>
  );
}

/** A project's photo, with its preference number on it when it is one of the student's ranked choices. */
function Thumb({ url, rank, first }: { url: string | null; rank?: number; first?: boolean }) {
  return (
    <span className="relative shrink-0 w-[88px] h-[66px] rounded-[14px] overflow-hidden bg-black/[0.05] block">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="h-full w-full grid place-items-center text-faint"><I.Bulb size={20} /></span>}
      {rank !== undefined && (
        <span className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-full grid place-items-center text-[12px] font-semibold tabular ring-2 ring-white ${first ? "bg-[#1c2566] text-white" : "bg-white text-text"}`}>{rank}</span>
      )}
    </span>
  );
}

/** Withdraw as a trash can: quiet until hovered, then red. */
function TrashButton({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="w-9 h-9 rounded-full inline-flex items-center justify-center text-muted transition-colors hover:bg-bad-soft hover:text-bad-ink disabled:text-border-strong disabled:hover:bg-transparent">
      <I.Trash size={17} />
    </button>
  );
}
