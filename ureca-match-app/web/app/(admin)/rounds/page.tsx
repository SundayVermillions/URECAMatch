"use client";
/** ManageApplicationCycle (4.1), ManageMatchingRounds (4.2), ExecuteMatchingProcess (4.3). Screen: MatchingRoundsPage.
 *  Timeline of rounds, the selected round's panel, cycle settings in a modal. Review of matches is /rounds/[id]/matches. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Banner, Button, Card, Field, Input, Loading, Modal, RankBadge, Select, Spinner, Stat, Status, Stepper, Toggle, fmtDate } from "@/components/ui";
import { getClient } from "@/lib/api/client";
import { ApiError, type Cycle, type Round, type RoundSummary } from "@/lib/api/models";
import type * as M from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

export default function Rounds() {
  const { me, refresh } = useMe();
  const call = useCall();
  const data = useApi((api) => api.tick().then(() => Promise.all([api.cycle(), api.listCycles()])).then(([active, all]) => ({ active, all })), []);
  const active = data.data?.active ?? null;
  const all = data.data?.all ?? [];
  const [viewId, setViewId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<RoundSummary | null>(null);

  const viewed = all.find((c) => c.id === viewId) ?? active ?? all[0] ?? null;
  const viewedIsActive = !!viewed && !!active && viewed.id === active.id;
  const rounds = viewed?.rounds ?? [];
  const now = me?.phase;
  // "now" comes from the API phase (deterministic in mock mode), never from the browser clock
  const current = rounds.find((r) => r.id === selected) ?? (viewedIsActive ? rounds.find((r) => r.id === now?.round_id) : undefined) ?? rounds[0];
  const reload = () => { data.reload(); refresh(); };

  useEffect(() => {
    let alive = true;
    const load = current && viewedIsActive && current.executed_at ? call((api) => api.summary(current.id)) : Promise.resolve(null);
    load.then((s) => { if (alive) setSummary(s); }).catch(() => {});
    return () => { alive = false; };
  }, [current?.id, current?.executed_at, viewedIsActive, call]);

  async function execute() {
    if (!current) return; setRunning(true); setError(null);
    try { await new Promise((r) => setTimeout(r, 900)); setSummary(await call((api) => api.execute(current.id))); reload(); }
    catch (e) { setError(e as ApiError); } finally { setRunning(false); }
  }
  const reviewClosed = !!current && !!now && viewedIsActive && (current.number < (now.round_number ?? 0) || (now.round_id === current.id && (now.window === "awaiting_results" || now.window === "results")));
  const statusOf = (r: Round) => {
    if (!viewedIsActive) return r.published_at ? "published" : r.executed_at ? "awaiting_publication" : "completed";
    if (r.published_at) return "published";
    if (r.executed_at) return "awaiting_publication";
    if (now?.round_id === r.id) return now.window === "application" ? "application_window" : now.window === "review" ? "review_window" : "ready_for_matching";
    return now?.round_number && r.number < now.round_number ? "completed" : "scheduled";
  };

  return (
    <>
      <PageHeader title="Matching rounds" description={viewed ? `${viewed.academic_year} · ${rounds.length} rounds · opens ${fmtDate(viewed.opening_date)} · closes ${fmtDate(viewed.closing_date)}${viewedIsActive ? "" : " · closed"}` : "No application cycle yet"}
        right={!creating ? (
          <div className="flex items-center gap-2">
            {all.length > 1 && (
              <Select value={viewed?.id ?? ""} onChange={(e) => { setViewId(e.target.value); setSelected(null); }} className="max-w-[240px]">
                {all.map((c) => <option key={c.id} value={c.id}>{c.academic_year}{c.status === "closed" ? " · closed" : " · active"}</option>)}
              </Select>
            )}
            {viewedIsActive && <Button variant="secondary" onClick={() => setClosing(true)}>Close cycle</Button>}
            {viewedIsActive && <Button variant="secondary" onClick={() => setSettings(true)}><I.Gear /> Cycle settings</Button>}
            {viewed && !viewedIsActive && <Button variant="secondary" disabled={!!active} title={active ? `Close the ${active.academic_year} cycle first` : undefined} onClick={() => setReopening(true)}>Reopen cycle</Button>}
            {!active && <Button onClick={() => setCreating(true)}>New cycle</Button>}
          </div>
        ) : undefined} />
      {error && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      {data.loading && !data.data ? <Loading /> : creating || !viewed ? (
        <CreateCycle onCreated={() => { setCreating(false); setViewId(null); reload(); }} onCancel={all.length > 0 ? () => setCreating(false) : undefined} />
      ) : (
        <>
          {!viewedIsActive && <div className="mb-4"><Banner tone="accent">This cycle is closed. {active ? `Close the ${active.academic_year} cycle to reopen it.` : "Reopen it to make it the active cycle."}</Banner></div>}
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
            {rounds.length === 0 && <div className="col-span-3 bg-surface rounded-card p-6 text-center text-[13px] text-muted border border-border">No rounds configured yet.{viewedIsActive ? " Use Cycle settings to add rounds." : ""}</div>}
          </div>

          {viewedIsActive && current && (
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
                    <Stat label="Excluded" value={summary.excluded} note="placed, declined or timed out earlier" />
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

      <CycleSettings open={settings} onClose={() => setSettings(false)} onSaved={() => { setSettings(false); reload(); }} />
      <CloseCycleModal open={closing} cycleId={viewed?.id} onClose={() => setClosing(false)} onClosed={() => { setClosing(false); reload(); }} />
      <ReopenCycleModal open={reopening} cycleId={viewed?.id} cycleName={viewed?.academic_year} onClose={() => setReopening(false)} onReopened={() => { setReopening(false); setViewId(viewed?.id ?? null); reload(); }} />
    </>
  );
}

const DAY_MS = 86_400_000;
// Cycle open/close sit at 09:00 UTC like the seed, so dates format to the intended calendar day in local time
// and a round ending that morning still fits a cycle closing the same day.
const atNine = (d: string) => new Date(`${d}T09:00:00.000Z`).toISOString();
const toDateInput = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

type Planned = { number: number; start: number; revEnd: number; started: boolean };

/** Mirror of set_rounds so the modal can show and check the dates before saving (use case 1-2).
 *  Rounds already under way (not "scheduled") keep their dates. A round with a start date in `starts` begins then;
 *  otherwise 4 days after the previous round, and Round 1 when the pre-application window ends. */
