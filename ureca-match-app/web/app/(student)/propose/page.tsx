"use client";
/** SelfProposeUrecaApplication (4.12). REQ-PROPOSE-1..3. Screens: ProposeProjectPage, ProposalSuccessPage.
 *  The checklist only guides the student; every rule is enforced again by POST /proposals. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Avatar, Banner, Button, Card, DeadlineChip, Field, Input, Loading, Textarea } from "@/components/ui";
import { ApiError, type Proposal, type SupervisorSummary } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

const DESCRIPTION_MAX_WORDS = 500; // same limits as routers/proposals.py
const STATEMENT_MAX_WORDS = 300;
const MIN_CHARS = 50;
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

export default function Propose() {
  const { me } = useMe();
  const call = useCall();
  const sups = useApi((api) => api.supervisors(), []);
  const docs = me?.student?.documents ?? [];
  const [supervisor, setSupervisor] = useState<SupervisorSummary | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [interests, setInterests] = useState<string[]>(me?.student?.research_interests ?? []);
  const [statement, setStatement] = useState("");
  const [attached, setAttached] = useState<string[] | null>(null); // null = default: attach the transcript(s)
  const docIds = attached ?? docs.filter((d) => /transcript/i.test(d.file_name)).map((d) => d.id);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const err = (k: string) => (error?.field === k ? error.message : null);
  const closed = me?.phase.window !== "application"; // REQ-PROPOSE-3

  const checks = [
    { label: "Supervisor chosen", ok: !!supervisor },
    { label: "Title", ok: title.trim().length >= 5 },
    { label: `Description, at least ${MIN_CHARS} characters`, ok: description.trim().length >= MIN_CHARS && words(description) <= DESCRIPTION_MAX_WORDS },
    { label: "At least one research interest", ok: interests.length > 0 },
    { label: `Why this supervisor, at least ${MIN_CHARS} characters`, ok: statement.trim().length >= MIN_CHARS && words(statement) <= STATEMENT_MAX_WORDS },
  ];
  const ready = checks.every((c) => c.ok) && !closed;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !supervisor) return;
    setBusy(true); setError(null);
    try {
      setDone(await call((api) => api.propose({ supervisor_id: supervisor.id, title: title.trim(), description, research_interests: interests, statement, document_ids: docIds })));
    } catch (x) { setError(x as ApiError); } finally { setBusy(false); }
  }

  if (done) return <Sent p={done} />;

  return (
    <form onSubmit={submit}>
      <PageHeader title="Propose a project" description="Pitch your own research idea directly to a supervisor. If they accept, you are registered to it and leave the matching pool."
        right={me && <DeadlineChip>{me.phase.label}</DeadlineChip>} />
      {closed && <div className="mb-5"><Banner tone="warn" title="Proposals are closed.">{me?.phase.label}. You can send a proposal during an application window.</Banner></div>}
      {error && !error.field && <div className="mb-5"><Banner tone="bad">{error.message}</Banner></div>}

      <div className="grid grid-cols-[1fr_300px] gap-6 items-start">
        <div className="flex flex-col gap-5">
          <Section title="Supervisor" note="Who you would like to supervise this project.">
            {sups.loading && !sups.data ? <Loading /> : (
              <SupervisorPicker options={sups.data ?? []} value={supervisor} onChange={setSupervisor} error={err("supervisor_id")} />
            )}
          </Section>

          <Section title="Your project">
            <Field label="Title" error={err("title")}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Graph models for protein folding" invalid={!!err("title")} />
            </Field>
            <Field label="Description" error={err("description")}>
              <Textarea rows={7} value={description} onChange={(e) => setDescription(e.target.value)} invalid={!!err("description")}
                placeholder="What you will build or study, your method, and the deliverable." />
              <WordCount text={description} max={DESCRIPTION_MAX_WORDS} />
            </Field>
            <Field label="Research interests" error={err("research_interests")} hint="Press Enter or comma to add. Prefilled from your profile.">
              <TagInput value={interests} onChange={setInterests} invalid={!!err("research_interests")} />
            </Field>
          </Section>

          <Section title="Why this supervisor" note="Your motivation, relevant modules or experience, and why this person fits.">
            <Field label="Statement" error={err("statement")}>
              <Textarea rows={5} value={statement} onChange={(e) => setStatement(e.target.value)} invalid={!!err("statement")} />
              <WordCount text={statement} max={STATEMENT_MAX_WORDS} />
            </Field>
          </Section>

          <Section title="Documents" note="The supervisor sees only what you attach.">
            {err("document_ids") && <Banner tone="bad">{err("document_ids")}</Banner>}
            {docs.length === 0 ? (
              <div className="text-[13.5px] text-muted">No documents yet. Upload your transcript in <Link href="/profile" className="font-medium">My profile</Link>.</div>
            ) : (
              <div className="rounded-row ring-1 ring-border overflow-hidden">
                {docs.map((d, i) => {
                  const on = docIds.includes(d.id);
                  return (
                    <label key={d.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bg transition-colors ${i ? "border-t border-border" : ""}`}>
                      <input type="checkbox" checked={on} onChange={() => setAttached(on ? docIds.filter((x) => x !== d.id) : [...docIds, d.id])} className="w-4 h-4 accent-[var(--accent)]" />
                      <span className="w-8 h-8 rounded-[8px] bg-bad-soft text-bad-ink inline-flex items-center justify-center shrink-0"><I.File size={15} /></span>
                      <span className="flex-1 min-w-0 text-[14px] text-text truncate">{d.file_name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        {/* Checklist and send, kept in view while the student scrolls */}
        <Card className="sticky top-10">
          <div className="text-[15px] font-semibold">Ready to send?</div>
          <ul className="mt-3 flex flex-col gap-2.5">
            {checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2.5 text-[13.5px]">
                <span className={`mt-0.5 w-[18px] h-[18px] rounded-full shrink-0 inline-flex items-center justify-center transition-colors ${c.ok ? "bg-good text-white" : "ring-[1.5px] ring-inset ring-border-strong"}`}>
                  {c.ok && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                </span>
                <span className={c.ok ? "text-text" : "text-muted"}>{c.label}</span>
              </li>
            ))}
          </ul>
          <div className="text-[12.5px] text-faint mt-4">{docIds.length ? `${docIds.length} document${docIds.length > 1 ? "s" : ""} attached` : "No documents attached"}</div>
          <Button type="submit" size="lg" className="w-full mt-4" disabled={!ready || busy}>{busy ? "Sending…" : "Send proposal"}</Button>
          {closed && <div className="text-[12.5px] text-muted mt-2 text-center">Opens in the next application window.</div>}
        </Card>
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

