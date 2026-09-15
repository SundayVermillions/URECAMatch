"use client";
/** ViewNotifications (4.21). REQ-NOTIF-1..2. Same page for every role. */
import Link from "next/link";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { Empty, Loading, fmtDateTime } from "@/components/ui";
import { useApi, useCall } from "@/lib/use-api";

export default function Notifications() {
  const { refresh } = useMe();
  const call = useCall();
  const { data, loading, setData } = useApi((api) => api.notifications(), []);
  async function open(id: string) {
    await call((api) => api.markRead(id));
    setData((data ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)));
    refresh();
  }
  return (
    <AppShell>
      <PageHeader title="Notifications" description="Newest first. Opening one marks it as read." />
      {loading && !data ? <Loading /> : !data?.length ? <Empty title="Nothing yet" note="Round openings, offers and decisions will appear here." /> : (
        <div className="flex flex-col gap-2 max-w-2xl">
          {data.map((n) => (
            <div key={n.id} onClick={() => open(n.id)} className={`flex gap-3 p-3 rounded-row border cursor-pointer ${n.read ? "border-border bg-surface" : "border-accent-border bg-accent-soft"}`}>
              <div className={`w-8 h-8 rounded-button flex items-center justify-center shrink-0 ${n.read ? "bg-sunken text-muted" : "bg-surface text-accent"}`}>
                {n.event === "offer_received" || n.event === "results_published" ? <I.Check size={16} /> : n.event === "proposal_decided" ? <I.Bulb size={16} /> : <I.Calendar size={16} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-semibold ${n.read ? "text-muted" : ""}`}>{n.title}</div>
                <div className="text-[12px] text-muted mt-0.5">{n.message}</div>
                <div className="text-[11px] text-faint mt-1">{fmtDateTime(n.created_at)}{n.link && <> · <Link href={n.link} className="font-semibold" onClick={(e) => e.stopPropagation()}>Open</Link></>}</div>
              </div>
              {!n.read && <div className="w-2 h-2 rounded-full bg-accent shrink-0 mt-1.5" />}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
