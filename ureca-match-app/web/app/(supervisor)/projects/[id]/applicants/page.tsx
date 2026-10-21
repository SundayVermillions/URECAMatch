"use client";
/** ReviewAndRankStudentApplications (4.16). REQ-VRANK-1..3. Screen: ApplicantAndRankingsPage.
 *  Left: applicants with search, filters and a Recommended sort (prerequisites, then CGPA). Right: the ranking.
 *  Drawer: full application with PDF viewer. Filtering and sorting run here over the one list the API returns. */
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { DocumentViewer } from "@/components/supervisor/document-viewer";
import { Avatar, Banner, Button, DeadlineChip, Drawer, Empty, FilterMultiSelect, FilterRange, FilterSelect, IconButton, Loading, Pill, RankBadge, ScoreRing, Tip, fmtDate } from "@/components/ui";
import { ApiError, type Applicant, type ApplicantScore } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

const cgpaLabel = (v: number) => `${v.toFixed(2)}+`;
const yearLabel = (y: number) => `Year ${y}`;
const SORTS = { cgpa: "CGPA", ai: "AI match score", name: "Name" } as const; // undefined = Recommended

function CgpaPill({ cgpa }: { cgpa: number | null | undefined }) {
  if (cgpa == null) return <Pill className="tabular">No CGPA</Pill>;
  return <Pill tone={cgpa >= 4.5 ? "good" : cgpa >= 4.0 ? "accent" : "neutral"} className="tabular font-semibold">{cgpa.toFixed(2)}</Pill>;
}

function FilterPill({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <button type="button" onClick={onRemove} aria-label={`Remove filter ${typeof children === "string" ? children : ""}`}
      className="inline-flex items-center gap-1 h-6 pl-2.5 pr-1.5 rounded-pill bg-accent-soft text-accent-ink text-[12px] font-medium hover:bg-accent-border transition-colors">
      {children}<I.X size={11} />
    </button>
  );
}

