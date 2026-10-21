"use client";
/** ManageUserAccounts (4.8). REQ-USER-1..3. Screens: ManageUsersPage, CreateUserForm, EditUserInlineForm. */
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { I } from "@/components/shell/icons";
import { Avatar, Banner, Button, Chip, Field, Input, Loading, Modal, Select, Status } from "@/components/ui";
import { ApiError, type AccountStatus, type ActiveItem, type ActiveItemKind, type Role, type UserListItem } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

const KIND_LABEL: Record<ActiveItemKind, string> = { listing: "Open project listings", proposal: "Pending proposals", application: "Applications", match: "Matches" };

/** What the API said would be closed, and how to send the same request again once the admin accepts (REQ-USER-3). */
type Cleanup = { who: string; items: ActiveItem[]; send: (confirm: boolean) => Promise<unknown>; done: () => void };

export default function Users() {
  const call = useCall();
  const [role, setRole] = useState<Role | undefined>();
  const [status, setStatus] = useState<AccountStatus | undefined>();
  const [q, setQ] = useState("");
  const { data, loading, reload } = useApi((api) => api.listUsers({ role, status, q }), [role, status, q]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [deactivating, setDeactivating] = useState<UserListItem | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "student" as Role });
  const [error, setError] = useState<ApiError | null>(null);
  const [cleanup, setCleanup] = useState<Cleanup | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try { await call((api) => api.createUser(form)); setCreating(false); setForm({ name: "", email: "", role: "student" }); reload(); } catch (err) { setError(err as ApiError); }
  }
  /** Try without the flag first. A user with open items comes back as a preview; resend with the flag once the admin accepts. */
  async function submit(who: string, send: (confirm: boolean) => Promise<unknown>, done: () => void, confirm = false) {
    setError(null);
    try { await send(confirm); setCleanup(null); done(); reload(); }
    catch (err) {
      const e = err as ApiError;
      if (e.code === "has_active_items" && e.items?.length && !confirm) setCleanup({ who, items: e.items, send, done });
      else { setCleanup(null); setError(e); }
    }
  }
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault(); if (!editing) return;
    const { id, name, role, status } = editing.user;
    await submit(name, (confirm) => call((api) => api.updateUser(id, { name, role, status }, confirm)), () => setEditing(null));
  }
  async function deactivate() {
    if (!deactivating) return;
    const { id, name } = deactivating.user;
    await submit(name, (confirm) => call((api) => api.deactivateUser(id, confirm)), () => setDeactivating(null));
  }

  return (
    <>
      <PageHeader title="Manage users" description="Create accounts, change roles, deactivate. Deactivating ends the user's sessions immediately." right={<Button onClick={() => setCreating(true)}><I.Plus /> New user</Button>} />
      {error && !error.field && <div className="mb-4"><Banner tone="bad">{error.message}</Banner></div>}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        <div className="relative w-64 mr-2"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"><I.Search size={16} /></span><Input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or e-mail" className="w-full pl-9" /></div>
        <span className="eyebrow">Role</span>
        {[undefined, "student", "supervisor", "admin"].map((r) => <Chip key={String(r)} active={role === r} onClick={() => setRole(r as Role | undefined)}>{r ?? "Any"}</Chip>)}
        <span className="eyebrow ml-2">Status</span>
        {[undefined, "active", "inactive", "pending_verification"].map((s) => <Chip key={String(s)} active={status === s} onClick={() => setStatus(s as AccountStatus | undefined)}>{s === "pending_verification" ? "Unverified" : s ?? "Any"}</Chip>)}
      </div>
      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <div className="grid grid-cols-[1fr_140px_120px_120px_170px] gap-3 px-4 py-2.5 border-b border-border eyebrow"><span>User</span><span>Role</span><span>School</span><span>Status</span><span /></div>
        {loading && !data ? <Loading /> : (data ?? []).map((u) => (
          <div key={u.user.id} className="grid grid-cols-[1fr_140px_120px_120px_170px] gap-3 items-center px-4 py-2.5 border-b border-border last:border-b-0">
            <div className="flex items-center gap-2.5 min-w-0"><Avatar name={u.user.name} size={30} tone={u.user.role === "student" ? "neutral" : "navy"} /><div className="min-w-0"><div className="text-[13.5px] font-semibold truncate">{u.user.name}</div><div className="text-[12px] text-muted truncate">{u.user.email}</div></div></div>
            <span className="text-[12.5px] capitalize">{u.user.role === "supervisor" ? "Project Supervisor" : u.user.role}</span>
            <span className="text-[12.5px] text-muted">{u.school ?? ""}</span>
            <Status value={u.user.status} />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="secondary" onClick={() => setEditing({ ...u, user: { ...u.user } })}>Edit</Button>
              {u.user.status !== "inactive" && <Button size="sm" variant="secondary" onClick={() => setDeactivating(u)}>Deactivate</Button>}
            </div>
          </div>
        ))}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="New user">
        <form onSubmit={create} className="flex flex-col gap-3 text-text">
          {error && !error.field && <Banner tone="bad">{error.message}</Banner>}
          <Field label="Full name"><Input id="new-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="NTU e-mail" error={error?.field === "email" ? error.message : null}><Input id="new-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required invalid={error?.field === "email"} /></Field>
          <Field label="Role" hint="Only admins can create admin accounts."><Select id="new-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}><option value="student">Student</option><option value="supervisor">Project Supervisor</option><option value="admin">Admin</option></Select></Field>
          <div className="flex justify-end gap-2 mt-2"><Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit">Create</Button></div>
        </form>
      </Modal>
      <Modal open={!!editing && !cleanup} onClose={() => setEditing(null)} title="Edit user">
        {editing && (
          <form onSubmit={saveEdit} className="flex flex-col gap-3 text-text">
            {error && !error.field && <Banner tone="bad">{error.message}</Banner>}
            <Field label="Full name"><Input id="edit-name" value={editing.user.name} onChange={(e) => setEditing({ ...editing, user: { ...editing.user, name: e.target.value } })} /></Field>
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
