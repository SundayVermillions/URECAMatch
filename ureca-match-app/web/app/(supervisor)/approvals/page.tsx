"use client";
/** ApproveMatchingResults (4.17). REQ-APPRV-1..4. Screen: MatchApprovalsPage.
 *  Students the matching places on a supervisor's projects are accepted by default: during the approval window the
 *  supervisor may only decline (REQ-APPRV-4). Use case 3-3 step 3: a match opens the student's profile in a drawer.
 *  Matches are grouped by round, so a student stays on screen, marked declined, after the supervisor declines them. */
import { useState } from "react";
import { PageTitle } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { CycleTimeline } from "@/components/student/cycle-timeline";
import { StudentSummary } from "@/components/supervisor/student-summary";
import { Avatar, Banner, Button, Card, Drawer, Empty, Field, Loading, Modal, PdfViewer, Pill, Skeleton, Status, Textarea, fmtDate, fmtDeadline } from "@/components/ui";
import { ApiError, type Match } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

export default function Approvals() {
  const { me, refresh } = useMe();
  const call = useCall();
  const { data, loading, reload } = useApi((api) => api.supervisorMatches(), []);
  const mine = useApi((api) => api.myListings(), []); // for each project's cover and slots
  const [history, setHistory] = useState(false);
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
  // Matches of this round grouped by project, so a supervisor reads "these students are coming to this project".
  const listing = (id: string) => (mine.data ?? []).find((l) => l.id === id);
  const groups = [...new Set(thisRound.map((m) => m.listing_id))].map((id) => ({ id, title: thisRound.find((m) => m.listing_id === id)!.listing_title, rows: thisRound.filter((m) => m.listing_id === id) }));
  return (
    <>
      <PageTitle title="Match approvals" right={<CycleTimeline />} />
      {error && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      {loading && !data ? (
        <div aria-busy="true" aria-label="Loading matches" className="flex flex-col gap-4"><Skeleton className="h-[190px] !rounded-[16px]" /><Skeleton className="h-[130px] !rounded-[16px]" /></div>
      ) : thisRound.length === 0 ? (
        <Empty icon={<I.Check size={20} />} title="No students to review" note={open ? "The matching did not place any students on your projects this round." : "Students matched to your projects appear here when matching runs, as soon as the review window closes."} />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => {
            const l = listing(g.id);
            return (
              <Card key={g.id} padded={false} className="overflow-hidden">
                <div className="flex items-center gap-4 border-b border-border px-6 py-4">
                  {l?.cover_url ? <img src={l.cover_url} alt="" className="h-[44px] w-[64px] shrink-0 rounded-[10px] object-cover" />
                    : <div className="grid h-[44px] w-[64px] shrink-0 place-items-center rounded-[10px] bg-neutral-soft text-faint"><I.Folder size={18} /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[15.5px] font-semibold tracking-[-0.01em]">{g.title}</div>
                    <div className="text-[12.5px] text-muted">{g.rows.length} {g.rows.length === 1 ? "student" : "students"} matched{l ? ` · ${l.available_slots} ${l.available_slots === 1 ? "slot" : "slots"}` : ""}</div>
                  </div>
                  {open && <div className="shrink-0 text-right text-[12.5px] leading-snug text-muted">You can decline until<br /><b className="font-semibold text-text">{fmtDeadline(phase?.window_ends_at)}</b></div>}
                </div>
                <ul className="divide-y divide-border">
                  {g.rows.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5">
                      <Avatar name={m.student_name} size={38} tone={m.status === "rejected" ? "neutral" : "navy"} />
                      <div className="min-w-[200px] flex-1">
                        <div className="flex items-center gap-2 text-[14.5px] font-semibold">{m.student_name}{m.preference_rank ? <Pill>Choice {m.preference_rank}</Pill> : null}</div>
                        {note(m) && <div className={`mt-0.5 text-[12px] ${m.status === "rejected" ? "text-bad-ink" : "text-muted"}`}>{note(m)}</div>}
                        <button type="button" onClick={() => setProfile(m)} className="mt-0.5 text-[12.5px] font-medium text-accent hover:text-accent-ink">View profile</button>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-2.5">
                        <Status value={m.status} />
                        {canDecline(m) && <Button size="sm" variant="secondary" className="hover:!bg-bad-soft hover:!text-bad-ink" onClick={() => setDecline(m)}>Decline</Button>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
          {open && <p className="flex items-center gap-2 px-1 text-[12.5px] text-muted"><I.Info size={14} />You do not need to approve anyone. Students you leave are offered a place when the window closes.</p>}
        </div>
      )}
      {earlier.length > 0 && (
        <div className="mt-8">
          <button type="button" onClick={() => setHistory((v) => !v)} aria-expanded={history} className="inline-flex items-center gap-1.5 px-1 text-[14px] font-medium text-muted transition-colors hover:text-text">
            <span className={`transition-transform ${history ? "" : "-rotate-90"}`}><I.ChevronDown size={15} /></span>
            Earlier rounds <span className="tabular text-faint">{earlier.length}</span>
          </button>
          {history && (
            <Card padded={false} className="step-in mt-3 overflow-hidden">
              <ul className="divide-y divide-border">
                {earlier.map((m) => (
                  <li key={m.id} className="flex items-center gap-4 px-6 py-3.5">
                    <Avatar name={m.student_name} size={36} tone="auto" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold">{m.student_name}</div>
                      <div className="truncate text-[12.5px] text-muted">{m.listing_title}</div>
                      {note(m) && <div className="mt-0.5 text-[12px] text-muted">{note(m)}</div>}
                    </div>
                    <Status value={m.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
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
      <StudentSummary name={st.name} email={st.email || `${st.id}@e.ntu.edu.sg`} school={st.school} degree={st.degree} year={st.year_of_study} cgpa={st.cgpa}
        modules={st.completed_modules} interests={st.research_interests} missing={a.meets_prerequisites ? [] : undefined}
        badge={a.rank ? <Pill tone="accent">You ranked #{a.rank}</Pill> : <Pill>{a.application_id ? "Not ranked" : "Assigned by the URECA office"}</Pill>} note={`for ${m.listing_title}`} />
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