export default function Applicants() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const call = useCall();
  const listing = useApi((api) => api.listing(id), [id]);
  const everyone = useApi((api) => api.applicants(id, {}), [id]);
  const ranking = useApi((api) => api.getRanking(id), [id]);
  const [q, setQ] = useState("");
  const [minCgpa, setMinCgpa] = useState(0); // 0 = any
  const [schools, setSchools] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [prereqOnly, setPrereqOnly] = useState(false);
  const [sort, setSort] = useState<string | undefined>(); // a SORTS label, or undefined for Recommended
  const [detail, setDetail] = useState<Applicant | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [opened, setOpened] = useState<string[]>([]); // documents expanded in the drawer, loaded on first open
  const [ai, setAi] = useState<{ listing: string; scores: Map<string, ApplicantScore> } | null>(null);
  const [matching, setMatching] = useState(false);
  const canRank = me?.phase.window === "review" || me?.phase.window === "application";

  const all = useMemo(() => everyone.data ?? [], [everyone.data]);
  const ids = ranking.data?.application_ids ?? [];
  const byId = useMemo(() => new Map(all.map((r) => [r.application_id, r])), [all]);
  const ranked = ids.map((i) => byId.get(i)).filter(Boolean) as Applicant[];
  // Decision (guide section 10): applicants a supervisor does not rank are never matched.
  const unrankedAll = all.filter((r) => !ids.includes(r.application_id));
  // AI match scores belong to one listing; keyed by it so they vanish when the supervisor opens another project.
  const scores = ai?.listing === id ? ai.scores : null;
  const scoredLocally = scores ? [...scores.values()].filter((s) => s.source === "local").length : 0;
  const schoolOptions = useMemo(() => [...new Set(all.map((r) => r.student.school).filter(Boolean))].sort(), [all]);
  const yearOptions = useMemo(() => [...new Set(all.map((r) => r.student.year_of_study).filter((y): y is number => y != null))].sort((a, b) => a - b), [all]);
  const missing = (a: Applicant) => (listing.data?.prerequisites ?? []).filter((p) => !a.student.completed_modules.includes(p));

  const needle = q.trim().toLowerCase();
  const filtered = unrankedAll.filter((r) =>
    (!needle || r.student.name.toLowerCase().includes(needle))
    && (minCgpa === 0 || (r.student.cgpa ?? 0) >= minCgpa)
    && (schools.length === 0 || schools.includes(r.student.school))
    && (years.length === 0 || (r.student.year_of_study != null && years.includes(r.student.year_of_study)))
    && (!prereqOnly || r.meets_prerequisites));
  const sortBy = sort === SORTS.ai && !scores ? undefined : sort;
  const pool = [...filtered].sort(
    sortBy === SORTS.cgpa ? (a, b) => (b.student.cgpa ?? 0) - (a.student.cgpa ?? 0)
      : sortBy === SORTS.ai ? (a, b) => (scores!.get(b.application_id)?.score ?? -1) - (scores!.get(a.application_id)?.score ?? -1)
      : sortBy === SORTS.name ? (a, b) => a.student.name.localeCompare(b.student.name)
      // Recommended: the REQ-VRANK-1 order, prerequisites met first, then highest CGPA (same as the API's top-10 flag)
      : (a, b) => Number(!a.meets_prerequisites) - Number(!b.meets_prerequisites) || (b.student.cgpa ?? 0) - (a.student.cgpa ?? 0));
  const filtering = !!needle || minCgpa > 0 || schools.length > 0 || years.length > 0 || prereqOnly;
  const clearAll = () => { setQ(""); setMinCgpa(0); setSchools([]); setYears([]); setPrereqOnly(false); };

  async function runAiMatch() {
    setMatching(true);
    try { setAi({ listing: id, scores: new Map((await call((api) => api.aiMatch(id))).map((s) => [s.application_id, s])) }); setSort(SORTS.ai); setError(null); }
    catch (e) { setError(e as ApiError); }
    finally { setMatching(false); }
  }

  async function save(next: string[]) {
    try { ranking.setData(await call((api) => api.putRanking(id, next))); setSubmitted(true); setError(null); } catch (e) { setError(e as ApiError); }
  }
  const add = (aid: string) => save([...ids, aid]);
  const remove = (aid: string) => save(ids.filter((x) => x !== aid));
  const move = (aid: string, dir: -1 | 1) => { const n = [...ids]; const i = n.indexOf(aid); const j = i + dir; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; save(n); };

  return (
    <>
      <PageHeader title="Applicants and ranking" back={{ href: "/projects", label: "Back to my projects" }} description={listing.data?.title ?? ""}
        right={me && <DeadlineChip>{me.phase.label}</DeadlineChip>} />
      {!canRank && <div className="mb-4"><Banner tone="warn" title="Ranking is closed for this round.">{me?.phase.label}</Banner></div>}
      {canRank && unrankedAll.length > 0 && <div className="mb-4"><Banner tone="warn" title={`${unrankedAll.length} ${unrankedAll.length === 1 ? "applicant is" : "applicants are"} not ranked yet.`}>Students you do not rank cannot be matched to this project. Rank them before the deadline: {me?.phase.label}.</Banner></div>}
      {error && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
        <div className="bg-surface border border-border rounded-card">{/* not overflow-hidden: menus and tooltips reach past the card */}
          <div className="flex items-center gap-2 px-[18px] pt-4 pb-3">
            <h2>Applicants</h2><span className="text-[12.5px] text-muted font-semibold">{unrankedAll.length} not ranked</span>
            <Button size="sm" variant="soft" className="ml-auto" disabled={matching || !all.length} onClick={runAiMatch}>
              <I.Bulb size={14} /> {matching ? "Scoring..." : scores ? "Rerun AI match" : "AI match"}
            </Button>
          </div>

          {/* Toolbar. Row 1: name search (same look as Browse). Row 2: filters. Sort sits with the count below. */}
          <div className="px-[18px] flex flex-col gap-2.5">
            <label className="relative flex items-center rounded-pill bg-surface ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] focus-within:ring-accent/40 transition-shadow">
              <span className="absolute left-4 text-faint pointer-events-none"><I.Search size={15} /></span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search applicants by name"
                className="w-full h-11 pl-10 pr-4 rounded-pill bg-transparent text-[14px] outline-none placeholder:text-faint" />
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <FilterRange size="sm" label="CGPA" title="Minimum CGPA" align="left" value={minCgpa} onChange={setMinCgpa} min={0} max={5} step={0.05} format={cgpaLabel} />
              <FilterMultiSelect size="sm" label="School" align="left" value={schools} options={schoolOptions} onChange={setSchools} countLabel={(n) => `${n} schools`} />
              <FilterMultiSelect size="sm" label="Year" align="left" value={years.map(yearLabel)} options={yearOptions.map(yearLabel)} countLabel={(n) => `${n} years`}
                onChange={(v) => setYears(yearOptions.filter((y) => v.includes(yearLabel(y))))} />
              <button type="button" aria-pressed={prereqOnly} onClick={() => setPrereqOnly(!prereqOnly)}
                className={`inline-flex items-center gap-1.5 h-9 rounded-pill px-3.5 text-[13px] whitespace-nowrap transition-colors ${prereqOnly
                  ? "bg-accent-soft text-accent-ink font-medium shadow-[inset_0_0_0_1px_var(--accent-border)]"
                  : "bg-surface text-text shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-neutral-soft"}`}>
                {prereqOnly && <I.Tick size={14} />}Meets prerequisites
              </button>
            </div>
          </div>

          {filtering && (
            <div className="flex items-center gap-1.5 flex-wrap px-[18px] pt-3">
              {needle && <FilterPill onRemove={() => setQ("")}>Name: “{q.trim()}”</FilterPill>}
              {minCgpa > 0 && <FilterPill onRemove={() => setMinCgpa(0)}>CGPA {cgpaLabel(minCgpa)}</FilterPill>}
              {schools.map((s) => <FilterPill key={s} onRemove={() => setSchools(schools.filter((x) => x !== s))}>School: {s}</FilterPill>)}
              {years.map((y) => <FilterPill key={y} onRemove={() => setYears(years.filter((x) => x !== y))}>{yearLabel(y)}</FilterPill>)}
              {prereqOnly && <FilterPill onRemove={() => setPrereqOnly(false)}>Meets prerequisites</FilterPill>}
              <Button variant="text" size="sm" onClick={clearAll}>Clear all</Button>
            </div>
          )}

          <div className="flex items-center gap-3 px-[18px] pt-3 pb-1">
            <span className="text-[12.5px] text-muted">Showing <span className="font-semibold text-text tabular">{pool.length}</span> of <span className="tabular">{unrankedAll.length}</span> applicants</span>
            <span className="ml-auto">
              <FilterSelect size="sm" label="Sort" value={sortBy} anyLabel="Recommended" options={[SORTS.cgpa, ...(scores ? [SORTS.ai] : []), SORTS.name]} onChange={setSort} />
            </span>
          </div>
          {scores && <div className="px-[18px] pb-1 text-[11.5px] text-faint">
            {scoredLocally === scores.size ? "Scored locally from prerequisites, shared interests and CGPA."
              : scoredLocally > 0 ? `Scored by Gemini (${scoredLocally} scored locally).` : "Scored by Gemini."} Hover a score for the reason. A guide only: read each application before ranking.
          </div>}

          <div className="flex flex-col gap-2 p-3.5">
            {everyone.loading && !everyone.data ? <Loading /> : pool.length === 0 ? (
              all.length === 0 ? <Empty title="No students have applied yet" note="Applicants appear here as students apply during the round." />
                : unrankedAll.length === 0 ? <Empty title="Everyone is ranked" note="All applicants are in your ranking." />
                : <Empty title="No applicants match these filters" note="Try fewer filters."><Button variant="secondary" size="sm" onClick={clearAll}>Clear all</Button></Empty>
            ) : pool.map((a) => {
              const s = scores?.get(a.application_id);
              const gaps = a.meets_prerequisites ? [] : missing(a);
              return (
                <div key={a.application_id}
                  className="flex items-center gap-3 px-3.5 py-3 rounded-row border border-border bg-surface transition-[background-color,border-color,box-shadow] duration-150 hover:bg-sunken hover:border-border-strong hover:shadow-[var(--shadow-card)]">
                  <Avatar name={a.student.name} size={34} tone="auto" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setDetail(a)}
                        className="text-[14px] font-semibold truncate text-left rounded-[6px] hover:text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/50">{a.student.name}</button>
                      {!a.meets_prerequisites && (
                        <Tip text={gaps.length ? `Missing prerequisite: ${gaps.join(", ")}` : "Missing a prerequisite"}>
                          <span className="text-warn inline-flex p-0.5" aria-label="Missing prerequisite"><I.Warn size={13} /></span>
                        </Tip>
                      )}
                    </div>
                    <div className="text-[12px] text-muted mt-0.5">{a.student.school} · Year {a.student.year_of_study}</div>
                  </div>
                  <CgpaPill cgpa={a.student.cgpa} />
                  {s && (
                    <Tip align="right" text={<><span className="block">{s.reason}</span><span className="block mt-0.5 text-white/60">{s.source === "ai" ? "Gemini" : "Local formula"}</span></>}>
                      <ScoreRing score={s.score} />
                    </Tip>
                  )}
                  <Button size="sm" variant="soft" disabled={!canRank} onClick={() => add(a.application_id)}><I.Plus size={12} /> Add</Button>
                </div>
              );
            })}
          </div>
          <div className="px-[18px] pb-3.5 text-[11.5px] text-faint">Click a name to read the full application and transcript.</div>
        </div>

        <div className="bg-surface border border-accent-border rounded-card overflow-hidden">
          <div className="px-[18px] pt-4 pb-3 border-b border-border">
            <div className="flex items-center gap-2"><h2>Your ranking</h2><Pill tone={ranked.length ? "accent" : "neutral"}>{ranked.length} ranked</Pill></div>
            <div className="text-[12px] text-faint mt-0.5">Best first. Only ranked applicants can be matched to this project.</div>
          </div>
          <div className="flex flex-col gap-2 p-3.5">
            {ranked.length === 0 && (
              <div className="flex flex-col items-center text-center gap-2 border-[1.5px] border-dashed border-border-strong rounded-row px-6 py-8">
                <span className="w-11 h-11 rounded-full bg-accent-soft text-accent flex items-center justify-center"><I.Layers size={20} /></span>
                <div className="text-[14px] font-semibold mt-1">No one ranked yet</div>
                <div className="text-[12.5px] text-muted max-w-[280px] leading-[1.5]">Click <span className="font-semibold text-accent-ink">Add</span> on an applicant to rank them. Put your best fit first; use the arrows to reorder.</div>
              </div>
            )}
            {ranked.map((a, i) => (
              <div key={a.application_id} className="flex items-center gap-2.5 h-[52px] pl-2.5 pr-2 border border-accent-border rounded-row">
                <RankBadge n={i + 1} />
                <Avatar name={a.student.name} size={28} tone="auto" />
                <button type="button" onClick={() => setDetail(a)} className="flex-1 min-w-0 text-left">
                  <div className="text-[13.5px] font-semibold truncate">{a.student.name}</div>
                  <div className="text-[11.5px] text-muted">{a.student.school} · Year {a.student.year_of_study}</div>
                </button>
                <span className="mr-1"><CgpaPill cgpa={a.student.cgpa} /></span>
                <IconButton disabled={!canRank || i === 0} onClick={() => move(a.application_id, -1)}><I.ArrowUp /></IconButton>
                <IconButton disabled={!canRank || i === ranked.length - 1} onClick={() => move(a.application_id, 1)}><I.ArrowDown /></IconButton>
                <IconButton disabled={!canRank} onClick={() => remove(a.application_id)}><I.X /></IconButton>
              </div>
            ))}
          </div>
          <div className="px-3.5 pb-3.5 pt-3 border-t border-border">
            {submitted ? <div className="flex items-center gap-1.5 text-[12px] font-semibold text-good-ink"><I.CheckCircle size={14} /> Saved · you can change it until the review window closes</div>
              : <div className="text-[12px] text-muted">Changes save automatically until the review window closes.</div>}
          </div>
        </div>
      </div>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title="Application"
        footer={detail && (ids.includes(detail.application_id)
          ? <Button variant="secondary" disabled={!canRank} onClick={() => { remove(detail.application_id); setDetail(null); }}>Remove from ranking</Button>
          : <Button disabled={!canRank} onClick={() => { add(detail.application_id); setDetail(null); }}>Add to ranking</Button>)}>
        {detail && (
          <>
            <div className="flex items-center gap-3.5">
              <Avatar name={detail.student.name} size={48} tone="navy" />
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
    </>
  );
}
