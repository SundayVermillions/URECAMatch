"use client";
/** ReviewAndRankStudentApplications (4.16). REQ-VRANK-1..3. Screen: ApplicantAndRankingsPage.
 *  Left: applicants with filters and top-10 recommendation. Right: the ranking. Drawer: full application with PDF viewer. */
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { DocumentViewer } from "@/components/supervisor/document-viewer";
import { Avatar, Banner, Button, Chip, DeadlineChip, Drawer, Empty, FilterSelect, IconButton, Loading, Pill, RankBadge, fmtDate } from "@/components/ui";
import { ApiError, type Applicant, type ApplicantFilters, type ApplicantScore } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

const SCHOOLS = ["CCDS", "EEE", "SBS", "MAE", "SPMS"];
const CGPA_MINS = [4.0, 4.5];
const cgpaLabel = (v: number) => `${v.toFixed(2)}+`;

export default function Applicants() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const call = useCall();
  const [filters, setFilters] = useState<ApplicantFilters>({});
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const listing = useApi((api) => api.listing(id), [id]);
  const rows = useApi((api) => api.applicants(id, filters), [id, JSON.stringify(filters)]);
  const ranking = useApi((api) => api.getRanking(id), [id]);
  const everyone = useApi((api) => api.applicants(id, {}), [id]); // unfiltered, for the unranked warning
  const [detail, setDetail] = useState<Applicant | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [opened, setOpened] = useState<string[]>([]); // documents expanded in the drawer, loaded on first open
  const [ai, setAi] = useState<{ listing: string; scores: Map<string, ApplicantScore> } | null>(null);
  const [matching, setMatching] = useState(false);
  const [sortByScore, setSortByScore] = useState(false);
  const canRank = me?.phase.window === "review" || me?.phase.window === "application";

  const ids = ranking.data?.application_ids ?? [];
  const byId = useMemo(() => new Map((rows.data ?? []).map((r) => [r.application_id, r])), [rows.data]);
  const ranked = ids.map((i) => byId.get(i)).filter(Boolean) as Applicant[];
  // Decision (guide section 10): applicants a supervisor does not rank are never matched.
  const unranked = (everyone.data ?? []).filter((r) => !ids.includes(r.application_id)).length;
  // AI match scores belong to one listing; keyed by it so they vanish when the supervisor opens another project.
  const scores = ai?.listing === id ? ai.scores : null;
  const filteredPool = (rows.data ?? []).filter((r) => !ids.includes(r.application_id) && (!recommendedOnly || r.recommended));
  const pool = scores && sortByScore
    ? [...filteredPool].sort((a, b) => (scores.get(b.application_id)?.score ?? -1) - (scores.get(a.application_id)?.score ?? -1))
    : filteredPool;

  async function runAiMatch() {
    setMatching(true);
    try { setAi({ listing: id, scores: new Map((await call((api) => api.aiMatch(id))).map((s) => [s.application_id, s])) }); setSortByScore(true); setError(null); }
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
      {canRank && unranked > 0 && <div className="mb-4"><Banner tone="warn" title={`${unranked} ${unranked === 1 ? "applicant is" : "applicants are"} not ranked yet.`}>Students you do not rank cannot be matched to this project. Rank them before the deadline: {me?.phase.label}.</Banner></div>}
      {error && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      <div className="grid grid-cols-[1fr_420px] gap-5 items-start">
        <div className="bg-surface border border-border rounded-card">{/* not overflow-hidden: the filter menus drop below the card */}
          <div className="flex items-center gap-2 px-[18px] pt-4 pb-2.5">
            <h2>Applicants</h2><span className="text-[12.5px] text-muted font-semibold">{pool.length} not ranked</span>
            <Button size="sm" variant="soft" className="ml-auto" disabled={matching || !rows.data?.length} onClick={runAiMatch}>
              <I.Bulb size={14} /> {matching ? "Scoring..." : scores ? "Rerun AI match" : "AI match"}
            </Button>
          </div>
          <div className="flex items-center gap-1.5 px-[18px] pb-3 border-b border-border flex-wrap">
            <FilterSelect label="CGPA" align="left" value={filters.min_cgpa != null ? cgpaLabel(filters.min_cgpa) : undefined} options={CGPA_MINS.map(cgpaLabel)}
              onChange={(v) => setFilters({ ...filters, min_cgpa: CGPA_MINS.find((m) => cgpaLabel(m) === v) })} />
            <FilterSelect label="School" align="left" value={filters.school} options={SCHOOLS} onChange={(s) => setFilters({ ...filters, school: s })} />
            <Chip active={!!filters.prerequisites_only} onClick={() => setFilters({ ...filters, prerequisites_only: !filters.prerequisites_only })}>Meets prerequisites</Chip>
            <Chip active={recommendedOnly} onClick={() => setRecommendedOnly(!recommendedOnly)}>Top 10</Chip>
            {scores && <Chip active={sortByScore} onClick={() => setSortByScore(!sortByScore)}>Sort by AI score</Chip>}
          </div>
          {scores && <div className="px-[18px] py-2 border-b border-border text-[11.5px] text-faint">
            {[...scores.values()].some((s) => s.source === "ai") ? "Scored by Gemini." : "Scored locally from prerequisites, shared interests and CGPA."} A guide only: read each application before ranking.
          </div>}
          {rows.loading && !rows.data ? <Loading /> : pool.length === 0 ? (
            <div className="p-4"><Empty title={rows.data?.length ? "Everyone shown is already ranked" : "No students have applied yet"} note={rows.data?.length ? "Clear a filter to see more." : "Applicants appear here as students apply during the round."} /></div>
          ) : pool.map((a) => {
            const s = scores?.get(a.application_id);
            return (
            <div key={a.application_id} className="flex items-center gap-3 px-[18px] py-2.5 border-b border-border last:border-b-0 hover:bg-sunken">
              <Avatar name={a.student.name} />
              <button type="button" onClick={() => setDetail(a)} className="flex-1 min-w-0 text-left">
                <span className="flex items-center gap-2">
                  <span className="text-[13.5px] font-semibold whitespace-nowrap">{a.student.name}</span>
                  {s && <Pill tone={s.score >= 70 ? "good" : s.score >= 40 ? "accent" : "neutral"} className="tabular">{s.score}</Pill>}
                  {!a.meets_prerequisites && <Pill tone="warn"><I.Warn size={10} /> prerequisite</Pill>}
                  {a.recommended && <Pill tone="accent">Top 10</Pill>}
                </span>
                {s && <span title={s.reason} className="block mt-0.5 text-[11.5px] text-muted truncate">{s.reason}</span>}
              </button>
              <span className="w-24 text-[12px] text-muted">{a.student.school} · Year {a.student.year_of_study}</span>
              <span className="w-11 text-right text-[13px] font-bold tabular">{a.student.cgpa?.toFixed(2)}</span>
              <Button size="sm" variant="soft" disabled={!canRank} onClick={() => add(a.application_id)}>Add</Button>
            </div>
            );
          })}
          <div className="px-[18px] py-2.5 text-[11.5px] text-faint">Click a name to read the full application and transcript.</div>
        </div>

        <div className="bg-surface border border-accent-border rounded-card overflow-hidden">
          <div className="px-[18px] pt-4 pb-3 border-b border-border">
            <div className="flex items-center gap-2"><h2>Your ranking</h2><Pill tone={ranked.length ? "accent" : "neutral"}>{ranked.length} ranked</Pill></div>
            <div className="text-[12px] text-faint mt-0.5">Best first. Only ranked applicants can be matched to this project.</div>
          </div>
          <div className="flex flex-col gap-2 p-3.5">
            {ranked.length === 0 && <div className="border-[1.5px] border-dashed border-border-strong rounded-row px-3 py-3.5 text-[12.5px] text-faint">Empty. Add applicants from the list.</div>}
            {ranked.map((a, i) => (
              <div key={a.application_id} className="flex items-center gap-2.5 h-[50px] pl-2.5 pr-2 border border-accent-border rounded-row">
                <RankBadge n={i + 1} />
                <Avatar name={a.student.name} size={28} tone="navy" />
                <button type="button" onClick={() => setDetail(a)} className="flex-1 min-w-0 text-left">
                  <div className="text-[13.5px] font-semibold truncate">{a.student.name}</div>
                  <div className="text-[11.5px] text-muted">{a.student.school} · Year {a.student.year_of_study}</div>
                </button>
                <span className="text-[12.5px] font-bold tabular mr-1">{a.student.cgpa?.toFixed(2)}</span>
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
              <div><div className="font-display text-[18px] font-bold">{detail.student.name}</div><div className="text-[12.5px] text-muted">{detail.student.school} · Year {detail.student.year_of_study} · applied {fmtDate(detail.submitted_at)}</div>
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
