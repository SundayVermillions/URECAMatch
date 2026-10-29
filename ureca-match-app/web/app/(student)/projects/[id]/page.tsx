"use client";
/** Project detail. Screen: ProjectDetailPage. REQ-BROWSE-1..3 (read-only view before applying).
 *  Optional details (tasks, skills, hours, mode, photos, video) show only when the supervisor filled them in.
 *  One status in the side card, in priority order: applied, applications closed, full, not eligible, else Apply. */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { titleCase } from "@/components/pickers";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { ApplicantStack, Avatar, Banner, Button, Card, LISTING_MODES, Loading, Pill, isHighDemand } from "@/components/ui";
import type { Listing, Me } from "@/lib/api/models";
import { useApi } from "@/lib/use-api";
import { type Standing, useStanding } from "@/lib/use-standing";
import { embedUrl } from "@/lib/video";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const standing = useStanding();
  const { data: l, loading, error } = useApi((api) => api.listing(id), [id]);
  const prereqKey = l?.prerequisites.join(",") ?? "";
  const courses = useApi((api) => api.coursesByCode(prereqKey ? prereqKey.split(",") : []), [prereqKey]);
  if (loading && !l) return <Loading />;
  if (error || !l) return <Banner tone="bad">{error?.message ?? "Project not found."}</Banner>;

  const open = Math.max(l.available_slots - l.filled_slots, 0);
  const hot = isHighDemand(l.applicant_count ?? 0, open);
  const modules = me?.student?.completed_modules ?? [];
  const missing = l.prerequisites.filter((p) => !modules.includes(p));
  const title = (code: string) => { const c = courses.data?.find((x) => x.code === code); return c ? titleCase(c.title) : null; };
  const tasks = (l.outcomes ?? "").split("\n").map((t) => t.replace(/^\s*[-•*\d.)]+\s*/, "").trim()).filter(Boolean); // one per line; list markers dropped
  const skills = (l.skills ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const player = l.video_url ? embedUrl(l.video_url) : null;
  const facts: [string, string][] = [
    ...(l.hours_per_week ? [["Time", `About ${l.hours_per_week} hours a week`] as [string, string]] : []),
    ...(l.mode ? [["Mode", LISTING_MODES[l.mode]] as [string, string]] : []),
    ...(l.research_location ? [["Location", l.research_location] as [string, string]] : []),
    ["School", l.offering_faculty],
    ["Slots", `${l.available_slots} student${l.available_slots === 1 ? "" : "s"}`],
  ];

  return (
    <>
      <Link href="/browse" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-accent mb-5 hover:text-accent-ink">
        <I.ChevronLeft /> Back to projects
      </Link>

      {/* Band 1: hero. Image and information share one card and one height. */}
      <Card padded={false} className="overflow-hidden grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="relative min-h-[300px] bg-gradient-to-br from-[#e8f1fd] via-[#f1f5fb] to-[#dfeafa]">
          {l.cover_url && <img src={l.cover_url} alt="" className="w-full h-full object-cover" />}
          <div aria-hidden className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#0b1f3a]/25 via-transparent to-transparent" />
        </div>
        <div className="p-8 flex flex-col min-w-0">
          <div className="text-[13px] text-faint">
            {[l.offering_faculty, l.research_location].filter(Boolean).join(" · ")}
            {hot && <span title="High demand: more than 5 students for each open slot" className="ml-2 inline-flex items-center gap-1 align-middle rounded-pill bg-gradient-to-b from-[#fff3dd] to-[#ffe7c2] text-[#a14a00] px-2.5 py-0.5 text-[11.5px] font-semibold shadow-[inset_0_0_0_1px_rgba(214,130,20,0.25)]"><I.Flame size={13} /> Popular</span>}
          </div>
          <h1 className="mt-1.5 text-[28px] leading-[1.18]">{l.title}</h1>
          <div className="flex items-center gap-2.5 mt-4">
            <Avatar name={l.supervisor_name} size={32} />
            <div>
              <div className="text-[14px] font-semibold text-text">{l.supervisor_name}</div>
              {l.supervisor_email && (
                <div className="text-[12.5px] text-accent">
                  <a href={`mailto:${l.supervisor_email}`} className="hover:underline">
                    {l.supervisor_email}
                  </a>
                </div>
              )}
            </div>
          </div>
          {l.topic_tags.length > 0 && <div className="text-[14px] text-muted mt-3">{l.topic_tags.join(" · ")}</div>}

          <div className="mt-auto pt-6">
            <div className="border-t border-border pt-5 flex items-center gap-6">
              <span className="text-[14px] whitespace-nowrap">
                {open > 0 ? <><span className="font-semibold text-text tabular">{open}</span><span className="text-muted"> of {l.available_slots} slots open</span></> : <span className="text-faint">No slots left</span>}
              </span>
              <ApplicantStack count={l.applicant_count ?? 0} />
              <div className="ml-auto shrink-0"><Action l={l} open={open} me={me} standing={standing} /></div>
            </div>
          </div>
        </div>
      </Card>

      {/* Band 2: details. Main column for what the project is; side column for what a student needs to know. */}
      <div className="grid grid-cols-3 gap-6 mt-6 items-start">
        <div className="col-span-2 flex flex-col gap-6 min-w-0">
          <Card>
            <h2 className="text-[16px]">About this project</h2>
            <p className="text-[15px] leading-[1.7] text-text mt-3 whitespace-pre-line">{l.description}</p>
          </Card>
          {(tasks.length > 0 || skills.length > 0) && (
            <Card>
              {tasks.length > 0 && <>
                <h2 className="text-[16px]">What you will do</h2>
                <ol className="mt-3 flex flex-col gap-2.5">
                  {tasks.map((t, i) => (
                    <li key={i} className="flex items-start gap-3 text-[15px] leading-[1.55]">
                      <span className="mt-0.5 w-5 h-5 rounded-full bg-accent-soft text-accent-ink text-[11.5px] font-semibold inline-flex items-center justify-center shrink-0 tabular">{i + 1}</span>
                      {t}
                    </li>
                  ))}
                </ol>
              </>}
              {skills.length > 0 && <>
                <h3 className={`text-[14px] font-semibold ${tasks.length ? "mt-6" : ""}`}>Skills you will gain</h3>
                <div className="flex flex-wrap gap-1.5 mt-2.5">{skills.map((s) => <Pill key={s} className="!text-[13px] !px-3 !py-1">{s}</Pill>)}</div>
              </>}
            </Card>
          )}
          {(l.gallery_urls?.length ?? 0) > 0 && <Gallery urls={l.gallery_urls ?? []} />}
          {player && (
            <Card>
              <h2 className="text-[16px]">Video</h2>
              <iframe src={player} title={`Video about ${l.title}`} className="mt-3 w-full aspect-video block rounded-row bg-neutral-soft" loading="lazy"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-6 min-w-0">
          <Card>
            <h2 className="text-[16px]">At a glance</h2>
            <dl className="mt-3 flex flex-col gap-2.5 text-[14px]">
              {facts.map(([k, v]) => (
                <div key={k} className="flex items-baseline gap-3"><dt className="text-muted w-[110px] shrink-0">{k}</dt><dd className="text-text font-semibold min-w-0">{v}</dd></div>
              ))}
            </dl>
          </Card>
        <Card>
          <h2 className="text-[16px] flex items-baseline gap-2">Prerequisites{l.prerequisites.length > 0 && <span className="text-[12.5px] font-medium text-muted tabular">{l.prerequisites.length - missing.length} of {l.prerequisites.length} met</span>}</h2>
          {l.prerequisites.length === 0 ? (
            <div className="text-[14px] text-muted mt-3">None. Open to all students.</div>
          ) : (
            <>
              <ul className="mt-3 flex flex-col gap-2.5">
                {l.prerequisites.map((p) => {
                  const has = modules.includes(p);
                  return (
                    <li key={p} className="flex items-start gap-2.5 text-[14px]">
                      <span className={`mt-px w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0 ${has ? "bg-good-soft text-good" : "bg-warn-soft text-warn-ink"}`}>
                        {has ? <I.Tick size={12} /> : <I.X size={11} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-text leading-[1.35]">{title(p) ?? p}</span>
                        {title(p) && <span className="block text-[12.5px] text-faint tabular">{p}</span>}
                      </span>
                      <span className={`ml-auto shrink-0 text-[12.5px] ${has ? "text-muted" : "rounded-pill bg-warn-soft text-warn-ink font-semibold px-2 py-0.5"}`}>{has ? "Completed" : "Missing"}</span>
                    </li>
                  );
                })}
              </ul>
              {missing.length > 0 && !l.applied && (
                <div className="text-[13px] text-muted mt-4 leading-[1.5]">You can still apply. The supervisor will see the missing module{missing.length > 1 ? "s" : ""}.</div>
              )}
            </>
          )}
        </Card>
        </div>
      </div>
    </>
  );
}

type Credit = { title: string; author: string; license: string; source: string };

/** Up to 4 photos in a row; one opens full size, with ← and → to move and Esc to close. */
function Gallery({ urls }: { urls: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  // Seeded demo photos come from Wikimedia Commons; their licences ask for the author and licence to be shown.
  const [credits, setCredits] = useState<Record<string, Credit>>({});
  useEffect(() => { fetch("/gallery/credits.json").then((r) => (r.ok ? r.json() : {})).then(setCredits).catch(() => {}); }, []);
  const credit = open !== null ? credits[urls[open]] : undefined;
  useEffect(() => {
    if (open === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % urls.length));
      else if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + urls.length) % urls.length));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, urls.length]);
  return (
    <Card>
      <h2 className="text-[16px]">Photos</h2>
      <div className={`grid gap-3 mt-3 ${urls.length === 1 ? "grid-cols-1" : urls.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {urls.map((u, i) => (
          <button key={u} type="button" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} of ${urls.length}`}
            className={`relative aspect-[4/3] rounded-row overflow-hidden bg-neutral-soft focus-visible:ring-4 focus-visible:ring-accent/30 ${urls.length === 4 && i === 0 ? "col-span-3 aspect-[16/7]" : ""}`}>
            <img src={u} alt="" className="w-full h-full object-cover transition-transform duration-300 hover:scale-[1.03]" />
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-10" onClick={() => setOpen(null)} role="dialog" aria-label={`Photo ${open + 1} of ${urls.length}`}>
          <img src={urls[open]} alt="" className="max-w-full max-h-full rounded-card shadow-[var(--shadow-float)]" onClick={(e) => e.stopPropagation()} />
          <button type="button" aria-label="Close" className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/15 text-white inline-flex items-center justify-center hover:bg-white/25"><I.X size={16} /></button>
          <div className="absolute bottom-5 inset-x-0 flex flex-col items-center gap-1 text-white/80 text-[13px] px-6 text-center" onClick={(e) => e.stopPropagation()}>
            {credit && (
              <a href={credit.source} target="_blank" rel="noreferrer" className="!text-white/80 hover:!text-white underline-offset-2 hover:underline">
                {credit.title} · {credit.author} · {credit.license} · Wikimedia Commons
              </a>
            )}
            {urls.length > 1 && <span className="tabular text-white/60">{open + 1} / {urls.length} · use ← → to browse</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

/** The one action or status for this student, in priority order: applied, closed, full, not eligible, else Apply. */
function Action({ l, open, me, standing }: { l: Listing; open: number; me: Me | null; standing: Standing }) {
  const windowOpen = me?.phase.window === "application";
  if (standing.placedIn) return <Muted title={standing.reason}>Ineligible</Muted>; // view only: one project per cycle
  if (standing.loading) return <Muted>Checking…</Muted>;
  const eligible = !standing.viewOnly;
  if (l.applied) return (
    <Link href="/my-applications" title="Change your ranking in My applications"
      className="inline-flex items-center gap-2 h-10 pl-4 pr-1.5 rounded-pill bg-good-soft text-good-ink text-[14px] font-semibold shadow-[inset_0_0_0_1px_rgba(26,116,49,0.15)] hover:brightness-95">
      Applied
      {l.applied_rank != null ? <span title={`Your preference number ${l.applied_rank}`} className="min-w-[26px] h-[26px] px-1.5 rounded-full bg-good text-white text-[12px] font-semibold tabular grid place-items-center">{l.applied_rank}</span> : <span className="w-[26px] h-[26px] rounded-full bg-good text-white grid place-items-center"><I.Tick size={13} /></span>}
    </Link>
  );
  if (!windowOpen) return <Muted>{me?.phase.label ?? "Applications closed"}</Muted>;
  if (open === 0) return <Muted>Fully allocated</Muted>;
  if (!eligible) return <Muted title={standing.reason}>Ineligible</Muted>;
  return <Link href={`/apply/${l.id}`}><Button size="lg" className="rounded-pill px-6">Apply</Button></Link>;
}

function Muted({ children, title }: { children: React.ReactNode; title?: string }) {
  return <span title={title} className="inline-flex items-center h-10 px-4 rounded-pill bg-neutral-soft text-[13.5px] text-muted">{children}</span>;
}
