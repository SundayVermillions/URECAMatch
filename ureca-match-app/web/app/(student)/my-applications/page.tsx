"use client";
/** RankAppliedProjects (4.11) and ManageMatchingOutcome (4.13). REQ-SRANK-1..2, REQ-OUTCOME-1..4. Screen: MyApplicationPage. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageTitle } from "@/components/shell/app-shell";
import { CycleTimeline } from "@/components/student/cycle-timeline";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Banner, Button, Empty, Modal, Pill, Skeleton, Status, fmtDate, fmtDeadline } from "@/components/ui";
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
  useEffect(() => { if (!saved) return; const t = setTimeout(() => setSaved(false), 3000); return () => clearTimeout(t); }, [saved]); // "Order saved" goes away by itself
  const [history, setHistory] = useState(false); // the earlier results, folded away until asked for

  const canEdit = me?.phase.window === "application";
  const active = (apps.data ?? []).filter((a) => a.status === "submitted");
  const past = (apps.data ?? []).filter((a) => a.status !== "submitted");
  /** "Not accepted (R2)": the round the application was not accepted in, when it belongs to the current cycle. */
  const notAccepted = (roundId: string) => {
    const n = cycle.data?.rounds.find((r) => r.id === roundId)?.number;
    return n ? `Not accepted (R${n})` : "Not accepted";
  };

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
    // Answering withdraws the other applications and waiting proposals on the server, so reload both lists.
    try { offer.setData(await call((api) => api.respondToOffer(accept))); await refresh(); apps.reload(); proposals.reload(); } catch (e) { setError(e as ApiError); } finally { setConfirm(null); }
  }
  const m = offer.data;
  const offerRound = m ? cycle.data?.rounds.find((r) => r.id === m.round_id)?.number : undefined;
  // A declined proposal is replaced once the student sends a newer one to the same supervisor. The clock can stand still in a demo,
  // so two proposals may share a time: the later id is the newer one.
  const sentAt = (p: { submitted_at: string; id: string }) => [Date.parse(p.submitted_at), Number(p.id.replace(/\D/g, ""))];
  const newer = (q: { submitted_at: string; id: string }, p: { submitted_at: string; id: string }) => {
    const [qt, qn] = sentAt(q), [pt, pn] = sentAt(p);
    return qt > pt || (qt === pt && qn > pn);
  };
  const proposalList = (proposals.data ?? []).filter((p) => p.status !== "declined" || !(proposals.data ?? []).some((q) => q.supervisor_id === p.supervisor_id && newer(q, p)));
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
      {apps.loading && !apps.data ? <RowSkeletons /> : active.length === 0 ? (
        <Empty icon={<I.Layers size={20} />} title="No applications this round" note={canEdit ? "Browse projects and apply. Each application becomes a preference you can reorder here." : me?.phase.label}>
          {canEdit && <Link href="/browse"><Button variant="soft">Browse projects</Button></Link>}
        </Empty>
      ) : (
        <ListCard>
          {active.map((a, i) => (
            <ListRow key={a.id} rank={a.preference_rank ?? i + 1} first={i === 0}
              lead={<Thumb url={a.cover_url ?? cover(a.listing_id)} />}
              title={a.listing_title} meta={`${a.supervisor_name} · applied ${fmtDate(a.submitted_at)}`}>
              <RoundButton disabled={!canEdit || i === 0} onClick={() => move(a.id, -1)} label="Move up"><I.ArrowUp /></RoundButton>
              <RoundButton disabled={!canEdit || i === active.length - 1} onClick={() => move(a.id, 1)} label="Move down"><I.ArrowDown /></RoundButton>
              <TrashButton disabled={!canEdit} label="Withdraw application" onClick={() => { setTarget(a.id); setConfirm("withdraw"); }} />
            </ListRow>
          ))}
        </ListCard>
      )}
      </>}

      {past.length > 0 && (
        <div className="mt-8">
          {/* The same fold-away as "Earlier rounds" on the supervisor's Match approvals */}
          <button type="button" onClick={() => setHistory((v) => !v)} aria-expanded={history} className="inline-flex items-center gap-1.5 px-1 text-[14px] font-medium text-muted transition-colors hover:text-text">
            <span className={`transition-transform ${history ? "" : "-rotate-90"}`}><I.ChevronDown size={15} /></span>
            Application history <span className="tabular text-faint">{past.length}</span>
          </button>
          {history && (
            <div className="step-in mt-3">
              <ListCard>
                {past.map((a) => (
                  <ListRow key={a.id} muted lead={<Thumb url={a.cover_url ?? cover(a.listing_id)} />} title={a.listing_title} meta={a.supervisor_name}>
                    {a.status === "unmatched" ? <Pill tone="neutral">{notAccepted(a.round_id)}</Pill> : <Status value={a.status} />}
                  </ListRow>
                ))}
              </ListCard>
            </div>
          )}
        </div>
      )}

      <SectionHead title="Self-proposed projects" count={proposalList.length}>
        {proposalList.length > 0 && canEdit && !standing.viewOnly && <Link href="/propose"><Button size="sm" variant="soft"><I.Plus /> Propose a project</Button></Link>}
      </SectionHead>
      {proposalList.length === 0 ? (
        <Empty icon={<I.Bulb size={20} />} title="No proposals yet" note="Have your own idea? Pitch it straight to a supervisor.">
          {canEdit && !standing.viewOnly && <Link href="/propose"><Button size="sm" variant="soft"><I.Plus /> Propose a project</Button></Link>}
        </Empty>
      ) : (
        <ListCard>
          {proposalList.map((p) => (
            <ListRow key={p.id} lead={<Thumb url={null} />} title={p.title} meta={`to ${p.supervisor_name} · sent ${fmtDate(p.submitted_at)}`}
              note={p.status === "declined" && p.decision_note ? <><b className="font-semibold">Reason from {p.supervisor_name}:</b> {p.decision_note}</> : undefined}>
              <Status value={p.status} />
              {p.status === "declined" && canEdit && !standing.viewOnly && ( // answer the reason and send it again
                <Link href={`/propose?from=${p.id}`}><Button size="sm" variant="soft">Revise</Button></Link>
              )}
              {p.status === "submitted" && ( // only until the supervisor answers
                <TrashButton label="Withdraw proposal" onClick={() => { setTarget(p.id); setConfirm("withdraw-proposal"); }} />
              )}
            </ListRow>
          ))}
        </ListCard>
      )}

      <Modal open={confirm === "accept"} onClose={() => setConfirm(null)} title="Accept this offer?"
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Not yet</Button><Button onClick={() => respond(true)}>Accept</Button></>}>
        You will be registered to {m?.listing_title}. Your other open applications will be withdrawn, and you will leave the later rounds of this cycle. You cannot undo this.
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
    <div className={`flex items-center justify-between gap-4 mb-3.5 px-1 ${first ? "mt-2" : "mt-9"}`}>
      <h2 className="text-[19px] font-semibold tracking-[-0.02em] flex items-center gap-2.5">
        {title}
        {!!count && <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-black/[0.05] text-[12.5px] font-medium text-muted tabular">{count}</span>}
      </h2>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}

