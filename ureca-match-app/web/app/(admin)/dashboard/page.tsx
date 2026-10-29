"use client";
/** Screen: AdminDashboardPage. Reads the dashboard counts, the published listings (for demand), the current round's summary and the
 *  audit log. It changes nothing. The "right now" panel is the dialog map's loadRoundBanner, shown as a panel instead of a banner. */
import Link from "next/link";
import { PageTitle } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { CycleTrack } from "@/components/admin/cycle-track";
import { DemandBars, KpiTile, Rings, SegmentBar, type DemandRow } from "@/components/admin/charts";
import { Button, Card, Skeleton, fmtDateTime, fmtDeadline } from "@/components/ui";
import type { AuditEntry, Cycle, Listing, Phase, Round, RoundSummary } from "@/lib/api/models";
import { useApi } from "@/lib/use-api";

type Hero = { dot: string; eyebrow: string; title: string; body: string; action?: { href: string; label: string } };

/** What the current round needs from the admin right now, from the same phase the API uses. */
function heroFor(phase: Phase, round: Round | undefined): Hero {
  const n = phase.round_number;
  const by = fmtDeadline(phase.window_ends_at);
  const matches = round ? { href: `/rounds/${round.id}/matches`, label: "Review matches" } : undefined;
  switch (phase.window) {
    case "before_cycle":
      return { dot: "bg-warn", eyebrow: "No cycle", title: "No cycle is open", body: "Create the cycle and its rounds before students can apply.", action: { href: "/rounds", label: "Set up the cycle" } };
    case "pre_application":
      return { dot: "bg-accent", eyebrow: `Round ${n}`, title: `Round ${n} has not started`, body: `${phase.label}.`, action: { href: "/rounds", label: "View rounds" } };
    case "application":
      return { dot: "bg-good", eyebrow: `Round ${n} · Applications`, title: `Round ${n} is open for applications`, body: `Applications close ${by}. Supervisors rank applicants after that.`, action: { href: "/rounds", label: "View rounds" } };
    case "review":
      return { dot: "bg-accent", eyebrow: `Round ${n} · Review`, title: `Round ${n} is in the review window`, body: `Supervisors submit rankings until ${by}. Matching runs automatically when the window ends.`, action: { href: "/rounds", label: "View rounds" } };
    case "approval": // REQ-APPRV-4
      return { dot: "bg-warn", eyebrow: `Round ${n} · Approval`, title: `Round ${n} is in the approval window`, body: `Matching has run. Supervisors can decline matched students until ${by}. Results publish automatically.`, action: matches };
    case "awaiting_results":
      return { dot: "bg-accent", eyebrow: `Round ${n} · Publishing`, title: `Round ${n} results are being published`, body: "This happens automatically when the approval window closes." };
    case "results":
      return { dot: "bg-good", eyebrow: `Round ${n} · Results`, title: `Round ${n} results are published`, body: "Students can accept or decline their offers.", action: matches && { ...matches, label: "View matches" } };
    case "closed":
      return { dot: "bg-faint", eyebrow: "Cycle closed", title: "The cycle is closed", body: "No more applications or matching this cycle." };
  }
}

/** "3" + "days left", "5" + "hours left", "20" + "min left". Uses the app's clock, not the machine's. */
function countdown(endsAt: string | null | undefined, now: string | undefined): { n: number; unit: string } | null {
  if (!endsAt || !now) return null;
  const ms = Date.parse(endsAt) - Date.parse(now);
  if (ms <= 0) return null;
  const min = Math.round(ms / 60000);
  if (min < 60) return { n: min, unit: "min left" };
  const h = Math.round(min / 60);
  if (h < 48) return { n: h, unit: h === 1 ? "hour left" : "hours left" };
  return { n: Math.round(h / 24), unit: "days left" };
}

/** The API's wording for a count of one reads "1 students have". Fixed here so it reads right. */
const plain = (s: string) => s.replace(/\b1 students have\b/, "1 student has");

const OPERATION: Record<AuditEntry["operation"], string> = {
  matching_executed: "Matching run", manual_reassignment: "Manual reassignment", results_published: "Results published",
  user_updated: "User updated", user_deactivated: "User deactivated", cycle_updated: "Cycle updated",
};

function SectionHead({ title, link }: { title: string; link?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <h2 className="text-[17px]">{title}</h2>
      {link && <Link href={link.href} className="text-[13px] font-medium">{link.label}</Link>}
    </div>
  );
}

