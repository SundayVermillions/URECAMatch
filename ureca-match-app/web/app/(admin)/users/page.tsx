"use client";
/** ManageUserAccounts (4.8). REQ-USER-1..3. Screens: ManageUsersPage, CreateUserForm, EditUserInlineForm. */
import { useState } from "react";
import { PageTitle } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Avatar, Banner, Button, Card, Empty, Field, FilterSelect, Input, Modal, Segmented, Select, Skeleton, statusLabel } from "@/components/ui";
import { ApiError, type AccountStatus, type ActiveItem, type ActiveItemKind, type Role, type UserListItem } from "@/lib/api/models";
import { TITLES, composeName, splitTitle } from "@/lib/titles";
import { useApi, useCall } from "@/lib/use-api";

const PAGE = 12; // rows shown before "Show more"
const STATUS_LABEL: Record<AccountStatus, string> = { active: "Active", inactive: "Inactive", pending_verification: "Unverified" };
const KIND_LABEL: Record<ActiveItemKind, string> = { listing: "Open project listings", proposal: "Pending proposals", application: "Applications", match: "Matches" };
const ROLE_LABEL: Record<Role, string> = { student: "Student", supervisor: "Project Supervisor", admin: "Admin" };
const IMPACT: Record<ActiveItemKind, string> = {
  listing: "Published listings will be closed and their pending applications will be withdrawn.",
  application: "The student's active applications will be withdrawn.",
  proposal: "Pending proposals will be closed and can no longer be accepted.",
  match: "Offers or project placements will be cancelled and their slots released.",
};

/** What the API said would be closed, and how to send the same request again once the admin accepts (REQ-USER-3). */
type AccountAction = { who: string; description: string; label: string; send: (confirm: boolean) => Promise<unknown>; done: () => void };
type Cleanup = AccountAction & { items: ActiveItem[] };

