"use client";
/** Shared by CreateProjectPage and EditProjectPage. REQ-PROJ-1..3.
 *  A new project is a guided flow in four steps, like Propose a project (the steps only guide; the API checks every rule again).
 *  An existing project is one page, so every field can be changed in one go.
 *  Buttons depend on state: new (Publish / Save as draft), draft (Publish / Save draft), published (Save changes).
 *  After the cycle closes, publishing and editing are refused by the API; the form explains why instead of failing. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { CoursePicker, TopicPicker } from "@/components/pickers";
import { Banner, Button, Card, Field, Input, LISTING_MODES as MODES, Pill, Select, Status, Stepper, Textarea } from "@/components/ui";
import { ApiError, type Listing, type ListingMode } from "@/lib/api/models";
import { useCall } from "@/lib/use-api";
import { canonicalVideo } from "@/lib/video";

const FACULTIES = ["CCDS", "EEE", "SBS", "MAE", "SPMS", "NBS", "CEE", "MSE"];
const MAX_PHOTOS = 4; // routers/listings.py MAX_GALLERY
const MIN_TITLE = 5;
const MIN_DESCRIPTION = 20;
const STEPS = [
  { title: "The project", note: "What students see first when they browse." },
  { title: "Details", note: "Topics, prerequisites, where it runs and how many students you can take." },
  { title: "What students will do", note: "Optional, but students choose projects they can picture themselves doing." },
  { title: "Photos and publish", note: "Add a cover and photos, check everything, then publish." },
];
/** Which step holds a field the server complained about, so the supervisor lands where the message is. */
const stepOf = (field?: string | null) =>
  field === "title" || field === "description" ? 0
    : field === "topic_tags" || field === "prerequisites" || field === "available_slots" || field === "offering_faculty" || field === "research_location" ? 1
    : field === "outcomes" || field === "skills" || field === "hours_per_week" || field === "video_url" ? 2 : 3;

