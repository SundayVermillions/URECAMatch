"use client";
/** ManageProfile (4.14). REQ-PROF-1..3. Screens: CompleteProfilePage, MyProfilePage, EditProfilePage. */
import { useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Banner, Button, Card, Field, Input, Select, fmtDate } from "@/components/ui";
import { ApiError, type StudentProfile } from "@/lib/api/models";
import { useCall } from "@/lib/use-api";

function ProfileForm({ p }: { p: StudentProfile | null }) {
  const { refresh } = useMe();
  const call = useCall();
  const mustComplete = useSearchParams().get("complete") === "1";
  const [f, setF] = useState(() => ({ school: p?.school ?? "", cgpa: p?.cgpa?.toString() ?? "", year_of_study: p?.year_of_study?.toString() ?? "", completed_modules: p?.completed_modules.join(", ") ?? "", research_interests: p?.research_interests.join(", ") ?? "" }));
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const err = (k: string) => (error?.field === k ? error.message : null);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setSaved(false);
    try {
      await call((api) => api.updateProfile({ school: f.school, cgpa: parseFloat(f.cgpa), year_of_study: parseInt(f.year_of_study, 10),
        completed_modules: f.completed_modules.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean), research_interests: f.research_interests.split(",").map((s) => s.trim()).filter(Boolean) }));
      await refresh(); setSaved(true);
    } catch (err) { setError(err as ApiError); } finally { setBusy(false); }
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files?.[0]; if (!fl) return; setError(null);
    try { await call((api) => api.uploadDocument(fl)); await refresh(); } catch (err) { setError(err as ApiError); } finally { if (file.current) file.current.value = ""; }
  }

  return (
    <form onSubmit={save}>
      <PageHeader title={mustComplete ? "Complete your profile" : "My profile"} description="Supervisors see this when they review your applications." />
      {mustComplete && !p?.profile_complete && <div className="mb-4"><Banner tone="accent" title="One step before you apply.">Fill in your academic details and upload your transcript.</Banner></div>}
      {saved && <div className="mb-4"><Banner tone="good" title="Saved.">Your profile is up to date.</Banner></div>}
      {error && !error.field && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      <div className="grid grid-cols-[1fr_340px] gap-5">
        <Card className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-4">
            <Field label="School"><Select id="school" value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })} required><option value="">Choose</option>{["CCDS", "EEE", "SBS", "MAE", "SPMS", "NBS", "CEE", "MSE"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="CGPA" error={err("cgpa")} hint="0.00 to 5.00"><Input id="cgpa" type="number" step="0.01" min={0} max={5} value={f.cgpa} onChange={(e) => setF({ ...f, cgpa: e.target.value })} required invalid={!!err("cgpa")} /></Field>
            <Field label="Year of study"><Select id="year" value={f.year_of_study} onChange={(e) => setF({ ...f, year_of_study: e.target.value })} required><option value="">Choose</option>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}</Select></Field>
          </div>
          <Field label="Completed modules" hint="Course codes, comma separated. Used to check project prerequisites."><Input id="modules" value={f.completed_modules} onChange={(e) => setF({ ...f, completed_modules: e.target.value })} placeholder="SC1015, SC2001, SC4001" /></Field>
          <Field label="Research interests" hint="Comma separated"><Input id="interests" value={f.research_interests} onChange={(e) => setF({ ...f, research_interests: e.target.value })} placeholder="Machine Learning, HCI" /></Field>
          <div><Button type="submit" size="lg" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button></div>
        </Card>
        <Card>
          <div className="eyebrow mb-2">Documents</div>
          <div className="text-[12.5px] text-muted mb-3">PDF only, up to 5 MB each. Transcript is required; a CV is optional.</div>
          <div className="flex flex-col gap-2 mb-3">
            {(p?.documents ?? []).map((d) => (
              <div key={d.id} className="flex items-center gap-2.5 px-3 py-2.5 border border-border rounded-button text-[12.5px]"><I.File size={14} /> <span className="truncate">{d.file_name}</span><span className="ml-auto text-faint shrink-0">{fmtDate(d.uploaded_at)}</span></div>
            ))}
          </div>
          <label className={`flex items-center justify-center gap-2 h-10 border-[1.5px] border-dashed rounded-[9px] text-[12.5px] cursor-pointer ${err("file") ? "border-bad text-bad-ink" : "border-border-strong text-muted hover:bg-sunken"}`}>
            <I.Upload /> Upload PDF
            <input ref={file} type="file" accept="application/pdf" className="hidden" onChange={upload} />
          </label>
          {err("file") && <div className="text-[12px] text-bad-ink mt-2">{err("file")}</div>}
        </Card>
      </div>
    </form>
  );
}
export default function Profile() {
  const { me } = useMe();
  const p = me?.student ?? null;
  // keyed on the profile so the form re-initialises once /me has loaded
  return <Suspense><ProfileForm key={p ? `${p.user_id}:${p.documents.length}` : "none"} p={p} /></Suspense>;
}
