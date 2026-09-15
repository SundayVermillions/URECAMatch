"use client";
/** ManageProjectDetails (4.15) list. Screen: SupervisorProjectsPage. */
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Button, DeadlineChip, Empty, Loading, Modal, Pill, Status } from "@/components/ui";
import { useApi, useCall } from "@/lib/use-api";

export default function SupervisorProjects() {
  const { me } = useMe();
  const call = useCall();
  const { data, loading, reload } = useApi((api) => api.myListings(), []);
  const [closing, setClosing] = useState<string | null>(null);
  async function close() { if (closing) { await call((api) => api.closeListing(closing)); setClosing(null); reload(); } }
  const rankWindow = me?.phase.window === "application" || me?.phase.window === "review";

  return (
    <>
      <PageHeader title="My projects" description="Post listings before or during the cycle. Rank applicants for each project during the review window."
        right={<div className="flex items-center gap-2">{me && <DeadlineChip>{me.phase.label}</DeadlineChip>}<Link href="/projects/new"><Button><I.Plus /> New project</Button></Link></div>} />
      {loading && !data ? <Loading /> : !data?.length ? <Empty title="No projects yet" note="Post your first listing so students can find it."><Link href="/projects/new"><Button variant="soft">New project</Button></Link></Empty> : (
        <div className="flex flex-col gap-3">
          {data.map((l) => (
            <div key={l.id} className="bg-surface border border-border rounded-card flex items-center gap-4 p-4">
              {l.cover_url ? <img src={l.cover_url} alt="" className="w-[88px] h-[60px] object-cover rounded-button shrink-0" /> : <div className="w-[88px] h-[60px] bg-sunken rounded-button shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><div className="font-display text-[15px] font-bold truncate">{l.title}</div><Status value={l.status} /></div>
                <div className="text-[12.5px] text-muted mt-0.5">{l.filled_slots} of {l.available_slots} slots filled · {l.applicant_count} applicants this round</div>
                <div className="flex gap-1.5 mt-1.5">{l.topic_tags.map((t) => <Pill key={t} tone="accent">{t}</Pill>)}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                {l.status === "published" && <Link href={`/projects/${l.id}/applicants`}><Button size="sm" variant={rankWindow ? "primary" : "soft"}>Applicants{l.applicant_count ? ` (${l.applicant_count})` : ""}</Button></Link>}
                <Link href={`/projects/${l.id}/edit`}><Button size="sm" variant="secondary">Edit</Button></Link>
                {l.status === "published" && <Button size="sm" variant="secondary" onClick={() => setClosing(l.id)}>Close</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!closing} onClose={() => setClosing(null)} title="Close this listing?" footer={<><Button variant="secondary" onClick={() => setClosing(null)}>Keep open</Button><Button variant="destructive" onClick={close}>Close listing</Button></>}>
        It disappears from student browsing. Existing applications and matches are kept.
      </Modal>
    </>
  );
}
