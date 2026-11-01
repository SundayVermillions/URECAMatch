"use client";
/** The common shell (style sheet 03): fixed 240 px sidebar, content region max 1080, 24/40 insets. */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMe } from "./app-provider";
import { DEBUG_CLOCK_ON, DebugClock } from "./debug-clock";
import { I } from "./icons";
import { BrandMark } from "./brand-mark";
import { GlassIndicator, LiquidGlassFilter } from "./liquid-glass";
import type { Role } from "@/lib/api/models";
import { Avatar, Toast } from "@/components/ui";

type Item = { href: string; label: string; icon: React.ReactNode; badge?: number };

const NAV: Record<Role, (unread: number, extra: Record<string, number>) => Item[]> = {
  student: (unread) => [
    { href: "/browse", label: "Browse projects", icon: <I.Search /> },
    { href: "/my-applications", label: "My applications", icon: <I.Layers /> },
    { href: "/propose", label: "Propose a project", icon: <I.Bulb /> },
    { href: "/profile", label: "My profile", icon: <I.User /> },
    { href: "/notifications", label: "Notifications", icon: <I.Bell />, badge: unread },
  ],
  supervisor: (unread, x) => [
    { href: "/projects", label: "My projects", icon: <I.Folder /> },
    { href: "/proposals", label: "Proposals", icon: <I.Bulb />, badge: x.proposals },
    { href: "/approvals", label: "Match approvals", icon: <I.Check />, badge: x.approvals },
    { href: "/notifications", label: "Notifications", icon: <I.Bell />, badge: unread },
  ],
  admin: (unread) => [
    { href: "/dashboard", label: "Dashboard", icon: <I.Chart /> },
    { href: "/users", label: "User Management", icon: <I.Users /> },
    { href: "/listings", label: "Project Status", icon: <I.Folder /> },
    { href: "/rounds", label: "Application Cycle", icon: <I.Calendar /> },
    { href: "/assignments", label: "Assignments", icon: <I.User /> },
    { href: "/audit", label: "Audit Log", icon: <I.Shield /> },
    { href: "/notifications", label: "Notifications", icon: <I.Bell />, badge: unread },
  ],
};
const SECTION: Record<Role, string> = { student: "Student", supervisor: "Supervisor", admin: "Administration" };

