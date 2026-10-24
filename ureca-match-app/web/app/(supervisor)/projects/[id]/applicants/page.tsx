"use client";
/** ReviewAndRankStudentApplications (4.16). REQ-VRANK-1..3. Screen: ApplicantAndRankingsPage.
 *  Left: applicants with search, filters and sort. Right: the ranking. Drawer: full application with PDF viewer.
 *  Filtering and sorting run here over the one list the API returns; filter state lives in the URL query string.
 *  Page palette (.ap-theme in globals.css): the app's neutrals with its blue accent. */
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { DocumentViewer } from "@/components/supervisor/document-viewer";
import { Banner, Button, Drawer, FilterMultiSelect, FilterSelect, Loading, Pill, ScoreRing, Tip, fmtDate } from "@/components/ui";
import { ApiError, type Applicant, type ApplicantScore } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

const CGPA_MINS = [3.5, 4.0, 4.5];
const cgpaLabel = (v: number) => `≥ ${v.toFixed(1)}`;
const yearLabel = (y: number) => `Year ${y}`;
const SORTS = { cgpa: "CGPA (high to low)", ai: "AI match score", name: "Name A-Z" } as const;
type SortKey = keyof typeof SORTS;
const VIEWS = { all: "All", prereq: "Meets prerequisites", unranked: "Not ranked yet" } as const;
type View = keyof typeof VIEWS;
const pad = (n: number) => String(n).padStart(2, "0");
const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

function FilterChip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <button type="button" onClick={onRemove} aria-label={`Remove filter ${typeof children === "string" ? children : ""}`}
      className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-[6px] bg-ap-soft text-ap-accent-ink text-[12px] font-medium hover:bg-[#e0e7ff] transition-colors duration-150">
      {children}<I.X size={11} />
    </button>
  );
}

function StatCard({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="bg-ap-soft rounded-[10px] px-4 py-2.5 min-w-[118px] shrink-0">
      <div className="text-[24px] font-semibold leading-none tracking-[-0.02em] tabular">{value}</div>
      <div className="text-[12px] text-slate-600 mt-1.5 whitespace-nowrap">{label}</div>
    </div>
  );
}

