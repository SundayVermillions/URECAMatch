"use client";
/** ReviewAndRankStudentApplications (4.16). REQ-VRANK-1..3. Screen: ApplicantAndRankingsPage.
 *  Left: applicants with search, filters and sort. Right: the ranking. Drawer: full application with PDF viewer.
 *  Filtering and sorting run here over the one list the API returns; filter state lives in the URL query string.
 *  "Rank top N" replaces the ranking with the first N applicants of the list as filtered and sorted.
 *  Uses the app's shared look (cards, pills, buttons), like every other screen. */
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageTitle } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { DocumentViewer } from "@/components/supervisor/document-viewer";
import { StudentSummary } from "@/components/supervisor/student-summary";
import { Avatar, Button, Card, Drawer, Empty, FilterMultiSelect, FilterSelect, Modal, Pill, ScoreRing, Segmented, Skeleton, Tip, fmtDate, inputCls } from "@/components/ui";
import { ApiError, type Applicant, type ApplicantScore } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

const CGPA_MINS = [3.5, 4.0, 4.5];
const cgpaLabel = (v: number) => `≥ ${v.toFixed(1)}`;
const yearLabel = (y: number) => `Year ${y}`;
const SORTS = { cgpa: "CGPA", ai: "AI score", name: "Name" } as const;
type SortKey = keyof typeof SORTS;
const VIEWS = { all: "All", prereq: "Meets prerequisites", unranked: "Not ranked yet" } as const;
type View = keyof typeof VIEWS;
const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

function FilterChip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <button type="button" onClick={onRemove} aria-label={`Remove filter ${typeof children === "string" ? children : ""}`}
      className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-accent-soft pl-3 pr-2 text-[12px] font-medium text-accent-ink transition-colors hover:bg-accent-border/60">
      {children}<I.X size={11} />
    </button>
  );
}

const Dot = () => <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />;

/** A large four-point star with a small one beside it, the usual "AI" mark. */
function Sparkle({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 4C10.4 8.6 13.4 11.6 18 12C13.4 12.4 10.4 15.4 10 20C9.6 15.4 6.6 12.4 2 12C6.6 11.6 9.6 8.6 10 4Z" />
      <path d="M19.5 1.5C19.65 3.3 20.7 4.35 22.5 4.5C20.7 4.65 19.65 5.7 19.5 7.5C19.35 5.7 18.3 4.65 16.5 4.5C18.3 4.35 19.35 3.3 19.5 1.5Z" />
    </svg>
  );
}

/** How the AI match scores were worked out, in the style of Uri's "How it works" on Browse. REQ-VRANK-1.
 *  Gemini has no fixed weights, so its factors carry no points; the local formula (api/app/services/ai_match.py) does. */
const GEMINI_FACTORS = [
  { c: "#22a06b", t: "Prerequisites", d: "Whether they have passed the project's prerequisite modules." },
  { c: "#7c5cff", t: "Fit", d: "How their interests and modules overlap with the project." },
  { c: "#f59e0b", t: "Statement", d: "The substance of their statement of interest." },
  { c: "#3d7bff", t: "CGPA", d: "Their CGPA out of 5.00." },
];
const LOCAL_FACTORS = [
  { c: "#22a06b", t: "Prerequisites, up to 40", d: "Share of the project's prerequisite modules they have passed." },
  { c: "#7c5cff", t: "Interests, up to 40", d: "20 for each interest the project is tagged with, 10 for each named in its title or description." },
  { c: "#3d7bff", t: "CGPA, up to 20", d: "CGPA out of 5.00, scaled to 20 points." },
];

