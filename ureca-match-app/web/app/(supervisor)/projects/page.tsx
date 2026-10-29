"use client";
/** ManageProjectDetails (4.15) list. Screen: SupervisorProjectsPage. REQ-PROJ-1..3.
 *  Published / Drafts / Closed tabs. Drafts can be published from here; closing asks for confirmation first.
 *  While rankings are open, each row shows how many of its applicants are ranked (ranking is the supervisor's task then). */
import Link from "next/link";
import { useState } from "react";
import { PageTitle } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { CycleTimeline } from "@/components/student/cycle-timeline";
import { Banner, Button, Card, Empty, Modal, Segmented, Skeleton } from "@/components/ui";
import { ApiError, type Listing } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

type Tab = "published" | "draft" | "closed";

export default function SupervisorProjects() {
  const { me } = useMe();
  const call = useCall();
  const { data, loading, reload } = useApi((api) => api.myListings(), []);
  const [tab, setTab] = useState<Tab>("published");
  const [closing, setClosing] = useState<Listing | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const rankWindow = me?.phase.window === "application" || me?.phase.window === "review";
  const cycleClosed = me?.phase.window === "closed";
  const rows = (data ?? []).filter((l) => l.status === tab);
  const count = (t: Tab) => (data ?? []).filter((l) => l.status === t).length;
  const published = (data ?? []).filter((l) => l.status === "published");
  // How many applicants of each project are already ranked, only while rankings are open.
  const ranked = useApi(async (api) => (rankWindow && published.length
    ? Object.fromEntries(await Promise.all(published.map(async (l) => [l.id, (await api.getRanking(l.id)).application_ids.length] as const)))
    : {}) as Record<string, number>, [rankWindow, published.map((l) => l.id).join(",")]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); reload(); } catch (e) { setError(e as ApiError); }
  }

  return (
    <>
      <PageTitle title="My projects" right={<div className="flex items-center gap-3"><CycleTimeline /><Link href="/projects/new"><Button><I.Plus size={16} /> New project</Button></Link></div>} />

      <div className="mb-5 flex items-center justify-between">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "published", label: "Published", count: count("published") },
          { value: "draft", label: "Drafts", count: count("draft") },
          { value: "closed", label: "Closed", count: count("closed") },
        ]} />
        {cycleClosed && <span className="text-[13px] text-muted">The cycle has closed. Listings are read-only.</span>}
      </div>
      {error && <div className="mb-5"><Banner tone="bad">{error.message}</Banner></div>}

      {loading && !data ? (
        <Card padded={false} className="overflow-hidden">
          <div aria-busy="true" aria-label="Loading your projects" className="divide-y divide-border">
            {[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-4 px-5 py-4"><Skeleton className="h-[64px] w-[88px] !rounded-[12px]" /><div className="flex flex-1 flex-col gap-2.5"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div></div>)}
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <Empty icon={<I.Folder size={20} />} title={tab === "published" ? "Nothing published yet" : tab === "draft" ? "No drafts" : "No closed listings"}
          note={tab === "published" ? "Publish a listing so students can find it." : tab === "draft" ? "Drafts you save appear here until you publish them." : "Listings you close are kept here."}>
          {tab !== "closed" && <Link href="/projects/new"><Button variant="soft">New project</Button></Link>}
        </Empty>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="divide-y divide-border">
            {rows.map((l) => (
              <div key={l.id} className="group flex items-center gap-5 px-5 py-4 transition-colors hover:bg-accent-soft/30">
                {l.cover_url
                  ? <img src={l.cover_url} alt="" className="h-[64px] w-[88px] shrink-0 rounded-[12px] object-cover" />
                  : <div className="grid h-[64px] w-[88px] shrink-0 place-items-center rounded-[12px] bg-neutral-soft text-faint"><I.Folder size={20} /></div>}
                <div className="min-w-0 flex-1">
                  <Link href={`/projects/${l.id}/edit`} className="block truncate text-[15.5px] font-semibold tracking-[-0.01em] !text-text hover:opacity-70">{l.title}</Link>
                  <div className="mt-0.5 truncate text-[13px] text-muted">{[l.offering_faculty, l.research_location, l.topic_tags.join(" · ")].filter(Boolean).join("  ·  ")}</div>
                </div>
                {(() => {
                  // While rankings are open the number that matters is how much of the ranking is done; otherwise how full the project is.
                  const ranking = l.status === "published" && rankWindow && l.applicant_count > 0 && ranked.data?.[l.id] !== undefined;
                  const done = ranking ? ranked.data![l.id] : l.filled_slots;
                  const of = ranking ? l.applicant_count : l.available_slots;
                  return (
                    <div className="hidden w-[150px] shrink-0 lg:block">
                      {l.status !== "draft" && <div className="text-[13px] text-muted"><b className="font-display text-[15px] font-semibold text-text tabular">{l.applicant_count}</b> {l.applicant_count === 1 ? "applicant" : "applicants"}</div>}
                      <div className="mt-1.5 h-1.5 rounded-full bg-[#e8eef7]"><div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${of ? Math.min(100, (done / of) * 100) : 0}%` }} /></div>
                      <div className="mt-1 text-[12px] tabular text-faint">{ranking ? `${done} of ${of} ranked` : `${done} of ${of} slots filled`}</div>
                    </div>
                  );
                })()}
                <div className="flex shrink-0 items-center gap-1.5">
                  {l.status === "published" && (
                    <>
                      <Link href={`/projects/${l.id}/applicants`}><Button size="sm" variant={rankWindow ? "primary" : "secondary"}>Applicants</Button></Link>
                      <Link href={`/projects/${l.id}/edit`}><Button size="sm" variant="secondary">{cycleClosed ? "View" : "Edit"}</Button></Link>
                      <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"><Button size="sm" variant="text" className="text-muted hover:text-bad-ink" onClick={() => setClosing(l)}>Close</Button></span>
                    </>
                  )}
                  {l.status === "draft" && (
                    <>
                      <Link href={`/projects/${l.id}/edit`}><Button size="sm" variant="secondary">{cycleClosed ? "View" : "Edit"}</Button></Link>
                      <Button size="sm" disabled={cycleClosed} onClick={() => run(() => call((api) => api.updateListing(l.id, { publish: true })))}>Publish</Button>
                    </>
                  )}
                  {l.status === "closed" && <Link href={`/projects/${l.id}/applicants`}><Button size="sm" variant="secondary">Applicants</Button></Link>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={!!closing} onClose={() => setClosing(null)} title="Close this listing?"
        footer={<><Button variant="secondary" onClick={() => setClosing(null)}>Keep open</Button><Button variant="destructive" onClick={() => { const l = closing!; setClosing(null); run(() => call((api) => api.closeListing(l.id))); }}>Close listing</Button></>}>
        <strong className="text-text font-medium">{closing?.title}</strong> disappears from student browsing. Applications still under review are withdrawn and those students are told. Accepted students and open offers are kept. This cannot be undone.
      </Modal>
    </>
  );
}
