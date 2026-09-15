"use client";
/** Project detail. Screen: ProjectDetailPage. */
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { Banner, Button, Card, Loading, Pill } from "@/components/ui";
import { useApi } from "@/lib/use-api";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const { data: l, loading, error } = useApi((api) => api.listing(id), [id]);
  if (loading && !l) return <Loading />;
  if (error || !l) return <Banner tone="bad">{error?.message ?? "Project not found."}</Banner>;
  const open = Math.max(l.available_slots - l.filled_slots, 0);
  const missing = l.prerequisites.filter((p) => !(me?.student?.completed_modules ?? []).includes(p));
  const canApply = me?.phase.window === "application" && !l.applied && open > 0 && me?.student?.eligible_for_matching;

  return (
    <>
      <PageHeader title={l.title} back={{ href: "/browse", label: "Back to projects" }} description={`${l.supervisor_name} · ${l.offering_faculty} · ${l.research_location}`}
        right={l.applied ? <Pill tone="good">Applied · preference {l.applied_rank}</Pill> : canApply ? <Link href={`/apply/${l.id}`}><Button size="lg">Apply to this project</Button></Link> : null} />
      {l.cover_url && <img src={l.cover_url} alt="" className="w-full h-[220px] object-cover rounded-card mb-5" />}
      {me?.phase.window !== "application" && !l.applied && <div className="mb-4"><Banner tone="warn" title="Applications are closed.">{me?.phase.label}. You can browse now and apply when the next window opens.</Banner></div>}
      {open === 0 && !l.applied && <div className="mb-4"><Banner tone="warn" title="Fully allocated.">All {l.available_slots} slots are filled. Slots reopen if a student declines.</Banner></div>}
      {missing.length > 0 && <div className="mb-4"><Banner tone="warn" title={`Missing prerequisite: ${missing.join(", ")}.`}>You can still apply, but the supervisor will see this.</Banner></div>}
      <div className="grid grid-cols-[1fr_300px] gap-5">
        <Card><div className="overline mb-2">Description</div><p className="text-[13.5px] leading-[1.65]">{l.description}</p></Card>
        <div className="flex flex-col gap-4">
          <Card>
            <div className="overline mb-2">At a glance</div>
            <dl className="text-[13px] grid grid-cols-[100px_1fr] gap-y-2">
              <dt className="text-muted">Slots</dt><dd className="font-semibold">{open} of {l.available_slots} open</dd>
              <dt className="text-muted">Applicants</dt><dd className="font-semibold">{l.applicant_count}</dd>
              <dt className="text-muted">Prerequisites</dt><dd className="font-semibold">{l.prerequisites.join(", ") || "None"}</dd>
              <dt className="text-muted">Topics</dt><dd className="flex gap-1 flex-wrap">{l.topic_tags.map((t) => <Pill key={t} tone="accent">{t}</Pill>)}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
