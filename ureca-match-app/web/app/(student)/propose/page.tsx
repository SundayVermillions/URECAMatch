"use client";
/** SelfProposeUrecaApplication (4.12). REQ-PROPOSE-1..3. Screens: ProposeProjectPage, ProposalSuccessPage. */
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { Banner, Button, Card, DeadlineChip, Field, Input, Loading, Select, Textarea } from "@/components/ui";
import { ApiError, type Proposal } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

export default function Propose() {
  const { me } = useMe();
  const call = useCall();
  const sups = useApi((api) => api.supervisors(), []);
  const [f, setF] = useState({ supervisor_id: "", title: "", description: "", research_interests: "", statement: "" });
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const err = (k: string) => (error?.field === k ? error.message : null);
  const closed = me?.phase.window !== "application";

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      setDone(await call((api) => api.propose({ ...f, research_interests: f.research_interests.split(",").map((s) => s.trim()).filter(Boolean), document_ids: (me?.student?.documents ?? []).map((d) => d.id) })));
    } catch (err) { setError(err as ApiError); } finally { setBusy(false); }
  }

  if (done) return (
    <>
      <PageHeader title="Proposal sent" />
      <Card className="max-w-xl">
        <Banner tone="good" title="Sent to {done.supervisor_name}.">They will see your proposal, profile and documents. You will be notified when they decide.</Banner>
        <div className="mt-4 text-[13px]"><strong>{done.title}</strong><div className="text-muted mt-1">{done.description}</div></div>
        <div className="mt-5 flex gap-2"><Link href="/my-applications"><Button>Track status</Button></Link><Link href="/browse"><Button variant="secondary">Back to projects</Button></Link></div>
      </Card>
    </>
  );

  return (
    <form onSubmit={submit}>
      <PageHeader title="Propose a project" description="Pitch your own research idea directly to a supervisor. If accepted, you are registered to it and leave the matching pool." right={me && <DeadlineChip>{me.phase.label}</DeadlineChip>} />
      {closed && <div className="mb-4"><Banner tone="warn" title="Proposals are closed.">{me?.phase.label}. Proposals can be sent during an application window.</Banner></div>}
      {error && !error.field && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      <div className="grid grid-cols-[1fr_300px] gap-5">
        <Card className="flex flex-col gap-4">
          <Field label="Project supervisor" error={err("supervisor_id")}>
            {sups.loading ? <Loading /> : (
              <Select id="supervisor" value={f.supervisor_id} onChange={(e) => setF({ ...f, supervisor_id: e.target.value })} required invalid={!!err("supervisor_id")}>
                <option value="">Choose a supervisor</option>
                {(sups.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.faculty}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Project title" error={err("title")}><Input id="title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={5} invalid={!!err("title")} /></Field>
          <Field label="Description" error={err("description")} hint="What you will build or study, the method, and the deliverable. Minimum 50 characters.">
            <Textarea id="description" rows={6} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required invalid={!!err("description")} />
          </Field>
          <Field label="Research interests" hint="Comma separated, e.g. Machine Learning, Healthcare AI">
            <Input id="interests" value={f.research_interests} onChange={(e) => setF({ ...f, research_interests: e.target.value })} />
          </Field>
          <Field label="Why you and why this supervisor" error={err("statement")} hint="Minimum 50 characters.">
            <Textarea id="statement" rows={5} value={f.statement} onChange={(e) => setF({ ...f, statement: e.target.value })} required invalid={!!err("statement")} />
          </Field>
          <div><Button type="submit" size="lg" disabled={busy || closed}>{busy ? "Sending…" : "Send proposal"}</Button></div>
        </Card>
        <Card>
          <div className="eyebrow mb-2">Attached from your profile</div>
          <ul className="text-[12.5px] text-muted flex flex-col gap-1.5">{(me?.student?.documents ?? []).map((d) => <li key={d.id}>{d.file_name}</li>)}</ul>
          <div className="text-[12px] text-faint mt-3">Manage documents in <Link href="/profile">My profile</Link>.</div>
        </Card>
      </div>
    </form>
  );
}
