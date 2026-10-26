"use client";
/** ApproveMatchingResults (4.17). REQ-APPRV-1..4. Screen: MatchApprovalsPage.
 *  Students the matching places on a supervisor's projects are accepted by default: during the approval window the
 *  supervisor may only decline (REQ-APPRV-4). Use case 3-3 step 3: a match opens the student's profile in a drawer.
 *  Matches are grouped by round, so a student stays on screen, marked declined, after the supervisor declines them. */
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { Avatar, Banner, Button, Drawer, Empty, Field, Loading, Modal, PdfViewer, Pill, Status, Textarea, fmtDate, fmtDeadline } from "@/components/ui";
import { ApiError, type Match } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

export default function Approvals() {
  const { me, refresh } = useMe();
  const call = useCall();
  const { data, loading, reload } = useApi((api) => api.supervisorMatches(), []);
  const [decline, setDecline] = useState<Match | null>(null);
  const [profile, setProfile] = useState<Match | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const phase = me?.phase;
  const open = phase?.window === "approval"; // REQ-APPRV-4: declining is only possible while the window is open
  const canDecline = (m: Match) => open && phase?.round_id === m.round_id && m.status === "proposed";
  async function confirmDecline(m: Match) {
    setError(null);
    try { await call((api) => api.declineMatch(m.id, reason)); reload(); refresh(); }
    catch (e) {
      setError(e as ApiError);
      if ((e as ApiError).code === "approval_closed") { reload(); refresh(); } // the window closed while the page was open
    } finally { setDecline(null); setReason(""); }
  }
  const thisRound = (data ?? []).filter((m) => m.round_id === phase?.round_id);
  const earlier = (data ?? []).filter((m) => m.round_id !== phase?.round_id);
  // The pill shows the status (SRS 3.1.6). The note says who acted, since supervisors decline with a button but the
  // pill for that is "Rejected", while "Declined" is a student turning down the offer.
  const note = (m: Match) =>
    m.status === "rejected" ? (m.supervisor_note ? `Your reason: "${m.supervisor_note}"` : null)
      : m.status === "reassigned" ? "Placed by the URECA office, so it cannot be declined"
      : m.status === "declined" ? "The student declined the offer"
      : m.status === "timed_out" ? "The student didn't reply in time" : null;
  return (
    <>
      <PageHeader title="Match approvals" description="Students the matching places on your projects are offered a place when the approval window closes. Decline any student you cannot take before then." />
      {error && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      {open && <div className="mb-4"><Banner tone="accent" title={`Approval window open until ${fmtDeadline(phase?.window_ends_at)}.`}>You do not need to approve anyone. Students you leave are offered a place when the window closes.</Banner></div>}
      {loading && !data ? <Loading /> : thisRound.length === 0 ? (
        <Empty title="No students to review" note={open ? "The matching did not place any students on your projects this round." : "Students matched to your projects appear here when matching runs, as soon as the review window closes."} />
      ) : (
        <ul className="flex flex-col gap-2">
          {thisRound.map((m) => (
            <li key={m.id} className="bg-surface border border-border rounded-row flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3">
              <Avatar name={m.student_name} size={32} tone={m.status === "rejected" ? "neutral" : "navy"} />
              {/* On narrow screens the actions wrap below instead of squeezing the name. */}
              <div className="flex-1 min-w-[220px]">
                <div className="text-[13.5px] font-semibold truncate">{m.student_name}</div>
                <div className="text-[12.5px] text-muted truncate">→ <strong className="text-text">{m.listing_title}</strong>{m.preference_rank ? ` · their preference ${m.preference_rank}` : ""}</div>
                {note(m) && <div className={`text-[11.5px] mt-0.5 ${m.status === "rejected" ? "text-bad-ink" : "text-muted"}`}>{note(m)}</div>}
                <button type="button" onClick={() => setProfile(m)} className="text-[12.5px] font-medium text-accent hover:text-accent-ink mt-0.5">View profile</button>
              </div>
              <div className="flex items-center gap-2 ml-auto shrink-0">
                <Status value={m.status} />
                {canDecline(m) && <Button size="sm" variant="secondary" onClick={() => setDecline(m)}>Decline</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {earlier.length > 0 && (
        <>
          <h2 className="mt-7 mb-3">Earlier rounds</h2>
          <ul className="flex flex-col gap-2">
            {earlier.map((m) => (
              <li key={m.id} className="bg-surface border border-border rounded-row flex items-center gap-3.5 px-4 py-3">
                <Avatar name={m.student_name} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold">{m.student_name}</div><div className="text-[12.5px] text-muted truncate">→ {m.listing_title}</div>
                  {note(m) && <div className="text-[11.5px] text-muted mt-0.5">{note(m)}</div>}
                </div>
                <Status value={m.status} />
              </li>
            ))}
          </ul>
        </>
      )}
      <Drawer open={!!profile} onClose={() => setProfile(null)} title="Matched student"
        footer={profile && canDecline(profile) ? <Button variant="secondary" onClick={() => { setDecline(profile); setProfile(null); }}>Decline</Button> : undefined}>
        {profile && <StudentBehindMatch m={profile} />}
      </Drawer>
      <Modal open={!!decline} onClose={() => { setDecline(null); setReason(""); }} title="Decline this student?" footer={<><Button variant="secondary" onClick={() => { setDecline(null); setReason(""); }}>Cancel</Button><Button variant="destructive" onClick={() => decline && confirmDecline(decline)}>Decline</Button></>}>
        <div className="flex flex-col gap-3">
          <div>{decline?.student_name} will not be offered {decline?.listing_title}. The slot returns to the pool, and the student is unmatched for this round. This cannot be undone.</div>
          <Field label="Reason for the URECA office" hint="Optional. Kept with the match, where the URECA office can see it.">
            <Textarea id="decline-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full" />
          </Field>
        </div>
      </Modal>
    </>
  );
}

/** The student's profile and the application behind the match (use case 3-3). */
function StudentBehindMatch({ m }: { m: Match }) {
  const { data: a, loading, error } = useApi((api) => api.matchStudent(m.id), [m.id]);
  const [open, setOpen] = useState<string | null>(null);
  if (loading && !a) return <Loading />;
  if (error || !a) return <Banner tone="bad">{error?.message ?? "The profile could not be loaded."}</Banner>;
  const st = a.student;
  return (
    <>
      <div className="flex items-center gap-3.5">
        <Avatar name={st.name} size={48} tone="navy" />
        <div><div className="font-display text-[18px] font-bold">{st.name}</div><div className="text-[12.5px] text-muted">{st.school} · Year {st.year_of_study ?? "-"} · for {m.listing_title}</div></div>
        <span className="ml-auto">{a.rank ? <Pill tone="accent">You ranked #{a.rank}</Pill> : <Pill>{a.application_id ? "Not ranked" : "Assigned by the URECA office"}</Pill>}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-sunken rounded-[9px] px-3 py-2.5"><div className="eyebrow">CGPA</div><div className="text-[15px] font-bold mt-0.5 tabular">{st.cgpa?.toFixed(2) ?? "-"} / 5.00</div></div>
        <div className="bg-sunken rounded-[9px] px-3 py-2.5"><div className="eyebrow">Prerequisites</div><div className={`text-[13px] font-bold mt-0.5 ${a.meets_prerequisites ? "text-good-ink" : "text-warn-ink"}`}>{a.meets_prerequisites ? "Met" : "Some missing"}</div></div>
        <div className="bg-sunken rounded-[9px] px-3 py-2.5"><div className="eyebrow">Modules</div><div className="text-[13px] font-semibold mt-0.5">{st.completed_modules.join(", ") || "None listed"}</div></div>
        <div className="bg-sunken rounded-[9px] px-3 py-2.5"><div className="eyebrow">Interests</div><div className="text-[13px] font-semibold mt-0.5">{st.research_interests.join(", ") || "None listed"}</div></div>
      </div>
      {a.application_id ? (
        <div><div className="eyebrow mb-1.5">Statement of interest · applied {fmtDate(a.submitted_at)}</div><p className="text-[13px] leading-[1.65]">{a.statement}</p></div>
      ) : <div className="text-[13px] text-muted">The URECA office assigned this student without an application to your project.</div>}
      <div>
        <div className="eyebrow mb-2">Documents</div>
        {a.documents.length === 0 ? <div className="text-[13px] text-muted">No documents attached.</div> : (
          <div className="flex flex-col gap-2">
            {a.documents.map((d) => (
              <div key={d.id} className="border border-border rounded-button">
                <button type="button" onClick={() => setOpen(open === d.id ? null : d.id)} className="w-full flex items-center gap-2 px-3 py-2.5 text-[12.5px] font-medium text-muted">
                  {d.file_name}<span className="ml-auto text-accent font-semibold text-[11.5px]">{open === d.id ? "Hide" : "View"}</span>
                </button>
                {open === d.id && <DocumentView id={d.id} name={d.file_name} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function DocumentView({ id, name }: { id: string; name: string }) {
  const doc = useApi((api) => api.documentUrl(id), [id]);
  const box = "border-t border-border bg-sunken h-[200px] flex items-center justify-center text-[12px] text-faint px-4 text-center";
  if (doc.loading) return <div className={box}><Loading /></div>;
  if (doc.error) return <div className={box}>{doc.error.message}</div>;
  if (!doc.data?.url) return <div className={box}>This file has not been uploaded yet, so it cannot be shown.</div>;
  return <PdfViewer url={doc.data.url} title={name} />;
}
