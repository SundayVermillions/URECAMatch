"use client";
/** Student profile page. REQ-PROF-1..3. */
import { Suspense, useEffect, useRef, useState } from "react";
import { DEMO } from "@/lib/demo-data";
import { demoFile, sleep, useDemoFill } from "@/lib/demo-fill";
import { useSearchParams } from "next/navigation";
import { CoursePicker, searchTopics } from "@/components/pickers";
import { PageTitle } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Avatar, Banner, Button, Card, Field, Input, Modal, Pill, Reveal, Select, Toast, fmtDate, inputCls } from "@/components/ui";
import { ApiError, type StudentProfile, type TranscriptParse } from "@/lib/api/models";
import { useCall } from "@/lib/use-api";

const NTU_DEGREES_BY_SCHOOL: Record<string, string[]> = {
  CCDS: [
    "Computer Science",
    "Data Science & Artificial Intelligence",
    "Computer Engineering",
    "AI & Society",
  ],
  EEE: [
    "Electrical & Electronic Engineering",
    "Information Engineering & Media",
  ],
  SBS: [
    "Biological Sciences",
    "Biomedical Sciences & BioBusiness",
    "Biomedical Sciences & Chinese Medicine",
  ],
  MAE: [
    "Mechanical Engineering",
    "Aerospace Engineering",
  ],
  SPMS: [
    "Mathematical Sciences",
    "Physics / Applied Physics",
    "Chemistry & Biological Chemistry",
    "Mathematics & Computer Science",
  ],
  NBS: [
    "Accountancy",
    "Business",
    "Accountancy & Data Science and AI",
    "Business & Computer Science",
  ],
  CEE: [
    "Civil Engineering",
    "Environmental Engineering",
    "Maritime Studies",
  ],
  MSE: [
    "Materials Engineering",
  ],
};

const ALL_NTU_DEGREES = Array.from(
  new Set(Object.values(NTU_DEGREES_BY_SCHOOL).flat())
).sort();

/** The form's starting values, from the saved profile. */
function fromProfile(p: StudentProfile | null) {
  return {
    school: p?.school ?? "",
    degree: p?.degree || (p?.school ? (NTU_DEGREES_BY_SCHOOL[p.school]?.[0] ?? "Computer Science") : ""),
    isDoubleDegree: (p?.degree?.includes("(Double Degree)") || p?.degree?.includes(" & ")) ?? false,
    degree1: p?.degree?.split(" & ")[0] ?? "",
    degree2: p?.degree?.split(" & ")[1]?.replace(" (Double Degree)", "") ?? "",
    cgpa: p?.cgpa?.toString() ?? "",
    year_of_study: p?.year_of_study?.toString() ?? "",
    completed_modules: p?.completed_modules ?? [],
    research_interests: p?.research_interests ?? [],
  };
}