export function ListingForm({ existing }: { existing?: Listing }) {
  const router = useRouter();
  const call = useCall();
  const { me } = useMe();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [tags, setTags] = useState<string[]>(existing?.topic_tags ?? []);
  const [prereqs, setPrereqs] = useState<string[]>(existing?.prerequisites ?? []);
  const [faculty, setFaculty] = useState(existing?.offering_faculty ?? me?.supervisor?.faculty ?? "CCDS");
  const [location, setLocation] = useState(existing?.research_location ?? "");
  const committed = (existing?.filled_slots ?? 0) + (existing?.held_slots ?? 0); // accepted plus open offers: REQ-PROJ-3
  const minSlots = Math.max(1, committed);
  const [slots, setSlots] = useState(existing?.available_slots ?? 1);
  // Optional project details
  const [outcomes, setOutcomes] = useState(existing?.outcomes ?? "");
  const [skills, setSkills] = useState(existing?.skills ?? "");
  const [hours, setHours] = useState(existing?.hours_per_week?.toString() ?? "");
  const [mode, setMode] = useState<ListingMode | "">(existing?.mode ?? "");
  const [video, setVideo] = useState(existing?.video_url ?? "");
  const videoBad = canonicalVideo(video) === undefined;
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<"publish" | "save" | null>(null);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0); // the furthest step the supervisor has moved on from; optional steps only count as done once passed
  const err = (k: string) => (error?.field === k ? error.message : null);

  // Cover image: existing listings upload immediately; new ones keep the file until the listing exists.
  const [coverUrl, setCoverUrl] = useState<string | null>(existing?.cover_url ?? null);
  const [pendingCover, setPendingCover] = useState<File | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  async function pickCover(file: File) {
    setCoverError(null);
    // Checked here for instant feedback; the API checks again (type, 5 MB, owner, closing date).
    if (!["image/jpeg", "image/png"].includes(file.type)) return setCoverError("Choose a JPEG or PNG image.");
    if (file.size > 5 * 1024 * 1024) return setCoverError("The image is larger than 5 MB.");
    if (!existing) { setPendingCover(file); setCoverUrl(URL.createObjectURL(file)); return; }
    setCoverBusy(true);
    try { setCoverUrl((await call((api) => api.uploadCover(existing.id, file))).cover_url ?? null); }
    catch (e) { setCoverError((e as ApiError).message); }
    finally { setCoverBusy(false); }
  }

  // Gallery: same pattern as the cover. Existing listings change straight away; new ones upload after creation.
  const [photos, setPhotos] = useState<string[]>(existing?.gallery_urls ?? []);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  async function addPhoto(file: File) {
    setPhotoError(null);
    if (!["image/jpeg", "image/png"].includes(file.type)) return setPhotoError("Choose a JPEG or PNG image.");
    if (file.size > 5 * 1024 * 1024) return setPhotoError("The image is larger than 5 MB.");
    if (!existing) { setPendingPhotos([...pendingPhotos, file]); setPhotos([...photos, URL.createObjectURL(file)]); return; }
    setPhotoBusy(true);
    try { setPhotos((await call((api) => api.addGalleryPhoto(existing.id, file))).gallery_urls ?? []); }
    catch (e) { setPhotoError((e as ApiError).message); }
    finally { setPhotoBusy(false); }
  }
  async function removePhoto(i: number) {
    setPhotoError(null);
    if (!existing) { setPendingPhotos(pendingPhotos.filter((_, j) => j !== i)); setPhotos(photos.filter((_, j) => j !== i)); return; }
    try { setPhotos((await call((api) => api.removeGalleryPhoto(existing.id, i))).gallery_urls ?? []); }
    catch (e) { setPhotoError((e as ApiError).message); }
  }

  const cycleClosed = me?.phase.window === "closed";
  const isDraft = existing?.status === "draft";
  const isClosedListing = existing?.status === "closed";
  const readOnly = !!existing && (cycleClosed || isClosedListing); // REQ-PROJ-2
  const titleOk = title.trim().length >= MIN_TITLE;
  const descriptionOk = description.trim().length >= MIN_DESCRIPTION;
  const textOk = titleOk && descriptionOk && !videoBad;

  async function submit(publish: boolean) {
    setBusy(publish ? "publish" : "save"); setError(null);
    const fields = { title: title.trim(), description, topic_tags: tags, prerequisites: prereqs, available_slots: slots, offering_faculty: faculty, research_location: location,
      outcomes, skills, hours_per_week: hours ? Number(hours) : null, mode: mode || null, video_url: video.trim() || null };
    try {
      if (existing) await call((api) => api.updateListing(existing.id, { ...fields, publish: publish || undefined }));
      else {
        const created = await call((api) => api.createListing({ ...fields, publish }));
        // A new listing has no id until it is created, so a chosen cover and photos upload right after.
        if (pendingCover) await call((api) => api.uploadCover(created.id, pendingCover));
        for (const f of pendingPhotos) await call((api) => api.addGalleryPhoto(created.id, f));
      }
      router.push("/projects");
    } catch (e) { setError(e as ApiError); if (!existing) setStep(stepOf((e as ApiError).field)); setBusy(null); }
  }

  // ---- the fields, written once and used by both the guided flow and the single page
  const titleField = (
    <Field label="Title" error={err("title")}>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Graph learning for traffic forecasting" invalid={!!err("title")} />
      {!existing && <Need ok={titleOk}>At least {MIN_TITLE} characters</Need>}
    </Field>
  );
  const descriptionField = (
    <Field label="Description" error={err("description")} hint={existing ? "What the student will do, the method, and the expected outcome." : undefined}>
      <Textarea rows={existing ? 7 : 8} value={description} onChange={(e) => setDescription(e.target.value)} invalid={!!err("description")}
        placeholder={existing ? undefined : "What the student will do, the method, and the expected outcome."} />
      {!existing && <Need ok={descriptionOk}>At least {MIN_DESCRIPTION} characters</Need>}
    </Field>
  );
  const detailFields = (
    <>
      <Field label="Topic tags" error={err("topic_tags")} hint="Choose from the standard list, so students can filter by topic.">
        <TopicPicker value={tags} onChange={setTags} invalid={!!err("topic_tags")} />
      </Field>
      <Field label="Prerequisites" error={err("prerequisites")} hint="NTU courses, optional. Students see which ones they are missing.">
        <CoursePicker value={prereqs} onChange={setPrereqs} invalid={!!err("prerequisites")} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Offering faculty">
          <Select value={faculty} onChange={(e) => setFaculty(e.target.value)}>{FACULTIES.map((s) => <option key={s}>{s}</option>)}</Select>
        </Field>
        <Field label="Research location">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. N4-02c Lab" />
        </Field>
      </div>
    </>
  );
  const capacityField = (
    <div>
      <div className="mb-1.5 text-[13px] font-medium">Capacity</div>
      <div className="flex items-center">
        <Stepper value={slots} onChange={setSlots} min={minSlots} max={20} format={(v) => `${v} ${v === 1 ? "slot" : "slots"}`} />
      </div>
      <div className="mt-1.5 text-[12px] text-faint">How many students you can take on this project.</div>
      {err("available_slots") && <div className="mt-2"><Banner tone="bad">{err("available_slots")}</Banner></div>}
    </div>
  );
  const doFields = (
    <>
      <Field label="Tasks and outputs" error={err("outcomes")} hint="One per line, e.g. Train a CNN grader. Shown as a list.">
        <Textarea rows={5} value={outcomes} onChange={(e) => setOutcomes(e.target.value)} maxLength={2000} invalid={!!err("outcomes")} />
      </Field>
      <Field label="Skills they will gain" error={err("skills")}>
        <Input value={skills} onChange={(e) => setSkills(e.target.value)} maxLength={1000} placeholder="e.g. PyTorch, model evaluation, scientific writing" invalid={!!err("skills")} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Hours per week" error={err("hours_per_week")}>
          <Input type="number" min={1} max={40} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 8" invalid={!!err("hours_per_week")} />
        </Field>
        <Field label="Mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value as ListingMode | "")}>
            <option value="">Not specified</option>
            {(Object.keys(MODES) as ListingMode[]).map((m) => <option key={m} value={m}>{MODES[m]}</option>)}
          </Select>
        </Field>
      </div>
    </>
  );
  const videoField = (
    <Field label="Video link" error={err("video_url") ?? (videoBad ? "Paste a YouTube or Vimeo link." : null)} hint="YouTube or Vimeo, e.g. a lab tour or a demo. Shown as a player on the project page.">
      <Input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" invalid={videoBad || !!err("video_url")} />
    </Field>
  );
  const photoField = (
    <div>
      <div className="grid grid-cols-4 gap-3">
        {photos.map((u, i) => (
          <div key={u} className="group relative aspect-[4/3] overflow-hidden rounded-row bg-neutral-soft">
            <img src={u} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            {!readOnly && (
              <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => removePhoto(i)}
                className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"><I.X size={12} /></button>
            )}
          </div>
        ))}
        {photos.length < MAX_PHOTOS && !readOnly && (
          <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-row border-[1.5px] border-dashed border-border-strong text-[12.5px] text-muted hover:bg-sunken">
            <I.Upload size={16} /> {photoBusy ? "Uploading…" : "Add photo"}
            <input type="file" accept="image/jpeg,image/png" className="hidden" disabled={photoBusy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {photoError
        ? <div className="mt-2 text-[12px] font-medium text-bad-ink">{photoError}</div>
        : <div className="mt-2 text-[11.5px] text-faint">Up to {MAX_PHOTOS} photos, JPEG or PNG, 5 MB each. {existing ? "Changes save straight away." : "They upload when you publish or save."}</div>}
    </div>
  );

  // ================================================================ a new project: guided steps
  if (!existing) {
    const stepOk = [titleOk && descriptionOk, true, !videoBad, true];
    let furthest = 0; // a step can be opened once every step before it is done
    while (furthest < 3 && stepOk[furthest]) furthest++;
    const next = (e: React.FormEvent) => {
      e.preventDefault();
      if (step < 3) { if (stepOk[step]) { setReached((r) => Math.max(r, step + 1)); setStep(step + 1); } return; } // Enter in a field moves on, it never publishes
      if (textOk && !cycleClosed && !busy) submit(true);
    };
    const slotText = `${slots} ${slots === 1 ? "slot" : "slots"}`;
    const subOf = (i: number) => i === 0 ? title.trim() : i === 1 ? (tags.length ? `${tags.length} ${tags.length === 1 ? "topic" : "topics"} · ${slotText}` : slotText) : i === 2 ? [hours && `${hours} h/week`, mode && MODES[mode]].filter(Boolean).join(" · ") : "";
    return (
      <form onSubmit={next}>
        {cycleClosed && <div className="mb-5"><Banner tone="warn">The cycle has closed. You can save a draft for the next cycle.</Banner></div>}
        {error && !error.field && <div className="mb-5"><Banner tone="bad">{error.message}</Banner></div>}
        <div className="grid grid-cols-[220px_minmax(0,1fr)] items-start gap-8">
          <nav aria-label="Project steps" className="sticky top-10">
            <ol className="relative flex flex-col gap-1">
              <span aria-hidden className="absolute bottom-6 left-[19px] top-6 w-px bg-[#d6e2f3]" />
              {STEPS.map((st, i) => {
                const current = i === step;
                const done = i < 3 && stepOk[i] && !current && i < reached;
                const reachable = i <= furthest;
                const sub = subOf(i);
                return (
                  <li key={st.title}>
                    <button type="button" disabled={!reachable} onClick={() => setStep(i)} aria-current={current ? "step" : undefined}
                      className={`relative flex w-full items-start gap-3 rounded-[14px] px-2 py-2.5 text-left transition-colors ${current ? "bg-white/70 shadow-[inset_0_0_0_1px_rgba(15,40,90,0.06)]" : reachable ? "hover:bg-white/50" : "cursor-not-allowed opacity-55"}`}>
                      <span className={`relative z-[1] mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular transition-colors ${done ? "bg-[var(--brand-steel)] text-white" : current ? "bg-accent text-white" : "bg-white text-faint shadow-[inset_0_0_0_1.5px_var(--border-strong)]"}`}>
                        {done ? <I.Tick size={12} /> : i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-[13.5px] leading-[1.3] ${current ? "font-semibold text-text" : "font-medium text-text/80"}`}>{st.title}</span>
                        {sub && <span className="block truncate text-[12px] text-muted">{sub}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <Card key={step} className="step-in flex min-w-0 flex-col gap-6 !p-7">
            <div>
              <div className="eyebrow">Step {step + 1} of {STEPS.length}</div>
              <h2 className="mt-1 text-[22px] tracking-[-0.02em]">{STEPS[step].title}</h2>
              <div className="mt-1 text-[14px] text-muted">{STEPS[step].note}</div>
            </div>

            {step === 0 && <div className="flex flex-col gap-5">{titleField}{descriptionField}</div>}
            {step === 1 && <div className="flex flex-col gap-5">{detailFields}{capacityField}</div>}
            {step === 2 && <div className="flex flex-col gap-5">{doFields}{videoField}</div>}
            {step === 3 && (
              <div className="flex flex-col gap-5">
                <div>
                  <div className="mb-2 text-[13px] font-medium">Cover image</div>
                  <CoverPicker url={coverUrl} disabled={false} busy={coverBusy} error={coverError} note="Uploads when you publish or save." onPick={pickCover} />
                </div>
                <div><div className="mb-2 text-[13px] font-medium">Photos</div>{photoField}</div>
                <div className="flex flex-col gap-3 pt-1">
                  <ReviewRow label="Project" onEdit={() => setStep(0)}>
                    <div className="text-[15px] font-semibold">{title}</div>
                    <p className="mt-1 line-clamp-3 whitespace-pre-line text-[13.5px] leading-[1.55] text-muted">{description}</p>
                  </ReviewRow>
                  <ReviewRow label="Details" onEdit={() => setStep(1)}>
                    <div className="text-[13.5px] text-muted">{[faculty, location, slotText].filter(Boolean).join(" · ")}</div>
                    {tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{tags.map((t) => <Pill key={t}>{t}</Pill>)}</div>}
                    {prereqs.length > 0 && <div className="mt-2 text-[12.5px] text-muted">Prerequisites: {prereqs.join(", ")}</div>}
                  </ReviewRow>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 border-t border-border pt-5">
              {step > 0 && <Button type="button" variant="secondary" size="lg" onClick={() => setStep(step - 1)}>Back</Button>}
              <div className="flex min-w-0 flex-1 justify-end">
                <Button type="button" variant="text" disabled={!!busy || !titleOk || videoBad} onClick={() => submit(false)}>{busy === "save" ? "Saving…" : "Save as draft"}</Button>
              </div>
              {step < 3
                ? <Button type="submit" size="lg" disabled={!stepOk[step]}>Continue</Button>
                : <Button type="submit" size="lg" disabled={!textOk || cycleClosed || !!busy}>{busy === "publish" ? "Publishing…" : "Publish listing"}</Button>}
            </div>
          </Card>
        </div>
      </form>
    );
  }

  // ================================================================ an existing project: one page
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(isDraft); }} className="grid grid-cols-[1fr_320px] items-start gap-6">
      <fieldset disabled={readOnly} className="min-w-0">
        {error && !error.field && <div className="mb-5"><Banner tone="bad">{error.message}</Banner></div>}
        <Card padded={false} className="divide-y divide-border overflow-hidden">
          <Section title="Project" note="What students see first when they browse.">{titleField}{descriptionField}</Section>
          <Section title="Details" note="Students filter by topic, and see which modules they are missing.">{detailFields}</Section>
          <Section title="What the student will do" note="Optional, but students choose projects they can picture themselves doing.">{doFields}</Section>
          <Section title="Photos and video" note="Optional. Show the lab, the equipment or a sample result.">{photoField}{videoField}</Section>
          <Section title="Capacity" note="How many students you can take on this project.">{capacityField}</Section>
        </Card>
      </fieldset>

      {/* Status and actions, kept in view */}
      <div className="sticky top-10 flex flex-col gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-semibold">Listing</div>
            <Status value={existing.status} kind="listing" />
          </div>

          {readOnly ? (
            <div className="mt-3"><Banner tone="warn">{isClosedListing ? "This listing is closed, so it can no longer be edited." : "The application cycle has closed. Listings can no longer be edited."}</Banner></div>
          ) : (
            <>
              <p className="mt-2 text-[13px] leading-[1.5] text-muted">
                {isDraft ? "This draft is only visible to you until you publish it." : "Changes are visible to students straight away."}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {isDraft && <Button type="submit" size="lg" className="w-full" disabled={!textOk || cycleClosed || !!busy}>{busy === "publish" ? "Publishing…" : "Publish listing"}</Button>}
                {isDraft ? (
                  <Button type="button" size="lg" variant="secondary" className="w-full" disabled={!!busy || !titleOk || videoBad} onClick={() => submit(false)}>{busy === "save" ? "Saving…" : "Save draft"}</Button>
                ) : (
                  <Button type="submit" size="lg" className="w-full" disabled={!textOk || !!busy}>{busy ? "Saving…" : "Save changes"}</Button>
                )}
              </div>
              {videoBad ? <div className="mt-3 text-[12.5px] text-faint">Fix the video link to save.</div> : !textOk && (
                <ul className="mt-3.5 flex flex-col gap-1.5" aria-label="Needed to publish">
                  <Need ok={titleOk}>A title, {MIN_TITLE} or more characters</Need>
                  <Need ok={descriptionOk}>A description, {MIN_DESCRIPTION} or more characters</Need>
                </ul>
              )}
            </>
          )}
        </Card>

        <Card>
          <div className="text-[15px] font-semibold">Cover image</div>
          <div className="mt-3">
            <CoverPicker url={coverUrl} disabled={readOnly} busy={coverBusy} error={coverError} note="Uploads straight away." onPick={pickCover} />
          </div>
        </Card>

        <div className="px-1 text-[12.5px] leading-[1.6] text-muted">
          <div className="mb-1 font-medium text-text">Good to know</div>
          Listings can be edited until the cycle closing date. Slots cannot go below the students already matched plus offers still open. Closing a listing hides it from students; matches are kept.
        </div>
      </div>
    </form>
  );
}

/** One part of the single-page form: its name and a line about it on the left, its fields on the right. */
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-[190px_1fr] gap-8 px-8 py-7">
      <div>
        <h2 className="text-[15px]">{title}</h2>
        {note && <div className="mt-1 text-[12.5px] leading-[1.5] text-muted">{note}</div>}
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}

/** A requirement under the field it belongs to: a hollow circle until it is met, then a green tick. */
function Need({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-1.5 text-[12.5px] transition-colors ${ok ? "text-good-ink" : "text-muted"}`}>
      <span aria-hidden className={`grid h-[14px] w-[14px] shrink-0 place-items-center rounded-full transition-colors ${ok ? "bg-good text-white" : "shadow-[inset_0_0_0_1.5px_var(--border-strong)]"}`}>{ok && <I.Tick size={9} />}</span>
      {children}
    </div>
  );
}

/** One answer on the review step, with a way back to the step that holds it. */
function ReviewRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="card-flat p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="eyebrow">{label}</span>
        <Button type="button" variant="text" size="sm" onClick={onEdit}>Edit</Button>
      </div>
      {children}
    </div>
  );
}

/** Cover image: preview plus a click-or-drop upload area. */
function CoverPicker({ url, disabled, busy, error, note, onPick }:
  { url: string | null; disabled: boolean; busy: boolean; error: string | null; note: string; onPick: (f: File) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div>
      <label
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f && !disabled) onPick(f); }}
        className={`group relative block h-[150px] w-full overflow-hidden rounded-row ${disabled ? "cursor-default" : "cursor-pointer"} ${over ? "ring-2 ring-accent" : ""}`}>
        {url
          ? <img src={url} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-gradient-to-br from-[#eef2ff] via-[#f5f5f7] to-[#eafaf4]" />}
        {!disabled && (
          <span className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[13px] font-medium transition-opacity ${url ? "bg-black/35 text-white opacity-0 group-hover:opacity-100" : "text-muted"} ${busy || over ? "opacity-100" : ""}`}>
            <I.Upload size={18} />
            {busy ? "Uploading…" : url ? "Replace image" : "Click or drop an image"}
          </span>
        )}
        <input type="file" accept="image/jpeg,image/png" className="hidden" disabled={disabled || busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
      </label>
      {error
        ? <div className="mt-2.5 text-[12.5px] font-medium text-bad-ink">{error}</div>
        : <div className="mt-2.5 text-[12.5px] text-faint">JPEG or PNG, up to 5 MB. {disabled ? "" : note}</div>}
    </div>
  );
}
