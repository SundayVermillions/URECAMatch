"use client";
/** ManageUserAccounts (4.8). REQ-USER-1..3. Screens: ManageUsersPage, CreateUserForm, EditUserInlineForm. */
import { useState } from "react";
import { PageTitle } from "@/components/shell/app-shell";
import { I } from "@/components/shell/icons";
import { Avatar, Banner, Button, Card, Empty, Field, FilterSelect, Input, Modal, Segmented, Select, Skeleton, statusLabel } from "@/components/ui";
import { ApiError, type AccountStatus, type ActiveItem, type ActiveItemKind, type Role, type UserListItem } from "@/lib/api/models";
import { TITLES, composeName, splitTitle } from "@/lib/titles";
import { useApi, useCall } from "@/lib/use-api";

const PAGE = 12; // rows shown before "Show more"
const STATUS_LABEL: Record<AccountStatus, string> = { active: "Active", inactive: "Inactive", pending_verification: "Unverified" };
const KIND_LABEL: Record<ActiveItemKind, string> = { listing: "Open project listings", proposal: "Pending proposals", application: "Applications", match: "Matches" };

/** What the API said would be closed, and how to send the same request again once the admin accepts (REQ-USER-3). */
type Cleanup = { who: string; items: ActiveItem[]; send: (confirm: boolean) => Promise<unknown>; done: () => void };

export default function Users() {
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
  const [deactivating, setDeactivating] = useState<UserListItem | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "student" as Role, title: "" });
  const [error, setError] = useState<ApiError | null>(null);
  const [cleanup, setCleanup] = useState<Cleanup | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try { await call((api) => api.createUser(form)); setCreating(false); setForm({ name: "", email: "", role: "student", title: "" }); refresh(); } catch (err) { setError(err as ApiError); }
  }
  /** Try without the flag first. A user with open items comes back as a preview; resend with the flag once the admin accepts. */
  async function submit(who: string, send: (confirm: boolean) => Promise<unknown>, done: () => void, confirm = false) {
    setError(null);
    try { await send(confirm); setCleanup(null); done(); refresh(); }
    catch (err) {
      const e = err as ApiError;
      if (e.code === "has_active_items" && e.items?.length && !confirm) setCleanup({ who, items: e.items, send, done });
      else { setCleanup(null); setError(e); }
    }
  }
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault(); if (!editing) return;
    const { id, name, role, status } = editing.user;
    const title = editing.title ?? "";
    // The form edits the name without its title. Students carry no title, so only a supervisor sets one; an admin keeps the one they had.
    const body = role === "supervisor" ? { name, role, status, title } : { name: role === "student" ? name : composeName(title, name), role, status };
    await submit(composeName(role === "supervisor" ? title : "", name), (confirm) => call((api) => api.updateUser(id, body, confirm)), () => setEditing(null));
  }
  async function deactivate() {
    if (!deactivating) return;
    const { id, name } = deactivating.user;
    await submit(name, (confirm) => call((api) => api.deactivateUser(id, confirm)), () => setDeactivating(null));
  }

  return (
    <>
      <PageTitle title="Manage users" right={<Button onClick={() => setCreating(true)}><I.Plus /> New user</Button>} />
      {error && !error.field && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
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
                  <Button size="sm" variant="secondary" onClick={() => setEditing({ ...u, user: { ...u.user, name: u.title ? splitTitle(u.user.name)[1] : u.user.name } })}>Edit</Button>
                  {u.user.status !== "inactive" && <Button size="sm" variant="secondary" className="hover:!bg-bad-soft hover:!text-bad-ink" onClick={() => setDeactivating(u)}>Deactivate</Button>}
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
      <Modal open={!!editing && !cleanup} onClose={() => setEditing(null)} title="Edit user">
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
            <Field label="Role"><Select id="edit-role" value={editing.user.role} onChange={(e) => setEditing({ ...editing, user: { ...editing.user, role: e.target.value as Role } })}><option value="student">Student</option><option value="supervisor">Project Supervisor</option><option value="admin">Admin</option></Select></Field>
            <Field label="Status"><Select id="edit-status" value={editing.user.status} onChange={(e) => setEditing({ ...editing, user: { ...editing.user, status: e.target.value as AccountStatus } })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="pending_verification">Unverified</option></Select></Field>
            <div className="flex justify-end gap-2 mt-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit">Save</Button></div>
          </form>
        )}
      </Modal>
      <Modal open={!!deactivating && !cleanup} onClose={() => setDeactivating(null)} title={`Deactivate ${deactivating?.user.name}?`} footer={<><Button variant="secondary" onClick={() => setDeactivating(null)}>Cancel</Button><Button variant="destructive" onClick={deactivate}>Deactivate</Button></>}>
        {error && !error.field && <div className="mb-3"><Banner tone="bad">{error.message}</Banner></div>}
        They are signed out everywhere and cannot sign in again until reactivated. If they still have open items, you will see them before anything changes.
      </Modal>
      <Modal open={!!cleanup} onClose={() => setCleanup(null)} title={`${cleanup?.who} still has open items`}
        footer={<><Button variant="secondary" onClick={() => setCleanup(null)}>Cancel</Button><Button variant="destructive" onClick={() => cleanup && submit(cleanup.who, cleanup.send, cleanup.done, true)}>Close items and continue</Button></>}>
        {cleanup && (
          <div className="flex flex-col gap-3 text-text">
            <p className="text-muted">Continuing will close or withdraw everything below and notify the people involved. Nothing has been changed yet.</p>
            {(["listing", "proposal", "application", "match"] as const).filter((k) => cleanup.items.some((i) => i.kind === k)).map((k) => (
              <div key={k}>
                <div className="eyebrow mb-1">{KIND_LABEL[k]}</div>
                <ul className="flex flex-col gap-1">
                  {cleanup.items.filter((i) => i.kind === k).map((i) => (
                    <li key={i.id} className="text-[13px] border border-border rounded-row px-3 py-1.5"><span className="font-semibold">{i.title}</span>{i.detail && <span className="text-muted"> · {i.detail}</span>}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
