"use client";
/** SelfProposeUrecaApplication (4.12). REQ-PROPOSE-1..3. Screens: ProposeProjectPage, ProposalSuccessPage.
 *  A guided flow in four steps (supervisor, project, motivation, review and send). Each step has to pass the same checks the old
 *  checklist used before Continue enables, and the last step shows everything before the confirm dialog. The steps only guide the
 *  student; every rule is enforced again by POST /proposals. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { TopicPicker } from "@/components/pickers";
import { CycleTimeline } from "@/components/student/cycle-timeline";
import { Avatar, Banner, Button, Card, Field, Input, Loading, Modal, Pill, Textarea } from "@/components/ui";
import { ApiError, type Proposal, type SupervisorSummary } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";
import { useStanding } from "@/lib/use-standing";

const DESCRIPTION_MAX_WORDS = 500; // same limits as routers/proposals.py
const STATEMENT_MAX_WORDS = 300;
const MIN_CHARS = 50;
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const STEPS = [
  { title: "Supervisor", note: "Who you would like to supervise this project." },
  { title: "Your project", note: "What you want to build or study." },
  { title: "Why this supervisor", note: "Your motivation, relevant modules or experience, and why this person fits." },
  { title: "Review and send", note: "Check everything, attach documents, then send." },
];
/** Which step holds a field the server complained about, so the student lands where the message is. */
const stepOf = (field?: string | null) => (field === "supervisor_id" ? 0 : field === "title" || field === "description" || field === "research_interests" ? 1 : field === "statement" ? 2 : 3);

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
  const [confirm, setConfirm] = useState(false); // "Send this proposal?" dialog
  const [step, setStep] = useState(0);
  const err = (k: string) => (error?.field === k ? error.message : null);
  const closed = me?.phase.window !== "application"; // REQ-PROPOSE-3
  const standing = useStanding(); // placed or ineligible: the form stays readable but cannot be sent

  const checks = [
    { label: "Supervisor chosen", ok: !!supervisor },
    { label: "Title", ok: title.trim().length >= 5 },
    { label: `Description, at least ${MIN_CHARS} characters`, ok: description.trim().length >= MIN_CHARS && words(description) <= DESCRIPTION_MAX_WORDS },
    { label: "At least one research interest", ok: interests.length > 0 },
    { label: `Why this supervisor, at least ${MIN_CHARS} characters`, ok: statement.trim().length >= MIN_CHARS && words(statement) <= STATEMENT_MAX_WORDS },
  ];
  const ready = checks.every((c) => c.ok) && !closed && !standing.viewOnly && !standing.loading;
  const stepOk = [checks[0].ok, checks[1].ok && checks[2].ok && checks[3].ok, checks[4].ok];
  const firstOpen = stepOk.findIndex((v) => !v); // -1 when the first three are done
  const furthest = firstOpen === -1 ? 3 : firstOpen; // a step can be opened once every step before it is done
  const missing = (step === 0 ? [checks[0]] : step === 1 ? checks.slice(1, 4) : step === 2 ? [checks[4]] : []).filter((c) => !c.ok);

  /** Sending is a commitment, so the form only asks; the dialog sends. */
  function ask(e: React.FormEvent) {
    e.preventDefault();
    if (step < 3) { if (stepOk[step]) setStep(step + 1); return; } // Enter in a field moves on, it never sends
    if (ready && supervisor) setConfirm(true);
  }
  async function send() {
    if (!ready || !supervisor) return;
    setBusy(true); setError(null);
    try {
      setDone(await call((api) => api.propose({ supervisor_id: supervisor.id, title: title.trim(), description, research_interests: interests, statement, document_ids: docIds })));
    } catch (x) { setError(x as ApiError); setStep(stepOf((x as ApiError).field)); } finally { setBusy(false); setConfirm(false); }
  }

  if (done) return <Sent p={done} />;

  return (
    <form onSubmit={ask}>
      <PageTitle title="Propose a project" right={<CycleTimeline />} />
      {standing.viewOnly
        ? <div className="mb-5"><Banner tone={standing.placedIn ? "good" : "warn"} title={standing.placedIn ? "You have a project." : "You cannot propose this cycle."}>{standing.reason}</Banner></div>
        : closed && <div className="mb-5"><Banner tone="warn" title="Proposals are closed.">{me?.phase.label}. You can send a proposal during an application window.</Banner></div>}
      {error && !error.field && <div className="mb-5"><Banner tone="bad">{error.message}</Banner></div>}

      <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-8 items-start">
        {/* The four steps. A finished step can be reopened; a later one opens once everything before it is done. */}
        <nav aria-label="Proposal steps" className="sticky top-10">
          <ol className="relative flex flex-col gap-1">
            <span aria-hidden className="absolute left-[19px] top-6 bottom-6 w-px bg-[#d6e2f3]" />
            {STEPS.map((st, i) => {
              const current = i === step;
              const done = i < 3 && stepOk[i] && !current;
              const reachable = i <= furthest;
              const sub = i === 0 ? supervisor?.name : i === 1 ? title.trim() : i === 2 ? (statement.trim() ? `${words(statement)} words` : "") : furthest === 3 && docIds.length ? `${docIds.length} attached` : "";
              return (
                <li key={st.title}>
                  <button type="button" disabled={!reachable} onClick={() => setStep(i)} aria-current={current ? "step" : undefined}
                    className={`relative w-full text-left flex items-start gap-3 rounded-[14px] px-2 py-2.5 transition-colors ${current ? "bg-white/70 shadow-[inset_0_0_0_1px_rgba(15,40,90,0.06)]" : reachable ? "hover:bg-white/50" : "opacity-55 cursor-not-allowed"}`}>
                    <span className={`relative z-[1] mt-px w-[22px] h-[22px] shrink-0 rounded-full grid place-items-center text-[11px] font-semibold tabular transition-colors ${done ? "bg-[var(--brand-steel)] text-white" : current ? "bg-accent text-white" : "bg-white text-faint shadow-[inset_0_0_0_1.5px_var(--border-strong)]"}`}>
                      {done ? <I.Tick size={12} /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[13.5px] leading-[1.3] ${current ? "font-semibold text-text" : "font-medium text-text/80"}`}>{st.title}</span>
                      {sub && <span className="block text-[12px] text-muted truncate">{sub}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <Card key={step} className="step-in flex flex-col gap-6 !p-7 min-w-0">
          <div>
            <div className="eyebrow">Step {step + 1} of {STEPS.length}</div>
            <h2 className="text-[22px] tracking-[-0.02em] mt-1">{STEPS[step].title}</h2>
            <div className="text-[14px] text-muted mt-1">{STEPS[step].note}</div>
          </div>

          {step === 0 && (
            sups.loading && !sups.data ? <Loading /> : (
              <SupervisorPicker options={sups.data ?? []} value={supervisor} onChange={setSupervisor} error={err("supervisor_id")} />
            )
          )}

          {step === 1 && (
            <div className="flex flex-col gap-5">
              <Field label="Title" error={err("title")}>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Graph models for protein folding" invalid={!!err("title")} />
              </Field>
              <Field label="Description" error={err("description")}>
                <Textarea rows={8} value={description} onChange={(e) => setDescription(e.target.value)} invalid={!!err("description")}
                  placeholder="What you will build or study, your method, and the deliverable." />
                <WordCount text={description} max={DESCRIPTION_MAX_WORDS} />
              </Field>
              <Field label="Research interests" error={err("research_interests")} hint="Standard topics. Prefilled from your profile.">
                <TopicPicker value={interests} onChange={setInterests} invalid={!!err("research_interests")} />
              </Field>
            </div>
          )}

          {step === 2 && (
            <Field label="Statement" error={err("statement")}>
              <Textarea rows={9} value={statement} onChange={(e) => setStatement(e.target.value)} invalid={!!err("statement")} />
              <WordCount text={statement} max={STATEMENT_MAX_WORDS} />
            </Field>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <ReviewRow label="Supervisor" onEdit={() => setStep(0)}>
                {supervisor && (
                  <div className="flex items-center gap-3">
                    <Avatar name={supervisor.name} size={34} />
                    <div className="min-w-0"><div className="text-[14px] font-semibold truncate">{supervisor.name}</div><div className="text-[12.5px] text-muted">{supervisor.faculty}</div></div>
                  </div>
                )}
              </ReviewRow>
              <ReviewRow label="Project" onEdit={() => setStep(1)}>
                <div className="text-[15px] font-semibold">{title}</div>
                <p className="text-[13.5px] text-muted mt-1 leading-[1.55] line-clamp-3 whitespace-pre-line">{description}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">{interests.map((t) => <Pill key={t}>{t}</Pill>)}</div>
              </ReviewRow>
              <ReviewRow label="Why this supervisor" onEdit={() => setStep(2)}>
                <p className="text-[13.5px] text-muted leading-[1.55] line-clamp-3 whitespace-pre-line">{statement}</p>
              </ReviewRow>

              <div className="pt-2">
                <h3 className="text-[14px] font-semibold">Documents</h3>
                <div className="text-[13px] text-muted mt-0.5 mb-3">The supervisor sees only what you attach.</div>
                {err("document_ids") && <div className="mb-3"><Banner tone="bad">{err("document_ids")}</Banner></div>}
                {docs.length === 0 ? (
                  <div className="text-[13.5px] text-muted">No documents yet. Upload your transcript in <Link href="/profile" className="font-medium">My profile</Link>.</div>
                ) : (
                  <div className="rounded-row ring-1 ring-border overflow-hidden bg-white/60">
                    {docs.map((d, i) => {
                      const on = docIds.includes(d.id);
                      return (
                        <label key={d.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${on ? "bg-accent-soft/60" : "hover:bg-white"} ${i ? "border-t border-border" : ""}`}>
                          <input type="checkbox" checked={on} onChange={() => setAttached(on ? docIds.filter((x) => x !== d.id) : [...docIds, d.id])} className="w-4 h-4 accent-[var(--accent)]" />
                          <span className="w-8 h-8 rounded-[10px] bg-white text-accent-ink shadow-[inset_0_0_0_1px_var(--accent-border)] inline-flex items-center justify-center shrink-0"><I.File size={15} /></span>
                          <span className="flex-1 min-w-0 text-[14px] text-text truncate">{d.file_name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-5 border-t border-border">
            {step > 0 && <Button type="button" variant="secondary" size="lg" onClick={() => setStep(step - 1)}>Back</Button>}
            <div className="flex-1 min-w-0 text-[12.5px] text-muted leading-[1.45] text-right">
              {step === 3
                ? standing.viewOnly ? (standing.placedIn ? "You already have a project this cycle." : "Not available this cycle.") : closed ? "Opens in the next application window." : ""
                : step === 0 ? (supervisor ? "" : "Choose a supervisor to continue.") : missing.length > 0 ? <>Still to do: {missing.map((c) => c.label).join(" · ")}</> : ""}
            </div>
            {step < 3
              ? <Button type="submit" size="lg" disabled={!stepOk[step]}>Continue</Button>
              : <Button type="submit" size="lg" disabled={!ready || busy}>Send proposal</Button>}
          </div>
        </Card>
      </div>
      <Modal open={confirm} onClose={() => !busy && setConfirm(false)} title={`Send this proposal to ${supervisor?.name ?? "the supervisor"}?`}
        footer={<><Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>Not yet</Button><Button type="button" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send proposal"}</Button></>}>
        <ul className="flex flex-col gap-2.5 text-text">
          {[
            "Until they answer, you can still withdraw it from My applications.",
            "If they accept, you are registered to this project straight away. It cannot be changed or withdrawn after that.",
            "You then leave the matching pool. Every other application and proposal you have is withdrawn.",
          ].map((t) => (
            <li key={t} className="flex gap-2.5 items-start"><span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-accent shrink-0" />{t}</li>
          ))}
        </ul>
      </Modal>
    </form>
  );
}

/** One answer on the review step, with a way back to the step that holds it. */
function ReviewRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="card-flat p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="eyebrow">{label}</span>
        <Button type="button" variant="text" size="sm" onClick={onEdit}>Edit</Button>
      </div>
      {children}
    </div>
  );
}

/** Live word counter under a textarea; turns amber near the limit and red over it. */
function WordCount({ text, max }: { text: string; max: number }) {
  const n = words(text);
  const tone = n > max ? "text-bad-ink font-medium" : n > max * 0.9 ? "text-warn-ink" : "text-faint";
  return <div className={`text-[12px] text-right tabular ${tone}`}>{n} / {max} words</div>;
}

/** Search-as-you-type supervisor picker (dialog map: searchSupervisor, selectSupervisor). */
function SupervisorPicker({ options, value, onChange, error }: { options: SupervisorSummary[]; value: SupervisorSummary | null; onChange: (s: SupervisorSummary | null) => void; error: string | null }) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? options.filter((s) => `${s.name} ${s.faculty}`.toLowerCase().includes(t)) : options).slice(0, 6);
  }, [q, options]);

  if (value) return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-row bg-accent-soft/60 shadow-[inset_0_0_0_1px_var(--accent-border)]">
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
      <div className="rounded-row ring-1 ring-border overflow-hidden bg-white/60">
        {matches.length === 0 ? <div className="px-4 py-3 text-[13.5px] text-muted">No supervisor matches “{q}”.</div> : matches.map((s, i) => (
          <button type="button" key={s.id} onClick={() => onChange(s)} className={`w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-accent-soft/60 transition-colors ${i ? "border-t border-border" : ""}`}>
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
      <div className="w-14 h-14 mx-auto rounded-full bg-good-soft text-good inline-flex items-center justify-center shadow-[0_0_0_8px_rgba(36,138,61,0.08)]">
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