function planRounds(cycle: Cycle, opensMs: number, preDays: number, count: number, applyDays: number, reviewDays: number, starts: Record<number, string>): Planned[] {
  let cursor = opensMs + preDays * DAY_MS;
  const out: Planned[] = [];
  for (let n = 1; n <= count; n++) {
    const old = cycle.rounds.find((r) => r.number === n);
    if (old && old.status !== "scheduled") {
      out.push({ number: n, start: Date.parse(old.application_start), revEnd: Date.parse(old.review_end), started: true });
      cursor = Date.parse(old.review_end) + 1000 + 4 * DAY_MS;
      continue;
    }
    const start = starts[n] ? Date.parse(atNine(starts[n])) : cursor;
    const revEnd = start + applyDays * DAY_MS + reviewDays * DAY_MS - 1000;
    out.push({ number: n, start, revEnd, started: false });
    cursor = revEnd + 1000 + 4 * DAY_MS;
  }
  return out;
}

function CreateCycle({ onCreated, onCancel }: { onCreated: () => void; onCancel?: () => void }) {
  const call = useCall();
  const [year, setYear] = useState("");
  const [opens, setOpens] = useState("");
  const [closes, setCloses] = useState("");
  const [preDays, setPreDays] = useState(7);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = year.trim() !== "" && opens !== "" && closes !== "";
  async function create() {
    setError(null); setBusy(true);
    try {
      await call((api) => api.createCycle({
        academic_year: year.trim(),
        opening_date: atNine(opens),
        closing_date: atNine(closes),
        pre_application_days: preDays,
      }));
      onCreated();
    } catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  }
  return (
    <Card>
      <div className="flex flex-col gap-4 max-w-[560px]">
        <div>
          <h2>Create an application cycle</h2>
          <p className="text-[13px] text-muted mt-1">No cycle is active. Set the term and dates to open a new one; add rounds afterwards in Cycle settings.</p>
        </div>
        {error && <Banner tone="bad">{error.message}</Banner>}
        <Field label="Academic year"><Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="AY26/27 Semester 1" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cycle opens"><Input type="date" value={opens} onChange={(e) => setOpens(e.target.value)} /></Field>
          <Field label="Cycle closes"><Input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} /></Field>
        </div>
        <div><div className="text-[12.5px] font-semibold mb-1.5">Pre-application days</div><Stepper value={preDays} onChange={setPreDays} min={0} max={60} format={(v) => `${v} days`} /></div>
        <div className="flex items-center gap-3">
          <Button size="lg" disabled={!valid || busy} onClick={create}>{busy ? "Creating…" : "Create cycle"}</Button>
          {onCancel && <Button variant="secondary" size="lg" onClick={onCancel}>Cancel</Button>}
        </div>
      </div>
    </Card>
  );
}

