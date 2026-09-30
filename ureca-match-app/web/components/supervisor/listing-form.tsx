"use client";
/** Shared by CreateProjectPage and EditProjectPage. REQ-PROJ-1..3. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { ApiError, type Listing, type ListingCreate } from "@/lib/api/models";
import { useCall } from "@/lib/use-api";

export function ListingForm({ existing }: { existing?: Listing }) {
  const router = useRouter();
  const call = useCall();
  const [f, setF] = useState({
    title: existing?.title ?? "", description: existing?.description ?? "", prerequisites: existing?.prerequisites.join(", ") ?? "",
    topic_tags: existing?.topic_tags.join(", ") ?? "", available_slots: existing?.available_slots ?? 2,
    offering_faculty: existing?.offering_faculty ?? "CCDS", research_location: existing?.research_location ?? "",
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const err = (k: string) => (error?.field === k ? error.message : null);
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function submit(publish: boolean) {
    setBusy(true); setError(null);
    const body: ListingCreate = { ...f, prerequisites: list(f.prerequisites).map((p) => p.toUpperCase()), topic_tags: list(f.topic_tags), available_slots: Number(f.available_slots), publish };
    try {
      if (existing) await call((api) => api.updateListing(existing.id, body));
      else await call((api) => api.createListing(body));
      router.push("/projects");
    } catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(true); }} className="grid grid-cols-[1fr_320px] gap-5">
      <Card className="flex flex-col gap-4">
        {error && !error.field && <Banner tone="bad">{error.message}</Banner>}
        <Field label="Title" error={err("title")}><Input id="title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={5} invalid={!!err("title")} /></Field>
        <Field label="Description" error={err("description")} hint="What the student will do, the method, and the expected outcome. Minimum 20 characters.">
          <Textarea id="description" rows={7} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required invalid={!!err("description")} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Prerequisites" hint="Course codes, comma separated. Optional."><Input id="prereq" value={f.prerequisites} onChange={(e) => setF({ ...f, prerequisites: e.target.value })} placeholder="SC4001" /></Field>
          <Field label="Topic tags" hint="Comma separated. Students filter by these."><Input id="tags" value={f.topic_tags} onChange={(e) => setF({ ...f, topic_tags: e.target.value })} placeholder="Machine Learning, Healthcare AI" /></Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Slots" error={err("available_slots")} hint={existing ? `${existing.filled_slots} already matched` : undefined}>
            <Input id="slots" type="number" min={Math.max(1, existing?.filled_slots ?? 1)} max={20} value={f.available_slots} onChange={(e) => setF({ ...f, available_slots: Number(e.target.value) })} invalid={!!err("available_slots")} />
          </Field>
          <Field label="Offering faculty"><Select id="faculty" value={f.offering_faculty} onChange={(e) => setF({ ...f, offering_faculty: e.target.value })}>{["CCDS", "EEE", "SBS", "MAE", "SPMS", "NBS", "CEE", "MSE"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Research location"><Input id="location" value={f.research_location} onChange={(e) => setF({ ...f, research_location: e.target.value })} placeholder="N4-02c Lab" /></Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="lg" disabled={busy}>{existing ? "Save changes" : "Publish listing"}</Button>
          {!existing && <Button type="button" size="lg" variant="secondary" disabled={busy} onClick={() => submit(false)}>Save as draft</Button>}
        </div>
      </Card>
      <Card>
        <div className="eyebrow mb-2">Cover image</div>
        {existing?.cover_url ? <img src={existing.cover_url} alt="" className="w-full h-[120px] object-cover rounded-button mb-3" /> : <div className="w-full h-[120px] bg-sunken rounded-button mb-3" />}
        <label className="flex items-center justify-center h-10 border-[1.5px] border-dashed border-border-strong rounded-[9px] text-[12.5px] text-muted cursor-pointer hover:bg-sunken">
          JPEG or PNG · up to 5 MB<input type="file" accept="image/jpeg,image/png" className="hidden" />
        </label>
        <div className="text-[11.5px] text-faint mt-2">TODO(slice B): upload to the covers bucket.</div>
        <div className="eyebrow mt-5 mb-2">Rules</div>
        <ul className="text-[12.5px] text-muted list-disc pl-4 flex flex-col gap-1.5">
          <li>Editable until the cycle closing date.</li>
          <li>Slots cannot go below the number of students already matched.</li>
          <li>Closing a listing hides it from students; matches are kept.</li>
        </ul>
      </Card>
    </form>
  );
}