/** Live word counter under a textarea; turns amber near the limit and red over it. */
function WordCount({ text, max }: { text: string; max: number }) {
  const n = words(text);
  const tone = n > max ? "text-bad-ink font-medium" : n > max * 0.9 ? "text-warn-ink" : "text-faint";
  return <div className={`text-[12px] text-right tabular ${tone}`}>{n} / {max} words</div>;
}

/** Research interests as removable tags. Enter or comma adds; Backspace on empty removes the last. */
function TagInput({ value, onChange, invalid }: { value: string[]; onChange: (v: string[]) => void; invalid?: boolean }) {
  const [draft, setDraft] = useState("");
  const add = (t: string) => {
    const v = t.trim();
    if (v && !value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className={`min-h-10 flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-button border bg-surface transition-shadow focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15 ${invalid ? "border-bad" : "border-border-strong"}`}>
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-pill bg-neutral-soft text-[13px] text-text">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="w-5 h-5 rounded-full inline-flex items-center justify-center text-faint hover:text-text hover:bg-black/[0.06]"><I.X size={12} /></button>
        </span>
      ))}
      <input value={draft} onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); add(draft); }
          else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft && add(draft)}
        placeholder={value.length ? "Add another" : "e.g. Machine Learning"} className="flex-1 min-w-[140px] h-7 px-1.5 outline-none bg-transparent text-[14px]" />
    </div>
  );
}

/** Search-as-you-type supervisor picker (dialog map: searchSupervisor, selectSupervisor). */
function SupervisorPicker({ options, value, onChange, error }: { options: SupervisorSummary[]; value: SupervisorSummary | null; onChange: (s: SupervisorSummary | null) => void; error: string | null }) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? options.filter((s) => `${s.name} ${s.faculty}`.toLowerCase().includes(t)) : options).slice(0, 6);
  }, [q, options]);

  if (value) return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-row bg-bg">
      <Avatar name={value.name} size={36} />
      <div className="flex-1 min-w-0"><div className="text-[14px] font-medium">{value.name}</div><div className="text-[12.5px] text-muted">{value.faculty}</div></div>
      <Button type="button" variant="text" size="sm" onClick={() => onChange(null)}>Change</Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none"><I.Search size={16} /></span>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or school" className="w-full pl-10" invalid={!!error} />
      </div>
      {error && <div className="text-[12px] text-bad-ink font-medium">{error}</div>}
      <div className="rounded-row ring-1 ring-border overflow-hidden">
        {matches.length === 0 ? <div className="px-4 py-3 text-[13.5px] text-muted">No supervisor matches “{q}”.</div> : matches.map((s, i) => (
          <button type="button" key={s.id} onClick={() => onChange(s)} className={`w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-bg transition-colors ${i ? "border-t border-border" : ""}`}>
            <Avatar name={s.name} size={28} />
            <span className="flex-1 min-w-0 text-[14px] text-text truncate">{s.name}</span>
            <span className="text-[12.5px] text-faint shrink-0">{s.faculty}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** ProposalSuccessPage. */
function Sent({ p }: { p: Proposal }) {
  return (
    <div className="max-w-[560px] mx-auto pt-10 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-good-soft text-good inline-flex items-center justify-center">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      <h1 className="mt-5">Proposal sent</h1>
      <p className="text-[15px] text-muted mt-2 leading-[1.5]">
        {p.supervisor_name} can now see your proposal, profile and attached documents. You will get a notification when they decide.
      </p>
      <Card className="mt-7 text-left">
        <div className="eyebrow">Your proposal</div>
        <div className="text-[16px] font-semibold mt-1">{p.title}</div>
        <div className="text-[13px] text-muted mt-1">{p.research_interests.join(" · ")}</div>
      </Card>
      <div className="mt-6 flex justify-center gap-2.5">
        <Link href="/browse"><Button variant="secondary">Back to projects</Button></Link>
        <Link href="/my-applications"><Button>Track status</Button></Link>
      </div>
    </div>
  );
}
