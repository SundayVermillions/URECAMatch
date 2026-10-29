"use client";
/** Student profile page. REQ-PROF-1..3. */
import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CoursePicker, TopicPicker } from "@/components/pickers";
import { PageTitle } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Avatar, Banner, Button, Card, Field, Input, Pill, Select, fmtDate } from "@/components/ui";
import { ApiError, type StudentProfile } from "@/lib/api/models";
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

function ProfileForm({ p }: { p: StudentProfile | null }) {
  const { me, refresh } = useMe();
  const call = useCall();
  const mustComplete = useSearchParams().get("complete") === "1";

  const [f, setF] = useState(() => ({
    school: p?.school ?? "",
    degree: p?.degree || (p?.school ? (NTU_DEGREES_BY_SCHOOL[p.school]?.[0] ?? "Computer Science") : ""),
    isDoubleDegree: (p?.degree?.includes("(Double Degree)") || p?.degree?.includes(" & ")) ?? false,
    degree1: p?.degree?.split(" & ")[0] ?? "",
    degree2: p?.degree?.split(" & ")[1]?.replace(" (Double Degree)", "") ?? "",
    cgpa: p?.cgpa?.toString() ?? "",
    year_of_study: p?.year_of_study?.toString() ?? "",
    completed_modules: p?.completed_modules ?? [],
    research_interests: p?.research_interests ?? [],
  }));

  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<"filled" | "none" | null>(null);

  const file = useRef<HTMLInputElement>(null);
  const transcriptFile = useRef<HTMLInputElement>(null);
  const err = (k: string) => (error?.field === k ? error.message : null);

  // The server tags every file with a slot (`kind`), so the split never depends on the file name.
  const allDocs = p?.documents ?? [];
  const transcriptDoc = allDocs.find((d) => d.kind === "transcript");
  const supportingDocs = allDocs.filter((d) => d.kind !== "transcript");
  const supportingCount = supportingDocs.length;
  const atMaxSupporting = supportingCount >= 5;

  /** Fill the form from the transcript. Only fields that were found are changed, and nothing is saved until the student presses Save. */
  async function prefillFromTranscript(pdf: File) {
    setSaved(false);
    try {
      const t = await call((api) => api.parseTranscript(pdf));
      const school = t.school in NTU_DEGREES_BY_SCHOOL ? t.school : "";
      const found = !!(t.cgpa != null || school || t.year_of_study || t.completed_modules.length);
      setF((cur) => ({
        ...cur,
        school: school || cur.school,
        ...(school && NTU_DEGREES_BY_SCHOOL[school].includes(t.degree)
          ? { degree: t.degree, isDoubleDegree: false, degree1: "", degree2: "" }
          : {}),
        cgpa: t.cgpa != null ? t.cgpa.toFixed(2) : cur.cgpa,
        year_of_study: t.year_of_study ? String(t.year_of_study) : cur.year_of_study,
        completed_modules: t.completed_modules.length ? t.completed_modules : cur.completed_modules,
      }));
      setPrefill(found ? "filled" : "none");
    } catch {
      setPrefill("none"); // the upload itself worked, so a transcript we cannot read is not an error
    }
  }

  async function handleTranscriptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const originalFile = e.target.files?.[0];
    if (!originalFile) return;
    setError(null);
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
      await call((api) => api.uploadDocument(originalFile, "transcript")); // replaces any existing transcript
      await prefillFromTranscript(originalFile);
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

  async function viewDoc(docId: string) {
    setActiveDocId(docId);
    setError(null);
    try {
      const res = await call((api) => api.documentUrl(docId));
      if (res?.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setActiveDocId(null);
    }
  }

  async function removeDoc(docId: string) {
    if (!confirm("Remove this document?")) return;
    setActiveDocId(docId);
    setError(null);
    try {
      await call((api) => api.deleteDocument(docId));
      await refresh();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setActiveDocId(null);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
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
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <PageTitle title={mustComplete ? "Complete your profile" : "My profile"} />

      {mustComplete && !p?.profile_complete && (
        <div className="mb-4">
          <Banner tone="accent" title="One step before you apply.">
            Fill in your academic details and upload your transcript.
          </Banner>
        </div>
      )}

      {prefill && (
        <div className="mb-4">
          {prefill === "filled" ? (
            <Banner tone="accent" title="Filled in from your transcript.">
              Check CGPA, school, degree, year and modules, then press Save changes.
            </Banner>
          ) : (
            <Banner tone="warn" title="We could not read details from this transcript.">
              Your file is uploaded. Fill in the details below by hand.
            </Banner>
          )}
        </div>
      )}

      {saved && (
        <div className="mb-4">
          <Banner tone="good" title="Saved.">
            Your profile is up to date.
          </Banner>
        </div>
      )}

      {error && !error.field && (
        <div className="mb-4">
          <Banner tone="bad">{error.message}</Banner>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <Card className="flex flex-col gap-7">
          <div className="flex items-center gap-4">
            <Avatar name={me?.user.name ?? ""} size={52} tone="navy" />
            <div className="min-w-0">
              <div className="text-[18px] font-semibold tracking-[-0.01em] truncate">{me?.user.name}</div>
              <div className="text-[13.5px] text-muted truncate">{me?.user.email}</div>
            </div>
            <Pill tone={p?.profile_complete ? "good" : "warn"} className="ml-auto shrink-0">{p?.profile_complete ? "Profile complete" : "Incomplete"}</Pill>
          </div>

          <section>
            <h2 className="text-[16px]">Academic details</h2>
            <div className="text-[13.5px] text-muted mt-0.5 mb-4">Supervisors see this when they review your applications.</div>
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

          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-[16px]">Modules and interests</h2>
          <Field label="Completed modules" error={err("completed_modules")}>
            <CoursePicker value={f.completed_modules} onChange={(v) => setF({ ...f, completed_modules: v })} />
          </Field>

          <Field label="Research interests" error={err("research_interests")}>
            <TopicPicker value={f.research_interests} onChange={(v) => setF({ ...f, research_interests: v })} />
          </Field>

          </section>

          <div className="flex items-center gap-3 pt-5 border-t border-border">
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col gap-7">
          {/* Dedicated Academic Transcript Slot (the first file input on the page, which the end-to-end test relies on) */}
          <input
            ref={transcriptFile}
            type="file"
            accept="application/pdf"
            className="hidden"
            onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
            onChange={handleTranscriptUpload}
          />

          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px]">Academic transcript</h2>
              <Pill tone="accent">Required</Pill>
            </div>
            <div className="text-[13.5px] text-muted mt-0.5 mb-4">
              Official NTU transcript (PDF, max 5 MB). Used for CGPA and prerequisite eligibility.
            </div>

            {transcriptDoc ? (
              <div className="card-flat p-3.5">
                <div className="flex items-center gap-3">
                  <DocTile />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-text" title={transcriptDoc.file_name}>{transcriptDoc.file_name}</div>
                    <div className="text-[12px] text-muted tabular">{(transcriptDoc.file_size / 1024).toFixed(0)} KB · uploaded {fmtDate(transcriptDoc.uploaded_at)}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button type="button" size="sm" variant="soft" onClick={() => viewDoc(transcriptDoc.id)} disabled={activeDocId === transcriptDoc.id}>View</Button>
                  <Button
                    type="button" size="sm" variant="secondary" disabled={busy}
                    onClick={() => {
                      if (transcriptFile.current) {
                        transcriptFile.current.value = "";
                        transcriptFile.current.click();
                      }
                    }}
                  >
                    Re-upload
                  </Button>
                  <DeleteIcon label="Delete transcript" disabled={activeDocId === transcriptDoc.id} onClick={() => removeDoc(transcriptDoc.id)} />
                </div>
              </div>
            ) : (
              <div className="rounded-[16px] border border-dashed border-[#b9c9e2] bg-accent-soft/40 px-4 py-6 text-center">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (transcriptFile.current) {
                      transcriptFile.current.value = "";
                      transcriptFile.current.click();
                    }
                  }}
                >
                  <I.Upload size={14} /> Upload Academic Transcript
                </Button>
                <div className="text-[12.5px] text-faint mt-2">PDF only, max 5 MB</div>
              </div>
            )}
          </section>

          {/* Supporting Documents (Max 5) */}
          <section className="border-t border-border pt-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px]">Supporting documents</h2>
              <span className="text-[12.5px] font-medium text-muted tabular">{supportingCount} of 5</span>
            </div>
            <div className="text-[13.5px] text-muted mt-0.5 mb-4">
              Optional files such as a CV, certificates or writing samples. PDF only, up to 5 MB each.
            </div>

            <div className="flex flex-col gap-2 mb-4">
              {supportingDocs.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-[#c3d0e4] bg-white/40 px-4 py-4 text-[13px] text-faint text-center">No supporting documents yet</div>
              ) : (
                supportingDocs.map((d) => (
                  <div key={d.id} className="card-flat flex items-center gap-3 px-3 py-2.5">
                    <DocTile small />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-text" title={d.file_name}>{d.file_name}</div>
                      <div className="text-[12px] text-faint tabular">{fmtDate(d.uploaded_at)}</div>
                    </div>
                    <Button type="button" size="sm" variant="text" onClick={() => viewDoc(d.id)} disabled={activeDocId === d.id}>View</Button>
                    <DeleteIcon label={`Delete ${d.file_name}`} disabled={activeDocId === d.id} onClick={() => removeDoc(d.id)} />
                  </div>
                ))
              )}
            </div>

            <input ref={file} type="file" accept="application/pdf" className="hidden" onChange={uploadSupporting} />
            {!atMaxSupporting ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (file.current) {
                    file.current.value = "";
                    file.current.click();
                  }
                }}
              >
                <I.Upload size={14} /> Upload supporting document
              </Button>
            ) : (
              <div className="card-flat px-3.5 py-3 text-center text-[12.5px] text-muted">
                Maximum of 5 documents reached. Delete an existing document to upload another.
              </div>
            )}
            {err("file") && <div className="text-[12.5px] text-bad-ink font-medium mt-2">{err("file")}</div>}
          </section>
        </Card>
      </div>
    </form>
  );
}

/** A file icon on a small white tile with a blue hairline. */
function DocTile({ small }: { small?: boolean }) {
  return (
    <span className={`${small ? "w-8 h-8 rounded-[10px]" : "w-10 h-10 rounded-[12px]"} shrink-0 grid place-items-center bg-white text-accent-ink shadow-[inset_0_0_0_1px_var(--accent-border)]`}>
      <I.File size={small ? 15 : 17} />
    </span>
  );
}

/** Delete as a trash can: quiet until hovered, then red (the same control as Withdraw on My applications). */
function DeleteIcon({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="ml-auto w-9 h-9 shrink-0 rounded-full inline-flex items-center justify-center text-muted transition-colors hover:bg-bad-soft hover:text-bad-ink disabled:text-border-strong disabled:hover:bg-transparent">
      <I.Trash size={16} />
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
