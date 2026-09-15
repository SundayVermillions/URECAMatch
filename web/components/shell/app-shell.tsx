"use client";
/** The common shell (style sheet 03): fixed 240 px sidebar, content region max 1080, 24/40 insets. */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMe } from "./app-provider";
import { I } from "./icons";
import type { Role } from "@/lib/api/models";
import { Avatar } from "@/components/ui";

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
    { href: "/proposals", label: "Proposals from students", icon: <I.Bulb />, badge: x.proposals },
    { href: "/approvals", label: "Match approvals", icon: <I.Check />, badge: x.approvals },
    { href: "/notifications", label: "Notifications", icon: <I.Bell />, badge: unread },
  ],
  admin: (unread) => [
    { href: "/dashboard", label: "Dashboard", icon: <I.Chart /> },
    { href: "/users", label: "Manage users", icon: <I.Users /> },
    { href: "/rounds", label: "Matching rounds", icon: <I.Calendar /> },
    { href: "/audit", label: "Audit & overrides", icon: <I.Shield /> },
    { href: "/notifications", label: "Notifications", icon: <I.Bell />, badge: unread },
  ],
};
const SECTION: Record<Role, string> = { student: "Student", supervisor: "Supervisor", admin: "Administration" };

export function AppShell({ role: wanted, children, badges = {} }: { role?: Role; children: React.ReactNode; badges?: Record<string, number> }) {
  const { me, loading, signOut } = useMe();
  const role = wanted ?? me?.user.role ?? "student";
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!me) { router.replace("/sign-in"); return; }
    if (me.user.role !== role) router.replace(me.user.role === "student" ? "/browse" : me.user.role === "supervisor" ? "/projects" : "/dashboard");
    else if (role === "student" && me.student && !me.student.profile_complete && path !== "/profile") router.replace("/profile?complete=1"); // REQ-PROF-1
  }, [me, loading, role, router, path]);

  if (loading || !me || me.user.role !== role) return <div className="p-10 text-muted">Loading…</div>;
  const items = NAV[role](me.unread_notifications, badges);
  const sub = role === "student" ? `${me.student?.school || "Student"} · Year ${me.student?.year_of_study ?? "?"}` : role === "supervisor" ? `Project Supervisor · ${me.supervisor?.faculty ?? ""}` : "URECA Programme Admin";

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-surface border-r border-border flex flex-col justify-between px-4 py-6 sticky top-0 h-screen">
        <div>
          <div className="flex items-center gap-2 px-2 pb-6">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="6" cy="12" r="3.4" stroke="var(--navy)" strokeWidth="1.8" /><circle cx="18" cy="12" r="3.4" stroke="var(--navy)" strokeWidth="1.8" /><line x1="9.4" y1="12" x2="14.6" y2="12" stroke="var(--navy)" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <span className="font-display font-bold text-[16.5px] tracking-tight">URECAMatch</span>
          </div>
          <div className="overline px-3 pb-2">{SECTION[role]}</div>
          <nav className="flex flex-col gap-0.5">
            {items.map((it) => {
              const active = path === it.href || path.startsWith(it.href + "/");
              return (
                <Link key={it.href} href={it.href} className={`flex items-center gap-[11px] px-3 py-2.5 rounded-button font-display text-[14px] ${active ? "bg-accent-soft text-accent-ink font-semibold" : "text-muted font-medium hover:bg-sunken hover:text-text"}`}>
                  {it.icon}
                  {it.label}
                  {it.badge ? <span className="ml-auto bg-bad text-white text-[10.5px] font-bold rounded-pill px-[6.5px] py-px">{it.badge}</span> : null}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="h-px bg-border" />
          <div className="flex items-center gap-2.5 p-2">
            <Avatar name={me.user.name} size={32} tone="navy" />
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold truncate">{me.user.name}</div>
              <div className="text-[11.5px] text-faint truncate">{sub}</div>
            </div>
          </div>
          <button onClick={signOut} className="text-left text-[12.5px] text-muted px-2 hover:text-text">Sign out</button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[1080px] py-6 pl-10 pr-5">{children}</div>
      </main>
    </div>
  );
}

/** Page title row with optional description, back link and right-hand slot (deadline chip, action). */
export function PageHeader({ title, description, back, right }: { title: string; description?: string; back?: { href: string; label: string }; right?: React.ReactNode }) {
  return (
    <div className="mb-5">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted mb-3.5 hover:text-text">
          <I.ChevronLeft /> {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1>{title}</h1>
          {description && <div className="text-[13.5px] text-muted mt-1">{description}</div>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </div>
  );
}
