"use client";
/** SubmitUrecaApplication (SRS 4.10). REQ-APPLY-1..2. Screen: ApplyProjectPage.
 *  The right-hand card is a live "Ready to submit?" checklist (the same pattern as Propose a project). It only mirrors the rules
 *  the form already enforces; it adds none. */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Banner, Button, Card, Field, Loading, Textarea } from "@/components/ui";
import { ApiError, type ApplicationTips } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";
import { useStanding } from "@/lib/use-standing";

const MIN_STATEMENT = 50;

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
  const [tips, setTips] = useState<ApplicationTips | null>(null);
  const [checking, setChecking] = useState(false);
  const [tipsFailed, setTipsFailed] = useState(false);
  const standing = useStanding();
  if ((loading && !l) || standing.loading) return <Loading />;
  if (!l) return null;
  if (standing.viewOnly) return ( // placed or ineligible: no form, just the reason (reached by a direct link)
    <>
      <PageHeader title={`Apply: ${l.title}`} back={{ href: `/projects/${id}`, label: "Back to project" }} description={`${l.supervisor_name} · ${l.offering_faculty}`} />
      <Banner tone={standing.placedIn ? "good" : "warn"} title={standing.placedIn ? "You have a project." : "You cannot apply this cycle."}
        action={<Link href="/my-applications" className="text-[12.5px] font-semibold underline whitespace-nowrap">My applications</Link>}>{standing.reason}</Banner>
    </>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await call((api) => api.apply({ listing_id: id, statement, document_ids: docs })); router.push("/my-applications?applied=1"); }
    catch (err) { setError(err as ApiError); } finally { setBusy(false); }
  }
  const dup = error?.code === "already_applied";
  const documents = me?.student?.documents ?? [];
  const long = statement.length >= MIN_STATEMENT;
  const windowOpen = me?.phase.window === "application";
  const canSubmit = !busy && long;

  /** REQ-APPLY-6. Saves nothing. A failure here must never get in the way of submitting. */
  async function checkApplication() {
    setChecking(true); setTipsFailed(false);
    try { setTips(await call((api) => api.applicationTips({ listing_id: id, statement, document_ids: docs }))); }
    catch { setTips(null); setTipsFailed(true); } finally { setChecking(false); }
  }

  return (
    <form onSubmit={submit}>
      <Link href={`/projects/${id}`} className="inline-flex items-center gap-1 text-[13.5px] font-medium text-accent mb-5 hover:text-accent-ink">
        <I.ChevronLeft /> Back to project
      </Link>
      <header className="flex items-center gap-5 mb-7">
        <div className="relative w-[72px] h-[72px] shrink-0 rounded-[16px] overflow-hidden bg-gradient-to-br from-[#e8f1fd] to-[#dfeafa]">
          {l.cover_url && <img src={l.cover_url} alt="" className="w-full h-full object-cover" />}
          <div aria-hidden className="absolute inset-0 rounded-[inherit] bg-gradient-to-t from-[#0b1f3a]/20 to-transparent shadow-[inset_0_0_0_1px_rgba(15,40,90,0.14)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Applying to</div>
          <h1 className="!text-[26px] !leading-[1.18] mt-0.5 line-clamp-2">{l.title}</h1>
          <div className="text-[14px] text-muted mt-1 truncate">{l.supervisor_name} · {l.offering_faculty}</div>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          {error && !error.field && (
            <Banner tone={dup ? "warn" : "bad"} action={dup ? <Link href="/my-applications" className="text-[12.5px] font-semibold underline">My applications</Link> : undefined}>{error.message}</Banner>
          )}
          <Card>
            <h2 className="text-[16px]">Why this project?</h2>
            <div className="text-[13.5px] text-muted mt-1 mb-4">Explain why this project and what you bring to it.</div>
            <Field label="Statement of interest" error={error?.field === "statement" ? error.message : null}>
              <Textarea id="statement" rows={10} value={statement} onChange={(e) => setStatement(e.target.value)} invalid={error?.field === "statement"} className="w-full" />
            </Field>
            <div className="mt-2.5 flex items-center gap-3">
              <span className="h-1 flex-1 rounded-full bg-[#dfe8f5] overflow-hidden" aria-hidden>
                <span className={`block h-full rounded-full transition-[width,background-color] duration-300 ${long ? "bg-good" : "bg-gradient-to-r from-[#6fa8ee] to-[#2f64b4]"}`} style={{ width: `${Math.min(100, (statement.length / MIN_STATEMENT) * 100)}%` }} />
              </span>
              <span className={`text-[12.5px] tabular whitespace-nowrap ${long ? "text-good-ink font-medium" : "text-muted"}`}>{statement.length} characters · minimum {MIN_STATEMENT}</span>
            </div>
          </Card>

          <Card>
            <h2 className="text-[16px]">Supporting documents</h2>
            <div className="text-[13.5px] text-muted mt-1 mb-4">From your profile. Untick any you do not want to attach.</div>
            <div className="flex flex-col gap-2">
              {documents.map((d) => {
                const on = docs.includes(d.id);
                return (
                  <label key={d.id} className={`flex items-center gap-3 px-3.5 py-3 rounded-[14px] cursor-pointer transition-colors ${on ? "bg-accent-soft/70 shadow-[inset_0_0_0_1px_var(--accent-border)]" : "bg-white/60 shadow-[inset_0_0_0_1px_var(--border)] hover:bg-white"}`}>
                    <input type="checkbox" className="w-4 h-4 accent-[#0071e3]" checked={on} onChange={(e) => setDocs(e.target.checked ? [...docs, d.id] : docs.filter((x) => x !== d.id))} />
                    <span className="w-8 h-8 rounded-[10px] grid place-items-center bg-white text-accent-ink shadow-[inset_0_0_0_1px_var(--accent-border)] shrink-0"><I.File size={15} /></span>
                    <span className="text-[13.5px] font-medium text-text truncate">{d.file_name}</span>
                    <span className="ml-auto text-[12.5px] text-faint tabular whitespace-nowrap">{Math.round(d.file_size / 1024)} KB</span>
                  </label>
                );
              })}
              {!documents.length && <div className="text-[13.5px] text-faint">No documents yet. <Link href="/profile">Upload a transcript</Link> (PDF, up to 5 MB).</div>}
            </div>
          </Card>
        </div>

        <aside className="sticky top-6 flex flex-col gap-4">
          <Card>
            <h2 className="text-[16px]">Ready to submit?</h2>
            <ul className="mt-3.5 flex flex-col gap-3 text-[13.5px]">
              <Check ok={windowOpen}>{windowOpen ? "Applications are open" : "Applications are closed"}</Check>
              <Check ok={long}>Statement, at least {MIN_STATEMENT} characters</Check>
              <Check ok={docs.length > 0} optional>{docs.length > 0 ? `${docs.length} ${docs.length === 1 ? "document" : "documents"} attached` : "No documents attached (optional)"}</Check>
            </ul>
            <Button type="submit" size="lg" className="w-full mt-5" disabled={!canSubmit}>{busy ? "Submitting…" : "Submit application"}</Button>
            <div className="text-[12.5px] text-muted mt-3 leading-[1.5]">
              {long ? "It will be added as your next preference. Reorder in My applications." : `Add ${MIN_STATEMENT - statement.length} more ${MIN_STATEMENT - statement.length === 1 ? "character" : "characters"} to submit.`}
            </div>
          </Card>
          <Card>
            <h2 className="text-[16px]">Check my application</h2>
            <div className="mt-1 text-[12.5px] leading-[1.5] text-muted">Tips on your draft. Optional, and not shared with the supervisor.</div>
            <Button type="button" variant="secondary" className="mt-3 w-full" disabled={checking || !statement.trim()} onClick={checkApplication}><I.Bulb size={15} /> {checking ? "Checking..." : tips ? "Check again" : "Check my application"}</Button>
            {tipsFailed && <div role="alert" className="mt-3 text-[12.5px] text-muted">Tips are not available right now. You can still submit.</div>}
            {tips && (
              <ul className="mt-3 flex flex-col gap-2.5 text-[12.5px] leading-[1.5]" aria-live="polite">
                {tips.tips.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className={`mt-0.5 shrink-0 ${t.tone === "good" ? "text-good" : "text-warn"}`}>{t.tone === "good" ? <I.CheckCircle size={15} /> : <I.Info size={15} />}</span>
                    <span>{t.text}</span>
                  </li>
                ))}
                {!tips.tips.length && <li className="text-muted">Nothing to flag.</li>}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </form>
  );
}

/** One line of the checklist: a filled tick when met, a hollow circle when not. `optional` ones are never blocking. */
function Check({ ok, optional, children }: { ok: boolean; optional?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span aria-hidden className={`w-[18px] h-[18px] shrink-0 rounded-full grid place-items-center transition-colors ${ok ? "bg-good text-white" : optional ? "shadow-[inset_0_0_0_1.5px_#d6dde9]" : "shadow-[inset_0_0_0_1.5px_var(--border-strong)]"}`}>
        {ok && <I.Tick size={11} />}
      </span>
      <span className={ok ? "text-text" : "text-muted"}>{children}</span>
    </li>
  );
}
