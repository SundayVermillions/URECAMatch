"use client";
/** Shared by CreateProjectPage and EditProjectPage. REQ-PROJ-1..3.
 *  Buttons depend on state: new (Publish / Save as draft), draft (Publish / Save draft), published (Save changes).
 *  After the cycle closes, publishing and editing are refused by the API; the form explains why instead of failing. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { CoursePicker, TopicPicker } from "@/components/pickers";
import { Banner, Button, Card, Field, Input, LISTING_MODES as MODES, Select, Status, Stepper, Textarea } from "@/components/ui";
import { ApiError, type Listing, type ListingMode } from "@/lib/api/models";
import { useCall } from "@/lib/use-api";
import { canonicalVideo } from "@/lib/video";

const FACULTIES = ["CCDS", "EEE", "SBS", "MAE", "SPMS", "NBS", "CEE", "MSE"];
const MAX_PHOTOS = 4; // routers/listings.py MAX_GALLERY

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
  const minSlots = Math.max(1, existing?.filled_slots ?? 1); // REQ-PROJ-3
  const [slots, setSlots] = useState(existing?.available_slots ?? 2);
  // Optional project details
  const [outcomes, setOutcomes] = useState(existing?.outcomes ?? "");
  const [skills, setSkills] = useState(existing?.skills ?? "");
  const [hours, setHours] = useState(existing?.hours_per_week?.toString() ?? "");
  const [mode, setMode] = useState<ListingMode | "">(existing?.mode ?? "");
  const [video, setVideo] = useState(existing?.video_url ?? "");
  const videoBad = canonicalVideo(video) === undefined;
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<"publish" | "save" | null>(null);
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
  const textOk = title.trim().length >= 5 && description.trim().length >= 20 && !videoBad;

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
    } catch (e) { setError(e as ApiError); setBusy(null); }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(!existing || isDraft); }} className="grid grid-cols-[1fr_320px] gap-6 items-start">
      <fieldset disabled={readOnly} className="flex flex-col gap-5 min-w-0">
        {error && !error.field && <Banner tone="bad">{error.message}</Banner>}

        <Section title="Project" note="What students see first when they browse.">
          <Field label="Title" error={err("title")}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Graph learning for traffic forecasting" invalid={!!err("title")} />
          </Field>
          <Field label="Description" error={err("description")} hint="What the student will do, the method, and the expected outcome.">
            <Textarea rows={7} value={description} onChange={(e) => setDescription(e.target.value)} invalid={!!err("description")} />
          </Field>
        </Section>

        <Section title="Details" note="Students filter by topic, and see which modules they are missing.">
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
        </Section>

        <Section title="What the student will do" note="Optional, but students choose projects they can picture themselves doing.">
          <Field label="Tasks and outputs" error={err("outcomes")} hint="One per line, e.g. Train a CNN grader. Shown as a list.">
            <Textarea rows={5} value={outcomes} onChange={(e) => setOutcomes(e.target.value)} maxLength={2000} invalid={!!err("outcomes")} />
          </Field>
          <Field label="Skills they will gain" error={err("skills")}>
            <Input value={skills} onChange={(e) => setSkills(e.target.value)} maxLength={1000} placeholder="e.g. PyTorch, model evaluation, scientific writing" invalid={!!err("skills")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Hours per week" error={err("hours_per_week")} hint="A typical week, 1 to 40.">
              <Input type="number" min={1} max={40} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 8" invalid={!!err("hours_per_week")} />
            </Field>
            <Field label="Mode">
              <Select value={mode} onChange={(e) => setMode(e.target.value as ListingMode | "")}>
                <option value="">Not specified</option>
                {(Object.keys(MODES) as ListingMode[]).map((m) => <option key={m} value={m}>{MODES[m]}</option>)}
              </Select>
            </Field>
          </div>
        </Section>

        <Section title="Photos and video" note="Optional. Show the lab, the equipment or a sample result.">
          <div>
            <div className="grid grid-cols-4 gap-3">
              {photos.map((u, i) => (
                <div key={u} className="group relative aspect-[4/3] rounded-row overflow-hidden bg-neutral-soft">
                  <img src={u} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  {!readOnly && (
                    <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => removePhoto(i)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/55 text-white inline-flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"><I.X size={12} /></button>
                  )}
                </div>
              ))}
              {photos.length < MAX_PHOTOS && !readOnly && (
                <label className="aspect-[4/3] rounded-row border-[1.5px] border-dashed border-border-strong flex flex-col items-center justify-center gap-1 text-[12.5px] text-muted cursor-pointer hover:bg-sunken">
                  <I.Upload size={16} /> {photoBusy ? "Uploading…" : "Add photo"}
                  <input type="file" accept="image/jpeg,image/png" className="hidden" disabled={photoBusy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = ""; }} />
                </label>
              )}
            </div>
            {photoError
              ? <div className="text-[12px] text-bad-ink font-medium mt-2">{photoError}</div>
              : <div className="text-[11.5px] text-faint mt-2">Up to {MAX_PHOTOS} photos, JPEG or PNG, 5 MB each. {existing ? "Changes save straight away." : "They upload when you publish or save."}</div>}
          </div>
          <Field label="Video link" error={err("video_url") ?? (videoBad ? "Paste a YouTube or Vimeo link." : null)} hint="YouTube or Vimeo, e.g. a lab tour or a demo. Shown as a player on the project page.">
            <Input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" invalid={videoBad || !!err("video_url")} />
          </Field>
        </Section>

        <Section title="Capacity" note="How many students you can take on this project.">
          <div className="flex items-center justify-between gap-4">
            <Stepper value={slots} onChange={setSlots} min={minSlots} max={20} format={(v) => `${v} ${v === 1 ? "slot" : "slots"}`} />
            {existing && existing.filled_slots > 0 && (
              <span className="text-[13px] text-muted">{existing.filled_slots} already matched, so at least {minSlots}</span>
            )}
          </div>
          {err("available_slots") && <Banner tone="bad">{err("available_slots")}</Banner>}
        </Section>
      </fieldset>

      {/* Status and actions, kept in view */}
      <div className="sticky top-10 flex flex-col gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-semibold">{existing ? "Listing" : "New listing"}</div>
            {existing && <Status value={existing.status} kind="listing" />}
          </div>

          {readOnly ? (
            <div className="mt-3"><Banner tone="warn">{isClosedListing ? "This listing is closed, so it can no longer be edited." : "The application cycle has closed. Listings can no longer be edited."}</Banner></div>
          ) : (
            <>
              {cycleClosed && !existing && <div className="mt-3"><Banner tone="warn">The cycle has closed. You can save a draft for the next cycle.</Banner></div>}
              <p className="text-[13px] text-muted mt-2 leading-[1.5]">
                {!existing ? "Publish now so students can find it, or save a draft to finish later."
                  : isDraft ? "This draft is only visible to you until you publish it."
                  : "Changes are visible to students straight away."}
              </p>
              <div className="flex flex-col gap-2 mt-4">
                {(!existing || isDraft) && (
                  <Button type="submit" size="lg" className="w-full" disabled={!textOk || cycleClosed || !!busy}>{busy === "publish" ? "Publishing…" : "Publish listing"}</Button>
                )}
                {(!existing || isDraft) ? (
                  <Button type="button" size="lg" variant="secondary" className="w-full" disabled={!!busy || title.trim().length < 5 || videoBad} onClick={() => submit(false)}>{busy === "save" ? "Saving…" : isDraft ? "Save draft" : "Save as draft"}</Button>
                ) : (
                  <Button type="submit" size="lg" className="w-full" disabled={!textOk || !!busy}>{busy ? "Saving…" : "Save changes"}</Button>
                )}
              </div>
              {videoBad ? <div className="text-[12.5px] text-faint mt-2.5">Fix the video link to save.</div> : !textOk && <div className="text-[12.5px] text-faint mt-2.5">Add a title (5+ characters) and a description (20+ characters) to publish.</div>}
            </>
          )}
        </Card>

        <CoverPicker
          url={coverUrl}
          disabled={readOnly}
          busy={coverBusy}
          error={coverError}
          note={existing ? "Uploads straight away." : "Uploads when you publish or save."}
          onPick={pickCover}
        />

        <div className="px-1 text-[12.5px] text-muted leading-[1.6]">
          <div className="font-medium text-text mb-1">Good to know</div>
          Listings can be edited until the cycle closing date. Slots cannot go below the number of students already matched. Closing a listing hides it from students; matches are kept.
        </div>
      </div>
    </form>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-[16px]">{title}</h2>
        {note && <div className="text-[13px] text-muted mt-0.5">{note}</div>}
      </div>
      {children}
    </Card>
  );
}

/** Cover image card: preview plus a click-or-drop upload area. */
function CoverPicker({ url, disabled, busy, error, note, onPick }:
  { url: string | null; disabled: boolean; busy: boolean; error: string | null; note: string; onPick: (f: File) => void }) {
  const [over, setOver] = useState(false);
  return (
    <Card>
      <div className="text-[15px] font-semibold">Cover image</div>
      <label
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f && !disabled) onPick(f); }}
        className={`group relative mt-3 block w-full h-[150px] rounded-row overflow-hidden ${disabled ? "cursor-default" : "cursor-pointer"} ${over ? "ring-2 ring-accent" : ""}`}>
        {url
          ? <img src={url} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-gradient-to-br from-[#eef2ff] via-[#f5f5f7] to-[#eafaf4]" />}
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
        ? <div className="text-[12.5px] text-bad-ink font-medium mt-2.5">{error}</div>
        : <div className="text-[12.5px] text-faint mt-2.5">JPEG or PNG, up to 5 MB. {disabled ? "" : note}</div>}
    </Card>
  );
}