function Hero({ phase, cycle, alerts }: { phase: Phase; cycle: Cycle | null; alerts: string[] }) {
  const round = cycle?.rounds.find((r) => r.id === phase.round_id);
  const h = heroFor(phase, round);
  const left = countdown(phase.window_ends_at, phase.now);
  const attention = alerts.map(plain);
  return (
    <Card padded={false} className="mb-4 overflow-hidden">
      <div className="grid grid-cols-[1fr_auto] items-start gap-10 px-8 pt-7">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted"><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${h.dot}`} />{h.eyebrow}</div>
          <h2 className="mt-2 !text-[26px] !font-semibold !leading-[1.2] !tracking-[-0.025em]">{h.title}</h2>
          <p className="mt-1.5 max-w-[540px] text-[14px] leading-[1.55] text-muted">{h.body}</p>
          {h.action && <Link href={h.action.href} className="mt-5 inline-block"><Button>{h.action.label}</Button></Link>}
        </div>
        {left && (
          <div className="text-right" aria-label={`${left.n} ${left.unit}`}>
            <div className="font-display text-[64px] font-semibold leading-none tracking-[-0.04em] tabular text-text">{left.n}</div>
            <div className="mt-1.5 text-[13px] font-medium text-faint">{left.unit}</div>
          </div>
        )}
      </div>
      {cycle && cycle.rounds.length > 0 && <div className="px-8 pb-7 pt-6"><CycleTrack rounds={cycle.rounds} now={phase.now} current={phase.round_number} /></div>}
      <div className="border-t border-border bg-white/40 px-8 py-4">
        {attention.length === 0 ? (
          <div className="flex items-center gap-2 text-[13px] text-muted"><span className="text-good"><I.CheckCircle size={16} /></span>Nothing needs your attention.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {attention.map((a) => <li key={a} className="flex items-center gap-2.5 text-[13.5px] text-text"><span className="text-warn"><I.Alert size={16} /></span>{a}</li>)}
          </ul>
        )}
      </div>
    </Card>
  );
}

function ThisRound({ summary, loading, phase, round }: { summary: RoundSummary | null; loading: boolean; phase: Phase; round: Round | undefined }) {
  if (loading) return <div className="flex flex-col gap-3"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-1/2" /></div>;
  if (!summary || !round) return <p className="text-[13.5px] text-muted">There is no current round.</p>;
  if (summary.round.executed_at) {
    return (
      <>
        <SegmentBar segments={[
          { label: "Matched", value: summary.matched, color: "#248a3d" },
          { label: "Unmatched", value: summary.unmatched, color: "#9db4d6" },
          { label: "Declined", value: summary.declined, color: "#e30000" },
          { label: "Excluded", value: summary.excluded, color: "#c9d3e2" },
        ]} />
        {summary.avg_preference != null && <p className="mt-5 text-[13px] text-muted">On average, matched students got their choice number {summary.avg_preference.toFixed(1)}.</p>}
      </>
    );
  }
  const until = countdown(round.review_end, phase.now);
  return (
    <>
      <div className="text-[12.5px] font-medium text-muted">Matching runs by itself</div>
      <div className="mt-1 font-display text-[24px] font-semibold leading-tight tracking-[-0.02em]">{fmtDeadline(round.review_end)}</div>
      {until && <div className="mt-1 text-[13px] font-medium text-accent-ink">in {until.n} {until.unit.replace(" left", "")}</div>}
      <p className="mt-5 text-[13px] leading-[1.55] text-muted">{summary.eligible} eligible students and {summary.open_slots} open slots go in. Supervisors can still change their rankings until then.</p>
    </>
  );
}

