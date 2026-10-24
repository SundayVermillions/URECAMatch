"use client";
/** ManageProjectDetails (4.15) list. Screen: SupervisorProjectsPage. REQ-PROJ-1..3.
 *  Published / Drafts / Closed tabs. Drafts can be published from here; closing asks for confirmation first. */
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Banner, Button, Card, DeadlineChip, Empty, Loading, Modal, Segmented } from "@/components/ui";
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

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); reload(); } catch (e) { setError(e as ApiError); }
  }

  return (
    <>
      <PageHeader title="My projects" description="Post listings before or during the cycle. Rank the applicants for each project during the review window."
        right={<div className="flex items-center gap-2.5">{me && <DeadlineChip>{me.phase.label}</DeadlineChip>}<Link href="/projects/new"><Button><I.Plus size={16} /> New project</Button></Link></div>} />

      <div className="flex items-center justify-between mb-5">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "published", label: "Published", count: count("published") },
          { value: "draft", label: "Drafts", count: count("draft") },
          { value: "closed", label: "Closed", count: count("closed") },
        ]} />
        {cycleClosed && <span className="text-[13px] text-muted">The cycle has closed. Listings are read-only.</span>}
      </div>
      {error && <div className="mb-5"><Banner tone="bad">{error.message}</Banner></div>}

      {loading && !data ? <Loading /> : rows.length === 0 ? (
        <Empty title={tab === "published" ? "Nothing published yet" : tab === "draft" ? "No drafts" : "No closed listings"}
          note={tab === "published" ? "Publish a listing so students can find it." : tab === "draft" ? "Drafts you save appear here until you publish them." : "Listings you close are kept here."}>
          {tab !== "closed" && <Link href="/projects/new"><Button variant="secondary">New project</Button></Link>}
        </Empty>
      ) : (
        <Card padded={false} className="overflow-hidden">
          {rows.map((l, i) => (
            <div key={l.id} className={`flex items-center gap-4 px-5 py-4 ${i ? "border-t border-border" : ""}`}>
              {l.cover_url
                ? <img src={l.cover_url} alt="" className="w-[76px] h-[56px] object-cover rounded-[10px] shrink-0" />
                : <div className="w-[76px] h-[56px] rounded-[10px] shrink-0 bg-gradient-to-br from-[#eef2ff] via-[#f5f5f7] to-[#eafaf4]" />}
              <div className="flex-1 min-w-0">
                <Link href={`/projects/${l.id}/edit`} className="block text-[15px] font-semibold text-text truncate hover:opacity-70">{l.title}</Link>
                <div className="text-[13px] text-muted mt-0.5 truncate">{[l.offering_faculty, l.research_location, l.topic_tags.join(" · ")].filter(Boolean).join("  ·  ")}</div>
              </div>
              <div className="hidden lg:flex items-center gap-6 shrink-0 text-[13px]">
                <Metric value={`${l.filled_slots}/${l.available_slots}`} label="filled" />
                {l.status !== "draft" && <Metric value={String(l.applicant_count)} label={l.applicant_count === 1 ? "applicant" : "applicants"} />}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {l.status === "published" && (
                  <>
                    <Link href={`/projects/${l.id}/applicants`}><Button size="sm" variant={rankWindow ? "primary" : "secondary"}>Applicants</Button></Link>
                    <Link href={`/projects/${l.id}/edit`}><Button size="sm" variant="secondary">{cycleClosed ? "View" : "Edit"}</Button></Link>
                    <Button size="sm" variant="text" className="text-muted hover:text-bad-ink" onClick={() => setClosing(l)}>Close</Button>
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
        </Card>
      )}

      <Modal open={!!closing} onClose={() => setClosing(null)} title="Close this listing?"
        footer={<><Button variant="secondary" onClick={() => setClosing(null)}>Keep open</Button><Button variant="destructive" onClick={() => { const l = closing!; setClosing(null); run(() => call((api) => api.closeListing(l.id))); }}>Close listing</Button></>}>
        <strong className="text-text font-medium">{closing?.title}</strong> disappears from student browsing. Applications still under review are withdrawn and those students are told. Accepted students and open offers are kept. This cannot be undone.
      </Modal>
    </>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-right min-w-[64px]">
      <div className="font-semibold text-text tabular">{value}</div>
      <div className="text-[12px] text-faint">{label}</div>
    </div>
  );
}