function AiMatchInfo({ total, local }: { total: number; local: number }) {
  const [open, setOpen] = useState(true);
  const gemini = local < total;
  const rows = gemini ? GEMINI_FACTORS : LOCAL_FACTORS;
  return (
    <Card padded={false} className="mb-4 p-4">
      <div style={{ animation: "uri-rise .35s ease-out both" }}>
        <div className="flex items-start gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#3b4578,#1c2566)] text-white"><Sparkle size={15} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold">{!gemini ? "Scored locally" : local ? `Scored by Gemini, ${local} locally` : "Scored by Gemini"}</div>
            <div className="mt-0.5 text-[12.5px] leading-[1.45] text-muted">
              {gemini ? "Gemini read each application against the project and gave a 0 to 100 fit score with a reason."
                : "Gemini was not used, so each applicant got a 0 to 100 score from a fixed formula."} Hover a score for the reason.
            </div>
          </div>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-150 ${open ? "bg-[#1c2566] text-white" : "bg-neutral-soft text-text hover:bg-[#e0e7ff]"}`}>
            <I.Info size={14} /> How it works
          </button>
        </div>
        {open && (
          <>
            <div className={`mt-4 grid grid-cols-1 gap-4 ${gemini ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
              {rows.map((r) => (
                <div key={r.t} className="flex gap-2.5">
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.c }} />
                  <div><div className="text-[13px] font-semibold">{r.t}</div><div className="mt-0.5 text-[12.5px] leading-[1.45] text-muted">{r.d}</div></div>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-border pt-3 text-[12px] text-muted">
              {gemini && "Gemini weighs these together, with no fixed points. If it cannot be reached, a formula scores instead: prerequisites 40, interests 40, CGPA 20. "}
              A guide only: read each application before ranking. It never changes your ranking or the matching.
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export default function Applicants() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const call = useCall();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const listing = useApi((api) => api.listing(id), [id]);
  const everyone = useApi((api) => api.applicants(id, {}), [id]);
  const ranking = useApi((api) => api.getRanking(id), [id]);
  const [detail, setDetail] = useState<Applicant | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [opened, setOpened] = useState<string[]>([]); // documents expanded in the drawer, loaded on first open
  const [ai, setAi] = useState<{ listing: string; scores: Map<string, ApplicantScore> } | null>(null);
  const [matching, setMatching] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [topN, setTopN] = useState(5);
  const [confirmTop, setConfirmTop] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false); // the CGPA, school and year dropdowns, tucked away until wanted
  const canRank = me?.phase.window === "review" || me?.phase.window === "application";

  // Filters live in the URL so a refresh keeps them. The search box keeps its own state while typing.
  const setParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  const [q, setQ] = useState(sp.get("q") ?? "");
  useEffect(() => {
    if ((sp.get("q") ?? "") !== q.trim()) setParams({ q: q.trim() || undefined });
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const minCgpa = Number(sp.get("cgpa")) || 0;
  const schools = list(sp.get("school"));
  const years = list(sp.get("year")).map(Number).filter(Boolean);
  const view: View = sp.get("view") === "prereq" || sp.get("view") === "unranked" ? (sp.get("view") as View) : "all";
  const sortKey: SortKey = sp.get("sort") === "ai" || sp.get("sort") === "name" ? (sp.get("sort") as SortKey) : "cgpa";

  const all = useMemo(() => everyone.data ?? [], [everyone.data]);
  const ids = ranking.data?.application_ids ?? [];
  const byId = useMemo(() => new Map(all.map((r) => [r.application_id, r])), [all]);
  const ranked = ids.map((i) => byId.get(i)).filter(Boolean) as Applicant[];
  // Decision (guide section 10): applicants a supervisor does not rank are never matched.
  const unrankedCount = all.filter((r) => !ids.includes(r.application_id)).length;
  const meetCount = all.filter((r) => r.meets_prerequisites).length;
  // AI match scores belong to one listing; keyed by it so they vanish when the supervisor opens another project.
  const scores = ai?.listing === id ? ai.scores : null;
  const scoredLocally = scores ? [...scores.values()].filter((s) => s.source === "local").length : 0;
  const schoolOptions = useMemo(() => [...new Set(all.map((r) => r.student.school).filter(Boolean))].sort(), [all]);
  const yearOptions = useMemo(() => [...new Set(all.map((r) => r.student.year_of_study).filter((y): y is number => y != null))].sort((a, b) => a - b), [all]);
  const missing = (a: Applicant) => (listing.data?.prerequisites ?? []).filter((p) => !a.student.completed_modules.includes(p));

  const needle = q.trim().toLowerCase();
  const pool = all.filter((r) =>
    (!needle || r.student.name.toLowerCase().includes(needle) || r.student.school.toLowerCase().includes(needle))
    && (minCgpa === 0 || (r.student.cgpa ?? 0) >= minCgpa)
    && (schools.length === 0 || schools.includes(r.student.school))
    && (years.length === 0 || (r.student.year_of_study != null && years.includes(r.student.year_of_study)))
    && (view !== "prereq" || r.meets_prerequisites)
    && (view !== "unranked" || !ids.includes(r.application_id)));
  const sortBy = sortKey === "ai" && !scores ? "cgpa" : sortKey;
  pool.sort(
    sortBy === "ai" ? (a, b) => (scores!.get(b.application_id)?.score ?? -1) - (scores!.get(a.application_id)?.score ?? -1)
      : sortBy === "name" ? (a, b) => a.student.name.localeCompare(b.student.name)
      : (a, b) => (b.student.cgpa ?? 0) - (a.student.cgpa ?? 0));
  const filtering = !!needle || minCgpa > 0 || schools.length > 0 || years.length > 0 || view !== "all";
  const clearAll = () => { setQ(""); setParams({ q: undefined, cgpa: undefined, school: undefined, year: undefined, view: undefined }); };
  const setSchools = (v: string[]) => setParams({ school: v.join(",") || undefined });
  const setYears = (v: number[]) => setParams({ year: v.join(",") || undefined });

  async function runAiMatch() {
    setMatching(true);
    try { setAi({ listing: id, scores: new Map((await call((api) => api.aiMatch(id))).map((s) => [s.application_id, s])) }); setParams({ sort: "ai" }); setError(null); }
    catch (e) { setError(e as ApiError); }
    finally { setMatching(false); }
  }
  function chooseSort(label: string | undefined) {
    const key = (Object.keys(SORTS) as SortKey[]).find((k) => SORTS[k] === label) ?? "cgpa";
    if (key === "ai" && !scores) { runAiMatch(); return; } // scores are needed first; runAiMatch switches the sort
    setParams({ sort: key === "cgpa" ? undefined : key });
  }

  async function save(next: string[]) {
    try { ranking.setData(await call((api) => api.putRanking(id, next))); setError(null); } catch (e) { setError(e as ApiError); }
  }
  const add = (aid: string) => save([...ids, aid]);
  const remove = (aid: string) => save(ids.filter((x) => x !== aid));
  const move = (aid: string, dir: -1 | 1) => { const n = [...ids]; const i = n.indexOf(aid); const j = i + dir; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; save(n); };
  // REQ-VRANK-2: the ranking becomes the first N rows as shown. Replacing loses a manual order, so ask first.
  const n = Math.min(Math.max(topN, 1), pool.length);
  const topIds = pool.slice(0, n).map((a) => a.application_id);
  const rankTop = () => { if (ids.length) setConfirmTop(true); else save(topIds); };
  const dropOn = (target: string) => {
    if (!dragging || dragging === target) return;
    const n = ids.filter((x) => x !== dragging);
    n.splice(n.indexOf(target) + (ids.indexOf(dragging) < ids.indexOf(target) ? 1 : 0), 0, dragging);
    save(n);
  };

  const activeFilters = (minCgpa > 0 ? 1 : 0) + schools.length + years.length;
  return (
    <>
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-[13.5px] font-medium"><I.ChevronLeft /> Back to my projects</Link>
      <PageTitle title="Applicants and ranking" />

      {/* The project and how far the ranking is: one slim card, nothing else */}
      <Card padded={false} className="mb-5">
        <div className="flex items-center gap-5 px-6 py-4">
          {listing.data?.cover_url
            ? <img src={listing.data.cover_url} alt="" className="h-[48px] w-[68px] shrink-0 rounded-[10px] object-cover" />
            : <div className="grid h-[48px] w-[68px] shrink-0 place-items-center rounded-[10px] bg-neutral-soft text-faint"><I.Folder size={18} /></div>}
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[16px] font-semibold tracking-[-0.015em]">{listing.data?.title ?? " "}</div>
            <div className="text-[12.5px] text-muted">
              {error ? <span className="text-bad-ink">{error.message}</span>
                : !canRank ? <>Ranking is closed for this round. <b className="font-semibold text-text">{me?.phase.label}</b></>
                : `${all.length} ${all.length === 1 ? "applicant" : "applicants"} · ${meetCount} meet the prerequisites`}
            </div>
          </div>
          <div className="w-[180px] shrink-0">
            <div className="flex items-baseline justify-between text-[12.5px] text-muted"><span>Ranked</span><b className="font-display text-[15px] font-semibold tabular text-text">{ranked.length}<span className="font-normal text-faint"> / {all.length}</span></b></div>
            <div className="mt-1.5 h-1.5 rounded-full bg-[#e8eef7]"><div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${all.length ? (ranked.length / all.length) * 100 : 0}%` }} /></div>
            {canRank && unrankedCount > 0 && <div className="mt-1.5 text-[11.5px] text-warn-ink">{unrankedCount} not ranked cannot be matched</div>}
          </div>
        </div>
      </Card>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Segmented value={view} onChange={(v) => setParams({ view: v === "all" ? undefined : v })}
            options={(Object.keys(VIEWS) as View[]).map((v) => ({ value: v, label: VIEWS[v] }))} />
          <div className="ml-auto flex min-w-[360px] flex-1 items-center justify-end gap-2">
            <label className="relative flex min-w-0 max-w-[260px] flex-1 items-center">
              <span className="pointer-events-none absolute left-3 text-faint"><I.Search size={15} /></span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or school" aria-label="Search applicants by name or school" className={`${inputCls()} !h-9 w-full pl-9`} />
            </label>
            <button type="button" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill pl-3.5 pr-3 text-[13px] transition-colors ${activeFilters ? "bg-accent-soft text-accent-ink shadow-[inset_0_0_0_1px_var(--accent-border)]" : "bg-surface text-text shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-neutral-soft"}`}>
              Filters{activeFilters > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white">{activeFilters}</span>}
              <span className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`}><I.ChevronDown size={14} /></span>
            </button>
            <FilterSelect size="sm" label="Sort" align="right" value={sortBy === "cgpa" ? undefined : SORTS[sortBy]} anyLabel={SORTS.cgpa} options={[SORTS.ai, SORTS.name]} onChange={chooseSort} />
            {/* Glassy navy pill: a top sheen over a dark gradient, with gradient text and a sparkle. */}
            <button type="button" disabled={matching || !all.length} onClick={runAiMatch}
              className="group relative isolate inline-flex h-9 shrink-0 items-center gap-2 overflow-hidden rounded-full bg-[linear-gradient(180deg,#3b4578_0%,#1c2566_55%,#151b4d_100%)] pl-4 pr-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_10px_22px_-12px_rgba(28,37,102,0.8)] ring-1 ring-white/10 transition-[box-shadow,filter] duration-200 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_12px_28px_-10px_rgba(80,100,240,0.7)] hover:brightness-110 disabled:opacity-60 disabled:hover:brightness-100">
              <span aria-hidden className="absolute inset-x-0 top-0 -z-10 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
              <span className="bg-gradient-to-b from-white to-[#c3cdf5] bg-clip-text text-[14px] font-semibold tracking-[-0.01em] text-transparent">
                {matching ? "Scoring..." : scores ? "Rerun AI match" : "AI match"}
              </span>
              <span className={`text-white transition-transform duration-300 ${matching ? "animate-pulse" : "group-hover:rotate-12 group-hover:scale-110"}`}><Sparkle size={17} /></span>
            </button>
          </div>
        </div>
        {/* Not a Reveal: its clipping would cut off the dropdown lists that open from these buttons. */}
        {filtersOpen && (
          <div className="step-in -mt-1 mb-4 flex flex-wrap items-center gap-2">
            <FilterSelect size="sm" label="CGPA" align="left" value={minCgpa ? cgpaLabel(minCgpa) : undefined} options={CGPA_MINS.map(cgpaLabel)}
              onChange={(v) => setParams({ cgpa: CGPA_MINS.find((m) => cgpaLabel(m) === v)?.toString() })} />
            <FilterMultiSelect size="sm" label="School" align="left" value={schools} options={schoolOptions} onChange={setSchools} countLabel={(n) => `${n} schools`} />
            <FilterMultiSelect size="sm" label="Year" align="left" value={years.map(yearLabel)} options={yearOptions.map(yearLabel)} countLabel={(n) => `${n} years`}
              onChange={(v) => setYears(yearOptions.filter((y) => v.includes(yearLabel(y))))} />
          </div>
        )}

        {filtering && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted">Showing <b className="font-semibold text-text tabular">{pool.length}</b> of <span className="tabular">{all.length}</span></span>
            {needle && <FilterChip onRemove={() => setQ("")}>Search: “{q.trim()}”</FilterChip>}
            {minCgpa > 0 && <FilterChip onRemove={() => setParams({ cgpa: undefined })}>CGPA {cgpaLabel(minCgpa)}</FilterChip>}
            {schools.map((s) => <FilterChip key={s} onRemove={() => setSchools(schools.filter((x) => x !== s))}>{s}</FilterChip>)}
            {years.map((y) => <FilterChip key={y} onRemove={() => setYears(years.filter((x) => x !== y))}>{yearLabel(y)}</FilterChip>)}
            <button type="button" onClick={clearAll} className="ml-1 text-[12.5px] font-medium text-accent hover:text-accent-ink">Clear all</button>
          </div>
        )}
        {scores && <AiMatchInfo total={scores.size} local={scoredLocally} />}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section className="min-w-0">
          <div>
            {everyone.loading && !everyone.data ? (
              <Card padded={false} className="overflow-hidden">
                <div aria-busy="true" aria-label="Loading applicants" className="divide-y divide-border">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-4 px-5 py-4"><Skeleton className="h-9 w-9 !rounded-full" /><div className="flex flex-1 flex-col gap-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-56" /></div></div>)}
                </div>
              </Card>
            ) : pool.length === 0 ? (
              <Empty icon={<I.Users size={20} />} title={all.length === 0 ? "No students have applied yet" : "No applicants match these filters"}
                note={all.length === 0 ? "Applicants appear here as students apply during the round." : undefined}>
                {all.length > 0 && <Button variant="soft" onClick={clearAll}>Clear filters</Button>}
              </Empty>
            ) : (
              // No overflow-hidden on this card: it cut off the score tooltip on the first row. The end rows round their own corners.
              <Card padded={false}>
                <ul className="divide-y divide-border [&>li:first-child]:rounded-t-[var(--radius-card)] [&>li:last-child]:rounded-b-[var(--radius-card)]">
                  {pool.map((a) => {
                    const s = scores?.get(a.application_id);
                    const added = ids.includes(a.application_id);
                    const gaps = a.meets_prerequisites ? [] : missing(a);
                    const cgpa = a.student.cgpa;
                    return (
                      <li key={a.application_id} className="relative flex items-center gap-4 px-5 py-3.5 transition-colors first:rounded-t-[inherit] last:rounded-b-[inherit] hover:bg-accent-soft/30">
                        <Avatar name={a.student.name} size={36} tone="auto" />
                        <div className="min-w-0 flex-1">
                          {/* The name button stretches over the whole row, so a click anywhere opens the application. */}
                          <button type="button" onClick={() => setDetail(a)}
                            className="block max-w-full truncate text-left text-[15px] font-semibold tracking-[-0.01em] outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-accent">{a.student.name}</button>
                          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
                            <span className="truncate">{a.student.school} · Year {a.student.year_of_study}</span>
                            {!a.meets_prerequisites && (
                              <span className="relative z-10 inline-flex shrink-0">
                                <Tip text={gaps.length ? `Missing: ${gaps.join(", ")}` : "Missing a prerequisite"}>
                                  <span className="inline-flex items-center gap-1.5">· <Dot />Missing prerequisite</span>
                                </Tip>
                              </span>
                            )}
                          </div>
                        </div>
                        {matching && !s ? <Skeleton className="h-9 w-9 !rounded-full" /> : s && (
                          <span className="relative z-10 inline-flex">
                            <Tip align="right" text={<><span className="block">{s.reason}</span><span className="mt-0.5 block text-white/60">{s.source === "ai" ? "Gemini" : "Local formula"}</span></>}>
                              <ScoreRing score={s.score} size={38} />
                            </Tip>
                          </span>
                        )}
                        <span className={`w-11 shrink-0 text-right font-display text-[16px] font-semibold tabular ${cgpa != null && cgpa >= 4.5 ? "text-good-ink" : cgpa != null && cgpa >= 4.0 ? "text-accent-ink" : ""}`} title="CGPA">{cgpa?.toFixed(2) ?? "–"}</span>
                        <button type="button" disabled={added || !canRank} onClick={() => add(a.application_id)} aria-label={added ? `${a.student.name} added to ranking` : `Add ${a.student.name} to ranking`}
                          className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${added ? "bg-good-soft text-good-ink" : "text-muted shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-accent-soft hover:text-accent-ink hover:shadow-[inset_0_0_0_1px_var(--accent-border)] disabled:opacity-50 disabled:hover:bg-transparent"}`}>
                          {added ? <I.Tick size={15} /> : <I.Plus size={15} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </div>
        </section>

        <aside className="card-surface p-6 lg:sticky lg:top-8">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[17px]">Your ranking</h2>
            <Tip align="right" text={`Replaces your ranking with the first ${n || "N"} applicants as listed.`}>
              <span className="inline-flex h-8 shrink-0 items-center overflow-hidden rounded-pill bg-surface shadow-[inset_0_0_0_1px_var(--border-strong)] focus-within:shadow-[inset_0_0_0_1px_var(--accent-border)]">
                <label className="pl-3 text-[12.5px] text-muted" htmlFor="rank-top-n">Top</label>
                <input id="rank-top-n" type="number" min={1} max={pool.length || 1} value={topN} disabled={!canRank || !pool.length}
                  onChange={(e) => setTopN(Number(e.target.value) || 1)}
                  className="h-full w-10 bg-transparent px-1 text-center text-[13px] font-semibold tabular outline-none" />
                <button type="button" onClick={rankTop} disabled={!canRank || !pool.length} aria-label={`Rank top ${n}`}
                  className="h-full whitespace-nowrap bg-accent px-3 text-[12.5px] font-semibold text-white transition-[filter] duration-150 hover:brightness-110 disabled:opacity-50">
                  Rank
                </button>
              </span>
            </Tip>
          </div>
          <ol className="mt-3 flex flex-col">
            {ranked.length === 0 && (
              <li className="rounded-[14px] border border-dashed border-border-strong px-5 py-8 text-center">
                <div className="text-[14.5px] font-semibold">No one ranked yet</div>
                <div className="mt-1 text-[13px] text-muted">Add applicants from the list. Only ranked applicants can be matched.</div>
              </li>
            )}
            {ranked.map((a, i) => (
              <li key={a.application_id} draggable={canRank}
                onDragStart={() => setDragging(a.application_id)} onDragEnd={() => setDragging(null)}
                onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(a.application_id)}
                className={`group flex items-center gap-3 border-b border-border py-3 last:border-0 ${dragging === a.application_id ? "opacity-40" : ""}`}>
                <span className={`w-7 shrink-0 text-center font-display text-[22px] font-semibold leading-none tracking-[-0.03em] tabular ${i === 0 ? "text-accent" : "text-[#b4c3da]"}`}>{i + 1}</span>
                <button type="button" onClick={() => setDetail(a)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[14.5px] font-semibold">{a.student.name}</div>
                  <div className="text-[12px] tabular text-muted">{a.student.school} · CGPA {a.student.cgpa?.toFixed(2) ?? "–"}</div>
                </button>
                {/* Arrows keep reordering possible from the keyboard; they show on hover or focus. */}
                <span className="flex gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                  <button type="button" aria-label={`Move ${a.student.name} up`} disabled={!canRank || i === 0} onClick={() => move(a.application_id, -1)} className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-neutral-soft hover:text-text disabled:opacity-30"><I.ArrowUp size={14} /></button>
                  <button type="button" aria-label={`Move ${a.student.name} down`} disabled={!canRank || i === ranked.length - 1} onClick={() => move(a.application_id, 1)} className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-neutral-soft hover:text-text disabled:opacity-30"><I.ArrowDown size={14} /></button>
                  <button type="button" aria-label={`Remove ${a.student.name} from ranking`} disabled={!canRank} onClick={() => remove(a.application_id)} className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-bad-soft hover:text-bad-ink disabled:opacity-30"><I.X size={14} /></button>
                </span>
              </li>
            ))}
          </ol>
          {ranked.length > 0 && <div className="mt-3 border-t border-border pt-3.5 text-[12px] text-faint">Drag to reorder. Saved automatically.</div>}
        </aside>
      </div>

      <Modal open={confirmTop} onClose={() => setConfirmTop(false)} title="Replace your ranking?"
        footer={<><Button variant="secondary" onClick={() => setConfirmTop(false)}>Cancel</Button><Button onClick={() => { save(topIds); setConfirmTop(false); }}>Replace ranking</Button></>}>
        Your ranking of {ids.length} will become the top {n} {n === 1 ? "applicant" : "applicants"} as listed now, sorted by {SORTS[sortBy]}{filtering ? ", with your filters" : ""}. Your current order will be lost.
      </Modal>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title="Application"
        footer={detail && (ids.includes(detail.application_id)
          ? <Button variant="secondary" disabled={!canRank} onClick={() => { remove(detail.application_id); setDetail(null); }}>Remove from ranking</Button>
          : <Button disabled={!canRank} onClick={() => { add(detail.application_id); setDetail(null); }}>Add to ranking</Button>)}>
        {detail && (
          <>
            <StudentSummary name={detail.student.name} email={detail.student.email || `${detail.student.id}@e.ntu.edu.sg`} school={detail.student.school} degree={detail.student.degree}
              year={detail.student.year_of_study} cgpa={detail.student.cgpa} modules={detail.student.completed_modules} interests={detail.student.research_interests}
              missing={listing.data ? listing.data.prerequisites.filter((p) => !detail.student.completed_modules.includes(p)) : undefined}
              badge={ids.includes(detail.application_id) ? <Pill tone="accent">Ranked #{ids.indexOf(detail.application_id) + 1}</Pill> : <Pill>Not ranked</Pill>} note={`applied ${fmtDate(detail.submitted_at)}`} />
            <div><div className="eyebrow mb-1.5">Statement of interest</div><p className="text-[13px] leading-[1.65]">{detail.statement}</p></div>
            <div>
              <div className="eyebrow mb-2">Documents</div>
              <div className="flex flex-col gap-2">
                {detail.documents.map((d) => (
                  <details key={d.id} className="border border-border rounded-button"
                    onToggle={(e) => { if (e.currentTarget.open && !opened.includes(d.id)) setOpened([...opened, d.id]); }}>
                    <summary className="flex items-center gap-2 px-3 py-2.5 text-[12.5px] font-medium text-muted cursor-pointer list-none"><I.File size={14} /> {d.file_name}<span className="ml-auto text-accent font-semibold text-[11.5px]">View</span></summary>
                    {opened.includes(d.id) && <DocumentViewer id={d.id} name={d.file_name} />}
                  </details>
                ))}
              </div>
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