export default function AdminDashboardPage() {
  const { me } = useMe();
  const dash = useApi((api) => api.adminDashboard(), []);
  const listings = useApi((api) => api.browse(), []);
  const roundId = me?.phase.round_id ?? null;
  const summary = useApi((api) => (roundId ? api.summary(roundId) : Promise.resolve(null)), [roundId]);
  const audit = useApi((api) => api.auditLog(), []);

  const data = dash.data;
  const cycle = data?.cycle ?? null;
  const current = cycle?.rounds.find((r) => r.id === roundId);

  // Demand per school: applications on its published projects, against the slots still open.
  const bySchool = new Map<string, DemandRow>();
  const pub: Listing[] = listings.data ?? [];
  for (const l of pub) {
    const s = bySchool.get(l.offering_faculty) ?? { label: l.offering_faculty, applications: 0, slots: 0, projects: 0 };
    s.applications += l.applicant_count; s.slots += Math.max(0, l.available_slots - l.filled_slots); s.projects += 1;
    bySchool.set(l.offering_faculty, s);
  }
  const demand = [...bySchool.values()].sort((a, b) => b.applications - a.applications);
  const openSlots = demand.reduce((n, d) => n + d.slots, 0);
  const supervisorsWithListings = new Set(pub.map((l) => l.supervisor_id)).size;
  const withApplicants = pub.filter((l) => l.applicant_count > 0).length;
  const recent = [...(audit.data ?? [])].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 3);

  return (
    <>
      <PageTitle title="Dashboard" />
      {!data || !me ? (
        <div aria-busy="true" aria-label="Loading the dashboard" className="flex flex-col gap-4">
          <Skeleton className="h-[330px] !rounded-[16px]" />
          <div className="grid grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[124px] !rounded-[16px]" />)}</div>
          <div className="grid grid-cols-5 gap-4"><Skeleton className="col-span-3 h-[300px] !rounded-[16px]" /><Skeleton className="col-span-2 h-[300px] !rounded-[16px]" /></div>
        </div>
      ) : (
        <>
          <Hero phase={me.phase} cycle={cycle} alerts={data.alerts} />

          <div className="mb-4 grid grid-cols-4 gap-4">
            <KpiTile icon={<I.Users size={15} />} label="Students" value={data.students} note={summary.data ? `${summary.data.eligible} eligible this round` : undefined} />
            <KpiTile icon={<I.User size={15} />} label="Supervisors" value={data.supervisors} note={listings.data ? `${supervisorsWithListings} with published projects` : undefined} />
            <KpiTile icon={<I.Layers size={15} />} label="Published projects" value={data.listings_published} note={listings.data ? `${openSlots} open ${openSlots === 1 ? "slot" : "slots"}` : undefined} />
            <KpiTile icon={<I.File size={15} />} label="Applications this round" value={data.applications_this_round} note={openSlots > 0 ? `${(data.applications_this_round / openSlots).toFixed(1)} per open slot` : undefined} />
          </div>

          <div className="mb-4 grid grid-cols-5 gap-4">
            <Card className="col-span-3">
              <SectionHead title="Supply and demand" />
              {listings.loading && !listings.data ? <div className="flex flex-col gap-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>
                : demand.length === 0 ? <p className="py-6 text-center text-[13.5px] text-muted">No published projects yet.</p>
                : <DemandBars rows={demand} />}
              <p className="mt-6 text-[12px] text-faint">By school: applications on its published projects against the slots still open. Over 5 applications per slot counts as high demand.</p>
            </Card>
            <Card className="col-span-2">
              <SectionHead title="Round readiness" />
              {(listings.loading && !listings.data) || (roundId && summary.loading && !summary.data)
                ? <div className="flex flex-col items-center gap-6"><Skeleton className="h-[184px] w-[184px] !rounded-full" /><div className="flex w-full flex-col gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div></div>
                : <Rings rings={[
                  { label: "Eligible students", value: summary.data?.eligible ?? 0, of: data.students, hint: "ready to be matched" },
                  { label: "Supervisors listing", value: supervisorsWithListings, of: data.supervisors, hint: "have a published project" },
                  { label: "Projects with applicants", value: withApplicants, of: pub.length, hint: "have at least one application" },
                ]} />}
            </Card>
          </div>

          <div className="grid grid-cols-5 gap-4">
            <Card className="col-span-2">
              <SectionHead title={current ? `Round ${current.number} matching` : "Matching"} link={{ href: "/rounds", label: "Manage rounds" }} />
              <ThisRound summary={summary.data} loading={summary.loading && !summary.data && !!roundId} phase={me.phase} round={current} />
            </Card>
            <Card className="col-span-3">
              <SectionHead title="Recent activity" link={{ href: "/audit", label: "View all" }} />
              {audit.loading && !audit.data ? <div className="flex flex-col gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>
                : recent.length === 0 ? <p className="py-6 text-center text-[13.5px] text-muted">Nothing has been recorded yet.</p>
                : (
                  <ul className="flex flex-col gap-4">
                    {recent.map((e) => (
                      <li key={e.id} className="flex items-start gap-3">
                        <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-medium">{OPERATION[e.operation]}</div>
                          <div className="truncate text-[12.5px] text-muted">{e.affected_labels[0] ?? e.note ?? ""}</div>
                        </div>
                        <div className="shrink-0 text-right text-[12px] text-faint">{e.actor_name}<br />{fmtDateTime(e.timestamp)}</div>
                      </li>
                    ))}
                  </ul>
                )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
