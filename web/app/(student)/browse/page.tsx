"use client";
/** QueryUrecaListings (SRS 4.9). REQ-BROWSE-1..3. Screen: BrowseProjectPage. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Button, Chip, DeadlineChip, Empty, Input, Loading, Pill } from "@/components/ui";
import { useApi } from "@/lib/use-api";

const SCHOOLS = ["CCDS", "EEE", "SBS", "MAE", "SPMS"];

export default function Browse() {
  const { me } = useMe();
  const [q, setQ] = useState("");
  const [school, setSchool] = useState<string | undefined>();
  const [tag, setTag] = useState<string | undefined>();
  const { data, loading } = useApi((api) => api.browse({ q, school, tag }), [q, school, tag]);
  const tags = useMemo(() => Array.from(new Set((data ?? []).flatMap((l) => l.topic_tags))).sort(), [data]);
  const applied = (data ?? []).filter((l) => l.applied).length;
  const canApply = me?.phase.window === "application";

  return (
    <>
      <PageHeader title="Browse projects" description="Find a project, then apply from its detail page. Rank your applications in My applications."
        right={me && <DeadlineChip>{me.phase.label}</DeadlineChip>} />
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"><I.Search size={16} /></span>
          <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, description or tag" className="w-full pl-9" />
        </div>
        {applied > 0 && <Pill tone="accent">{applied} applied this round</Pill>}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mb-5">
        <span className="overline mr-1">School</span>
        <Chip active={!school} onClick={() => setSchool(undefined)}>Any</Chip>
        {SCHOOLS.map((s) => <Chip key={s} active={school === s} onClick={() => setSchool(s)}>{s}</Chip>)}
        <span className="overline ml-3 mr-1">Topic</span>
        <Chip active={!tag} onClick={() => setTag(undefined)}>Any</Chip>
        {tags.map((t) => <Chip key={t} active={tag === t} onClick={() => setTag(t)}>{t}</Chip>)}
      </div>
      {loading && !data ? <Loading /> : !data?.length ? <Empty title="No projects match" note="Try a different keyword or clear a filter." /> : (
        <div className="grid grid-cols-3 gap-4">
          {data.map((l) => {
            const full = l.filled_slots >= l.available_slots;
            return (
              <div key={l.id} className="bg-surface border border-border rounded-card overflow-hidden flex flex-col">
                {l.cover_url ? <img src={l.cover_url} alt="" className="h-[130px] w-full object-cover" /> : <div className="h-[130px] bg-sunken" />}
                <div className="p-4 flex flex-col gap-2 flex-1">
                  <div className="flex gap-1.5 flex-wrap">{l.topic_tags.slice(0, 2).map((t) => <Pill key={t} tone="accent">{t}</Pill>)}<Pill>{l.offering_faculty}</Pill></div>
                  <Link href={`/projects/${l.id}`} className="font-display text-[15px] font-bold leading-[1.3] text-text hover:text-accent-ink">{l.title}</Link>
                  <div className="text-[12.5px] text-muted">{l.supervisor_name} · {l.available_slots} slots · {Math.max(l.available_slots - l.filled_slots, 0)} open</div>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    {l.prerequisites.length ? <Pill tone="warn">Requires {l.prerequisites.join(", ")}</Pill> : <span />}
                    {l.applied ? <Pill tone="good">Applied · preference {l.applied_rank}</Pill>
                      : full ? <Pill>Fully allocated</Pill>
                      : <Link href={canApply ? `/apply/${l.id}` : `/projects/${l.id}`}><Button size="sm" variant="soft">{canApply ? "Apply" : "View details"}</Button></Link>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