function ProfileForm({ p }: { p: StudentProfile | null }) {
  const { me, refresh } = useMe();
  const call = useCall();
  const mustComplete = useSearchParams().get("complete") === "1"; // set when they were sent here after trying to open another page
  const [redirectNotice, setRedirectNotice] = useState(true);

  const [f, setF] = useState(() => fromProfile(p));
  const [editing, setEditing] = useState(false); // a complete profile is read first; Edit profile opens the fields

  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [pendingRemovals, setPendingRemovals] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ id: string; name: string; url: string | null; loading: boolean; error: string | null } | null>(null);
  const previewRequest = useRef(0);
  const [prefill, setPrefill] = useState<"filled" | "updated" | "rejected" | null>(null);
  const [changes, setChanges] = useState(""); // what an automatic update changed, in words
  const [baseline, setBaseline] = useState(() => JSON.stringify(f)); // the form as last saved, to tell "unsaved changes" from "up to date"
  const dirty = JSON.stringify(f) !== baseline || pendingRemovals.length > 0;

  const file = useRef<HTMLInputElement>(null);
  const transcriptFile = useRef<HTMLInputElement>(null);
  const err = (k: string) => (error?.field === k ? error.message : null);

  // The server tags every file with a slot (`kind`), so the split never depends on the file name.
  const allDocs = p?.documents ?? [];
  const transcriptDoc = allDocs.find((d) => d.kind === "transcript");
  const supportingDocs = allDocs.filter((d) => d.kind !== "transcript");
  const supportingCount = supportingDocs.length;
  const atMaxSupporting = supportingCount >= 5;

  /** The form with what the transcript says put in. Only fields that were found change; nothing is saved by this. */
  function mergeParsed(cur: typeof f, t: TranscriptParse): typeof f {
    const school = t.school in NTU_DEGREES_BY_SCHOOL ? t.school : "";
    return {
      ...cur,
      school: school || cur.school,
      ...(school && NTU_DEGREES_BY_SCHOOL[school].includes(t.degree) ? { degree: t.degree, isDoubleDegree: false, degree1: "", degree2: "" } : {}),
      cgpa: t.cgpa != null ? t.cgpa.toFixed(2) : cur.cgpa,
      year_of_study: t.year_of_study ? String(t.year_of_study) : cur.year_of_study,
      completed_modules: t.completed_modules.length ? t.completed_modules : cur.completed_modules,
    };
  }
  /** A real NTU transcript states a Cumulative GPA and lists the courses passed. A file that does not (slides, a CV, a
   *  screenshot) is not one, even if it mentions a course code. */
  const readsAsTranscript = (t: TranscriptParse) => t.cgpa != null && t.completed_modules.length > 0;
  const saveBody = (x: typeof f) => ({ school: x.school, degree: x.degree || null, cgpa: parseFloat(x.cgpa), year_of_study: parseInt(x.year_of_study, 10), completed_modules: x.completed_modules, research_interests: x.research_interests });

  /** A transcript is read before it is stored. One that does not read as an NTU transcript is not uploaded and nothing changes.
   *  A real one is stored and, on a finished profile that is not being edited, the profile is updated from it straight away. */
  async function handleTranscriptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const originalFile = e.target.files?.[0];
    if (!originalFile) return;
    setError(null);
    setSaved(false);
    setPrefill(null);
    setBusy(true);

    if (originalFile.type !== "application/pdf" && !originalFile.name.toLowerCase().endsWith(".pdf")) {
      setError(new ApiError(422, "not_pdf", "Upload a PDF file.", "file"));
      setBusy(false);
      return;
    }
    if (originalFile.size > 5 * 1024 * 1024) {
      setError(new ApiError(422, "too_large", "The file is larger than 5 MB.", "file"));
      setBusy(false);
      return;
    }

    try {
      let t: TranscriptParse | null = null;
      try { t = await call((api) => api.parseTranscript(originalFile)); } catch { t = null; } // an unreadable file is a wrong transcript, not a crash
      if (!t || !readsAsTranscript(t)) { setPrefill("rejected"); return; }
      await call((api) => api.uploadDocument(originalFile, "transcript")); // replaces any existing transcript
      const next = mergeParsed(f, t);
      if (complete && !editing) {
        try {
          await call((api) => api.updateProfile(saveBody(next)));
          const bits = [
            next.cgpa !== f.cgpa ? `CGPA ${f.cgpa || "—"} → ${next.cgpa}` : "",
            next.year_of_study !== f.year_of_study ? `Year ${next.year_of_study}` : "",
            next.school !== f.school || next.degree !== f.degree ? `${next.degree || next.school}` : "",
            JSON.stringify(next.completed_modules) !== JSON.stringify(f.completed_modules) ? `${next.completed_modules.length} modules` : "",
          ].filter(Boolean);
          setF(next); setBaseline(JSON.stringify(next));
          setChanges(bits.length ? bits.join(" · ") : "Your details already matched it.");
          setPrefill("updated");
        } catch { setF(next); setEditing(true); setPrefill("filled"); } // it would not save as it stands: let the student correct it
      } else { setF(next); setPrefill("filled"); }
      await refresh();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
      if (transcriptFile.current) transcriptFile.current.value = "";
    }
  }

  async function uploadSupporting(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files?.[0];
    if (!fl) return;
    setError(null);
    if (atMaxSupporting) {
      setError(new ApiError(422, "max_documents", "Maximum limit of 5 supporting documents reached.", "file"));
      if (file.current) file.current.value = "";
      return;
    }
    try {
      await call((api) => api.uploadDocument(fl, "supporting"));
      await refresh();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      if (file.current) file.current.value = "";
    }
  }

  // Demo only: upload the transcript (which fills the details in), add the interests one by one, add the portfolio, then save.
  const formRef = useRef<HTMLFormElement>(null);
  const [saveTick, setSaveTick] = useState(0);
  useEffect(() => { if (saveTick) formRef.current?.requestSubmit(); }, [saveTick]);
  useDemoFill(async (role) => {
    const d = DEMO[role];
    const asEvent = (file: File) => ({ target: { files: [file] } }) as unknown as React.ChangeEvent<HTMLInputElement>;
    if (!transcriptDoc) await handleTranscriptUpload(asEvent(await demoFile(d.transcript)));
    setEditing(true);
    await sleep(500);
    for (const t of d.interests) { setF((x) => (x.research_interests.includes(t) ? x : { ...x, research_interests: [...x.research_interests, t] })); await sleep(450); }
    if (d.portfolio && !allDocs.some((x) => x.kind === "supporting")) await uploadSupporting(asEvent(await demoFile(d.portfolio)));
    await sleep(400);
    setSaveTick((n) => n + 1);
  });

  async function viewDoc(docId: string) {
    // REQ-PROF-3: open the viewer in-page; delayed signed URLs must not depend on browser popups.
    const request = ++previewRequest.current;
    const name = allDocs.find((d) => d.id === docId)?.file_name ?? "Document";
    setPreview({ id: docId, name, url: null, loading: true, error: null });
    setActiveDocId(docId);
    try {
      const res = await call((api) => api.documentUrl(docId));
      if (request === previewRequest.current) {
        setPreview({ id: docId, name, url: res.url ?? null, loading: false,
          error: res.url ? null : "This file is unavailable. Upload it again to view it." });
      }
    } catch (err) {
      if (request === previewRequest.current) {
        setPreview({ id: docId, name, url: null, loading: false,
          error: err instanceof ApiError ? err.message : "The document could not be opened. Please try again." });
      }
    } finally {
      if (request === previewRequest.current) setActiveDocId(null);
    }
  }

  function closePreview() {
    previewRequest.current += 1;
    setPreview(null);
    setActiveDocId(null);
  }

  function removeDoc(docId: string) {
    // REQ-PROF-3: cancelling or leaving the form must not delete a stored document.
    setPendingRemovals((ids) => ids.includes(docId) ? ids : [...ids, docId]);
    setEditing(true);
    setSaved(false);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    setPrefill(null);
    let removedAny = false;
    try {
      await call((api) =>
        api.updateProfile({
          school: f.school,
          degree: f.degree || null,
          cgpa: parseFloat(f.cgpa),
          year_of_study: parseInt(f.year_of_study, 10),
          completed_modules: f.completed_modules,
          research_interests: f.research_interests,
        })
      );
      setBaseline(JSON.stringify(f));
      for (const docId of pendingRemovals) {
        await call((api) => api.deleteDocument(docId));
        removedAny = true;
        // Keep any failed removals pending so a retry does not delete a file twice.
        setPendingRemovals((ids) => ids.filter((id) => id !== docId));
      }
      await refresh();
      setSaved(true);
      setEditing(false); // back to reading it
    } catch (err) {
      // A later removal may fail after an earlier one succeeded. Show the saved state before retrying.
      if (removedAny) await refresh();
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  const complete = !!p?.profile_complete;
  // REQ-PROF-1: the "complete your profile first" notice comes from the sidebar (a toast) when they try to leave, not as a permanent banner.
  const inline = error && !error.field ? <Banner tone="bad">{error.message}</Banner> : null;
  const locked = !transcriptDoc; // the transcript comes first: until it is uploaded nothing else can be filled in
  const editMode = !locked && (editing || !complete); // without a transcript there is nothing to edit yet: the profile reads as dashes
  const headline = [f.degree, f.school, f.year_of_study ? `Year ${f.year_of_study}` : null].filter(Boolean).join(" · ");

  function startEdit() { setSaved(false); setPrefill(null); setEditing(true); }
  function cancelEdit() {
    const next = fromProfile(p);
    setF(next); setBaseline(JSON.stringify(next));
    setPendingRemovals([]);
    setError(null); setPrefill(null); setSaved(false); setEditing(false);
  }
  function pickTranscript() {
    if (transcriptFile.current) {
      transcriptFile.current.value = "";
      transcriptFile.current.click();
    }
  }

  return (
    <form ref={formRef} onSubmit={save}>
      <PageTitle title={mustComplete ? "Complete your profile" : "My profile"} />

      {/* The two file inputs live here so they exist in every mode. The transcript one comes first on the page. */}
      <input ref={transcriptFile} type="file" accept="application/pdf" className="hidden" onClick={(e) => { (e.target as HTMLInputElement).value = ""; }} onChange={handleTranscriptUpload} />
      <input ref={file} type="file" accept="application/pdf" className="hidden" onChange={uploadSupporting} />

      {/* One notice at a time, most important first. "Saved" and the transcript note go away by themselves. */}
      <Reveal show={!!inline}>{inline}</Reveal>
      <Toast show={saved} tone="good" title="Saved." onClose={() => setSaved(false)}>Your profile is up to date.</Toast>
      {/* Sent here from another page (a typed address): say why. The sidebar shows the same notice when they click a tab. */}
      <Toast show={mustComplete && !complete && redirectNotice && !saved && !prefill} tone="warn" title="Please complete your profile first." onClose={() => setRedirectNotice(false)}>
        Upload your transcript, check your details and save before opening other pages.
      </Toast>
      <Toast show={!saved && prefill === "updated"} tone="good" title="Profile updated from your transcript." onClose={() => setPrefill(null)}>{changes}</Toast>
      <Toast show={!saved && prefill === "filled"} tone="accent" title="Transcript uploaded." onClose={() => setPrefill(null)}>Review your details and save changes.</Toast>
      <Toast show={!saved && prefill === "rejected"} tone="warn" title="That does not look like an NTU transcript." onClose={() => setPrefill(null)}>It needs your Cumulative GPA and the courses you passed. Nothing was uploaded.</Toast>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-stretch gap-5">
        <Card padded={false} className="h-full min-w-0">
          <div aria-hidden className="h-[72px] rounded-t-[16px] bg-[radial-gradient(120%_160%_at_0%_0%,#a9c8f5_0%,#d3e3fb_42%,#eaf1fd_100%)]" />
          <div className="px-8">
            <div className="-mt-9 flex items-end justify-between gap-4">
              <div className="rounded-full ring-4 ring-white shadow-[0_12px_28px_-14px_rgba(47,100,180,0.55)]">
                <Avatar name={me?.user.name ?? ""} size={76} tone="navy" />
              </div>
              {/* The same spot in both modes: Edit profile while reading, Cancel and Save while editing */}
              <div className="flex items-center gap-2">
                {!editMode && !locked && <Button type="button" variant="secondary" onClick={startEdit}>Edit profile</Button>}
                {editMode && (
                  <>
                    {dirty && <span className="mr-1 inline-flex items-center gap-2 text-[13px] text-muted"><span aria-hidden className="h-2 w-2 rounded-full bg-warn" />Unsaved changes</span>}
                    {(complete || pendingRemovals.length > 0) && <Button type="button" variant="secondary" disabled={busy} onClick={cancelEdit}>Cancel</Button>}
                    <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save changes"}</Button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-3 min-w-0 pb-6">
              <h2 className="truncate text-[24px] leading-[1.2] tracking-[-0.02em]">{me?.user.name}</h2>
              <div className={`mt-0.5 truncate text-[14.5px] ${headline ? "text-text/80" : "text-faint"}`}>{headline || "—"}</div>
              <div className="mt-0.5 truncate text-[13.5px] text-muted">{me?.user.email}</div>
            </div>
          </div>

          <fieldset disabled={busy} className="m-0 min-w-0 divide-y divide-border border-0 border-t border-border p-0 px-8">
            <Group title="Academic details">
              {editMode ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
            <Field label="School">
              <Select id="school" value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })} required>
                <option value="">Choose</option>
                {["CCDS", "EEE", "SBS", "MAE", "SPMS", "NBS", "CEE", "MSE"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>

            <Field label="Degree Course" hint={f.school ? `Offered under ${f.school}` : "Select your school first"}>
              <Select
                id="degree"
                required
                value={f.isDoubleDegree ? "Other" : f.degree}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "Other") {
                    setF({ ...f, isDoubleDegree: true, degree1: f.degree || ALL_NTU_DEGREES[0], degree2: ALL_NTU_DEGREES[1], degree: `${f.degree || ALL_NTU_DEGREES[0]} & ${ALL_NTU_DEGREES[1]} (Double Degree)` });
                  } else {
                    setF({ ...f, isDoubleDegree: false, degree: val, degree1: "", degree2: "" });
                  }
                }}
              >
                <option value="" disabled>Choose degree programme</option>
                {((f.school && NTU_DEGREES_BY_SCHOOL[f.school]) || ALL_NTU_DEGREES).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                <option value="Other">Other / Double Degree</option>
              </Select>
            </Field>

            {f.isDoubleDegree && (
              <div className="col-span-2 grid grid-cols-2 gap-3 p-4 card-flat">
                <Field label="Primary Degree">
                  <Select
                    value={f.degree1}
                    onChange={(e) => {
                      const d1 = e.target.value;
                      setF({ ...f, degree1: d1, degree: `${d1} & ${f.degree2 || "Second Major"} (Double Degree)` });
                    }}
                  >
                    <option value="">Select First Degree</option>
                    {ALL_NTU_DEGREES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Select>
                </Field>

                <Field label="Second Degree / Major">
                  <Select
                    value={f.degree2}
                    onChange={(e) => {
                      const d2 = e.target.value;
                      setF({ ...f, degree2: d2, degree: `${f.degree1 || "Primary Degree"} & ${d2} (Double Degree)` });
                    }}
                  >
                    <option value="">Select Second Degree</option>
                    {ALL_NTU_DEGREES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

            <Field label="CGPA" error={err("cgpa")} hint="0.00 to 5.00">
              <Input
                id="cgpa"
                type="number"
                step="0.01"
                min={0}
                max={5}
                value={f.cgpa}
                onChange={(e) => setF({ ...f, cgpa: e.target.value })}
                required
                invalid={!!err("cgpa")}
              />
            </Field>

            <Field label="Year of study">
              <Select
                id="year"
                value={f.year_of_study}
                onChange={(e) => setF({ ...f, year_of_study: e.target.value })}
                required
              >
                <option value="">Choose</option>
                {[1, 2, 3, 4, 5].map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
                </>
              ) : (
                <dl className="grid grid-cols-[1fr_2fr_1fr_1fr] gap-6">
                  <Item label="School" value={f.school} />
                  <Item label="Degree" value={f.degree} />
                  <Item label="CGPA" value={f.cgpa} />
                  <Item label="Year of study" value={f.year_of_study ? `Year ${f.year_of_study}` : ""} />
                </dl>
              )}
            </Group>

            <Group title="Modules">
              {editMode ? (
                <Field label="Completed modules" error={err("completed_modules")}>
                  <CoursePicker value={f.completed_modules} onChange={(v) => setF({ ...f, completed_modules: v })} />
                </Field>
              ) : (
                <div className="flex flex-wrap gap-1.5">{f.completed_modules.length ? f.completed_modules.map((m) => <Pill key={m}>{m}</Pill>) : <span className="text-[15px] text-faint">—</span>}</div>
              )}
            </Group>
          </fieldset>
        </Card>

        {/* Documents sit beside the profile, so an upload shows the form filling in. */}
        <div className="flex min-w-0 flex-col gap-5">
        <Card className={`!p-6 ${locked ? "flex-1" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px]">Documents</h2>
            {locked && <Pill tone="warn">Required</Pill>}
          </div>

          {locked ? (
            <div className="mt-4 flex flex-col items-center rounded-[16px] border border-dashed border-[#b9c9e2] bg-accent-soft/40 px-5 pb-6 pt-8 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-accent-ink shadow-[0_6px_16px_-8px_rgba(0,113,227,0.5),inset_0_0_0_1px_var(--accent-border)]"><I.Upload size={22} /></span>
              <div className="mt-4 font-display text-[16px] font-semibold tracking-[-0.01em]">Upload your transcript</div>
              <Button type="button" size="lg" className="mt-5" disabled={busy} onClick={pickTranscript}>{busy ? "Uploading..." : "Upload transcript"}</Button>
              <div className="mt-3 text-[12px] text-faint">PDF, up to 5 MB</div>
            </div>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-border">
                {transcriptDoc && (
                  <DocRow name={transcriptDoc.file_name} meta={`Transcript · ${(transcriptDoc.file_size / 1024).toFixed(0)} KB`} busy={activeDocId === transcriptDoc.id} onView={() => viewDoc(transcriptDoc.id)}>
                    <IconAction label="Replace transcript" disabled={busy} onClick={pickTranscript}><I.Upload size={16} /></IconAction>
                  </DocRow>
                )}
                {supportingDocs.map((d) => (
                  <DocRow key={d.id} name={d.file_name} meta={pendingRemovals.includes(d.id) ? "Will be removed when you save" : `Supporting · ${fmtDate(d.uploaded_at)}`} busy={activeDocId === d.id} onView={() => viewDoc(d.id)}>
                    {pendingRemovals.includes(d.id)
                      ? <Button type="button" variant="text" size="sm" disabled={busy} onClick={() => setPendingRemovals((ids) => ids.filter((id) => id !== d.id))}>Undo</Button>
                      : <IconAction label={`Delete ${d.file_name}`} danger disabled={busy || activeDocId === d.id} onClick={() => removeDoc(d.id)}><I.Trash size={16} /></IconAction>}
                  </DocRow>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
                  {!atMaxSupporting ? (
                    <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => { if (file.current) { file.current.value = ""; file.current.click(); } }}>
                      <I.Upload size={14} /> Add a document
                    </Button>
                  ) : (
                    <span className="text-[12.5px] text-muted">{pendingRemovals.length ? "Save your removals before adding another document." : "Limit reached. Remove a document and save to add another."}</span>
                  )}
                  <span className="text-[12.5px] text-muted tabular">{supportingCount} of 5</span>
                </div>
            </>
          )}
          {pendingRemovals.length > 0 && <p className="mt-3 text-[12.5px] text-muted">Save changes to confirm document removals, or Cancel to keep the files.</p>}
          {err("file") && <div className="mt-3 text-[12.5px] font-medium text-bad-ink">{err("file")}</div>}
        </Card>

        <Card className="flex-1 !p-6">
            <h2 className="text-[16px]">Research interests</h2>
            <InterestNetwork topics={f.research_interests} name={me?.user.name ?? ""} onRemove={editMode ? (t) => setF({ ...f, research_interests: f.research_interests.filter((x) => x !== t) }) : undefined} />
            {editMode && (
              <div className="mt-4 border-t border-border pt-4">
                <InterestSearch chosen={f.research_interests} onAdd={(t) => setF({ ...f, research_interests: [...f.research_interests, t] })} error={err("research_interests")} />
              </div>
            )}
        </Card>
        </div>
      </div>
      <Modal open={preview !== null} onClose={closePreview} title={preview?.name ?? "Document"} wide
        footer={<>{preview?.error && <Button type="button" variant="secondary" onClick={() => viewDoc(preview.id)}>Try again</Button>}<Button type="button" onClick={closePreview}>Close</Button></>}>
        {preview?.loading && <p role="status">Opening document...</p>}
        {preview?.error && <p role="alert" className="text-bad-ink">{preview.error}</p>}
        {preview?.url && <iframe src={`${preview.url}#toolbar=0&navpanes=0&view=FitH`} title={preview.name} className="h-[78vh] min-h-[280px] w-full border-0" />}
      </Modal>
    </form>
  );
}

/** Search topics and show the matches as labels underneath; click one to add it as a node. Nothing opens over the page. */
function InterestSearch({ chosen, onAdd, error }: { chosen: string[]; onAdd: (t: string) => void; error?: string | null }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ value: string; group?: string }[]>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    searchTopics(q, true).then((r) => { if (live) setFound(r); }).catch(() => { if (live) setFound([]); });
    return () => { live = false; };
  }, [q]);
  const shown = found.filter((o) => !chosen.includes(o.value)).slice(0, 12);
  return (
    <Field label="Research interests" error={error}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"><I.Search size={16} /></span>
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search topics" className={`${inputCls()} w-full pl-10`} />
      </div>
      <div role="listbox" aria-label="Matching topics" className="mt-1 flex min-h-[34px] flex-wrap gap-1.5">
        {shown.map((o) => (
          <button key={o.value} type="button" role="option" aria-selected="false" title={o.group}
            onClick={() => { onAdd(o.value); setQ(""); input.current?.focus(); }}
            className="inline-flex items-center gap-1 rounded-pill bg-white px-3 py-1 text-[12.5px] font-medium text-accent-ink shadow-[inset_0_0_0_1px_var(--accent-border)] transition-colors hover:bg-accent-soft">
            <I.Plus size={12} />{o.value}
          </button>
        ))}
        {q.trim() && shown.length === 0 && <span className="py-1 text-[13px] text-muted">{found.length ? "Already added" : "No standard topic matches"}</span>}
      </div>
      <div className="text-[12px] text-faint">{q.trim() ? "Click a topic to add it." : "Suggestions. Type to search all topics."}</div>
    </Field>
  );
}

/** Your interests as a small network: you in the middle, each topic a node joined to you by a line that draws itself in,
 *  and to its neighbours down each side. Topics alternate left and right so the labels never collide.
 *  With onRemove, a node can be clicked to take it away. A picture of the list, nothing more. */
function InterestNetwork({ topics, name, onRemove }: { topics: string[]; name: string; onRemove?: (t: string) => void }) {
  const W = 292, NW = 108, ROW = 62, PAD = 34, cx = W / 2;
  const yOf = (i: number) => PAD + Math.floor(i / 2) * ROW + (i % 2 ? 30 : 0);
  const H = Math.max(130, Math.max(0, ...topics.map((_, i) => yOf(i))) + PAD); // as tall as the last node needs, no more
  const cy = H / 2;
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
  if (!topics.length) return <div className="mt-3 text-[15px] text-faint">—</div>;
  const nodes = topics.map((t, i) => {
    const right = i % 2 === 1;
    return { t, right, y: yOf(i), x: right ? W - NW / 2 : NW / 2 };
  });
  return (
    <div className="relative mt-3 select-none" style={{ height: H }} role="group" aria-label={`Interest network: ${topics.join(", ")}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="net-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#6fa8ee" /><stop offset="1" stopColor="#2f64b4" />
          </linearGradient>
        </defs>
        {nodes.map((n, i) => nodes[i + 2] && (
          <line key={`s${n.t}`} x1={n.x} y1={n.y} x2={n.x} y2={nodes[i + 2].y} stroke="#9db4d6" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 3" />
        ))}
        {nodes.map((n, i) => (
          <path key={n.t} d={`M${cx} ${cy} Q${(cx + n.x) / 2} ${cy} ${n.x} ${n.y}`} pathLength={1} fill="none" stroke="url(#net-line)" strokeOpacity="0.6" strokeWidth="1.4" strokeLinecap="round"
            style={{ strokeDasharray: 1, animation: `net-draw .9s cubic-bezier(0.16, 1, 0.3, 1) ${0.08 * i}s backwards` }} />
        ))}
        <circle cx={cx} cy={cy} r="15" fill="none" stroke="#6fa8ee" strokeWidth="1.2" style={{ transformOrigin: `${cx}px ${cy}px`, animation: "ping-ring 3.4s ease-out infinite" }} />
      </svg>
      <span className="absolute z-[1] grid h-[30px] w-[30px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-b from-[#7fa6dc] to-[#2f5aa0] text-[11px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(47,100,180,0.7)] ring-2 ring-white"
        style={{ left: cx, top: cy }}>{initials}</span>
      {nodes.map((n, i) => {
        const cls = `absolute -translate-y-1/2 rounded-[14px] bg-white px-2.5 py-1.5 text-center text-[12px] font-medium leading-[1.25] text-accent-ink shadow-[inset_0_0_0_1px_var(--accent-border),0_6px_14px_-8px_rgba(47,100,180,0.5)] ${n.right ? "right-0" : "left-0"}`;
        const style = { top: n.y, width: NW, animation: `net-pop .5s cubic-bezier(0.16, 1, 0.3, 1) ${0.18 + 0.08 * i}s backwards` };
        return onRemove ? (
          <button key={n.t} type="button" title={`Remove ${n.t}`} aria-label={`Remove ${n.t}`} onClick={() => onRemove(n.t)} style={style}
            className={`${cls} group transition-colors hover:bg-bad-soft hover:text-bad-ink`}>
            <span className="line-clamp-2">{n.t}</span>
            <span aria-hidden className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 place-items-center rounded-full bg-bad text-white group-hover:grid"><I.X size={9} /></span>
          </button>
        ) : (
          <span key={n.t} title={n.t} style={style} className={cls}><span className="line-clamp-2">{n.t}</span></span>
        );
      })}
    </div>
  );
}

/** A block of the profile: its title, then its content. The blocks are separated by hairlines. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-7">
      <h2 className="text-[16px]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** One labelled value in the read-only view. */
function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className={`mt-0.5 truncate text-[15px] ${value ? "font-medium text-text" : "text-faint"}`}>{value || "—"}</dd>
    </div>
  );
}

/** A document as a plain row: the file, what it is, and its actions as icons. */
function DocRow({ name, meta, busy, onView, children }: { name: string; meta: string; busy?: boolean; onView: () => void; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-neutral-soft text-muted"><I.File size={16} /></span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-text" title={name}>{name}</div>
        <div className="text-[12px] text-muted tabular">{meta}</div>
      </div>
      <IconAction label={`View ${name}`} disabled={busy} onClick={onView}><I.Eye size={16} /></IconAction>
      {children}
    </li>
  );
}

/** A round icon button, quiet until hovered. The label is its tooltip and its accessible name. */
function IconAction({ label, danger, disabled, onClick, children }: { label: string; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors disabled:text-border-strong disabled:hover:bg-transparent ${danger ? "hover:bg-bad-soft hover:text-bad-ink" : "hover:bg-accent-soft hover:text-accent-ink"}`}>
      {children}
    </button>
  );
}

export default function Profile() {
  const { me } = useMe();
  const p = me?.student ?? null;
  return (
    <Suspense>
      <ProfileForm key={p?.user_id ?? "none"} p={p} />
    </Suspense>
  );
}