export function AppShell({ role: wanted, children, badges = {} }: { role?: Role; children: React.ReactNode; badges?: Record<string, number> }) {
  const { me, loading, signOut } = useMe();
  const role = wanted ?? me?.user.role ?? "student";
  const path = usePathname();
  const router = useRouter();
  const [epoch, setEpoch] = useState(0);
  const [profileNotice, setProfileNotice] = useState(0);
  const profileIncomplete = me?.user.role === "student" && !!me.student && !me.student.profile_complete;

  useEffect(() => {
    if (loading) return;
    if (!me) { router.replace("/sign-in"); return; }
    if (me.user.role !== role) router.replace(me.user.role === "student" ? "/browse" : me.user.role === "supervisor" ? "/projects" : "/dashboard");
    // The incomplete-profile redirect lives in AppProvider, so there is one place that decides where they land.
  }, [me, loading, role, router, path]);

  if (loading || !me || me.user.role !== role) return <div className="p-10 text-muted">Loading…</div>;
  const items = NAV[role](me.unread_notifications, badges);
  const activeIndex = items.findIndex((it) => path === it.href || path.startsWith(it.href + "/"));
  const sub = role === "student" ? `${me.student?.school || "Student"} · Year ${me.student?.year_of_study ?? "?"}` : role === "supervisor" ? `Supervisor${me.supervisor?.faculty ? ` · ${me.supervisor.faculty}` : ""}` : "URECA Programme Admin";

  return (
    <div className="flex min-h-screen">
      <div className="w-60 shrink-0 p-3 pr-0 sticky top-0 h-screen">
      {/* Frosted glass, one layer only: translucent white, blur, a single hairline and a soft shadow. */}
      <aside className="h-full rounded-[20px] bg-white/60 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-black/[0.05] shadow-[0_4px_24px_rgba(0,0,0,0.04)] flex flex-col justify-between p-3">
        <div>
          <div className="flex items-center gap-2.5 px-2.5 pb-6 pt-2">
            <BrandMark size={28} />
            <span className="font-display font-semibold text-[16px] tracking-[-0.02em]">URECAMatch</span>
          </div>
          <div className="eyebrow px-2.5 pb-2">{SECTION[role]}</div>
          <LiquidGlassFilter />
          <nav className="relative flex flex-col gap-0.5">
            <GlassIndicator index={activeIndex} />
            {items.map((it, i) => {
              const active = i === activeIndex;
              return (
                <Link key={it.href} href={it.href} onNavigate={(event) => {
                  // REQ-PROF-1: explain the gate without discarding an unfinished profile form.
                  if (profileIncomplete && it.href !== "/profile") {
                    event.preventDefault();
                    setProfileNotice((notice) => notice + 1);
                    if (path !== "/profile") router.replace("/profile?complete=1");
                  }
                }} className={`group flex items-center gap-3 h-10 px-2.5 rounded-[12px] font-display text-[14px] transition-colors ${active ? "text-text font-semibold" : "text-muted font-medium hover:bg-black/[0.03] hover:text-text"}`}>
                  <span className={`shrink-0 ${active ? "text-text" : "text-faint group-hover:text-muted"}`}>{it.icon}</span>
                  <span className="truncate">{it.label}</span>
                  {it.badge ? <span className="ml-auto min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-accent text-white text-[11px] font-semibold tabular">{it.badge}</span> : null}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2.5 px-2 pt-3 border-t border-black/[0.06]">
          <Avatar name={me.user.name} size={32} tone="navy" />
          <div className="min-w-0 flex-1" title={`${me.user.name} · ${sub}`}>
            <div className="text-[13.5px] font-medium truncate">{me.user.name}</div>
            <div className="text-[12px] text-faint truncate">{sub}</div>
          </div>
          <button onClick={signOut} title="Sign out" aria-label="Sign out" className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full text-faint transition-colors hover:text-text hover:bg-black/[0.06]"><I.LogOut size={16} /></button>
        </div>
      </aside>
      </div>
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Toast key={profileNotice} show={profileNotice > 0 && profileIncomplete} tone="warn" title="Please complete your profile first." onClose={() => setProfileNotice(0)}>
          Upload your transcript, check your details and save before opening other pages.
        </Toast>
        {DEBUG_CLOCK_ON && <DebugClock onChanged={() => setEpoch((n) => n + 1)} />}
        {/* The key remounts the page after the debug clock moves, so every screen re-fetches for the new "now", and when the route changes, so the entrance plays. */}
        <div key={`${epoch}:${path}`} className="page-in max-w-[1080px] pt-10 pb-16 pl-12 pr-10">{children}</div>
      </main>
    </div>
  );
}

/** Page title row with optional description, back link and right-hand slot (deadline chip, action). */
/** A title and nothing else, with the cycle's status as a pill on the right (green dot while applications are open,
 *  amber otherwise). For screens that explain themselves; PageHeader keeps the one-line description for the rest. */
export function PageTitle({ title, status, open, right }: { title: string; status?: string; open?: boolean; right?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-4 mb-6">
      <h1 className="!text-[38px] !leading-[1.08] !tracking-[-0.035em]">{title}</h1>
      {right ?? (status && (
        <span className="shrink-0 inline-flex items-center gap-2 h-9 px-4 rounded-pill bg-white/70 backdrop-blur-xl ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_20px_-12px_rgba(0,0,0,0.15)] text-[13px] font-medium text-text">
          <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${open ? "bg-good" : "bg-warn"}`} />
          {status}
        </span>
      ))}
    </header>
  );
}

export function PageHeader({ title, description, back, right }: { title: string; description?: string; back?: { href: string; label: string }; right?: React.ReactNode }) {
  return (
    <div className="mb-8">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-[13.5px] font-medium text-accent mb-4 hover:text-accent-ink">
          <I.ChevronLeft /> {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1>{title}</h1>
          {description && <div className="text-[15px] text-muted mt-2 max-w-[640px] leading-[1.5]">{description}</div>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </div>
  );
}
