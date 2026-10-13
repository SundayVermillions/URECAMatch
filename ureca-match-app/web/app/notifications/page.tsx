"use client";
/** ViewNotifications (4.21). REQ-NOTIF-1..2. Same page for every role. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Empty, ErrorBanner, Loading, fmtDateTime } from "@/components/ui";
import { ApiError, type Notification } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

export default function Notifications() {
  const { refresh } = useMe();
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
  return (
    <AppShell>
      <PageHeader title="Notifications" description="Newest first. Opening one marks it as read." />
      {error && <div className="mb-4 max-w-2xl"><ErrorBanner error={error} /></div>}
      {loading && !data ? <Loading /> : !data?.length ? <Empty title="Nothing yet" note="Round openings, offers and decisions will appear here." /> : (
        <div className="flex flex-col gap-2 max-w-2xl">
          {data.map((n) => (
            <button type="button" key={n.id} onClick={() => open(n)} className={`flex gap-3 p-3 rounded-row border cursor-pointer text-left w-full ${n.read ? "border-border bg-surface" : "border-accent-border bg-accent-soft"}`}>
              <div className={`w-8 h-8 rounded-button flex items-center justify-center shrink-0 ${n.read ? "bg-sunken text-muted" : "bg-surface text-accent"}`}>
                {n.event === "offer_received" || n.event === "results_published" ? <I.Check size={16} /> : n.event === "proposal_decided" ? <I.Bulb size={16} /> : <I.Calendar size={16} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-semibold ${n.read ? "text-muted" : ""}`}>{n.title}</div>
                <div className="text-[12px] text-muted mt-0.5">{n.message}</div>
                <div className="text-[11px] text-faint mt-1">{fmtDateTime(n.created_at)}{n.link && <> · <span className="font-semibold text-accent">Open</span></>}</div>
              </div>
              {!n.read && <div className="w-2 h-2 rounded-full bg-accent shrink-0 mt-1.5" aria-label="Unread" />}
            </button>
          ))}
        </div>
      )}
    </AppShell>
  );
}
