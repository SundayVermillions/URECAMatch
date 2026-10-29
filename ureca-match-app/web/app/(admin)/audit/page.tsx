"use client";
/** MaintainAuditLog (4.7). REQ-AUDIT-1..3. Screen: AuditOverridesPage. Read only: a table like a spreadsheet, with a sticky header,
 *  gridlines, a row number and a sortable "When" column. */
import { useState } from "react";
import { PageTitle } from "@/components/shell/app-shell";
import { I } from "@/components/shell/icons";
import { Avatar, Card, Empty, FilterSelect, Input, Pill, Skeleton, fmtDateTime } from "@/components/ui";
import type { AuditOperation } from "@/lib/api/models";
import { useApi } from "@/lib/use-api";

const LABEL: Record<AuditOperation, string> = { matching_executed: "Matching run", manual_reassignment: "Manual reassignment", results_published: "Results published", user_updated: "User updated", user_deactivated: "User deactivated", cycle_updated: "Cycle updated" };

const COLS = "grid-cols-[48px_170px_200px_1fr_180px]";
const CELL = "px-4 border-r border-border last:border-r-0";

export default function Audit() {
  const [op, setOp] = useState<AuditOperation | undefined>();
  const [q, setQ] = useState("");
  const [newest, setNewest] = useState(true);
  const { data, loading } = useApi((api) => api.auditLog(), []);
  const text = (e: NonNullable<typeof data>[number]) => [(e.affected_labels?.length ? e.affected_labels : e.affected_records).join(" "), e.note ?? "", e.actor_name].join(" ").toLowerCase();
  const rows = [...(data ?? [])]
    .filter((e) => (!op || e.operation === op) && (!q.trim() || text(e).includes(q.trim().toLowerCase())))
    .sort((a, b) => (newest ? -1 : 1) * (Date.parse(a.timestamp) - Date.parse(b.timestamp)));
  return (
    <>
      <PageTitle title="Audit and overrides" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-64"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"><I.Search size={16} /></span><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names and notes" aria-label="Search the audit log" className="w-full pl-9" /></div>
        <FilterSelect label="Operation" value={op ? LABEL[op] : undefined} options={Object.values(LABEL)} anyLabel="All" align="left"
          onChange={(v) => setOp(v ? (Object.keys(LABEL) as AuditOperation[]).find((k) => LABEL[k] === v) : undefined)} />
        {data && <span className="ml-auto text-[12.5px] tabular text-faint">{rows.length} {rows.length === 1 ? "entry" : "entries"}</span>}
      </div>

      {loading && !data ? (
        <Card padded={false} className="overflow-hidden">
          <div aria-busy="true" aria-label="Loading the audit log" className="divide-y divide-border">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-4 px-5 py-3.5"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-5 w-32 !rounded-full" /><Skeleton className="h-3.5 flex-1" /></div>)}
          </div>
        </Card>
      ) : rows.length === 0 ? <Empty icon={<I.Shield size={20} />} title="No entries" note={op || q ? "Nothing matches this search." : undefined} /> : (
        <Card padded={false} className="overflow-clip">
          <div role="table" aria-label="Audit log" className="text-[13px]">
            <div role="row" className={`sticky top-0 z-10 grid ${COLS} items-center border-b border-border-strong/70 bg-[#f4f7fc] text-[12px] font-semibold text-muted`}>
              <span role="columnheader" className={`${CELL} py-2.5 text-center text-faint`}>#</span>
              <span role="columnheader" className={`${CELL} py-0`}>
                <button type="button" onClick={() => setNewest((v) => !v)} aria-label={`Sort by date, ${newest ? "newest first" : "oldest first"}`}
                  className="-mx-1 inline-flex items-center gap-1 rounded-md px-1 py-2.5 transition-colors hover:text-text">
                  When {newest ? <I.ArrowDown size={13} /> : <I.ArrowUp size={13} />}
                </button>
              </span>
              <span role="columnheader" className={`${CELL} py-2.5`}>Operation</span>
              <span role="columnheader" className={`${CELL} py-2.5`}>Detail</span>
              <span role="columnheader" className={`${CELL} py-2.5`}>By</span>
            </div>
            {rows.map((e, i) => (
              <div key={e.id} role="row" className={`grid ${COLS} items-stretch border-b border-border last:border-b-0 transition-colors hover:bg-accent-soft/40 ${i % 2 ? "bg-[#f8fafd]/70" : ""}`}>
                <span role="cell" className={`${CELL} flex items-center justify-center py-3 text-[12px] tabular text-faint`}>{i + 1}</span>
                <span role="cell" className={`${CELL} flex items-center py-3 tabular text-muted`}>{fmtDateTime(e.timestamp)}</span>
                <span role="cell" className={`${CELL} flex items-center py-3`}>
                  <Pill tone={e.operation === "manual_reassignment" ? "warn" : e.operation === "user_deactivated" ? "bad" : "accent"}>{LABEL[e.operation]}</Pill>
                </span>
                <span role="cell" className={`${CELL} flex flex-col justify-center py-3 leading-[1.45]`}>
                  {/* Names to read; the record ids stay available on hover for tracing. */}
                  <span className="font-medium text-text" title={e.affected_records.join(", ")}>{(e.affected_labels?.length ? e.affected_labels : e.affected_records).join(", ")}</span>
                  {e.note && <span className="text-muted">{e.note}</span>}
                </span>
                {/* REQ-AUDIT-3: the scheduler's own actions are shown apart from people's */}
                <span role="cell" className={`${CELL} flex items-center py-3`}>
                  {e.actor_id === "system"
                    ? <span className="inline-flex items-center gap-1.5 rounded-pill bg-neutral-soft px-2.5 py-0.5 text-[12px] font-medium text-muted"><I.Gear size={12} />System</span>
                    : <span className="inline-flex items-center gap-2 font-medium"><Avatar name={e.actor_name} size={22} tone="auto" />{e.actor_name}</span>}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <p className="mt-4 px-1 text-[12px] text-faint">Append-only. Every matching run and manual reassignment is recorded with who did it and when. System marks what ran on its own when a window closed.</p>
    </>
  );
}
