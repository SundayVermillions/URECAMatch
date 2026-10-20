"use client";
/** QueryUrecaListings (SRS 4.9). REQ-BROWSE-1..3. Screen: BrowseProjectPage. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { ApplicantStack, Avatar, Banner, Button, DeadlineChip, Empty, FilterSelect, Input, Loading, isHighDemand } from "@/components/ui";
import type { Listing } from "@/lib/api/models";
import { useApi } from "@/lib/use-api";
import { useStanding } from "@/lib/use-standing";

const SCHOOLS = ["CCDS", "EEE", "SBS", "MAE", "SPMS"];

export default function Browse() {
  const { me } = useMe();
  const [q, setQ] = useState("");
  const [school, setSchool] = useState<string | undefined>();
  const [tag, setTag] = useState<string | undefined>();
  const [supervisor, setSupervisor] = useState<string | undefined>();
  const { data, loading } = useApi((api) => api.browse({ q, school, tag, supervisor }), [q, school, tag, supervisor]);
  // Filter options come from the unfiltered list, fetched once, so they do not shrink as you filter.
  const all = useApi((api) => api.browse({}), []);
  const topics = useMemo(() => Array.from(new Set((all.data ?? []).flatMap((l) => l.topic_tags))).sort(), [all.data]);
  const supervisors = useMemo(() => {
    const bare = (n: string) => n.replace(/^(Assoc\. )?(Prof\. |Dr\. )/, "");
    return Array.from(new Set((all.data ?? []).map((l) => l.supervisor_name))).sort((a, b) => bare(a).localeCompare(bare(b)));
  }, [all.data]);
  const applied = (data ?? []).filter((l) => l.applied).length;
  const standing = useStanding();
  const windowOpen = me?.phase.window === "application";
  const canApply = windowOpen && !standing.viewOnly && !standing.loading; // placed or ineligible students browse view only
  const filtered = !!(q || school || tag || supervisor);
  const early = me?.phase.window === "before_cycle" || me?.phase.window === "pre_application"; // REQ-BROWSE-1

  return (
    <>
      <PageHeader title="Browse projects" description="Find a research project that fits you. Open one to read the details and apply."
        right={me && <DeadlineChip>{me.phase.label}</DeadlineChip>} />
      {standing.viewOnly && (
        <div className="mb-5">
          <Banner tone={standing.placedIn ? "good" : "warn"} title={standing.placedIn ? "You have a project." : "You cannot apply this cycle."}>{standing.reason}</Banner>
        </div>
      )}
      {me && !windowOpen && !standing.viewOnly && (
        <div className="mb-5">
          {early
            ? <Banner tone="accent" title="You're early.">{me.phase.window === "pre_application" ? `${me.phase.label}.` : "No application cycle is open yet."} Browse and shortlist projects now, then come back to apply.</Banner>
            : <Banner tone="warn" title="Applications are closed right now.">{me.phase.label}. You can still browse projects.</Banner>}
        </div>
      )}

      <div className="flex items-center gap-2.5 mb-3">
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none"><I.Search size={16} /></span>
          <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects, topics or keywords" className="w-full pl-10 rounded-pill border-border-strong" />
        </div>
        <FilterSelect label="School" value={school} options={SCHOOLS} onChange={setSchool} />
        <FilterSelect label="Topic" value={tag} options={topics} onChange={setTag} />
        <FilterSelect label="Supervisor" value={supervisor} options={supervisors} onChange={setSupervisor} />
        {filtered && <Button variant="text" onClick={() => { setQ(""); setSchool(undefined); setTag(undefined); setSupervisor(undefined); }}>Clear</Button>}
      </div>
      <div className="flex items-center justify-between text-[13px] text-muted mb-5 px-1">
        <span>{data ? `${data.length} ${data.length === 1 ? "project" : "projects"}` : " "}</span>
        {applied > 0 && <Link href="/my-applications" className="inline-flex items-center gap-1 font-medium text-text hover:opacity-70">{applied} applied this round <span className="-rotate-90"><I.ChevronDown size={14} /></span></Link>}
      </div>

      {loading && !data ? <Loading /> : !data?.length ? <Empty title="No projects match" note="Try a different keyword or clear a filter." /> : (
        <div className="grid grid-cols-3 gap-5">
          {data.map((l) => <ProjectCard key={l.id} l={l} canApply={canApply} />)}
        </div>
      )}
    </>
  );
}

function ProjectCard({ l, canApply }: { l: Listing; canApply: boolean }) {
  const open = Math.max(l.available_slots - l.filled_slots, 0);
  const full = open === 0;
  const hot = isHighDemand(l.applicant_count ?? 0, open);
  return (
    <div className="group relative bg-surface rounded-card overflow-hidden flex flex-col shadow-[var(--shadow-card)] ring-1 ring-black/[0.04] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
      <div className="relative h-[150px] bg-sunken overflow-hidden">
        {l.cover_url && <img src={l.cover_url} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />}
      </div>
      <div className="p-5 flex flex-col flex-1">
        <div className="text-[12.5px] text-faint truncate">
          {l.offering_faculty}{hot && <> · <span className="text-warn-ink font-medium">High demand</span></>}
        </div>
        {/* The title link stretches over the whole card (after:inset-0), so the card is clickable without nesting links. */}
        <Link href={`/projects/${l.id}`} className="mt-1 text-[16px] font-semibold leading-[1.35] tracking-[-0.01em] text-text line-clamp-2 after:absolute after:inset-0">
          {l.title}
        </Link>
        <div className="text-[13px] text-muted mt-1.5 truncate">{l.topic_tags.join(" · ")}</div>

        {/* Decision aid: how many places are left, and how many students want them. */}
        <div className="mt-auto pt-5 flex items-center justify-between gap-3">
          <span className="text-[13px] whitespace-nowrap">
            {full ? <span className="text-faint">No slots left</span>
              : <><span className="font-semibold text-text tabular">{open}</span><span className="text-muted"> of {l.available_slots} slots open</span></>}
          </span>
          <ApplicantStack count={l.applicant_count ?? 0} />
        </div>

        {/* Footer: who supervises, and what you can do (or already did). */}
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3 min-h-[45px]">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={l.supervisor_name} size={24} />
            <span className="text-[13px] font-medium text-text truncate">{l.supervisor_name}</span>
          </div>
          {l.applied ? (
            <span className="shrink-0 inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-good-soft text-good-ink text-[12.5px] font-medium">
              <I.Tick size={14} /> Applied · #{l.applied_rank}
            </span>
          ) : full ? (
            <span className="shrink-0 inline-flex items-center h-7 px-3 rounded-pill bg-neutral-soft text-muted text-[12.5px] font-medium">Full</span>
          ) : (
            <Link href={canApply ? `/apply/${l.id}` : `/projects/${l.id}`} className="relative z-10 shrink-0">
              <Button size="sm" variant={canApply ? "primary" : "secondary"} className="rounded-pill px-4">{canApply ? "Apply" : "View"}</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
