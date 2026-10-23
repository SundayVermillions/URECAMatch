"use client";
/** ManageApplicationCycle (4.1), ManageMatchingRounds (4.2), ExecuteMatchingProcess (4.3). Screen: MatchingRoundsPage.
 *  Timeline of rounds, the selected round's panel, cycle settings in a modal. Review of matches is /rounds/[id]/matches.
 *  Matching and publishing run by themselves when the review and approval windows close (REQ-EXEC-4, REQ-PUB-3). */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Banner, Button, Card, Field, Input, Loading, Modal, RankBadge, Select, Stat, Status, Stepper, Toggle, fmtDate, fmtDeadline } from "@/components/ui";
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
  const [summary, setSummary] = useState<RoundSummary | null>(null);

  const viewed = all.find((c) => c.id === viewId) ?? active ?? all[0] ?? null;
  const viewedIsActive = !!viewed && !!active && viewed.id === active.id;
  const rounds = viewed?.rounds ?? [];
  const now = me?.phase;
  // "now" comes from the API phase (deterministic in mock mode), never from the browser clock
  const current = rounds.find((r) => r.id === selected) ?? (viewedIsActive ? rounds.find((r) => r.id === now?.round_id) : undefined) ?? rounds[0];
  const reload = () => { data.reload(); refresh(); };

  // Every round of the active cycle has a summary: before matching, its pool and the slots matching can fill.
  useEffect(() => {
    let alive = true;
    const load = current && viewedIsActive ? call((api) => api.summary(current.id)) : Promise.resolve(null);
    load.then((s) => { if (alive) setSummary(s); }).catch(() => {});
    return () => { alive = false; };
  }, [current?.id, current?.executed_at, viewedIsActive, call]);
  const stats = summary && summary.round.id === current?.id ? summary : null; // never another round's numbers while loading

  const statusOf = (r: Round) => {
    if (!viewedIsActive) return r.published_at ? "published" : r.executed_at ? "awaiting_publication" : "completed";
    if (r.published_at) return "published";
    if (r.executed_at) return now?.round_id === r.id && now.window === "approval" ? "approval_window" : "awaiting_publication";
    if (now?.round_id === r.id) return now.window === "application" ? "application_window" : now.window === "review" ? "review_window" : "awaiting_publication";
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
                  <div className="text-[12px] text-muted mt-2.5">Apply {fmtDate(r.application_start)} to {fmtDate(r.application_end)} · review to {fmtDate(r.review_end)} · approvals to {fmtDate(r.approval_end)}</div>
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
                    <Stat label="Eligible students" value={stats?.eligible ?? "–"} />
                    <Stat label="Open slots" value={stats?.open_slots ?? "–"} />
                    <Stat label="Review window" value={fmtDate(current.review_end)} note={`ends ${fmtDeadline(current.review_end)}`} />
                  </div>
                  {/* REQ-EXEC-4, REQ-APPRV-4, REQ-PUB-3: nobody has to be at a keyboard when a window closes */}
                  <div className="flex items-start gap-3 bg-accent-soft border border-accent-border rounded-row px-4 py-3.5">
                    <span className="text-accent mt-0.5"><I.Calendar /></span>
                    <div className="text-[13px]">
                      <div className="font-display text-[14px] font-bold">Matching runs automatically at {fmtDeadline(current.review_end)}</div>
                      <div className="text-muted mt-0.5">Supervisors then have until {fmtDeadline(current.approval_end)} to decline any student matched to them. Results publish automatically after that.</div>
                    </div>
                  </div>
                </>
              )}
              {current.executed_at && stats && (
                <>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <Stat label="Matched" value={stats.matched} />
                    <Stat label="Unmatched" value={stats.unmatched} />
                    <Stat label="Excluded" value={stats.excluded} note="placed, declined or timed out earlier" />
                    <Stat label="Avg. preference" value={stats.avg_preference ?? "–"} />
                  </div>
                  {current.published_at ? (
                    <Banner tone="good" title="Results published." action={<Link href={`/rounds/${current.id}/matches`} className="text-[12.5px] font-semibold underline">View matches</Link>}>Students answer by the end of the next application window, or by the cycle&apos;s closing date after the last round. Declines reopen slots for the next round.</Banner>
                  ) : (
                    <div className="flex items-center gap-3.5 bg-accent-soft border border-accent-border rounded-row px-4 py-3.5">
                      <div className="flex-1">
                        <div className="font-display text-[14px] font-bold">{stats.declined ? `${stats.declined} declined by supervisors` : "No supervisor has declined a match"}</div>
                        <div className="text-[12.5px] text-muted mt-0.5">Approval window until {fmtDeadline(current.approval_end)}. Results publish automatically when it closes. Declined students are unmatched for this round; reassign one only in exceptional cases.</div>
                      </div>
                      <Link href={`/rounds/${current.id}/matches`}><Button>Review matches</Button></Link>
                    </div>
                  )}
                </>
              )}
              {current.executed_at && !stats && <Loading />}
            </Card>
          )}
        </>
      )}

      {settings && <CycleSettings onClose={() => setSettings(false)} onSaved={() => { setSettings(false); reload(); }} />}
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