const Dot = () => <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-ap-warn shrink-0" />;

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
  const dropOn = (target: string) => {
    if (!dragging || dragging === target) return;
    const n = ids.filter((x) => x !== dragging);
    n.splice(n.indexOf(target) + (ids.indexOf(dragging) < ids.indexOf(target) ? 1 : 0), 0, dragging);
    save(n);
  };

  return (
    <div className="ap-theme bg-ap-bg rounded-[12px] px-4 py-5 md:px-6 md:py-6">
      <div className="flex flex-col xl:flex-row xl:items-end gap-4">
        <div className="min-w-0 flex-1">
          <Link href="/projects" className="ap-link">← Back to my projects</Link>
          <div className="ap-eyebrow mt-4">Supervisor · Review and rank</div>
          <h1 className="mt-1 text-[28px] md:text-[34px] leading-[1.1]">Applicants and ranking</h1>
          <div className="mt-1 text-[14px] text-ap-muted truncate">{listing.data?.title ?? " "}</div>
        </div>
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 xl:mx-0 xl:px-0 shrink-0">
          <StatCard value={all.length} label="Applicants" />
          <StatCard value={`${ranked.length}/${all.length}`} label="Ranked" />
          <StatCard value={meetCount} label="Meet prerequisites" />
        </div>
      </div>
      {!canRank && <div className="flex items-center gap-2 mt-3 text-[13px] text-ap-muted"><Dot />Ranking is closed for this round. <b className="font-semibold text-ap-ink">{me?.phase.label}</b></div>}
      {canRank && unrankedCount > 0 && (
        <div className="flex items-center gap-2 mt-3 text-[13px] text-ap-muted">
          <Dot /><span>{unrankedCount} {unrankedCount === 1 ? "applicant is" : "applicants are"} not ranked yet and cannot be matched. Rank them before <b className="font-semibold text-ap-ink">{me?.phase.label}</b>.</span>
        </div>
      )}
      {error && <div className="mt-3"><Banner tone="bad">{error.message}</Banner></div>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_370px] gap-6 items-start mt-6">
        <section>
          <div className="flex items-center gap-3">
            <div className="ap-eyebrow">Applicants</div>
            <button type="button" disabled={matching || !all.length} onClick={runAiMatch}
              className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-ap-card border border-ap-line text-[11.5px] font-semibold uppercase tracking-[0.1em] hover:border-ap-accent hover:text-ap-accent-ink transition-colors duration-150 disabled:opacity-50">
              <I.Bulb size={14} /> {matching ? "Scoring..." : scores ? "Rerun AI match" : "AI match"}
            </button>
          </div>

          {/* One toolbar row on wide screens: quick views, search, dropdowns. Everything combines (AND). */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <div role="tablist" aria-label="Quick filters" className="flex gap-1 overflow-x-auto">
              {(Object.keys(VIEWS) as View[]).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setParams({ view: v === "all" ? undefined : v })}
                  className={`h-9 px-3 rounded-[6px] text-[11.5px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap transition-colors duration-150 ${view === v ? "bg-ap-accent text-white" : "text-ap-muted hover:text-ap-ink hover:bg-ap-card"}`}>
                  {VIEWS[v]}
                </button>
              ))}
            </div>
            <label className="relative flex items-center flex-1 min-w-[180px]">
              <span className="absolute left-3 text-ap-muted pointer-events-none"><I.Search size={15} /></span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or school" aria-label="Search applicants by name or school"
                className="w-full h-9 pl-9 pr-3 rounded-[6px] bg-ap-card border border-ap-line text-[14px] outline-none focus:border-ap-accent focus:ring-1 focus:ring-ap-accent placeholder:text-ap-muted" />
            </label>
            <FilterSelect size="sm" label="CGPA" align="left" value={minCgpa ? cgpaLabel(minCgpa) : undefined} options={CGPA_MINS.map(cgpaLabel)}
              onChange={(v) => setParams({ cgpa: CGPA_MINS.find((m) => cgpaLabel(m) === v)?.toString() })} />
            <FilterMultiSelect size="sm" label="School" align="left" value={schools} options={schoolOptions} onChange={setSchools} countLabel={(n) => `${n} schools`} />
            <FilterMultiSelect size="sm" label="Year" align="left" value={years.map(yearLabel)} options={yearOptions.map(yearLabel)} countLabel={(n) => `${n} years`}
              onChange={(v) => setYears(yearOptions.filter((y) => v.includes(yearLabel(y))))} />
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-2.5 min-h-8">
            <span className="text-[13px] text-ap-muted">Showing <b className="font-semibold text-ap-ink tabular">{pool.length}</b> of <span className="tabular">{all.length}</span></span>
            {needle && <FilterChip onRemove={() => setQ("")}>Search: “{q.trim()}”</FilterChip>}
            {view !== "all" && <FilterChip onRemove={() => setParams({ view: undefined })}>{VIEWS[view]}</FilterChip>}
            {minCgpa > 0 && <FilterChip onRemove={() => setParams({ cgpa: undefined })}>CGPA {cgpaLabel(minCgpa)}</FilterChip>}
            {schools.map((s) => <FilterChip key={s} onRemove={() => setSchools(schools.filter((x) => x !== s))}>{s}</FilterChip>)}
            {years.map((y) => <FilterChip key={y} onRemove={() => setYears(years.filter((x) => x !== y))}>{yearLabel(y)}</FilterChip>)}
            {filtering && <button type="button" onClick={clearAll} className="text-[12px] font-semibold text-ap-accent-ink underline underline-offset-4 ml-1">Clear all</button>}
            <span className="ml-auto">
              <FilterSelect size="sm" label="Sort" value={SORTS[sortBy]} anyLabel={SORTS.cgpa} options={[SORTS.ai, SORTS.name]} onChange={chooseSort} />
            </span>
          </div>
          {scores && <div className="mt-1 text-[12px] text-ap-muted">
            {scoredLocally === scores.size ? "Scored locally from prerequisites, shared interests and CGPA."
              : scoredLocally > 0 ? `Scored by Gemini (${scoredLocally} scored locally).` : "Scored by Gemini."} Hover a score for the reason. A guide only: read each application before ranking.
          </div>}

          <div className="flex flex-col gap-2 mt-3">
            {everyone.loading && !everyone.data ? <Loading /> : pool.length === 0 ? (
              <div className="bg-ap-card border border-ap-line rounded-[12px] px-6 py-10 text-center">
                <div className="text-[16px] font-semibold">{all.length === 0 ? "No students have applied yet" : "No applicants match these filters"}</div>
                {all.length === 0 ? <div className="text-[13px] text-ap-muted mt-1">Applicants appear here as students apply during the round.</div>
                  : <button type="button" onClick={clearAll} className="mt-4 h-9 px-4 rounded-[6px] bg-ap-accent text-white text-[12px] font-semibold uppercase tracking-[0.1em]">Clear filters</button>}
              </div>
            ) : pool.map((a, i) => {
              const s = scores?.get(a.application_id);
              const added = ids.includes(a.application_id);
              const gaps = a.meets_prerequisites ? [] : missing(a);
              const cgpa = a.student.cgpa;
              return (
                <div key={a.application_id}
                  className="relative flex items-center gap-3 px-4 py-3 rounded-[10px] bg-ap-card border border-ap-line transition-colors duration-150 hover:bg-ap-hover hover:border-ap-accent">
                  <span className="text-[12px] text-ap-muted tabular w-5 shrink-0">{pad(i + 1)}</span>
                  <div className="flex-1 min-w-0">
                    {/* The name button stretches over the whole row, so a click anywhere opens the application. */}
                    <button type="button" onClick={() => setDetail(a)}
                      className="block text-[16px] font-semibold tracking-[-0.01em] truncate max-w-full text-left outline-none after:absolute after:inset-0 after:rounded-[10px] focus-visible:after:ring-2 focus-visible:after:ring-ap-accent">{a.student.name}</button>
                    <div className="flex items-center gap-1.5 text-[12.5px] text-ap-muted mt-0.5 min-w-0">
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
                  {matching && !s ? <span className="ap-skeleton w-9 h-9 rounded-full!" aria-label="Scoring" /> : s && (
                    <span className="relative z-10 inline-flex">
                      <Tip align="right" text={<><span className="block">{s.reason}</span><span className="block mt-0.5 text-white/60">{s.source === "ai" ? "Gemini" : "Local formula"}</span></>}>
                        <ScoreRing score={s.score} size={38} />
                      </Tip>
                    </span>
                  )}
                  <span className="flex flex-col items-end leading-none w-12 shrink-0">
                    <span className={`text-[16px] font-semibold tabular ${cgpa != null && cgpa >= 4.5 ? "text-ap-good" : cgpa != null && cgpa >= 4.0 ? "text-ap-accent-ink" : ""}`}>{cgpa?.toFixed(2) ?? "–"}</span>
                    <span className="text-[10.5px] text-ap-muted mt-1 uppercase tracking-[0.08em]">CGPA</span>
                  </span>
                  <button type="button" disabled={added || !canRank} onClick={() => add(a.application_id)} aria-label={added ? `${a.student.name} added to ranking` : `Add ${a.student.name} to ranking`}
                    className={`relative z-10 w-9 h-9 shrink-0 rounded-[6px] flex items-center justify-center transition-colors duration-150 ${added ? "bg-ap-accent text-white" : "bg-ap-soft border border-ap-soft text-ap-accent-ink hover:border-ap-accent disabled:opacity-50"}`}>
                    {added ? <I.Tick size={15} /> : <I.Plus size={15} />}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="lg:sticky lg:top-6 bg-ap-panel border border-[#cde2fa] text-ap-ink rounded-[12px] p-5">
          <div className="flex items-baseline gap-2">
            <div className="ap-eyebrow text-ap-rank!">Your ranking</div>
            <span className="ml-auto text-[12px] text-ap-muted tabular">{ranked.length} ranked</span>
          </div>
          <p className="text-[12.5px] text-ap-muted mt-1.5">Best first. Only ranked applicants can be matched. Drag to reorder.</p>
          <ol className="mt-3 flex flex-col">
            {ranked.length === 0 && (
              <li className="border border-dashed border-ap-line rounded-[10px] px-5 py-7 text-center">
                <div className="text-[15px] font-semibold">No one ranked yet</div>
                <div className="text-[13px] text-ap-muted mt-1">Add applicants from the list.</div>
              </li>
            )}
            {ranked.map((a, i) => (
              <li key={a.application_id} draggable={canRank}
                onDragStart={() => setDragging(a.application_id)} onDragEnd={() => setDragging(null)}
                onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(a.application_id)}
                className={`group flex items-center gap-2.5 py-2.5 border-b border-ap-line last:border-0 ${dragging === a.application_id ? "opacity-40" : ""}`}>
                <span aria-hidden className="text-ap-muted cursor-grab opacity-0 group-hover:opacity-100 transition-opacity duration-150">⋮⋮</span>
                <span className="text-[13px] font-semibold text-ap-rank tabular w-6">{pad(i + 1)}</span>
                <button type="button" onClick={() => setDetail(a)} className="flex-1 min-w-0 text-left">
                  <div className="text-[14.5px] font-semibold truncate">{a.student.name}</div>
                  <div className="text-[12px] text-ap-muted tabular">{a.student.school} · CGPA {a.student.cgpa?.toFixed(2) ?? "–"}</div>
                </button>
                {/* Arrows keep reordering possible from the keyboard; they show on hover or focus. */}
                <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
                  <button type="button" aria-label={`Move ${a.student.name} up`} disabled={!canRank || i === 0} onClick={() => move(a.application_id, -1)} className="w-7 h-7 rounded-[6px] flex items-center justify-center hover:bg-ap-soft disabled:opacity-30"><I.ArrowUp size={14} /></button>
                  <button type="button" aria-label={`Move ${a.student.name} down`} disabled={!canRank || i === ranked.length - 1} onClick={() => move(a.application_id, 1)} className="w-7 h-7 rounded-[6px] flex items-center justify-center hover:bg-ap-soft disabled:opacity-30"><I.ArrowDown size={14} /></button>
                  <button type="button" aria-label={`Remove ${a.student.name} from ranking`} disabled={!canRank} onClick={() => remove(a.application_id)} className="w-7 h-7 rounded-[6px] flex items-center justify-center hover:bg-ap-soft disabled:opacity-30"><I.X size={14} /></button>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-3 pt-3 border-t border-ap-line flex items-center gap-1.5 text-[12px] text-ap-muted"><I.Tick size={13} /> Changes save automatically</div>
        </aside>
      </div>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title="Application"
        footer={detail && (ids.includes(detail.application_id)
          ? <Button variant="secondary" disabled={!canRank} onClick={() => { remove(detail.application_id); setDetail(null); }}>Remove from ranking</Button>
          : <Button disabled={!canRank} onClick={() => { add(detail.application_id); setDetail(null); }}>Add to ranking</Button>)}>
        {detail && (
          <>
            <div className="flex items-center gap-3.5">
              <div><div className="font-display text-[18px] font-bold">{detail.student.name}</div><div className="text-[12.5px] text-muted">{detail.student.school}{detail.student.degree ? ` · ${detail.student.degree}` : ''} · Year {detail.student.year_of_study} · applied {fmtDate(detail.submitted_at)}</div>
                <div className="text-[12.5px] text-accent mt-0.5">
                  <a href={`mailto:${detail.student.email || `${detail.student.id}@e.ntu.edu.sg`}`} className="hover:underline">
                    {detail.student.email || `${detail.student.id}@e.ntu.edu.sg`}
                  </a>
                </div></div>
              <span className="ml-auto">{ids.includes(detail.application_id) ? <Pill tone="accent">Ranked #{ids.indexOf(detail.application_id) + 1}</Pill> : <Pill>Not ranked</Pill>}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-sunken rounded-[9px] px-3 py-2.5"><div className="eyebrow">CGPA</div><div className="text-[15px] font-bold mt-0.5 tabular">{detail.student.cgpa?.toFixed(2)} / 5.00</div></div>
              <div className="bg-sunken rounded-[9px] px-3 py-2.5"><div className="eyebrow">Prerequisite</div><div className={`text-[13px] font-bold mt-0.5 ${detail.meets_prerequisites ? "text-good-ink" : "text-warn-ink"}`}>{detail.meets_prerequisites ? "Met" : `Missing ${listing.data?.prerequisites.filter((p) => !detail.student.completed_modules.includes(p)).join(", ")}`}</div></div>
              <div className="bg-sunken rounded-[9px] px-3 py-2.5"><div className="eyebrow">Modules</div><div className="text-[13px] font-semibold mt-0.5">{detail.student.completed_modules.join(", ")}</div></div>
              <div className="bg-sunken rounded-[9px] px-3 py-2.5"><div className="eyebrow">Interests</div><div className="text-[13px] font-semibold mt-0.5">{detail.student.research_interests.join(", ")}</div></div>
            </div>
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
    </div>
  );
}