export default function Users() {
  const { me } = useMe();
  const call = useCall();
  const [role, setRole] = useState<Role | undefined>();
  const [status, setStatus] = useState<AccountStatus | undefined>();
  const [q, setQ] = useState("");
  const { data, loading, reload } = useApi((api) => api.listUsers({ role, status, q }), [role, status, q]);
  const everyoneCall = useApi((api) => api.listUsers({}), []); // for the counts on the role tabs
  const everyone = everyoneCall.data ?? [];
  const countOf = (r: Role) => everyone.filter((u) => u.user.role === r).length;
  const [limit, setLimit] = useState(PAGE);
  const refresh = () => { reload(); everyoneCall.reload(); };
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [originalRole, setOriginalRole] = useState<Role | null>(null);
  const [roleChange, setRoleChange] = useState<AccountAction | null>(null);
  const [deactivating, setDeactivating] = useState<UserListItem | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "student" as Role, title: "" });
  const [error, setError] = useState<ApiError | null>(null);
  const [cleanup, setCleanup] = useState<Cleanup | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const editingSelf = editing?.user.id === me?.user.id;

  async function create(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try { await call((api) => api.createUser(form)); setCreating(false); setForm({ name: "", email: "", role: "student", title: "" }); refresh(); } catch (err) { setError(err as ApiError); }
  }
  /** Try without the flag first. A user with open items comes back as a preview; resend with the flag once the admin accepts. */
  async function submit(action: AccountAction, confirm = false) {
    if (busy) return;
    setError(null); setBusy(true);
    try { await action.send(confirm); setCleanup(null); setRoleChange(null); action.done(); refresh(); }
    catch (err) {
      const e = err as ApiError;
      if (e.code === "has_active_items" && e.items?.length && !confirm) {
        setAcknowledged(false);
        setCleanup({ ...action, items: e.items });
      }
      else { setCleanup(null); setError(e); }
    } finally { setBusy(false); }
  }
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault(); if (!editing) return;
    const { id, name, role, status } = editing.user;
    const title = editing.title ?? "";
    // The form edits the name without its title. Students carry no title, so only a supervisor sets one; an admin keeps the one they had.
    const body = role === "supervisor" ? { name, role, status, title } : { name: role === "student" ? name : composeName(title, name), role, status };
    const who = composeName(role === "supervisor" ? title : "", name);
    const roleChanged = originalRole !== null && role !== originalRole;
    const action: AccountAction = {
      who,
      description: roleChanged ? `Change ${who}'s role from ${ROLE_LABEL[originalRole!]} to ${ROLE_LABEL[role]}.` : `Update ${who}'s account.`,
      label: roleChanged ? "Change role" : "Save changes",
      send: (confirm) => call((api) => api.updateUser(id, body, confirm)),
      done: () => setEditing(null),
    };
    // REQ-USER-3: every role change needs an explicit confirmation, even without active items.
    if (roleChanged) { setError(null); setRoleChange(action); }
    else await submit(action);
  }
  async function deactivate() {
    if (!deactivating) return;
    const { id, name } = deactivating.user;
    await submit({ who: name, description: `Deactivate ${name}'s account.`, label: "Deactivate",
      send: (confirm) => call((api) => api.deactivateUser(id, confirm)), done: () => setDeactivating(null) });
  }

  return (
    <>
      <PageTitle title="User Management" right={<Button onClick={() => setCreating(true)}><I.Plus /> New user</Button>} />
      {error && !error.field && !editing && !deactivating && !creating && !roleChange && !cleanup && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={role ?? "all"} onChange={(v) => { setRole(v === "all" ? undefined : v); setLimit(PAGE); }} options={[
          { value: "all", label: "Everyone", count: everyone.length },
          { value: "student", label: "Students", count: countOf("student") },
          { value: "supervisor", label: "Supervisors", count: countOf("supervisor") },
          { value: "admin", label: "Admins", count: countOf("admin") },
        ]} />
        <div className="relative w-60"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"><I.Search size={16} /></span><Input id="q" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Name or e-mail" className="w-full pl-9" /></div>
        <FilterSelect label="Status" value={status ? STATUS_LABEL[status] : undefined} options={Object.values(STATUS_LABEL)} align="left"
          onChange={(v) => { setStatus(v ? (Object.keys(STATUS_LABEL) as AccountStatus[]).find((k) => STATUS_LABEL[k] === v) : undefined); setLimit(PAGE); }} />
        {data && <span className="ml-auto text-[12.5px] tabular text-faint">{data.length} {data.length === 1 ? "user" : "users"}</span>}
      </div>

      {loading && !data ? (
        <Card padded={false} className="overflow-hidden" >
          <div aria-busy="true" aria-label="Loading users" className="divide-y divide-border">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="flex items-center gap-3 px-5 py-3.5"><Skeleton className="h-8 w-8 !rounded-full" /><div className="flex flex-1 flex-col gap-2"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-56" /></div></div>)}
          </div>
        </Card>
      ) : (data ?? []).length === 0 ? (
        <Empty icon={<I.Users size={20} />} title="No users match" note="Try another name, role or status." />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="grid grid-cols-[1fr_150px_90px_110px_150px] gap-3 border-b border-border px-5 py-3 text-[12px] font-medium text-faint"><span>User</span><span>Role</span><span>School</span><span>Status</span><span /></div>
          <div className="divide-y divide-border">
            {(data ?? []).slice(0, limit).map((u) => (
              <div key={u.user.id} className="group grid grid-cols-[1fr_150px_90px_110px_150px] items-center gap-3 px-5 py-3 transition-colors hover:bg-accent-soft/30">
                <div className="flex min-w-0 items-center gap-3"><Avatar name={u.user.name} size={34} tone={u.user.role === "student" ? "auto" : "navy"} /><div className="min-w-0"><div className="truncate text-[14px] font-semibold">{u.user.name}</div><div className="truncate text-[12.5px] text-muted">{u.user.email}</div></div></div>
                <span className="text-[13px]">{u.user.role === "supervisor" ? "Project Supervisor" : u.user.role === "admin" ? "Admin" : "Student"}</span>
                <span className="text-[13px] text-muted">{u.school ?? "–"}</span>
                <span className="inline-flex items-center gap-1.5 text-[13px] text-muted"><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${u.user.status === "active" ? "bg-good" : u.user.status === "inactive" ? "bg-bad" : "bg-warn"}`} />{statusLabel(u.user.status)}</span>
                <div className="flex justify-end gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <Button size="sm" variant="secondary" onClick={() => { setError(null); setOriginalRole(u.user.role); setEditing({ ...u, user: { ...u.user, name: u.title ? splitTitle(u.user.name)[1] : u.user.name } }); }}>Edit</Button>
                  {u.user.status !== "inactive" && <Button size="sm" variant="secondary" disabled={u.user.id === me?.user.id} title={u.user.id === me?.user.id ? "You cannot deactivate your own account." : undefined} className="hover:!bg-bad-soft hover:!text-bad-ink" onClick={() => { setError(null); setDeactivating(u); }}>Deactivate</Button>}
                </div>
              </div>
            ))}
          </div>
          {(data ?? []).length > limit && (
            <div className="flex items-center justify-between border-t border-border bg-white/40 px-5 py-3">
              <span className="text-[12.5px] tabular text-faint">Showing {limit} of {(data ?? []).length}</span>
              <Button size="sm" variant="soft" onClick={() => setLimit((n) => n + PAGE)}>Show more</Button>
            </div>
          )}
        </Card>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New user">
        <form onSubmit={create} className="flex flex-col gap-3 text-text">
          {error && !error.field && <Banner tone="bad">{error.message}</Banner>}
          {form.role === "supervisor" && (
            <Field label="Title" hint="Shown in front of the name">
              <Select id="new-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}>
                <option value="">No title</option>
                {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Full name" hint={form.role === "supervisor" ? "Without the title" : undefined}><Input id="new-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="NTU e-mail" error={error?.field === "email" ? error.message : null}><Input id="new-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required invalid={error?.field === "email"} /></Field>
          <Field label="Role" hint="Only admins can create admin accounts."><Select id="new-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}><option value="student">Student</option><option value="supervisor">Project Supervisor</option><option value="admin">Admin</option></Select></Field>
          <div className="flex justify-end gap-2 mt-2"><Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit">Create</Button></div>
        </form>
      </Modal>
      <Modal open={!!editing && !cleanup && !roleChange} onClose={() => !busy && setEditing(null)} title="Edit user">
        {editing && (
          <form onSubmit={saveEdit} className="flex flex-col gap-3 text-text">
            {error && !error.field && <Banner tone="bad">{error.message}</Banner>}
            {editing.user.role === "supervisor" && (
              <Field label="Title" hint="Shown in front of the name">
                <Select id="edit-title" value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })}>
                  <option value="">No title</option>
                  {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Full name" hint={editing.user.role === "supervisor" ? "Without the title" : undefined}><Input id="edit-name" value={editing.user.name} onChange={(e) => setEditing({ ...editing, user: { ...editing.user, name: e.target.value } })} /></Field>
            <Field label="Role" hint={editingSelf ? "You cannot change your own role. Ask another administrator." : undefined}><Select id="edit-role" disabled={editingSelf || busy} value={editing.user.role} onChange={(e) => setEditing({ ...editing, user: { ...editing.user, role: e.target.value as Role } })}><option value="student">Student</option><option value="supervisor">Project Supervisor</option><option value="admin">Admin</option></Select></Field>
            <Field label="Status" hint={editingSelf ? "You cannot deactivate your own account. Ask another administrator." : undefined}><Select id="edit-status" disabled={editingSelf || busy} value={editing.user.status} onChange={(e) => setEditing({ ...editing, user: { ...editing.user, status: e.target.value as AccountStatus } })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="pending_verification">Unverified</option></Select></Field>
            <div className="flex justify-end gap-2 mt-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save"}</Button></div>
          </form>
        )}
      </Modal>
      <Modal open={!!roleChange && !cleanup} onClose={() => !busy && setRoleChange(null)} title="Confirm role change"
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setRoleChange(null)}>Back</Button><Button disabled={busy} onClick={() => roleChange && submit(roleChange)}>{busy ? "Checking..." : "Change role"}</Button></>}>
        {error && <div className="mb-3"><Banner tone="bad">{error.message}</Banner></div>}
        <p className="font-semibold text-text">{roleChange?.description}</p>
        <p className="mt-2">This changes the pages and actions available to this user. If they have active items, you will review those before any changes are saved.</p>
      </Modal>
      <Modal open={!!deactivating && !cleanup} onClose={() => !busy && setDeactivating(null)} title={`Deactivate ${deactivating?.user.name}?`} footer={<><Button variant="secondary" disabled={busy} onClick={() => setDeactivating(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={deactivate}>{busy ? "Checking..." : "Deactivate"}</Button></>}>
        {error && !error.field && <div className="mb-3"><Banner tone="bad">{error.message}</Banner></div>}
        They are signed out everywhere and cannot sign in again until reactivated. If they still have open items, you will see them before anything changes.
      </Modal>
      <Modal open={!!cleanup} onClose={() => !busy && setCleanup(null)} title="Warning: active items will be closed"
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setCleanup(null)}>Cancel</Button><Button variant="destructive" disabled={!acknowledged || busy} onClick={() => cleanup && acknowledged && submit(cleanup, true)}>{busy ? "Saving..." : `${cleanup?.label ?? "Continue"} and close items`}</Button></>}>
        {cleanup && (
          <div className="flex flex-col gap-3 text-text">
            <div role="alert" className="rounded-row border-2 border-bad bg-bad-soft p-4 text-bad-ink">
              <p className="font-semibold">{cleanup.description}</p>
              <p className="mt-2 font-semibold">This affects existing applications, projects or placements.</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                {(["listing", "application", "proposal", "match"] as const).filter((k) => cleanup.items.some((i) => i.kind === k)).map((k) => <li key={k}>{IMPACT[k]}</li>)}
              </ul>
              <p className="mt-3">Affected users will be notified. Changing the role or status back will not restore these items.</p>
            </div>
            <p>Nothing has been changed yet. Review all affected items below.</p>
            {(["listing", "proposal", "application", "match"] as const).filter((k) => cleanup.items.some((i) => i.kind === k)).map((k) => (
              <div key={k}>
                <div className="eyebrow mb-1">{KIND_LABEL[k]} ({cleanup.items.filter((i) => i.kind === k).length})</div>
                <ul className="flex flex-col gap-1">
                  {cleanup.items.filter((i) => i.kind === k).map((i) => (
                    <li key={i.id} className="text-[13px] border border-border rounded-row px-3 py-1.5"><span className="font-semibold">{i.title}</span>{i.detail && <span className="text-muted"> · {i.detail}</span>}</li>
                  ))}
                </ul>
              </div>
            ))}
            <label className="flex items-start gap-2 rounded-row border border-bad/40 bg-bad-soft/40 p-3 font-medium">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} disabled={busy} className="mt-1 shrink-0 accent-[var(--bad)]" />
              I understand that the listed items will be closed, withdrawn or cancelled.
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}