const GAP_MS = 2 * DAY_MS; // cycles.GAP: a round without a start date opens 2 days after the previous approval window
const RESPOND_DAYS = 7; // cycles.RESPOND (REQ-OUTCOME-3): the cycle closes at least this long after the last approval window

/** One round in the form: its window lengths in days, and the start date the admin picked ("" for the default). */
type RoundForm = { apply: number; review: number; approval: number; start: string };
const NEW_ROUND: RoundForm = { apply: 5, review: 2, approval: 2, start: "" };
const lengthsOf = (r: Round) => ({
  apply: Math.round((Date.parse(r.application_end) + 1000 - Date.parse(r.application_start)) / DAY_MS),
  review: Math.round((Date.parse(r.review_end) + 1000 - Date.parse(r.review_start)) / DAY_MS),
  approval: Math.round((Date.parse(r.approval_end) - Date.parse(r.review_end)) / DAY_MS),
});

type Planned = { number: number; start: number; appEnd: number; revEnd: number; end: number; started: boolean; typed: boolean };

/** Mirror of the API's _plan_rounds, so the form can show and check the dates before saving (use case 1-2).
 *  A round that has started by the API's clock (`nowMs`) keeps its dates (REQ-ROUND-2). The others use their own
 *  window lengths (REQ-ROUND-1, REQ-APPRV-5) and open on the date picked, or 2 days after the previous round ends;
 *  Round 1 when the pre-application window ends. */
