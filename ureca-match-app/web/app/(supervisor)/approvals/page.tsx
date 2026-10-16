"use client";
/** ApproveMatchingResults (4.17). REQ-APPRV-1..3. Screen: MatchApprovalsPage.
 *  Use case 3-3 step 3: selecting a proposed match opens the student's profile and application in a drawer. */
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { Avatar, Banner, Button, Drawer, Empty, Field, Loading, Modal, PdfViewer, Pill, Status, Textarea, fmtDate } from "@/components/ui";
import { ApiError, type Match } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

export default function Approvals() {
  const { me } = useMe();
  const call = useCall();
  const { data, loading, reload } = useApi((api) => api.supervisorMatches(), []);
  const [reject, setReject] = useState<Match | null>(null);
  const [profile, setProfile] = useState<Match | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  async function decide(m: Match, approve: boolean, note?: string) {
    try { await call((api) => api.decideMatch(m.id, approve, note)); reload(); } catch (e) { setError(e as ApiError); } finally { setReject(null); setReason(""); }
  }
  const pending = (data ?? []).filter((m) => m.status === "proposed");
  const rest = (data ?? []).filter((m) => m.status !== "proposed");
  return (
    <>
      <PageHeader title="Match approvals" description="Approve or reject each student the matching proposed for your projects. Rejecting returns the slot to the pool." />
      {error && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      {loading && !data ? <Loading /> : pending.length === 0 ? (
        <Empty title="Nothing to approve" note={me?.phase.window === "awaiting_results" ? "Nothing is waiting for you. If matching has not run yet, proposed matches appear here as soon as it does." : "Proposed matches appear here as soon as the admin runs matching for the round."} />
      ) : (
        <div className="flex flex-col gap-2">
          {pending.map((m) => (
            <div key={m.id} className="bg-surface border border-border rounded-row flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3">
              <Avatar name={m.student_name} size={32} tone="navy" />
              {/* On narrow screens the actions wrap below instead of squeezing the name. */}
              <div className="flex-1 min-w-[220px]">
                <div className="text-[13.5px] font-semibold truncate">{m.student_name}</div>
                <div className="text-[12.5px] text-muted truncate">→ <strong className="text-text">{m.listing_title}</strong>{m.preference_rank ? ` · their preference ${m.preference_rank}` : ""}</div>
                <button type="button" onClick={() => setProfile(m)} className="text-[12.5px] font-medium text-accent hover:text-accent-ink mt-0.5">View profile</button>
              </div>
              <div className="flex items-center gap-2 ml-auto shrink-0">
                <Status value={m.status} />
                <Button size="sm" onClick={() => decide(m, true)}>Approve</Button>
                <Button size="sm" variant="secondary" onClick={() => setReject(m)}>Reject</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <>
          <h2 className="mt-7 mb-3">Decided</h2>
          <div className="flex flex-col gap-2">
            {rest.map((m) => (
              <div key={m.id} className="bg-surface border border-border rounded-row flex items-center gap-3.5 px-4 py-3">
                <Avatar name={m.student_name} size={32} />
                <div className="flex-1 min-w-0"><div className="text-[13.5px] font-semibold">{m.student_name}</div><div className="text-[12.5px] text-muted truncate">→ {m.listing_title}</div></div>
                <Status value={m.status} />
              </div>
            ))}
          </div>
        </>
      )}
      <Drawer open={!!profile} onClose={() => setProfile(null)} title="Proposed match"
        footer={profile && <><Button variant="secondary" onClick={() => { setReject(profile); setProfile(null); }}>Reject</Button><Button onClick={() => { decide(profile, true); setProfile(null); }}>Approve</Button></>}>
        {profile && <StudentBehindMatch m={profile} />}
      </Drawer>
      <Modal open={!!reject} onClose={() => { setReject(null); setReason(""); }} title="Reject this match?" footer={<><Button variant="secondary" onClick={() => { setReject(null); setReason(""); }}>Cancel</Button><Button variant="destructive" onClick={() => reject && decide(reject, false, reason)}>Reject</Button></>}>
        <div className="flex flex-col gap-3">
          <div>{reject?.student_name} will not be placed on {reject?.listing_title}. The slot returns to the pool and the admin is notified for review.</div>
          <Field label="Reason for the admin" hint="Optional. Helps the admin decide where to reassign the student.">
            <Textarea id="reject-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full" />
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
