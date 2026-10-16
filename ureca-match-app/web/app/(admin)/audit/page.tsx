"use client";
/** MaintainAuditLog (4.7). REQ-AUDIT-1..2. Screen: AuditOverridesPage. */
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { Chip, Empty, Loading, Pill, fmtDateTime } from "@/components/ui";
import type { AuditOperation } from "@/lib/api/models";
import { useApi } from "@/lib/use-api";

const LABEL: Record<AuditOperation, string> = { matching_executed: "Matching run", manual_reassignment: "Manual reassignment", results_published: "Results published", user_updated: "User updated", user_deactivated: "User deactivated", cycle_updated: "Cycle updated" };

export default function Audit() {
  const [op, setOp] = useState<AuditOperation | undefined>();
  const { data, loading } = useApi((api) => api.auditLog(), []);
  const rows = (data ?? []).filter((e) => !op || e.operation === op);
  return (
    <>
      <PageHeader title="Audit and overrides" description="Append-only. Every matching run and manual reassignment is recorded with who did it and when." />
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        <Chip active={!op} onClick={() => setOp(undefined)}>All</Chip>
        {(Object.keys(LABEL) as AuditOperation[]).map((k) => <Chip key={k} active={op === k} onClick={() => setOp(k)}>{LABEL[k]}</Chip>)}
      </div>
      {loading && !data ? <Loading /> : rows.length === 0 ? <Empty title="No entries" /> : (
        <div className="bg-surface border border-border rounded-card overflow-hidden">
          <div className="grid grid-cols-[170px_180px_1fr_160px] gap-3 px-4 py-2.5 border-b border-border eyebrow"><span>When</span><span>Operation</span><span>Detail</span><span>By</span></div>
          {rows.map((e) => (
            <div key={e.id} className="grid grid-cols-[170px_180px_1fr_160px] gap-3 items-center px-4 py-2.5 border-b border-border last:border-b-0 text-[12.5px]">
              <span className="font-mono text-[12px] text-muted">{fmtDateTime(e.timestamp)}</span>
              <Pill tone={e.operation === "manual_reassignment" ? "warn" : e.operation === "user_deactivated" ? "bad" : "accent"}>{LABEL[e.operation]}</Pill>
              <span>
                {/* Names to read; the record ids stay available on hover for tracing. */}
                <span className="font-medium mr-2" title={e.affected_records.join(", ")}>{(e.affected_labels?.length ? e.affected_labels : e.affected_records).join(", ")}</span>
                {e.note && <span className="text-muted">{e.note}</span>}
              </span>
              <span className="font-semibold">{e.actor_name}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
