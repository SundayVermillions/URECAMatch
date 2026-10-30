"use client";
/** Messages (REQ-CHAT-1..6, added after the SRS). Same screen for students and supervisors; admins are sent away.
 *  Conversations on the left (newest first, unread counts), the open conversation on the right. Opening one marks it read
 *  on the API, then the sidebar badge is asked for again. Messages are plain text: React escapes them and line breaks are kept. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, PageTitle } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Avatar, Banner, Button, Empty, ErrorBanner, Modal, Skeleton, Spinner, fmtDate, inputCls } from "@/components/ui";
import { API_MODE } from "@/lib/api/client";
import { ApiError, type ChatContact, type Conversation, type Message } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

const MAX = 2000; // REQ-CHAT-3, after trimming
const WARN_AT = 1800; // the counter appears from here
const POLL_MS = 5000; // live mode only: the mock has nobody on the other side

// The page remounts when the conversation changes (AppShell keys it by path), so the list is kept here to show at once.
let cachedList: Conversation[] | null = null;

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Singapore" });
const toError = (e: unknown) => (e instanceof ApiError ? e : new ApiError(0, "network", String(e)));

export function Inbox({ selectedId }: { selectedId?: string }) {
  const { me } = useMe();
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const list = useApi((api) => api.conversations(), []);
  const conversations = list.data ?? cachedList;
  useEffect(() => { if (list.data) cachedList = list.data; }, [list.data]);

  useEffect(() => { if (me?.user.role === "admin") router.replace("/dashboard"); }, [me, router]); // REQ-CHAT-1

  // Live mode: new conversations and unread counts appear without a reload.
  const { reload } = list;
  useEffect(() => {
    if (API_MODE !== "live") return;
    const t = setInterval(reload, POLL_MS);
    return () => clearInterval(t);
  }, [reload]);

  /** The open conversation changed (sent, or read): keep the list in step without waiting for the next poll. */
  function touch(c: Conversation, last?: Message) {
    list.setData((prev) => {
      const rest = (prev ?? cachedList ?? []).filter((x) => x.id !== c.id);
      const row = { ...(prev ?? cachedList ?? []).find((x) => x.id === c.id), ...c, unread: 0, ...(last ? { last_message: last, last_message_at: last.created_at } : {}) };
      return row.last_message_at ? [row as Conversation, ...rest].sort((a, b) => Date.parse(b.last_message_at!) - Date.parse(a.last_message_at!)) : rest;
    });
  }

  if (me?.user.role === "admin") return <AppShell><div /></AppShell>;
  return (
    <AppShell>
      <PageTitle title="Messages" right={<Button variant="soft" onClick={() => setPicking(true)}><I.Plus /> New message</Button>} />
      {list.error && !conversations && <div className="mb-4"><ErrorBanner error={list.error} /></div>}
      <div className="card-surface !rounded-[22px] overflow-hidden grid grid-cols-[300px_1fr] h-[calc(100vh-190px)] min-h-[480px]">
        <aside className="border-r border-border flex flex-col min-h-0" aria-label="Conversations">
          <div className="px-4 pt-4 pb-2 eyebrow">Conversations</div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {!conversations ? (
              <div className="flex flex-col gap-2 p-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="flex gap-3 items-center"><Skeleton className="w-9 h-9 !rounded-full" /><div className="flex-1 flex flex-col gap-2"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-full" /></div></div>)}</div>
            ) : !conversations.length ? (
              <p className="px-3 py-6 text-[13px] text-muted leading-[1.5]">No messages yet. Use New message to write to {me?.user.role === "supervisor" ? "a student who applied to your projects or sent you a proposal" : "a supervisor you applied to or sent a proposal"}.</p>
            ) : conversations.map((c) => <Row key={c.id} c={c} active={c.id === selectedId} meId={me?.user.id ?? ""} today={me ? dayKey(me.phase.now) : ""} />)}
          </div>
        </aside>
        <section className="min-w-0 min-h-0 flex flex-col">
          {selectedId ? <Thread key={selectedId} id={selectedId} onChange={touch} /> : (
            <div className="flex-1 grid place-items-center p-8">
              <div className="text-center max-w-sm">
                <div className="mx-auto mb-3 w-11 h-11 rounded-full grid place-items-center bg-accent-soft text-accent-ink"><I.Chat size={20} /></div>
                <div className="font-display text-[15px] font-semibold">Pick a conversation</div>
                <p className="text-[13.5px] text-muted mt-1">Or start a new one with someone linked to you by an application or a proposal.</p>
              </div>
            </div>
          )}
        </section>
      </div>
      {picking && <ContactPicker onClose={() => setPicking(false)} />}
    </AppShell>
  );
}

