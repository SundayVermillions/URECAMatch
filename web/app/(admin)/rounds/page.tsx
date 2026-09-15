"use client";
/** ManageApplicationCycle (4.1), ManageMatchingRounds (4.2), ExecuteMatchingProcess (4.3). Screen: MatchingRoundsPage.
 *  Timeline of rounds, the selected round's panel, cycle settings in a modal. Review of matches is /rounds/[id]/matches. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Banner, Button, Card, Field, Input, Loading, Modal, Pill, RankBadge, Spinner, Stat, Status, Stepper, fmtDate } from "@/components/ui";
import { getClient } from "@/lib/api/client";
import { ApiError, type Cycle, type Round, type RoundSummary } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

export default function Rounds() {
  const { me, refresh } = useMe();
  const call = useCall();
  const cycle = useApi((api) => api.tick().then(() => api.cycle()), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<RoundSummary | null>(null);
  const rounds = cycle.data?.rounds ?? [];
  const current = rounds.find((r) => r.id === (selected ?? me?.phase.round_id)) ?? rounds[0];

  useEffect(() => {
    if (!current) return;
    let alive = true;
    const load = current.executed_at ? call((api) => api.summary(current.id)) : Promise.resolve(null);
    load.then((s) => { if (alive) setSummary(s); }).catch(() => {});
    return () => { alive = false; };
  }, [current?.id, current?.executed_at, call]);

  async function execute() {
    if (!current) return; setRunning(true); setError(null);
    try { await new Promise((r) => setTimeout(r, 900)); setSummary(await call((api) => api.execute(current.id))); cycle.reload(); await refresh(); }
    catch (e) { setError(e as ApiError); } finally { setRunning(false); }
  }
  const now = me?.phase;
  // "now" comes from the API phase (deterministic in mock mode), never from the browser clock
  const reviewClosed = !!current && !!now && (current.number < (now.round_number ?? 0) || (now.round_id === current.id && (now.window === "awaiting_results" || now.window === "results")));
  const statusOf = (r: Round) => (r.published_at ? "published" : r.executed_at ? "awaiting_publication" : now?.round_id === r.id ? (now.window === "review" ? "review_window" : "application_window") : Date.parse(r.review_end) < Date.parse(now?.window_ends_at ?? "") ? "completed" : "scheduled");

  return (
    <>
      <PageHeader title="Matching rounds" description={cycle.data ? `${cycle.data.academic_year} · ${rounds.length} rounds · opens ${fmtDate(cycle.data.opening_date)} · closes ${fmtDate(cycle.data.closing_date)}` : "No cycle configured"}
        right={<Button variant="secondary" onClick={() => setSettings(true)}><I.Gear /> Cycle settings</Button>} />
      {error && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      {cycle.loading && !cycle.data ? <Loading /> : (
        <>
          <div className="grid grid-cols-3 gap-3.5 mb-4">
            {rounds.map((r) => {
              const st = statusOf(r);
              return (
                <button key={r.id} type="button" onClick={() => setSelected(r.id)} className={`text-left bg-surface rounded-card p-4 border-[1.5px] ${current?.id === r.id ? "border-accent" : "border-border hover:border-border-strong"}`}>
                  <div className="flex items-center gap-2.5"><RankBadge n={r.number} tone={st === "published" || st === "completed" ? "good" : now?.round_id === r.id ? "accent" : "empty"} /><span className="font-display font-bold text-[14px]">Round {r.number}</span><span className="ml-auto"><Status value={st} kind="round" /></span></div>
                  <div className="text-[12px] text-muted mt-2.5">Apply {fmtDate(r.application_start)} to {fmtDate(r.application_end)} · review to {fmtDate(r.review_end)}</div>
                </button>
              );
            })}
          </div>

          {current && (
            <Card>
              <div className="flex items-center gap-2.5 mb-4"><h2>Round {current.number}</h2><Status value={statusOf(current)} kind="round" /></div>
              {!current.executed_at && (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <Stat label="Eligible students" value={current.eligible_students || "–"} />
                    <Stat label="Open slots" value={current.open_slots || "–"} note={current.reopened_slots ? `${current.reopened_slots} reopened by declines` : undefined} />
                    <Stat label="Review window" value={reviewClosed ? "Closed" : fmtDate(current.review_end)} note={reviewClosed ? `closed ${fmtDate(current.review_end)}` : `ends ${fmtDate(current.review_end)}`} />
                  </div>
                  {running ? <Spinner label={`Matching ${current.eligible_students || ""} students…`} /> : (
                    <div className="flex items-center gap-3.5">
                      <Button size="lg" disabled={!reviewClosed} onClick={execute}>Run matching</Button>
                      <span className="text-[12.5px] text-muted">{reviewClosed ? "Review window closed. Runs once over this round's rankings and open slots." : `Available once the review window closes on ${fmtDate(current.review_end)}.`}</span>
                    </div>
                  )}
                </>
              )}
              {current.executed_at && summary && (
                <>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <Stat label="Matched" value={summary.matched} />
                    <Stat label="Unmatched" value={summary.unmatched} />
                    <Stat label="Excluded" value={summary.excluded} note="declined or timed out earlier" />
                    <Stat label="Avg. preference" value={summary.avg_preference ?? "–"} />
                  </div>
                  {current.published_at ? (
                    <Banner tone="good" title="Results published." action={<Link href={`/rounds/${current.id}/matches`} className="text-[12.5px] font-semibold underline">View matches</Link>}>Students can accept or decline until the next review window. Declines reopen slots for the next round.</Banner>
                  ) : (
                    <div className="flex items-center gap-3.5 bg-accent-soft border border-accent-border rounded-row px-4 py-3.5">
                      <div className="flex-1"><div className="font-display text-[14px] font-bold">{summary.approvals_done} of {summary.approvals_total} matches decided by supervisors</div><div className="text-[12.5px] text-muted mt-0.5">Review, reassign if needed, then publish.</div></div>
                      <Link href={`/rounds/${current.id}/matches`}><Button>Review matches</Button></Link>
                    </div>
                  )}
                </>
              )}
              {current.executed_at && !summary && <Loading />}
            </Card>
          )}
        </>
      )}

      <CycleSettings open={settings} onClose={() => setSettings(false)} onSaved={() => { setSettings(false); cycle.reload(); }} />
    </>
  );
}

function CycleSettings({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const call = useCall();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [applyDays, setApplyDays] = useState(5);
  const [reviewDays, setReviewDays] = useState(2);
  const [count, setCount] = useState(3);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    getClient().then((api) => api.cycle()).then((c) => {
      if (!alive || !c) return;
      setCycle(c);
      if (c.rounds.length) { const r = c.rounds[0]; setCount(c.rounds.length); setApplyDays(Math.round((Date.parse(r.application_end) - Date.parse(r.application_start)) / 86_400_000)); setReviewDays(Math.round((Date.parse(r.review_end) - Date.parse(r.review_start)) / 86_400_000)); }
    });
    return () => { alive = false; };
  }, [open]);
  async function save() {
    if (!cycle) return; setError(null);
    try { await call((api) => api.setRounds(cycle.id, { rounds: Array.from({ length: count }, (_, i) => ({ number: i + 1, application_days: applyDays, review_days: reviewDays })), rollover_unmatched: true })); onSaved(); }
    catch (e) { setError(e as ApiError); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Cycle settings" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save settings</Button></>}>
      <div className="flex flex-col gap-4 text-text">
        {error && <Banner tone="bad">{error.message}</Banner>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cycle opens"><Input id="opens" value={fmtDate(cycle?.opening_date, { day: "numeric", month: "short", year: "numeric" })} readOnly /></Field>
          <Field label="Cycle closes"><Input id="closes" value={fmtDate(cycle?.closing_date, { day: "numeric", month: "short", year: "numeric" })} readOnly /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><div className="text-[12.5px] font-semibold mb-1.5">Application window</div><Stepper value={applyDays} onChange={setApplyDays} min={1} max={14} format={(v) => `${v} days`} /></div>
          <div><div className="text-[12.5px] font-semibold mb-1.5">Review window</div><Stepper value={reviewDays} onChange={setReviewDays} min={1} max={7} format={(v) => `${v} day${v === 1 ? "" : "s"}`} /></div>
          <div><div className="text-[12.5px] font-semibold mb-1.5">Rounds</div><Stepper value={count} onChange={setCount} min={1} max={3} /></div>
        </div>
        <div className="text-[12px] text-faint">Rounds that have already started are kept. Later rounds are re-derived from these lengths with a 4-day gap, and must end before the cycle closes. <Pill tone="accent">REQ-ROUND-1..3</Pill></div>
      </div>
    </Modal>
  );
}
