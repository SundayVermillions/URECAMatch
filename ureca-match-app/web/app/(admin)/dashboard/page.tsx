"use client";
/** Screen: AdminDashboardPage. Round banner is the dialog map's loadRoundBanner. */
import Link from "next/link";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { Banner, Button, Card, DeadlineChip, Loading, Stat, Status, fmtDate } from "@/components/ui";
import type { Cycle, Phase } from "@/lib/api/models";
import { useApi } from "@/lib/use-api";

/** What the current round needs from the admin right now, from the same phase the API uses. */
function RoundBanner({ phase, cycle }: { phase: Phase; cycle: Cycle | null }) {
  const round = cycle?.rounds.find((r) => r.id === phase.round_id);
  const n = phase.round_number;
  const by = fmtDate(phase.window_ends_at);
  const link = (href: string, label: string) => <Link href={href} className="text-[12.5px] font-semibold underline shrink-0">{label}</Link>;
  switch (phase.window) {
    case "before_cycle":
      return <Banner tone="accent" title="No cycle is open." action={link("/rounds", "Set up the cycle")}>Create the cycle and its rounds before students can apply.</Banner>;
    case "pre_application":
      return <Banner tone="accent" title={`Round ${n} has not started.`} action={link("/rounds", "View rounds")}>{phase.label}.</Banner>;
    case "application":
      return <Banner tone="accent" title={`Round ${n} is open for applications.`} action={link("/rounds", "View rounds")}>Applications close {by}. Supervisors rank applicants after that.</Banner>;
    case "review":
      return <Banner tone="warn" title={`Round ${n} review window.`} action={link("/rounds", "View rounds")}>Supervisors submit rankings until {by}. Run matching once the window ends.</Banner>;
    case "awaiting_results":
      return round?.executed_at
        ? <Banner tone="warn" title={`Round ${n} matching has run.`} action={link(`/rounds/${round.id}/matches`, "Review matches")}>Check supervisor approvals, then publish the results.</Banner>
        : <Banner tone="warn" title={`Round ${n} is ready for matching.`} action={link("/rounds", "Run matching")}>The review window has ended. Execute matching to propose matches.</Banner>;
    case "results":
      return <Banner tone="good" title={`Round ${n} results published.`} action={round && link(`/rounds/${round.id}/matches`, "View matches")}>Students can accept or decline their offers.</Banner>;
    case "closed":
      return <Banner tone="accent" title="The cycle is closed.">No more applications or matching this cycle.</Banner>;
  }
}

export default function AdminDashboardPage() {
  const { me } = useMe();
  const { data, loading } = useApi((api) => api.adminDashboard(), []);
  if (loading && !data) return <Loading />;
  if (!data) return null;
  return (
    <>
      <PageHeader title="Dashboard" description={data.cycle?.academic_year ?? "No active cycle"} right={me && <DeadlineChip>{me.phase.label}</DeadlineChip>} />
      {me && <div className="mb-3"><RoundBanner phase={me.phase} cycle={data.cycle} /></div>}
      {data.alerts.length > 0 && <div className="flex flex-col gap-2 mb-5">{data.alerts.map((a) => <Banner key={a} tone="warn">{a}</Banner>)}</div>}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <Stat label="Students" value={data.students} />
        <Stat label="Supervisors" value={data.supervisors} />
        <Stat label="Published listings" value={data.listings_published} />
        <Stat label="Applications this round" value={data.applications_this_round} />
        <Stat label="Pending approvals" value={data.pending_approvals} tone={data.pending_approvals ? "bad" : undefined} />
      </div>
      <Card>
        <div className="flex items-center justify-between mb-3"><h2>Rounds</h2><Link href="/rounds"><Button size="sm" variant="soft">Manage rounds</Button></Link></div>
        <div className="grid grid-cols-3 gap-3">
          {(data.cycle?.rounds ?? []).map((r) => (
            <div key={r.id} className="border border-border rounded-row p-3.5">
              <div className="flex items-center gap-2"><span className="font-display font-bold">Round {r.number}</span><span className="ml-auto"><Status value={r.status} kind="round" /></span></div>
              <div className="text-[12px] text-muted mt-2">Apply {fmtDate(r.application_start)} to {fmtDate(r.application_end)} · review to {fmtDate(r.review_end)}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