function Row({ c, active, meId, today }: { c: Conversation; active: boolean; meId: string; today: string }) {
  const last = c.last_message;
  const when = c.last_message_at ? (dayKey(c.last_message_at) === today ? timeOf(c.last_message_at) : fmtDate(c.last_message_at)) : "";
  return (
    <Link href={`/messages/${c.id}`} aria-current={active ? "page" : undefined} aria-label={`${c.unread ? `${c.unread} unread. ` : ""}${c.other_name}`}
      className={`flex gap-3 items-start px-2.5 py-2.5 rounded-[14px] transition-colors ${active ? "bg-accent-soft" : "hover:bg-black/[0.03]"}`}>
      <Avatar name={c.other_name} size={36} tone="auto" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`truncate text-[14px] ${c.unread ? "font-semibold text-text" : "font-medium text-text"}`}>{c.other_name}</span>
          <span className="ml-auto shrink-0 text-[11.5px] text-faint tabular">{when}</span>
        </span>
        <span className="flex items-center gap-2 mt-0.5">
          <span className={`truncate text-[12.5px] ${c.unread ? "text-text" : "text-muted"}`}>{last ? `${last.sender_id === meId ? "You: " : ""}${last.body.replace(/\s+/g, " ")}` : ""}</span>
          {c.unread ? <span className="ml-auto shrink-0 min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-accent text-white text-[11px] font-semibold tabular">{c.unread}</span> : null}
        </span>
      </span>
    </Link>
  );
}

