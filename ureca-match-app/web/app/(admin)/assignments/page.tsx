"use client";
/** ManualAssignStudent (4.6) and the reassignment in ReviewMatchingResults (use case 1-4 AF-S3). Screen: AssignmentsPage.
 *  Every active student in the cycle and where they stand: the project that places them, or why they have none.
 *  Assign (REQ-ASSIGN-1, 2), Reassign before the round's results are out, and Unassign (REQ-ASSIGN-3) happen here;
 *  a round's results page is read only and links here. The API picks the round a new assignment joins. */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useMe } from "@/components/shell/app-provider";
import { PageTitle } from "@/components/shell/app-shell";
import { I } from "@/components/shell/icons";
import { Avatar, Banner, Button, Card, Empty, Field, FilterSelect, Input, Modal, Pill, Segmented, Select, Skeleton, Status, Textarea, fmtDeadline } from "@/components/ui";
import { ApiError, type AssignmentStatus, type MatchStatus, type StudentAssignment } from "@/lib/api/models";
import { DEMO_ASSIGNMENT_REASON } from "@/lib/demo-data";
import { typeText, useDemoFill } from "@/lib/demo-fill";
import { useApi, useCall } from "@/lib/use-api";

const PAGE = 25; // rows shown before "Show more"
const MOVABLE: MatchStatus[] = ["proposed", "approved", "reassigned"]; // its round's results are not out, so it can move (AF-S3)
const STANDINGS: { value: AssignmentStatus; label: string }[] = [
  { value: "unassigned", label: "No project" }, { value: "matched", label: "Matched" }, { value: "offered", label: "Offer sent" }, { value: "accepted", label: "Accepted" },
];
const COLUMNS = "grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_130px_262px]"; // the last fits two row buttons side by side
const ROW_BUTTON = "min-w-32"; // one width for every row button, so they line up down the column
type Action = { kind: "assign" | "reassign" | "unassign"; row: StudentAssignment };

export default function Assignments() {
  return <Suspense fallback={null}><AssignmentsPage /></Suspense>; // useSearchParams needs a Suspense boundary
}

