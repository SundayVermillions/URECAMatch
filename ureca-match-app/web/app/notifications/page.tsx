"use client";
/** ViewNotifications (4.21). REQ-NOTIF-1..2. Same page for every role.
 *  Grouped by day (Today, Yesterday, then the date) using the app's clock; each kind of event has its own icon and tint. */
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AppShell, PageTitle } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Card, Empty, ErrorBanner, Skeleton, fmtDate } from "@/components/ui";
import { ApiError, type Notification } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

/** One icon per kind of event, in one colour system: blue while unread, grey once read. Only a rejection is red. */
const ICON: Record<string, React.ReactNode> = {
  round_opened: <I.PlayCircle size={18} />,   // a round has started
  cycle_changed: <I.Clock size={18} />,       // a date or deadline moved, or is close
  offer_received: <I.Mail size={18} />,       // an offer has arrived
  results_published: <I.Check size={18} />,   // results are out
  matches_proposed: <I.Layers size={18} />,
  match_approved: <I.CheckCircle size={18} />,
  match_rejected: <I.Alert size={18} />,
  proposal_decided: <I.Bulb size={18} />,
  account_changed: <I.User size={18} />,
  message_received: <I.Chat size={18} />,     // REQ-CHAT-6
};
const FALLBACK = <I.Bell size={18} />;
const tileFor = (event: string, read: boolean) => (read ? "bg-neutral-soft text-faint" : event === "match_rejected" ? "bg-bad-soft text-bad-ink" : "bg-accent-soft text-accent-ink");

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" }); // YYYY-MM-DD in Singapore

export default function Notifications() {
  const { me, refresh } = useMe();
  const call = useCall();
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const { data, loading, setData } = useApi((api) => api.notifications(), []);
  // REQ-NOTIF-2: opening marks it read (once) and updates the sidebar badge, then follows its link.
  async function open(n: Notification) {
    setError(null);
    if (!n.read) {
      try {
        await call((api) => api.markRead(n.id));
      } catch (e) {
        setError(e instanceof ApiError ? e : new ApiError(0, "network", String(e)));
        return;
      }
      setData((prev) => (prev ?? []).map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void refresh();
    }
    if (n.link) router.push(n.link);
  }

  const groups = useMemo(() => {
    const now = me?.phase.now ?? new Date().toISOString();
    const today = dayKey(now), yesterday = dayKey(new Date(Date.parse(now) - 86_400_000).toISOString());
    const out: { key: string; label: string; items: Notification[] }[] = [];
    for (const n of data ?? []) {
      const k = dayKey(n.created_at);
      let g = out[out.length - 1];
      if (!g || g.key !== k) { g = { key: k, label: k === today ? "Today" : k === yesterday ? "Yesterday" : fmtDate(n.created_at, { day: "numeric", month: "long" }), items: [] }; out.push(g); }
      g.items.push(n);
    }
    return out;
  }, [data, me?.phase.now]);

  return (
    <AppShell>
      <PageTitle title="Notifications" />
      {error && <div className="mb-4 max-w-3xl"><ErrorBanner error={error} /></div>}
      {loading && !data ? (
        <div className="flex flex-col gap-3 max-w-3xl" aria-busy="true" aria-label="Loading notifications">
          {[0, 1, 2].map((i) => <Card key={i} padded={false} className="flex gap-4 !rounded-[18px] p-4"><Skeleton className="w-10 h-10 !rounded-[12px]" /><div className="flex-1 flex flex-col gap-2.5 pt-1"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-4/5" /></div></Card>)}
        </div>
      ) : !data?.length ? <Empty icon={<I.Bell size={20} />} title="Nothing yet" note="Round openings, offers and decisions will appear here." /> : (
        <div className="flex flex-col gap-7 max-w-3xl">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h2 className="eyebrow !text-[12.5px] font-semibold mb-2.5 px-1">{g.label}</h2>
              <div className="flex flex-col gap-2.5">
                {g.items.map((n) => {
                  return (
                    <button type="button" key={n.id} onClick={() => open(n)} aria-label={`${n.read ? "" : "Unread. "}${n.title}`}
                      className={`group relative flex items-start gap-4 !rounded-[18px] pl-5 pr-4 py-3.5 cursor-pointer text-left w-full overflow-hidden transition-[box-shadow,background-color] ${n.read
                        ? "card-flat !bg-white/40 hover:!bg-white/70"
                        : "card-surface !bg-[linear-gradient(180deg,#eef5ff,#ffffff)] shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgba(0,113,227,0.28),0_18px_36px_-22px_rgba(0,113,227,0.5)] hover:shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgba(0,113,227,0.4),0_20px_40px_-20px_rgba(0,113,227,0.55)]"}`}>
                      {!n.read && <span aria-hidden className="absolute left-0 top-3 bottom-3 w-[3.5px] rounded-r-full bg-accent" />}
                      <span className={`w-10 h-10 rounded-full grid place-items-center shrink-0 ${tileFor(n.event, n.read)}`}>{ICON[n.event] ?? FALLBACK}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[14.5px] leading-[1.35] ${n.read ? "font-medium text-muted" : "font-semibold text-text"}`}>{n.title}</span>
                        <span className={`block text-[13.5px] mt-0.5 leading-[1.5] ${n.read ? "text-faint" : "text-muted"}`}>{n.message}</span>
                        <span className="block text-[12px] text-faint mt-1.5 tabular">{new Date(n.created_at).toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" })}{n.link && <span className={`ml-2 font-semibold ${n.read ? "text-muted" : "text-accent group-hover:text-accent-ink"}`}>Open</span>}</span>
                      </span>
                      {!n.read && <span className="shrink-0 mt-1 inline-flex items-center h-6 px-2.5 rounded-pill bg-accent text-white text-[11px] font-semibold">New</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
