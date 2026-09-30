"use client";
/** SubmitUrecaApplication (SRS 4.10). REQ-APPLY-1..2. Screen: ApplyProjectPage. */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Banner, Button, Card, DeadlineChip, Field, Loading, Textarea } from "@/components/ui";
import { ApiError } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

export default function Apply() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useMe();
  const call = useCall();
  const { data: l, loading } = useApi((api) => api.listing(id), [id]);
  const [statement, setStatement] = useState("");
  const [docs, setDocs] = useState<string[]>(() => (me?.student?.documents ?? []).map((d) => d.id));
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading && !l) return <Loading />;
  if (!l) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await call((api) => api.apply({ listing_id: id, statement, document_ids: docs })); router.push("/my-applications?applied=1"); }
    catch (err) { setError(err as ApiError); } finally { setBusy(false); }
  }
  const dup = error?.code === "already_applied";

  return (
    <form onSubmit={submit}>
      <PageHeader title={`Apply: ${l.title}`} back={{ href: `/projects/${id}`, label: "Back to project" }} description={`${l.supervisor_name} · ${l.offering_faculty}`}
        right={me && <DeadlineChip>{me.phase.label}</DeadlineChip>} />
      <div className="grid grid-cols-[1fr_300px] gap-5">
        <div className="flex flex-col gap-4">
          {error && !error.field && (
            <Banner tone={dup ? "warn" : "bad"} action={dup ? <Link href="/my-applications" className="text-[12.5px] font-semibold underline">My applications</Link> : undefined}>{error.message}</Banner>
          )}
          <Card>
            <Field label="Statement of interest" error={error?.field === "statement" ? error.message : null} hint={`${statement.length} characters · minimum 50. Explain why this project and what you bring to it.`}>
              <Textarea id="statement" rows={9} value={statement} onChange={(e) => setStatement(e.target.value)} invalid={error?.field === "statement"} className="w-full" />
            </Field>
          </Card>
          <Card>
            <div className="eyebrow mb-2">Supporting documents</div>
            <div className="text-[12.5px] text-muted mb-3">From your profile. Untick any you do not want to attach.</div>
            <div className="flex flex-col gap-2">
              {(me?.student?.documents ?? []).map((d) => (
                <label key={d.id} className="flex items-center gap-3 px-3 py-2.5 border border-border rounded-button text-[12.5px]">
                  <input type="checkbox" checked={docs.includes(d.id)} onChange={(e) => setDocs(e.target.checked ? [...docs, d.id] : docs.filter((x) => x !== d.id))} />
                  <I.File size={14} /> {d.file_name} <span className="ml-auto text-faint">{Math.round(d.file_size / 1024)} KB</span>
                </label>
              ))}
              {!me?.student?.documents?.length && <div className="text-[12.5px] text-faint">No documents yet. <Link href="/profile">Upload a transcript</Link> (PDF, up to 5 MB).</div>}
            </div>
          </Card>
          <div className="flex items-center gap-3">
            <Button type="submit" size="lg" disabled={busy || statement.length < 50}>{busy ? "Submitting…" : "Submit application"}</Button>
            <span className="text-[12.5px] text-muted">It will be added as your next preference. Reorder in My applications.</span>
          </div>
        </div>
        <Card>
          <div className="eyebrow mb-2">Before you submit</div>
          <ul className="text-[12.5px] text-muted flex flex-col gap-2 list-disc pl-4">
            <li>Applications can be edited or withdrawn until the window closes.</li>
            <li>Rank all your applications; the matching uses that order.</li>
            <li>If you receive and decline an offer, you cannot join later rounds this cycle.</li>
          </ul>
        </Card>
      </div>
    </form>
  );
}
