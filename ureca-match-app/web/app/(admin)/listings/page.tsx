"use client";
/** Admin view of every project listing and where it stands. Read only: nothing here edits, closes or applies to a project.
 *  Each project is Open, Full, Draft or Closed; students only ever see the published ones. */
import Link from "next/link";
import { useState } from "react";
import { PageTitle } from "@/components/shell/app-shell";
import { I } from "@/components/shell/icons";
import { Button, Card, Empty, FilterSelect, Input, Pill, Skeleton } from "@/components/ui";
import type { Listing } from "@/lib/api/models";
import { useApi } from "@/lib/use-api";

const PAGE = 12; // rows shown before "Show more"
const COLUMNS = "grid-cols-[minmax(0,1fr)_170px_70px_90px_100px_90px]";
type State = "Open" | "Full" | "Draft" | "Closed";
const STATES: State[] = ["Open", "Full", "Draft", "Closed"];
const TONE = { Open: "good", Full: "warn", Draft: "neutral", Closed: "neutral" } as const;
/** Published projects are Open while a slot is free, and Full once every slot is taken. */
const stateOf = (l: Listing): State => (l.status === "draft" ? "Draft" : l.status === "closed" ? "Closed" : l.available_slots - l.filled_slots > 0 ? "Open" : "Full");

export default function AdminListings() {
  const [q, setQ] = useState("");
  const [school, setSchool] = useState<string | undefined>();
  const [supervisor, setSupervisor] = useState<string | undefined>();
  const [state, setState] = useState<State | undefined>();
  const [limit, setLimit] = useState(PAGE);
  const { data, loading } = useApi((api) => api.adminListings(), []);
  const all = data ?? [];
  const schools = [...new Set(all.map((l) => l.offering_faculty))].sort();
  const supervisors = [...new Set(all.map((l) => l.supervisor_name))].sort();
  const needle = q.trim().toLowerCase();
  const rows = all.filter((l) =>
    (!needle || [l.title, l.supervisor_name, ...l.topic_tags].join(" ").toLowerCase().includes(needle)) &&
    (!school || l.offering_faculty === school) && (!supervisor || l.supervisor_name === supervisor) && (!state || stateOf(l) === state));
  const reset = (fn: () => void) => { fn(); setLimit(PAGE); };

  return (
    <>
      <PageTitle title="Project Status" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"><I.Search size={16} /></span>
          <Input id="q" value={q} onChange={(e) => reset(() => setQ(e.target.value))} placeholder="Search projects, supervisors or topics" className="!pl-9" />
        </div>
        <FilterSelect label="School" value={school} options={schools} align="left" onChange={(v) => reset(() => setSchool(v))} />
        <FilterSelect label="Supervisor" value={supervisor} options={supervisors} align="left" onChange={(v) => reset(() => setSupervisor(v))} />
        <FilterSelect label="Status" value={state} options={STATES} align="left" onChange={(v) => reset(() => setState(v as State | undefined))} />
        {data && <span className="ml-auto text-[12.5px] tabular text-faint">{rows.length} {rows.length === 1 ? "project" : "projects"}</span>}
      </div>

      {loading && !data ? (
        <Card padded={false} className="overflow-hidden">
          <div aria-busy="true" aria-label="Loading projects" className="divide-y divide-border">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-3 px-5 py-3.5"><Skeleton className="h-12 w-16 !rounded-[10px]" /><div className="flex flex-1 flex-col gap-2"><Skeleton className="h-3.5 w-64" /><Skeleton className="h-3 w-40" /></div></div>)}
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <Empty icon={<I.Folder size={20} />} title="No projects to show" note={needle || school || supervisor || state ? "Try another search or clear a filter." : "Projects appear here once supervisors create them."} />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className={`grid ${COLUMNS} gap-3 border-b border-border px-5 py-3 text-[12px] font-medium text-faint`}>
            <span>Project</span><span>Supervisor</span><span>School</span><span>Slots filled</span><span>Applicants</span><span>Status</span>
          </div>
          <ul className="divide-y divide-border">
            {rows.slice(0, limit).map((l) => (
              <li key={l.id} className={`grid ${COLUMNS} items-center gap-3 px-5 py-3 transition-colors hover:bg-accent-soft/30`}>
                <Link href={`/listings/${l.id}`} className="flex min-w-0 items-center gap-3 !text-text">
                  {l.cover_url
                    ? <img src={l.cover_url} alt="" className="h-[48px] w-[68px] shrink-0 rounded-[10px] object-cover" />
                    : <span className="grid h-[48px] w-[68px] shrink-0 place-items-center rounded-[10px] bg-neutral-soft text-faint"><I.Folder size={18} /></span>}
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold tracking-[-0.01em]">{l.title}</span>
                    {l.topic_tags.length > 0 && <span className="block truncate text-[12.5px] text-muted">{l.topic_tags.join(" · ")}</span>}
                  </span>
                </Link>
                <span className="truncate text-[13px]">{l.supervisor_name}</span>
                <span className="text-[13px] text-muted">{l.offering_faculty}</span>
                <span className="text-[13px] tabular">{l.filled_slots} of {l.available_slots}</span>
                <span className="text-[13px] tabular text-muted">{l.applicant_count ?? 0}</span>
                <span><Pill tone={TONE[stateOf(l)]}>{stateOf(l)}</Pill></span>
              </li>
            ))}
          </ul>
          {rows.length > limit && (
            <div className="flex items-center justify-between border-t border-border bg-white/40 px-5 py-3">
              <span className="text-[12.5px] tabular text-faint">Showing {limit} of {rows.length}</span>
              <Button size="sm" variant="soft" onClick={() => setLimit((n) => n + PAGE)}>Show more</Button>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