function ReopenCycleModal({ open, cycleId, cycleName, onClose, onReopened }: { open: boolean; cycleId?: string; cycleName?: string; onClose: () => void; onReopened: () => void }) {
  const call = useCall();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (!cycleId) return; setError(null); setBusy(true);
    try { await call((api) => api.reopenCycle(cycleId)); onReopened(); }
    catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Reopen this cycle?" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={confirm}>{busy ? "Reopening…" : "Reopen cycle"}</Button></>}>
      <div className="flex flex-col gap-3 text-text">
        {error && <Banner tone="bad">{error.message}</Banner>}
        <p className="text-[13px] text-muted">Reopening makes {cycleName ?? "this cycle"} the active cycle again and notifies students and supervisors. Only one cycle can be active at a time.</p>
      </div>
    </Modal>
  );
}

function CloseCycleModal({ open, cycleId, onClose, onClosed }: { open: boolean; cycleId?: string; onClose: () => void; onClosed: () => void }) {
  const call = useCall();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (!cycleId) return; setError(null); setBusy(true);
    try { await call((api) => api.closeCycle(cycleId)); onClosed(); }
    catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Close this cycle?" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={confirm}>{busy ? "Closing…" : "Close cycle"}</Button></>}>
      <div className="flex flex-col gap-3 text-text">
        {error && <Banner tone="bad">{error.message}</Banner>}
        <p className="text-[13px] text-muted">Closing pauses the cycle and notifies students and supervisors. It stays in the history and you can reopen it later or create the next cycle.</p>
      </div>
    </Modal>
  );
}

