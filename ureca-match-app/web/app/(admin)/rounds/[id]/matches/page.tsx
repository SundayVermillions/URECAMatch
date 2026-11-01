"use client";
/** ReviewMatchingResults (4.4), PublishResults (4.5). Screen: MatchingAwaitPublishPage. Read only.
 *  Status chips filter the matches (REQ-REV-1); "Unmatched" lists the round's applicants without a match. Assigning,
 *  reassigning and unassigning (REQ-ASSIGN-1..3) happen on the Assignments page; each unmatched student links there.
 *  Results publish by themselves when the approval window closes (REQ-PUB-3), so there is no Publish button. */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PageTitle } from "@/components/shell/app-shell";
import { I } from "@/components/shell/icons";
import { CountUp } from "@/components/admin/charts";
import { Avatar, Button, Card, Empty, FilterSelect, Loading, Pill, Segmented, Skeleton, Status, fmtDeadline, statusLabel } from "@/components/ui";
import { type MatchStatus } from "@/lib/api/models";
import { useApi } from "@/lib/use-api";

// The chips name each status exactly as its pill does (SRS 3.1.6): "Rejected" is the supervisor's, "Declined" the student's.
const STATUSES: MatchStatus[] = ["proposed", "rejected", "reassigned", "published", "accepted", "declined", "timed_out"];

export default function ReviewMatches() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<"matches" | "unmatched">("matches");
  const [status, setStatus] = useState<MatchStatus | undefined>();
  const [shown, setShown] = useState(12); // unmatched rows shown before "Show more"
  const summary = useApi((api) => api.summary(id), [id]);
  const matches = useApi((api) => api.matches(id, status), [id, status]);
  const unmatched = useApi((api) => api.unmatched(id), [id]);
  const s = summary.data;
  const published = !!s?.round.published_at;

  return (
    <>
      <Link href="/rounds" className="mb-3 inline-flex items-center gap-1 text-[13.5px] font-medium"><I.ChevronLeft /> Back to Application Cycle</Link>
      <PageTitle title={`Round ${s?.round.number ?? ""} matches`} />

      <Card padded={false} className="mb-5 overflow-hidden">
        {!s ? <div className="px-8 py-6"><Skeleton className="h-12 w-full" /></div> : (
          <div className="grid grid-cols-[repeat(3,auto)_1fr] items-center divide-x divide-border">
            {[
              { label: "Matched", value: s.matched },
              ...(published ? [] : [{ label: "Rejected by supervisors", value: s.declined }]),
              { label: "Unmatched", value: unmatched.data?.length ?? s.unmatched },
            ].map((f, i) => (
              <div key={f.label} className={`py-5 ${i === 0 ? "pl-8 pr-7" : "px-7"}`}>
                <div className="text-[12.5px] font-medium text-muted">{f.label}</div>
                <div className="mt-1 font-display text-[30px] font-semibold leading-none tracking-[-0.03em]"><CountUp value={f.value} /></div>
              </div>
            ))}
            <div className="flex items-center gap-3 py-5 pl-7 pr-8">
              {published ? (
                <>
                  <Status value="published" kind="round" />
                  <span className="text-[12.5px] leading-snug text-muted">Results are published. Manual assignment overrides can be performed on <Link href="/assignments" className="font-medium">Assignments</Link>.</span>
                </>
              ) : (
                <>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-ink"><I.Clock size={16} /></span>
                  <span className="text-[12.5px] leading-snug text-muted">Supervisors can decline until {fmtDeadline(s.round.approval_end)}.</span>
                </>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: "matches", label: "Matches" }, { value: "unmatched", label: "Unmatched", count: unmatched.data?.length }]} />
        {tab === "matches" && (
          <FilterSelect label="Status" value={status ? statusLabel(status) : undefined} options={STATUSES.map(statusLabel)} align="left" anyLabel="All"
            onChange={(v) => setStatus(v ? STATUSES.find((k) => statusLabel(k) === v) : undefined)} />
        )}
      </div>

      {tab === "unmatched" ? (
        unmatched.loading && !unmatched.data ? <Loading /> : !unmatched.data?.length ? <Empty icon={<I.CheckCircle size={20} />} title="No unmatched students" note="Everyone who applied in this round has a match, or was excluded after declining or timing out earlier." /> : (
          <Card padded={false} className="overflow-hidden">
            <div className="flex items-center gap-4 border-b border-border px-6 py-3 text-[12px] font-medium text-faint"><span className="flex-1">Applied, no match</span><span className="w-32" /></div>
            <ul className="divide-y divide-border">
              {unmatched.data.slice(0, shown).map((u) => (
                <li key={u.user.id} className="flex items-center gap-4 px-6 py-3.5">
                  <Avatar name={u.user.name} size={36} tone="auto" />
                  <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold">{u.user.name}</div><div className="truncate text-[12.5px] text-muted">{[u.school, u.user.email].filter(Boolean).join(" · ")}</div></div>
                  <span className="flex w-32 justify-end"><Link href={`/assignments?student=${encodeURIComponent(u.user.id)}`}><Button size="sm" variant="soft">Assign</Button></Link></span>
                </li>
              ))}
            </ul>
            {unmatched.data.length > shown && (
              <div className="flex items-center justify-between border-t border-border bg-white/40 px-6 py-3">
                <span className="text-[12.5px] tabular text-faint">Showing {shown} of {unmatched.data.length}</span>
                <Button size="sm" variant="soft" onClick={() => setShown((n) => n + 12)}>Show more</Button>
              </div>
            )}
          </Card>
        )
      ) : matches.loading && !matches.data ? <Loading /> : !matches.data?.length ? <Empty icon={<I.Users size={20} />} title="No matches" note={status ? "Nothing with this status." : "Matching runs automatically when the round's review window closes."} /> : (
        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center gap-4 border-b border-border px-6 py-3 text-[12px] font-medium text-faint"><span className="flex-1">Student and project</span><span className="w-32">Status</span></div>
          <ul className="divide-y divide-border">
            {matches.data.map((m) => (
              <li key={m.id} className="flex items-center gap-4 px-6 py-3.5">
                <Avatar name={m.student_name} size={36} tone="navy" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[14px] font-semibold">{m.student_name}{m.preference_rank ? <Pill>Choice {m.preference_rank}</Pill> : null}</div>
                  <div className="truncate text-[12.5px] text-muted">→ <strong className="font-semibold text-text">{m.listing_title}</strong> · {m.supervisor_name}</div>
                  {m.original_listing_id && <div className="mt-0.5 text-[12px] text-warn-ink">Reassigned · {m.justification}</div>}
                  {m.status === "rejected" && <div className="mt-0.5 text-[12px] text-bad-ink">Rejected by {m.supervisor_name}{m.supervisor_note ? ` · "${m.supervisor_note}"` : " · no reason given"}</div>}
                </div>
                <span className="w-32"><Status value={m.status} /></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