function AssignmentsPage() {
  const call = useCall();
  const router = useRouter();
  const { me } = useMe();
  const linked = useSearchParams().get("student"); // "Manual Assign" next to an unmatched student on a round's results; only they are listed
  const view = useApi((api) => api.assignments(), []);
  const listings = useApi((api) => api.browse(), []);
  const [standing, setStanding] = useState<AssignmentStatus | "all">("all");
  const [q, setQ] = useState("");
  const [school, setSchool] = useState<string | undefined>();
  const [limit, setLimit] = useState(PAGE);
  const [action, setAction] = useState<Action | null>(null);
  const [target, setTarget] = useState("");
  const [why, setWhy] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false); // a request is in flight, so a second click cannot send it again
  const v = view.data;
  const students = useMemo(() => v?.students ?? [], [v]);
  const schools = useMemo(() => [...new Set(students.map((s) => s.school).filter((s): s is string => !!s))].sort(), [students]);

  // Opened from a round's results for one student: show only them, and open Assign once if they have no project.
  const [handled, setHandled] = useState<string | null>(null); // the linked student whose Assign has already opened
  const linkedRow = linked && linked !== handled && v?.round ? v.students.find((s) => s.user.id === linked && s.status === "unassigned") : undefined;
  const current: Action | null = action ?? (linkedRow ? { kind: "assign", row: linkedRow } : null);
  useDemoFill(async () => { if (current) await typeText(setWhy, DEMO_ASSIGNMENT_REASON[current.kind]); }); // demo only: the justification box of the open dialog

  const needle = q.trim().toLowerCase();
  const shown = students.filter((s) => (!linked || s.user.id === linked) && (standing === "all" || s.status === standing)
    && (!school || s.school === school) && (!needle || `${s.user.name}\n${s.user.email}`.toLowerCase().includes(needle)));
  const countOf = (s: AssignmentStatus) => students.filter((x) => x.status === s).length;
  const filter = (fn: () => void) => { fn(); setLimit(PAGE); };

  const close = () => { setAction(null); setHandled(linked); setTarget(""); setWhy(""); setError(null); };
  const open = (kind: Action["kind"], row: StudentAssignment) => { close(); setAction({ kind, row }); };
  async function confirm() {
    if (!current || busy) return;
    const { kind, row } = current, m = row.match;
    setError(null); setBusy(true);
    try {
      if (kind === "assign") await call((api) => api.assignStudent({ student_id: row.user.id, listing_id: target, justification: why }));
      else if (kind === "reassign" && m) await call((api) => api.reassign(m.id, { listing_id: target, justification: why }));
      else if (m) await call((api) => api.unassign(m.id, why));
      close(); view.reload(); listings.reload();
    } catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  }

  // When a new assignment reaches the student: with the round's results, or at once if they are out (REQ-OUTCOME-3).
  // Once the approval window has closed the results are being published, so there is no date left to give.
  const pending = me?.phase.window === "awaiting_results";
  const hears = !v?.round ? "" : v.offer_deadline
    ? `Round ${v.round.number} results are out, so the student gets the offer straight away and has until ${fmtDeadline(v.offer_deadline)} to answer.`
    : pending ? `The student is offered this project with the Round ${v.round.number} results, which are being published now.`
    : `The student is offered this project with the Round ${v.round.number} results on ${fmtDeadline(v.round.approval_end)}.`;
  // The API also counts slots held by pending matches and open offers; this list is a first filter.
  const projectOptions = (exclude?: string) => (listings.data ?? []).filter((l) => l.id !== exclude && l.filled_slots < l.available_slots)
    .map((l) => <option key={l.id} value={l.id}>{l.title} · {l.available_slots - l.filled_slots} open</option>);
  const modalError = error && <Banner tone="bad">{error.message}</Banner>;
  const whyField = (hint: string) => (
    <Field label="Justification" hint={hint} error={error?.field === "justification" || error?.field === "note" ? error.message : null}>
      <Textarea id="why" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} />
    </Field>
  );
  const row = current?.row, name = row?.user.name;
  const footer = (label: string, ready: boolean, destructive = false) => (
    <><Button variant="secondary" onClick={close}>Cancel</Button><Button variant={destructive ? "destructive" : undefined} disabled={!ready || busy} onClick={confirm}>{label}</Button></>
  );

  return (
    <>
      <PageTitle title="Overrides" />
      {view.error && <div className="mb-4"><Banner tone="bad">{view.error.message}</Banner></div>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={standing} onChange={(x) => filter(() => setStanding(x))}
          options={[{ value: "all" as const, label: "Everyone", count: students.length }, ...STANDINGS.map((s) => ({ ...s, count: countOf(s.value) }))]} />
        <div className="relative w-60"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"><I.Search size={16} /></span><Input id="q" value={q} onChange={(e) => filter(() => setQ(e.target.value))} placeholder="Name or e-mail" className="w-full pl-9" /></div>
        <FilterSelect label="School" value={school} options={schools} align="left" onChange={(x) => filter(() => setSchool(x))} />
        {linked && <Button size="sm" variant="secondary" onClick={() => router.replace("/assignments")}>Show all students</Button>}
        {v && <span className="ml-auto text-[12.5px] tabular text-faint">{shown.length} {shown.length === 1 ? "student" : "students"}</span>}
      </div>

      {view.loading && !v ? (
        <Card padded={false} className="overflow-hidden">
          <div aria-busy="true" aria-label="Loading students" className="divide-y divide-border">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="flex items-center gap-3 px-5 py-3.5"><Skeleton className="h-8 w-8 !rounded-full" /><div className="flex flex-1 flex-col gap-2"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-56" /></div></div>)}
          </div>
        </Card>
      ) : !v ? null : shown.length === 0 ? ( // without data the error banner above says why
        <Empty icon={<I.Users size={20} />} title="No students match" note="Try another name, status or school." />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className={`grid ${COLUMNS} gap-3 border-b border-border px-5 py-3 text-[12px] font-medium text-faint`}><span>Student</span><span>Project</span><span>Status</span><span /></div>
          <div className="divide-y divide-border">
            {shown.slice(0, limit).map((s) => (
              <div key={s.user.id} className={`grid ${COLUMNS} items-center gap-3 px-5 py-3`}>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={s.user.name} size={34} tone="auto" />
                  <div className="min-w-0"><div className="truncate text-[14px] font-semibold">{s.user.name}</div><div className="truncate text-[12.5px] text-muted">{[s.school, s.user.email].filter(Boolean).join(" · ")}</div></div>
                </div>
                {s.match ? (
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold">{s.match.listing_title}</div>
                    <div className="truncate text-[12.5px] text-muted">{s.match.supervisor_name} · Round {s.round_number}{s.status === "offered" && s.match.offer_expires_at ? ` · answer by ${fmtDeadline(s.match.offer_expires_at)}` : ""}</div>
                  </div>
                ) : <div className="min-w-0 text-[13px] text-muted">{s.reason}</div>}
                <span>{s.match ? <Status value={s.match.status} /> : <Pill>No project</Pill>}</span>
                <div className="flex justify-end gap-1.5">
                  {s.status === "unassigned" && <Button size="sm" variant="soft-good" className={ROW_BUTTON} disabled={!v?.round} onClick={() => open("assign", s)}>Manual Assign</Button>}
                  {s.match && MOVABLE.includes(s.match.status) && <Button size="sm" variant="soft" className={ROW_BUTTON} onClick={() => open("reassign", s)}>Reassign</Button>}
                  {s.match && <Button size="sm" variant="soft-bad" className={ROW_BUTTON} onClick={() => open("unassign", s)}>Manual Unassign</Button>}
                </div>
              </div>
            ))}
          </div>
          {shown.length > limit && (
            <div className="flex items-center justify-between border-t border-border bg-white/40 px-6 py-3">
              <span className="text-[12.5px] tabular text-faint">Showing {limit} of {shown.length}</span>
              <Button size="sm" variant="soft" onClick={() => setLimit((n) => n + PAGE)}>Show more</Button>
            </div>
          )}
        </Card>
      )}

      <Modal open={current?.kind === "assign"} onClose={close} title={`Manually assign ${name}`} footer={footer("Manual Assign", !!target && why.trim().length >= 10)}>
        <div className="flex flex-col gap-3 text-text">
          {modalError}
          <div className="text-[13px] text-muted">{hears} The supervisor cannot decline a manual assignment.</div>
          {row && !row.eligible && <Banner tone="warn">Matching skips {name} because they declined an offer or let one lapse. Assigning them overrides that.</Banner>}
          <Field label="Project" error={error?.field === "listing_id" ? error.message : null}>
            <Select id="assign-target" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose a project with an open slot</option>{projectOptions()}</Select>
          </Field>
          {whyField("Required, at least 10 characters. Manual assignment is for exceptional cases and is recorded in the audit log.")}
        </div>
      </Modal>
      <Modal open={current?.kind === "reassign"} onClose={close} title={`Reassign ${name}`} footer={footer("Reassign", !!target && why.trim().length >= 10)}>
        <div className="flex flex-col gap-3 text-text">
          {modalError}
          <div className="text-[13px] text-muted">Moves {name} off {row?.match?.listing_title} before the Round {row?.round_number} results come out.</div>
          <Field label="Move to project" error={error?.field === "listing_id" ? error.message : null}>
            <Select id="reassign-target" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose a project with an open slot</option>{projectOptions(row?.match?.listing_id)}</Select>
          </Field>
          {whyField("Required, at least 10 characters. Recorded in the audit log.")}
        </div>
      </Modal>
      <Modal open={current?.kind === "unassign"} onClose={close} title={`Manually unassign ${name}?`} footer={footer("Manual Unassign", why.trim().length >= 10, true)}>
        <div className="flex flex-col gap-3 text-text">
          {modalError}
          <div className="text-[13px] text-muted">{name} is taken off {row?.match?.listing_title} and the slot opens again. {row?.status === "accepted" ? "They had accepted, so they return to the pool and can be assigned elsewhere. " : ""}{row?.status === "matched" ? "The supervisor is told. The student had not heard about this match yet." : "The student and supervisor are told."}</div>
          {whyField("Required, at least 10 characters. Recorded in the audit log.")}
        </div>
      </Modal>
    </>
  );
}
