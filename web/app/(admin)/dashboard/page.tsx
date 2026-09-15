"use client";
/** Screen: AdminDashboardPage. */
import Link from "next/link";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { Banner, Button, Card, DeadlineChip, Loading, Stat, Status, fmtDate } from "@/components/ui";
import { useApi } from "@/lib/use-api";

export default function AdminDashboardPage() {
  const { me } = useMe();
  const { data, loading } = useApi((api) => api.adminDashboard(), []);
  if (loading && !data) return <Loading />;
  if (!data) return null;
  return (
    <>
      <PageHeader title="Dashboard" description={data.cycle?.academic_year ?? "No active cycle"} right={me && <DeadlineChip>{me.phase.label}</DeadlineChip>} />
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