/** A list of rows in one card, separated by hairlines. */
function ListCard({ children }: { children: React.ReactNode }) {
  return <div className="card-surface !rounded-[20px] divide-y divide-border overflow-hidden">{children}</div>;
}

/** One application, proposal or past result: an optional big rank number, a photo, the title and who it is with, and actions. */
function ListRow({ rank, first, lead, title, meta, note, muted, children }: { rank?: number; first?: boolean; lead?: React.ReactNode; title: string; meta: string; note?: React.ReactNode; muted?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-5 px-6 py-4 transition-colors ${muted ? "opacity-75" : "hover:bg-accent-soft/30"}`}>
      {rank !== undefined && (
        <span aria-label={`Choice ${rank}`} className={`w-7 shrink-0 text-center font-display text-[26px] font-semibold leading-none tracking-[-0.03em] tabular ${first ? "text-accent" : "text-[#b4c3da]"}`}>{rank}</span>
      )}
      {lead}
      <div className="flex-1 min-w-0">
        <div className="truncate text-[15.5px] font-semibold tracking-[-0.01em]">{title}</div>
        <div className="mt-0.5 truncate text-[13px] text-muted">{meta}</div>
        {note && <div className="mt-2 rounded-[10px] bg-bad-soft/70 px-3 py-2 text-[12.5px] leading-[1.55] text-bad-ink">{note}</div>}
        {first && <span className="mt-1.5 inline-flex h-5 items-center rounded-pill bg-accent-soft px-2 text-[11px] font-semibold text-accent-ink">First choice</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

/** A round icon button for reordering. */
function RoundButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:bg-accent-soft hover:text-accent-ink disabled:text-border-strong disabled:shadow-none disabled:hover:bg-transparent">
      {children}
    </button>
  );
}

/** The match offer, first thing on the page. The same card as every row below it, with a bar on its edge for where it stands:
 *  blue while it waits for an answer, green once accepted. */
function OfferCard({ m, round, cover, answerable, lapsed, onAccept, onDecline }: { m: Match; round?: number; cover: string | null; answerable: boolean; lapsed: boolean; onAccept: () => void; onDecline: () => void }) {
  const waiting = m.status === "published", accepted = m.status === "accepted";
  const bar = accepted ? "bg-good" : waiting ? "bg-accent" : "bg-faint";
  return (
    <section className="card-surface relative mb-2 !rounded-[22px] p-6 pl-7 overflow-hidden">
      <span aria-hidden className={`absolute left-0 top-6 bottom-6 w-1 rounded-r-full ${bar}`} />
      <div className="flex items-center gap-5">
        <div className="relative hidden sm:block w-[112px] h-[84px] rounded-[16px] overflow-hidden bg-neutral-soft shrink-0">
          {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full grid place-items-center text-faint"><I.Bulb size={24} /></div>}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0b1f3a]/25 to-transparent shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow !text-accent-ink font-semibold">{accepted ? "Your project" : "Match offer"}{round ? ` · Round ${round}` : ""}</div>
          <h2 className="mt-1 text-[22px] leading-[1.25] tracking-[-0.02em]">{m.listing_title}</h2>
          <div className="mt-1 text-[14px] text-muted">{m.supervisor_name}{m.preference_rank ? ` · your choice number ${m.preference_rank}` : ""}</div>
        </div>
        <Status value={m.status} />
      </div>

      {waiting && answerable && (
        <div className="mt-5 pt-5 border-t border-border">
          <div className="inline-flex items-center gap-2 text-[14px] font-medium text-text"><I.Calendar size={15} /> Respond by {fmtDeadline(m.offer_expires_at)}</div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={onAccept} className="rounded-pill px-6 h-11">Accept offer</Button>
            <Button variant="secondary" onClick={onDecline} className="rounded-pill px-6 h-11">Decline</Button>
          </div>
          <p className="mt-4 text-[12.5px] leading-[1.5] text-faint max-w-[560px]">You cannot apply to other projects while this offer is open. Declining reopens the slot and ends your applications this cycle. No reply by the deadline counts as a decline.</p>
        </div>
      )}
      {waiting && !answerable && (
        <p className="mt-5 pt-5 border-t border-border text-[14px] text-muted">{lapsed ? <>The deadline to respond passed on <strong>{fmtDeadline(m.offer_expires_at)}</strong>, so this offer can no longer be answered.</> : "The application cycle has closed, so this offer can no longer be answered."}</p>
      )}
      {accepted && (
        <p className="mt-5 pt-5 border-t border-border flex items-center gap-2.5 text-[14px] text-muted">
          <span className="w-6 h-6 rounded-full bg-good-soft text-good grid place-items-center shrink-0"><I.Tick size={12} /></span>
          You are registered to this project. Your other applications this cycle are withdrawn.
        </p>
      )}
      {(m.status === "declined" || m.status === "timed_out") && (
        <p className="mt-5 pt-5 border-t border-border text-[14px] text-bad-ink">{m.status === "declined" ? "You declined this offer." : "This offer timed out."} You are not eligible for further rounds this cycle.</p>
      )}
    </section>
  );
}

/** A project's photo. */
function Thumb({ url }: { url: string | null }) {
  return (
    <span className="relative block h-[68px] w-[96px] shrink-0 overflow-hidden rounded-[14px] bg-black/[0.05]">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-faint"><I.Bulb size={20} /></span>}
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0b1f3a]/25 to-transparent shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]" />
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

/** Placeholder rows, the same shape as ListRow, while the applications load. */
function RowSkeletons() {
  return (
    <ListCard>
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-5 px-6 py-4" aria-busy="true" aria-label="Loading applications">
          <Skeleton className="h-7 w-7 !rounded-md" />
          <Skeleton className="h-[68px] w-[96px] !rounded-[14px]" />
          <div className="flex flex-1 flex-col gap-2.5"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
          <Skeleton className="h-9 w-24 !rounded-full" />
        </div>
      ))}
    </ListCard>
  );
}
