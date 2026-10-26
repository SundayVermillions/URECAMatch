"use client";
/** QueryUrecaListings (SRS 4.9). REQ-BROWSE-1..4. Screen: BrowseProjectPage.
 *  Students also get "Uri's picks" (REQ-BROWSE-4): recommendations on top, a match badge on each card, and a Best match sort. */
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { PageTitle } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { UriPicks } from "@/components/student/uri-picks";
import { ApplicantStack, Avatar, Banner, Button, Empty, FilterSelect, Loading, fmtDate, isHighDemand } from "@/components/ui";
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
  // REQ-BROWSE-4: every open project that fits, scored. The panel shows the top three; cards show their score.
  const interests = me?.student?.research_interests ?? [];
  const isStudent = me?.user.role === "student";
  const phaseWindow = me?.phase.window;
  const picksOpen = phaseWindow === "application"; // Uri picks only while a student can act on them
  const recs = useApi((api) => (isStudent && !standing.viewOnly && interests.length && picksOpen ? api.recommendations(50) : Promise.resolve([])),
    [isStudent, standing.viewOnly, interests.join("|"), picksOpen]);
  const scores = useMemo(() => new Map((recs.data ?? []).map((r) => [r.listing.id, r.score])), [recs.data]);
  const [sort, setSort] = useState<string | undefined>();
  const grid = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => sort === "Best match" && data
    ? [...data].sort((a, b) => (scores.get(b.id) ?? -1) - (scores.get(a.id) ?? -1)) : data, [sort, data, scores]);
  const windowOpen = me?.phase.window === "application";
  // An open offer is answered before anything else (REQ-APPLY-3): until then the student cannot apply to projects.
  const offerLive = standing.match?.status === "published" && !!me && !(standing.match.offer_expires_at && Date.parse(me.phase.now) > Date.parse(standing.match.offer_expires_at)) && phaseWindow !== "closed" && phaseWindow !== "before_cycle";
  const canApply = windowOpen && !standing.viewOnly && !standing.loading && !offerLive; // placed or ineligible students browse view only
  const filtered = !!(q || school || tag || supervisor);
  const early = me?.phase.window === "before_cycle" || me?.phase.window === "pre_application"; // REQ-BROWSE-1
  // Applications are not open (before Round 1, between rounds, after the cycle): cards stay browsable but faded and locked.
  // A student who already has a project (or can no longer apply) sees every project closed too.
  const locked = !!me && !standing.loading && (!windowOpen || standing.viewOnly || offerLive);
  const lockLabel = standing.viewOnly ? "Not eligible" : offerLive ? "Answer your offer first"
    : phaseWindow === "before_cycle" ? "Not open yet"
    : phaseWindow === "pre_application" ? `Opens ${fmtDate(me?.phase.window_ends_at)}` : "Applications closed";
  const cycle = useApi((api) => api.cycle(), []);
  const roundNumber = me?.phase.round_number ?? null;
  const nextRound = roundNumber && cycle.data?.rounds.some((r) => r.number === roundNumber + 1)
    ? { number: roundNumber + 1, rollover: !!cycle.data.rollover_unmatched } : null;
  const mine = useApi((api) => (isStudent ? api.myApplications() : Promise.resolve([])), [isStudent]);
  const appliedThisRound = (mine.data ?? []).some((a) => a.round_id === me?.phase.round_id);
  const offer = offerLive && standing.match ? { title: standing.match.listing_title, expires: standing.match.offer_expires_at ?? null } : null;
  const m = standing.match;
  const out = standing.viewOnly && !standing.placedIn
    ? { kind: m?.status === "declined" ? "declined" as const : m?.status === "timed_out" ? "timed_out" as const : "other" as const, title: m?.listing_title }
    : null;
  const uriShown = isStudent && !standing.loading && !filtered;

  return (
    <>
      <PageTitle title="Browse projects" status={me?.phase.label} open={windowOpen} />
      {/* Search and filters in one bar, first thing on the page. z-30: the blur makes it its own layer, and its menus must sit above Uri and the cards below. */}
      <div className="relative z-30 flex items-center gap-1 mb-8 p-2 rounded-pill bg-surface/90 backdrop-blur-xl ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_16px_40px_-20px_rgba(30,40,90,0.28)] focus-within:ring-accent/40 transition-shadow">
        <label className="relative flex-1 min-w-0 flex items-center">
          <span className="absolute left-3.5 text-faint pointer-events-none"><I.Search size={16} /></span>
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects, topics or keywords" aria-label="Search projects"
            className="w-full h-11 pl-10 pr-3 rounded-pill bg-transparent text-[15px] outline-none placeholder:text-faint" />
        </label>
        <span aria-hidden className="w-px h-6 bg-border mx-1" />
        <FilterSelect bare label="School" value={school} options={SCHOOLS} onChange={setSchool} />
        <FilterSelect bare label="Topic" value={tag} options={topics} onChange={setTag} />
        <FilterSelect bare label="Supervisor" value={supervisor} options={supervisors} onChange={setSupervisor} />
        {scores.size > 0 && <FilterSelect bare label="Sort" value={sort} options={["Best match"]} onChange={setSort} anyLabel="Default" />}
        {filtered && <Button variant="text" className="px-3" onClick={() => { setQ(""); setSchool(undefined); setTag(undefined); setSupervisor(undefined); }}>Clear</Button>}
      </div>

      {standing.viewOnly && !standing.placedIn && !uriShown && (
        <div className="mb-5">
          <Banner tone={standing.placedIn ? "good" : "warn"} title={standing.placedIn ? "You have a project." : "You cannot apply this cycle."}>{standing.reason}</Banner>
        </div>
      )}
      {/* Where Uri is on screen she gives this message herself (early, paused); the banner covers the other cases. */}
      {me && !windowOpen && !standing.viewOnly && !uriShown && (
        <div className="mb-5">
          {early
            ? <Banner tone="accent" title="You're early.">{me.phase.window === "pre_application" ? `${me.phase.label}.` : "No application cycle is open yet."} Browse and shortlist projects now, then come back to apply.</Banner>
            : <Banner tone="warn" title="Applications are closed right now.">{me.phase.label}. You can still browse projects.</Banner>}
        </div>
      )}

      {/* Uri steps aside while searching or filtering, so results come first */}
      {uriShown && (
        <UriPicks name={me?.user.name ?? ""} interests={interests} placedIn={standing.placedIn} window={phaseWindow} phaseLabel={me?.phase.label} roundNumber={roundNumber} out={out} appliedThisRound={appliedThisRound} offer={offer} nextRound={nextRound}
          picks={!interests.length || standing.placedIn ? [] : recs.loading && !recs.data ? null : recs.data ?? []}
          onShowAll={() => { setSort("Best match"); grid.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
      )}
      {/* All projects */}
      <div ref={grid} className="flex items-end justify-between gap-4 mb-4 px-1 scroll-mt-6">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] flex items-center gap-2.5">
          All projects
          {data && <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-black/[0.05] text-[12.5px] font-medium text-muted tabular">{data.length}</span>}
        </h2>
        {applied > 0 && <Link href="/my-applications" className="inline-flex items-center gap-1 h-8 px-3.5 rounded-pill bg-surface ring-1 ring-black/[0.06] text-[13px] font-medium !text-text hover:ring-black/15 transition-shadow">{applied} applied this round <span className="-rotate-90"><I.ChevronDown size={14} /></span></Link>}
      </div>
      {loading && !data ? <Loading /> : !data?.length ? <Empty title="No projects match" note="Try a different keyword or clear a filter." /> : (
        <div className="grid grid-cols-3 gap-5">
          {(shown ?? []).map((l) => <ProjectCard key={l.id} l={l} canApply={canApply} match={scores.get(l.id)} lock={locked ? lockLabel : undefined} />)}
        </div>
      )}
    </>
  );
}

function ProjectCard({ l, canApply, match, lock }: { l: Listing; canApply: boolean; match?: number; lock?: string }) {
  const open = Math.max(l.available_slots - l.filled_slots, 0);
  const full = open === 0;
  const hot = isHighDemand(l.applicant_count ?? 0, open);
  return (
    <div className="group relative bg-surface rounded-card overflow-hidden flex flex-col shadow-[var(--shadow-card)] ring-1 ring-black/[0.04] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
      <div className="relative h-[150px] bg-sunken overflow-hidden">
        {l.cover_url && <img src={l.cover_url} alt="" className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] ${lock ? "opacity-60 saturate-50" : ""}`} />}
        {lock && (
          <span className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-pill bg-white/90 backdrop-blur px-2.5 py-1 text-[12px] font-semibold text-muted shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
            <I.Lock size={12} /> {lock}
          </span>
        )}
        {match !== undefined && (
          <span title="How well this project fits your interests, courses and chances" className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-pill bg-white/90 backdrop-blur px-2.5 py-1 text-[12px] font-semibold text-[#1c2566] shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#7c5cff" aria-hidden><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg>
            {match}% match
          </span>
        )}
      </div>
      <div className={`p-5 flex flex-col flex-1 ${lock ? "opacity-70" : ""}`}>
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
