"use client";
/** Project detail. Screen: ProjectDetailPage. REQ-BROWSE-1..3 (read-only view before applying).
 *  One status in the side card, in priority order: applied, applications closed, full, not eligible, else Apply. */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { ApplicantStack, Avatar, Banner, Button, Card, Loading, isHighDemand } from "@/components/ui";
import type { Listing, Me } from "@/lib/api/models";
import { useApi } from "@/lib/use-api";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const { data: l, loading, error } = useApi((api) => api.listing(id), [id]);
  if (loading && !l) return <Loading />;
  if (error || !l) return <Banner tone="bad">{error?.message ?? "Project not found."}</Banner>;

  const open = Math.max(l.available_slots - l.filled_slots, 0);
  const hot = isHighDemand(l.applicant_count ?? 0, open);
  const modules = me?.student?.completed_modules ?? [];
  const missing = l.prerequisites.filter((p) => !modules.includes(p));

  return (
    <>
      <Link href="/browse" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-accent mb-5 hover:text-accent-ink">
        <I.ChevronLeft /> Back to projects
      </Link>

      {/* Band 1: hero. Image and information share one card and one height. */}
      <Card padded={false} className="overflow-hidden grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-h-[300px] bg-gradient-to-br from-[#eef2ff] via-[#f5f5f7] to-[#eafaf4]">
          {l.cover_url && <img src={l.cover_url} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="p-8 flex flex-col min-w-0">
          <div className="text-[13px] text-faint">
            {[l.offering_faculty, l.research_location].filter(Boolean).join(" · ")}
            {hot && <> · <span className="text-warn-ink font-medium">High demand</span></>}
          </div>
          <h1 className="mt-1.5 text-[28px] leading-[1.18]">{l.title}</h1>
          <div className="flex items-center gap-2.5 mt-4">
            <Avatar name={l.supervisor_name} size={30} />
            <span className="text-[14px] font-medium text-text">{l.supervisor_name}</span>
          </div>
          {l.topic_tags.length > 0 && <div className="text-[14px] text-muted mt-3">{l.topic_tags.join(" · ")}</div>}

          <div className="mt-auto pt-6">
            <div className="border-t border-border pt-5 flex items-center gap-6">
              <span className="text-[14px] whitespace-nowrap">
                {open > 0 ? <><span className="font-semibold text-text tabular">{open}</span><span className="text-muted"> of {l.available_slots} slots open</span></> : <span className="text-faint">No slots left</span>}
              </span>
              <ApplicantStack count={l.applicant_count ?? 0} />
              <div className="ml-auto shrink-0"><Action l={l} open={open} me={me} /></div>
            </div>
          </div>
        </div>
      </Card>

      {/* Band 2: details. Two cards stretched to the same height. */}
      <div className="grid grid-cols-3 gap-6 mt-6 items-stretch">
        <Card className="col-span-2">
          <h2 className="text-[16px]">About this project</h2>
          <p className="text-[15px] leading-[1.7] text-text mt-3 whitespace-pre-line">{l.description}</p>
        </Card>
        <Card>
          <h2 className="text-[16px]">Prerequisites</h2>
          {l.prerequisites.length === 0 ? (
            <div className="text-[14px] text-muted mt-3">None. Open to all students.</div>
          ) : (
            <>
              <ul className="mt-3 flex flex-col gap-2.5">
                {l.prerequisites.map((p) => {
                  const has = modules.includes(p);
                  return (
                    <li key={p} className="flex items-center gap-2.5 text-[14px]">
                      <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0 ${has ? "bg-good-soft text-good" : "bg-warn-soft text-warn-ink"}`}>
                        {has ? <I.Tick size={12} /> : <I.X size={11} />}
                      </span>
                      <span className="font-medium text-text tabular">{p}</span>
                      <span className={`ml-auto text-[13px] ${has ? "text-muted" : "text-warn-ink"}`}>{has ? "Completed" : "Missing"}</span>
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
    </>
  );
}

/** The one action or status for this student, in priority order: applied, closed, full, not eligible, else Apply. */
function Action({ l, open, me }: { l: Listing; open: number; me: Me | null }) {
  const windowOpen = me?.phase.window === "application";
  const eligible = me?.student?.eligible_for_matching !== false;
  if (l.applied) return (
    <Link href="/my-applications" title="Change your ranking in My applications"
      className="inline-flex items-center gap-1.5 h-10 px-4 rounded-pill bg-good-soft text-good-ink text-[14px] font-medium hover:brightness-95">
      <I.Tick size={15} /> Applied · preference #{l.applied_rank}
    </Link>
  );
  if (!windowOpen) return <Muted>{me?.phase.label ?? "Applications closed"}</Muted>;
  if (open === 0) return <Muted>Fully allocated</Muted>;
  if (!eligible) return <Muted>Not eligible this cycle</Muted>;
  return <Link href={`/apply/${l.id}`}><Button size="lg" className="rounded-pill px-6">Apply</Button></Link>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center h-10 px-4 rounded-pill bg-neutral-soft text-[13.5px] text-muted">{children}</span>;
}