function CycleSettings({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const call = useCall();
  const { me } = useMe();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [applyDays, setApplyDays] = useState(5);
  const [reviewDays, setReviewDays] = useState(2);
  const [count, setCount] = useState(3);
  const [opens, setOpens] = useState("");
  const [closes, setCloses] = useState("");
  const [preDays, setPreDays] = useState(7);
  const [starts, setStarts] = useState<Record<number, string>>({}); // start dates the admin typed; others are derived
  const [rollover, setRollover] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    getClient().then((api) => api.cycle()).then((c) => {
      if (!alive || !c) return;
      setCycle(c); setOpens(toDateInput(c.opening_date)); setCloses(toDateInput(c.closing_date)); setPreDays(c.pre_application_days);
      setRollover(c.rollover_unmatched); setError(null);
      if (c.rounds.length) setCount(c.rounds.length);
      const editable = c.rounds.find((r) => r.status === "scheduled") ?? c.rounds[c.rounds.length - 1];
      const apply = editable ? Math.round((Date.parse(editable.application_end) - Date.parse(editable.application_start)) / DAY_MS) : 5;
      const review = editable ? Math.round((Date.parse(editable.review_end) - Date.parse(editable.review_start)) / DAY_MS) : 2;
      setApplyDays(apply); setReviewDays(review);
      // Keep a start date chosen earlier: any upcoming round that does not begin on its default date had one.
      const chosen: Record<number, string> = {};
      let cursor = Date.parse(c.opening_date) + c.pre_application_days * DAY_MS;
      for (const r of [...c.rounds].sort((x, y) => x.number - y.number)) {
        if (r.status === "scheduled" && Date.parse(r.application_start) !== cursor) chosen[r.number] = toDateInput(r.application_start);
        cursor = Date.parse(r.review_end) + 1000 + 4 * DAY_MS;
      }
      setStarts(chosen);
    });
    return () => { alive = false; };
  }, [open]);

  // REQ-CYCLE-2: the opening date can change until it passes; the pre-application window until Round 1 starts.
  const anyStarted = (cycle?.rounds ?? []).some((r) => r.status !== "scheduled");
  const canEditOpening = me?.phase.window === "before_cycle";
  const canEditPre = !anyStarted && (me?.phase.window === "before_cycle" || me?.phase.window === "pre_application");
  // Live check (before Save): plan the rounds and confirm they fit the cycle and do not overlap (REQ-ROUND-3).
  const opensMs = opens ? Date.parse(atNine(opens)) : NaN;
  const closesMs = closes ? Date.parse(atNine(closes)) : NaN;
  const plan = cycle && !Number.isNaN(opensMs) ? planRounds(cycle, opensMs, preDays, count, applyDays, reviewDays, starts) : [];
  const overflow = plan.find((p) => p.revEnd > closesMs);
  const overlap = plan.find((p, i) => i > 0 && !p.started && p.start <= plan[i - 1].revEnd);
  const early = plan.find((p) => !p.started && p.start < opensMs + preDays * DAY_MS);
  const lastEnd = plan.length ? plan[plan.length - 1].revEnd : NaN;
  const requiredClose = Number.isNaN(lastEnd) ? "" : toDateInput(new Date(lastEnd).toISOString());
  // REQ-ROUND-2: a round that has started cannot be removed, so the count cannot drop below it
  const minRounds = Math.max(1, ...(cycle?.rounds ?? []).filter((r) => r.status !== "scheduled").map((r) => r.number));
  const valid = !!cycle && opens !== "" && closes !== "" && closesMs > opensMs && !overflow && !overlap && !early && count >= minRounds;

  async function save() {
    if (!cycle || !valid) return;
    setError(null); setBusy(true);
    try {
      // The API checks each change against the other's current value, so the order matters. Opening and
      // pre-application changes go first (they move the rounds that have not started), and a later closing date
      // with them; the rounds come next; an earlier closing date goes last, once the rounds fit inside it.
      const newOpen = atNine(opens), newClose = atNine(closes);
      const first: M.CycleUpdate = {};
      if (canEditOpening && toDateInput(cycle.opening_date) !== opens) first.opening_date = newOpen;
      if (canEditPre && preDays !== cycle.pre_application_days) first.pre_application_days = preDays;
      const closeLater = Date.parse(newClose) > Date.parse(cycle.closing_date), closeEarlier = Date.parse(newClose) < Date.parse(cycle.closing_date);
      if (closeLater) first.closing_date = newClose;
      if (Object.keys(first).length) await call((api) => api.updateCycle(cycle.id, first));
      const rounds = Array.from({ length: count }, (_, i) => ({ number: i + 1, application_days: applyDays, review_days: reviewDays, start_date: starts[i + 1] ? atNine(starts[i + 1]) : null }));
      await call((api) => api.setRounds(cycle.id, { rounds, rollover_unmatched: rollover }));
      if (closeEarlier) await call((api) => api.updateCycle(cycle.id, { closing_date: newClose }));
      onSaved();
    } catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  }
  const day = (ms: number) => fmtDate(new Date(ms).toISOString());
  return (
    <Modal open={open} onClose={onClose} title="Cycle settings" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!valid || busy}>{busy ? "Saving…" : "Save settings"}</Button></>}>
      <div className="flex flex-col gap-4 text-text">
        {error && <Banner tone="bad">{error.message}</Banner>}
        {overflow && (
          <Banner tone="warn" action={requiredClose ? <button type="button" onClick={() => setCloses(requiredClose)} className="text-[12.5px] font-semibold underline whitespace-nowrap">Extend to {day(lastEnd)}</button> : undefined}>
            Round {overflow.number} would end {day(overflow.revEnd)}, after the cycle closes {fmtDate(atNine(closes))}.
          </Banner>
        )}
        {overlap && <Banner tone="warn">Round {overlap.number} would start before Round {overlap.number - 1} ends on {day(plan[overlap.number - 2].revEnd)}. Pick a later start date.</Banner>}
        {early && <Banner tone="warn">Round {early.number} would start before the pre-application window ends on {day(opensMs + preDays * DAY_MS)}.</Banner>}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Cycle opens" hint={canEditOpening ? undefined : "Opened; can no longer change"}><Input type="date" value={opens} onChange={(e) => setOpens(e.target.value)} disabled={!canEditOpening} /></Field>
          <Field label="Cycle closes"><Input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} invalid={!!overflow} /></Field>
          <div><div className="text-[12.5px] font-semibold mb-1.5">Pre-application</div>{canEditPre ? <Stepper value={preDays} onChange={setPreDays} min={0} max={60} format={(v) => `${v} days`} /> : <div className="h-10 flex items-center text-[13px] text-muted">{preDays} days (ended)</div>}</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><div className="text-[12.5px] font-semibold mb-1.5">Application window</div><Stepper value={applyDays} onChange={setApplyDays} min={1} max={14} format={(v) => `${v} days`} /></div>
          <div><div className="text-[12.5px] font-semibold mb-1.5">Review window</div><Stepper value={reviewDays} onChange={setReviewDays} min={1} max={7} format={(v) => `${v} day${v === 1 ? "" : "s"}`} /></div>
          <div><div className="text-[12.5px] font-semibold mb-1.5">Rounds</div><Stepper value={count} onChange={setCount} min={minRounds} max={3} /></div>
        </div>
        <div className="flex flex-col gap-2">
          {plan.map((p) => (
            <div key={p.number} className="grid grid-cols-[90px_170px_1fr] gap-3 items-center text-[13px]">
              <span className="font-semibold">Round {p.number}</span>
              {p.started ? <span className="text-muted">Started {day(p.start)}</span>
                : <Input type="date" aria-label={`Round ${p.number} starts`} value={starts[p.number] ?? toDateInput(new Date(p.start).toISOString())}
                    onChange={(e) => setStarts((cur) => { const next = { ...cur }; if (e.target.value) next[p.number] = e.target.value; else delete next[p.number]; return next; })} invalid={overlap?.number === p.number || early?.number === p.number} />}
              <span className="text-muted">review ends {day(p.revEnd)}{!p.started && !starts[p.number] ? " · default start" : ""}</span>
            </div>
          ))}
        </div>
        <Toggle on={rollover} onChange={setRollover} label="Carry unmatched students' applications into the next round" />
        <div className="text-[12px] text-faint">Rounds that have already started are kept and cannot be removed. A round without a start date opens 4 days after the previous one. Open projects and slots freed by declines always carry over.</div>
      </div>
    </Modal>
  );
}