function planRounds(cycle: Cycle, opensMs: number, preDays: number, count: number, formOf: (n: number) => RoundForm, nowMs: number): Planned[] {
  let cursor = opensMs + preDays * DAY_MS;
  const out: Planned[] = [];
  for (let n = 1; n <= count; n++) {
    const old = cycle.rounds.find((r) => r.number === n);
    if (old && Date.parse(old.application_start) <= nowMs) {
      out.push({ number: n, start: Date.parse(old.application_start), appEnd: Date.parse(old.application_end), revEnd: Date.parse(old.review_end), end: Date.parse(old.approval_end), started: true, typed: false });
    } else {
      const f = formOf(n);
      const start = f.start ? Date.parse(atNine(f.start)) : cursor;
      const revEnd = start + (f.apply + f.review) * DAY_MS - 1000;
      out.push({ number: n, start, appEnd: start + f.apply * DAY_MS - 1000, revEnd, end: revEnd + f.approval * DAY_MS, started: false, typed: !!f.start });
    }
    cursor = out[out.length - 1].end + 1000 + GAP_MS;
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

/** A setting that can no longer change: its control is disabled and greyed out, and the reason shows on hover. The
 *  controls inside let the pointer through, so the hover lands on this wrapper and its title in every browser. Screen
 *  readers hear the reason too, unless `quiet` because it is already said once for the group. */
function Locked({ reason, quiet, children }: { reason: string | null; quiet?: boolean; children: React.ReactNode }) {
  if (!reason) return <div>{children}</div>;
  return <div title={reason} className="cursor-not-allowed [&_*]:pointer-events-none">{children}{!quiet && <span className="sr-only">{reason}</span>}</div>;
}

const days = (v: number) => `${v} day${v === 1 ? "" : "s"}`;
const WINDOWS = [["apply", "Application", 14], ["review", "Review", 7], ["approval", "Approval", 7]] as const; // REQ-ROUND-1, REQ-APPRV-5

function CycleSettings({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const call = useCall();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [nowMs, setNowMs] = useState(NaN); // the API's clock from /me (deterministic in mock mode), never the browser's
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0); // "Try again" after a failed load
  const [opens, setOpens] = useState("");
  const [closes, setCloses] = useState("");
  const [preDays, setPreDays] = useState(7);
  const [count, setCount] = useState(3);
  const [forms, setForms] = useState<Record<number, RoundForm>>({});
  const [rollover, setRollover] = useState(true);
  const [refusal, setRefusal] = useState<{ form: string; error: ApiError } | null>(null); // the API's answer to the last save
  const [busy, setBusy] = useState(false);
  const lastOpens = useRef(""); // the last full opening date, so typed start dates move by each change to it
  useEffect(() => {
    let alive = true;
    call((api) => Promise.all([api.cycle(), api.me()])).then(([c, me]) => {
      if (!alive) return;
      if (!c) { setLoadError(new ApiError(404, "not_found", "There is no active cycle.")); return; }
      setCycle(c); setNowMs(Date.parse(me.phase.now)); setOpens(toDateInput(c.opening_date)); setCloses(toDateInput(c.closing_date));
      setPreDays(c.pre_application_days); setRollover(c.rollover_unmatched); setCount(c.rounds.length || 3);
      lastOpens.current = toDateInput(c.opening_date);
      // Each round's own windows. Keep a start date chosen earlier: a round that does not begin on its default date had one.
      const loaded: Record<number, RoundForm> = {};
      let cursor = Date.parse(c.opening_date) + c.pre_application_days * DAY_MS;
      for (const r of [...c.rounds].sort((x, y) => x.number - y.number)) {
        loaded[r.number] = { ...lengthsOf(r), start: Date.parse(r.application_start) !== cursor ? toDateInput(r.application_start) : "" };
        cursor = Date.parse(r.approval_end) + 1000 + GAP_MS;
      }
      setForms(loaded);
    }).catch((e) => { if (alive) setLoadError(e instanceof ApiError ? e : new ApiError(0, "network", String(e))); });
    return () => { alive = false; };
  }, [attempt, call]);

  // A round added here starts with the windows of the round before it.
  const formOf = (n: number): RoundForm => forms[n] ?? (n > 1 ? { ...formOf(n - 1), start: "" } : NEW_ROUND);
  const setForm = (n: number, change: Partial<RoundForm>) => setForms((cur) => ({ ...cur, [n]: { ...(cur[n] ?? formOf(n)), ...change } }));
  const setLength = (n: number, key: (typeof WINDOWS)[number][0], v: number) =>
    setForms((cur) => { const f = { ...(cur[n] ?? formOf(n)) }; f[key] = v; return { ...cur, [n]: f }; });
  // REQ-CYCLE-2: a new opening date or pre-application window moves every round that has not started, typed start
  // dates included, so the rounds keep their spacing (as PUT /admin/cycles/{id} does). Rounds without one follow anyway.
  const moveTypedStarts = (by: number) => {
    if (by) setForms((cur) => Object.fromEntries(Object.entries(cur).map(([n, f]) => [n, f.start ? { ...f, start: toDateInput(new Date(Date.parse(atNine(f.start)) + by).toISOString()) } : f])));
  };
  const changeOpens = (v: string) => {
    setOpens(v);
    if (!v) return; // a half-typed date: wait for the full one, then move by the whole change
    if (lastOpens.current) moveTypedStarts(Date.parse(atNine(v)) - Date.parse(atNine(lastOpens.current)));
    lastOpens.current = v;
  };
  const changePre = (v: number) => { moveTypedStarts((v - preDays) * DAY_MS); setPreDays(v); };
  const ready = !!cycle && !Number.isNaN(nowMs);
  const opensMs = opens ? Date.parse(atNine(opens)) : NaN;
  const closesMs = closes ? Date.parse(atNine(closes)) : NaN;
  const earliest = opensMs + preDays * DAY_MS;
  const plan = ready && !Number.isNaN(opensMs) ? planRounds(cycle, opensMs, preDays, count, formOf, nowMs) : [];
  const day = (ms: number) => fmtDate(new Date(ms).toISOString());

  // REQ-CYCLE-2: a date that has passed stays, and the pre-application window once Round 1 starts. REQ-ROUND-2: a round
  // that has started stays as it is. Locked settings are greyed out, with the reason on hover.
  const started = (cycle?.rounds ?? []).filter((r) => Date.parse(r.application_start) <= nowMs);
  const openLocked = cycle && Date.parse(cycle.opening_date) <= nowMs ? "The application cycle has already started." : null;
  const closeLocked = cycle && Date.parse(cycle.closing_date) <= nowMs ? "The application cycle has already closed." : null;
  const preLocked = started.length ? "Round 1 has already started." : null;
  const minRounds = Math.max(1, ...started.map((r) => r.number)); // a round that has started cannot be removed

  // Live checks, the same as the API makes on Save (use case 1-1 E1, use case 1-2 E1 and E2, REQ-ROUND-3).
  const opensChanged = !!cycle && opens !== toDateInput(cycle.opening_date);
  const closesChanged = !!cycle && closes !== toDateInput(cycle.closing_date);
  const opensError = !opens ? "Pick a date." : opensChanged && opensMs <= nowMs ? "This date has passed." : null;
  const closesError = !closes ? "Pick a date." : closesMs <= opensMs ? "Must be after the cycle opens." : closesChanged && closesMs <= nowMs ? "This date has passed." : null;
  const roundErrors = plan.map((p, i) => {
    if (p.started) return null;
    if (p.start <= nowMs) return p.typed ? "This start date has passed. Pick a later one." : `Its default start, ${day(p.start)}, has passed. Pick a start date.`;
    if (p.start < earliest) return `Starts before the pre-application window ends on ${day(earliest)}.`;
    if (i > 0 && p.start <= plan[i - 1].end) return `Starts before Round ${p.number - 1} ends on ${day(plan[i - 1].end)}.`;
    return null;
  });
  const overflow = plan.find((p) => p.end > closesMs);
  const lastEnd = plan.length ? plan[plan.length - 1].end : NaN;
  // REQ-OUTCOME-3: last-round offers are open until the cycle closes, so it closes at least a week after the last round
  const respondBy = lastEnd + RESPOND_DAYS * DAY_MS;
  const tooClose = !overflow && respondBy > closesMs;
  const requiredClose = Number.isNaN(lastEnd) ? "" : toDateInput(new Date(respondBy).toISOString());
  // Use case 1-1 E4: Save stays greyed out until something changes.
  const moved = (p: Planned) => {
    const r = cycle?.rounds.find((x) => x.number === p.number);
    return !r || p.start !== Date.parse(r.application_start) || p.appEnd !== Date.parse(r.application_end) || p.revEnd !== Date.parse(r.review_end) || p.end !== Date.parse(r.approval_end);
  };
  const dirty = !!cycle && (opensChanged || closesChanged || preDays !== cycle.pre_application_days || rollover !== cycle.rollover_unmatched || plan.length !== cycle.rounds.length || plan.some(moved));
  const valid = ready && !opensError && !closesError && roundErrors.every((e) => !e) && !overflow && !tooClose && count >= minRounds;
  // What stops Save, said beside it so it is in view however far the form is scrolled: the first problem above, or the
  // API's answer to the last save until the form changes.
  const formKey = JSON.stringify([opens, closes, preDays, count, forms, rollover]);
  const firstBad = roundErrors.findIndex(Boolean);
  const blocker = !ready ? null
    : opensError ? `Cycle opens: ${opensError}`
    : closesError ? `Cycle closes: ${closesError}`
    : firstBad >= 0 ? `Round ${plan[firstBad].number}: ${roundErrors[firstBad]}`
    : overflow ? `Round ${overflow.number} would end ${day(overflow.end)}, after the cycle closes.`
    : tooClose ? `Students need ${RESPOND_DAYS} days after the last approvals to answer their offers.`
    : null;
  const notice = blocker ?? (refusal?.form === formKey ? refusal.error.message : null);
  const extend = (overflow || tooClose) && requiredClose && !closeLocked
    ? <button type="button" onClick={() => setCloses(requiredClose)} className="font-semibold underline whitespace-nowrap">Extend to {day(respondBy)}</button> : null;

  async function save() {
    if (!cycle || !valid || !dirty) return;
    const form = formKey;
    setRefusal(null); setBusy(true);
    // One request: the API checks the dates and rounds together and saves all of it or none of it.
    const body: M.ScheduleUpdate = {
      opening_date: opensChanged ? atNine(opens) : null,
      closing_date: closesChanged ? atNine(closes) : null,
      pre_application_days: preDays !== cycle.pre_application_days ? preDays : null,
      rounds: plan.map((p) => {
        const old = cycle.rounds.find((r) => r.number === p.number);
        const f = p.started && old ? { ...lengthsOf(old), start: "" } : formOf(p.number); // a round that has started is sent as it is
        return { number: p.number, application_days: f.apply, review_days: f.review, approval_days: f.approval, start_date: f.start ? atNine(f.start) : null };
      }),
      rollover_unmatched: rollover,
    };
    try { await call((api) => api.saveSchedule(cycle.id, body)); onSaved(); }
    catch (e) { setRefusal({ form, error: e instanceof ApiError ? e : new ApiError(0, "network", String(e)) }); } finally { setBusy(false); }
  }
  const minStart = ready ? toDateInput(new Date(nowMs + 15 * 3_600_000).toISOString()) : undefined; // first day whose 5 pm SGT start is ahead
  return (
    <Modal open onClose={onClose} title="Cycle settings" footer={
      <div className="w-full flex items-center gap-4">
        <div aria-live="polite" className="flex-1 min-w-0">
          {notice && (
            <div className="flex items-start gap-1.5 text-[12.5px] leading-snug text-bad-ink font-medium">
              <span className="mt-0.5 shrink-0"><I.Alert size={13} /></span>
              <span>{notice}{blocker && extend && <> {extend}</>}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2.5 shrink-0">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!valid || !dirty || busy}>{busy ? "Saving…" : "Save settings"}</Button>
        </div>
      </div>
    }>
      {loadError ? (
        <Banner tone="bad" title="Couldn't load the cycle settings." action={<button type="button" onClick={() => { setLoadError(null); setAttempt((a) => a + 1); }} className="text-[12.5px] font-semibold underline whitespace-nowrap">Try again</button>}>{loadError.message}</Banner>
      ) : !ready ? <Loading /> : (
        <div className="flex flex-col gap-4 text-text">
          <div className="grid grid-cols-3 gap-3">
            <Locked reason={openLocked}>
              <Field label="Cycle opens" error={openLocked ? null : opensError}><Input type="date" value={opens} onChange={(e) => changeOpens(e.target.value)} disabled={!!openLocked} invalid={!openLocked && !!opensError} /></Field>
            </Locked>
            <Locked reason={closeLocked}>
              <Field label="Cycle closes" error={closeLocked ? null : closesError}><Input type="date" value={closes} min={minStart} onChange={(e) => setCloses(e.target.value)} disabled={!!closeLocked} invalid={!closeLocked && (!!closesError || !!overflow || tooClose)} /></Field>
            </Locked>
            <Locked reason={preLocked}>
              <div className="text-[13px] font-medium mb-1.5">Pre-application</div>
              <div className="h-10 flex items-center"><Stepper value={preDays} onChange={changePre} min={0} max={60} format={days} disabled={!!preLocked} /></div>
            </Locked>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center justify-between pb-2.5">
              <span className="text-[13px] font-medium">Rounds</span>
              <Stepper value={count} onChange={setCount} min={minRounds} max={3} />
            </div>
            {plan.map((p, i) => {
              const old = cycle.rounds.find((r) => r.number === p.number);
              const f = p.started && old ? { ...lengthsOf(old), start: "" } : formOf(p.number);
              const lock = p.started ? `Round ${p.number} has already started.` : null;
              const problem = roundErrors[i];
              return (
                <div key={p.number} className="flex flex-col gap-2.5 py-3.5 border-t border-border">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-[13.5px] w-[64px] shrink-0">Round {p.number}{lock && <span className="sr-only">. {lock}</span>}</span>
                    <Locked reason={lock} quiet>
                      <Input type="date" aria-label={`Round ${p.number} starts`} value={f.start || toDateInput(new Date(p.start).toISOString())} min={minStart}
                        onChange={(e) => setForm(p.number, { start: e.target.value })} disabled={!!lock} invalid={!!problem} className="w-[168px]" />
                    </Locked>
                    {!p.started && (f.start
                      ? <button type="button" onClick={() => setForm(p.number, { start: "" })} className="text-[12.5px] font-medium text-accent hover:text-accent-ink">Use default start</button>
                      : <span className="text-[12px] text-faint">Default start</span>)}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {WINDOWS.map(([key, label, max]) => (
                      <Locked key={key} reason={lock} quiet>
                        <div className="text-[12px] text-muted mb-1">{label}</div>
                        <Stepper value={f[key]} onChange={(v) => setLength(p.number, key, v)} min={1} max={max} format={days} disabled={!!lock} />
                      </Locked>
                    ))}
                  </div>
                  {problem
                    ? <div className="flex items-center gap-1.5 text-[12px] text-bad-ink font-medium"><I.Alert size={13} /> {problem}</div>
                    : <div className="text-[12px] text-muted">Applications close {day(p.appEnd)} · rankings due {day(p.revEnd)} · approvals end {day(p.end)}</div>}
                </div>
              );
            })}
          </div>
          <Toggle on={rollover} onChange={setRollover} label="Carry unmatched students' applications into the next round" />
        </div>
      )}
    </Modal>
  );
}