function Thread({ id, onChange }: { id: string; onChange: (c: Conversation, last?: Message) => void }) {
  const { me, refresh } = useMe();
  const call = useCall();
  const { data, error, loading, setData, reload } = useApi((api) => api.conversation(id), [id]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<ApiError | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const seen = useRef(-1);

  // Opening marked it read on the API: update the list row and the sidebar badge once, then again only when more arrive.
  const count = data?.messages.length ?? -1;
  useEffect(() => {
    if (!data) return;
    if (count !== seen.current) {
      seen.current = count;
      onChange(data.conversation, data.messages.at(-1));
      void refresh();
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    }
  }, [data, count, onChange, refresh]);

  useEffect(() => {
    if (API_MODE !== "live") return;
    const t = setInterval(reload, POLL_MS);
    return () => clearInterval(t);
  }, [reload]);

  const days = useMemo(() => {
    const out: { key: string; items: Message[] }[] = [];
    for (const m of data?.messages ?? []) {
      const k = dayKey(m.created_at);
      if (out.at(-1)?.key !== k) out.push({ key: k, items: [] });
      out.at(-1)!.items.push(m);
    }
    return out;
  }, [data]);

  const length = draft.trim().length;
  const tooLong = length > MAX;

  async function send() {
    if (!length || tooLong || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const m = await call((api) => api.sendMessage(id, draft));
      setDraft("");
      setData((prev) => (prev ? { ...prev, messages: [...prev.messages, m] } : prev));
    } catch (e) {
      setSendError(toError(e));
    } finally {
      setSending(false);
    }
  }

  if (error && !data) return <div className="p-6"><ErrorBanner error={error} /></div>;
  if (loading && !data) return <div className="flex-1 grid place-items-center"><Spinner label="Loading conversation" /></div>;
  if (!data) return null;
  const c = data.conversation;
  const today = me ? dayKey(me.phase.now) : "";
  return (
    <>
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <Avatar name={c.other_name} size={38} tone="auto" />
        <div className="min-w-0">
          <h2 className="!text-[16px] truncate">{c.other_name}</h2>
          <div className="text-[12.5px] text-muted truncate" title={c.projects.join(" · ")}>{c.projects.length ? c.projects.join(" · ") : "No linked project"}</div>
        </div>
      </header>
      <div ref={scroller} className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5" aria-live="polite">
        {!data.messages.length && <p className="m-auto text-[13.5px] text-muted">No messages yet. Say hello.</p>}
        {days.map((d) => (
          <section key={d.key} className="flex flex-col gap-1.5" aria-label={d.key === today ? "Today" : fmtDate(d.items[0].created_at, { day: "numeric", month: "long" })}>
            <div className="self-center text-[11.5px] font-medium text-faint mb-1.5">{d.key === today ? "Today" : fmtDate(d.items[0].created_at, { day: "numeric", month: "long" })}</div>
            {d.items.map((m) => {
              const mine = m.sender_id === me?.user.id;
              return (
                <div key={m.id} className={`flex flex-col max-w-[72%] ${mine ? "self-end items-end" : "self-start items-start"}`}>
                  <p className={`whitespace-pre-wrap break-words text-[14px] leading-[1.5] px-3.5 py-2 rounded-[18px] ${mine ? "bg-accent text-white rounded-br-[6px]" : "bg-neutral-soft text-text rounded-bl-[6px]"}`}>{m.body}</p>
                  <span className="text-[11px] text-faint mt-1 px-1 tabular">{timeOf(m.created_at)}</span>
                </div>
              );
            })}
          </section>
        ))}
      </div>
      <footer className="border-t border-border px-4 py-3">
        {!c.can_send ? <Banner tone="warn" title="You can no longer reply here.">{c.blocked_reason}</Banner> : (
          <>
            {sendError && <div className="mb-2"><ErrorBanner error={sendError} /></div>}
            <form className="flex items-end gap-2.5" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <label htmlFor="chat-draft" className="sr-only">Message to {c.other_name}</label>
              <textarea id="chat-draft" value={draft} rows={Math.min(6, Math.max(1, draft.split("\n").length))} placeholder={`Message ${c.other_name}`}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
                aria-invalid={tooLong || undefined} aria-describedby="chat-hint"
                className={`flex-1 resize-none rounded-[18px] border bg-surface px-4 py-2.5 text-[14px] leading-[1.5] outline-none transition-shadow focus:border-accent focus:ring-4 focus:ring-accent/15 ${tooLong ? "border-bad ring-4 ring-bad/10" : "border-border-strong"}`} />
              <Button type="submit" disabled={!length || tooLong || sending} aria-label="Send" className="!h-11 !w-11 !px-0 !rounded-full"><I.Send /></Button>
            </form>
            <div id="chat-hint" className="flex justify-between text-[11.5px] text-faint mt-1.5 px-1">
              <span>Enter to send, Shift + Enter for a new line</span>
              {length > WARN_AT && <span className={`tabular ${tooLong ? "text-bad-ink font-semibold" : ""}`}>{length.toLocaleString("en-SG")} / {MAX.toLocaleString("en-SG")}</span>}
            </div>
          </>
        )}
      </footer>
    </>
  );
}

/** REQ-CHAT-1, 2: the people this user may write to. Picking one opens the pair's conversation, made on first use.
 *  Mounted only while open, so each opening asks the API again. */
function ContactPicker({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const call = useCall();
  const [contacts, setContacts] = useState<ChatContact[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const shown = (contacts ?? []).filter((p) => !q.trim() || `${p.name} ${p.projects.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()));

  useEffect(() => {
    let alive = true;
    call((api) => api.chatContacts()).then((x) => { if (alive) setContacts(x); }, (e) => { if (alive) setError(toError(e)); });
    return () => { alive = false; };
  }, [call]);

  async function pick(p: ChatContact) {
    setBusy(p.user_id);
    try {
      const id = p.conversation_id ?? (await call((api) => api.startConversation(p.user_id))).id;
      onClose();
      router.push(`/messages/${id}`);
    } catch (e) {
      setError(toError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title="New message">
      {error && <div className="mb-3"><ErrorBanner error={error} /></div>}
      {!contacts ? <div className="py-6 flex justify-center"><Spinner /></div> : !contacts.length ? (
        <Empty icon={<I.Chat size={20} />} title="No one to message yet" note="You can message once a student has applied to one of the supervisor's projects or sent them a proposal." />
      ) : (
        <>
        {contacts.length > 6 && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or project" aria-label="Search people"
          className={`${inputCls()} w-full mb-2`} autoFocus />}
        {!shown.length && <p className="px-2.5 py-4 text-[13.5px] text-muted">No one matches &ldquo;{q.trim()}&rdquo;.</p>}
        <ul className="flex flex-col gap-1">
          {shown.map((p) => (
            <li key={p.user_id}>
              <button type="button" onClick={() => pick(p)} disabled={busy !== null}
                className="w-full flex items-center gap-3 text-left px-2.5 py-2.5 rounded-[14px] hover:bg-black/[0.03] disabled:opacity-60">
                <Avatar name={p.name} size={36} tone="auto" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-text truncate">{p.name}</span>
                  <span className="block text-[12.5px] text-muted truncate">{p.projects.join(" · ")}</span>
                </span>
                {busy === p.user_id ? <Spinner /> : <span className="text-[12.5px] font-semibold text-accent">{p.conversation_id ? "Open" : "Start"}</span>}
              </button>
            </li>
          ))}
        </ul>
        </>
      )}
    </Modal>
  );
}
