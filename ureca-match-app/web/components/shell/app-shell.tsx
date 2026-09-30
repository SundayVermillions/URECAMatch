"use client";
/** The common shell (style sheet 03): fixed 240 px sidebar, content region max 1080, 24/40 insets. */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMe } from "./app-provider";
import { I } from "./icons";
import { GlassIndicator, LiquidGlassFilter } from "./liquid-glass";
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
    { href: "/proposals", label: "Proposals", icon: <I.Bulb />, badge: x.proposals },
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
  const activeIndex = items.findIndex((it) => path === it.href || path.startsWith(it.href + "/"));
  const sub = role === "student" ? `${me.student?.school || "Student"} · Year ${me.student?.year_of_study ?? "?"}` : role === "supervisor" ? `Supervisor${me.supervisor?.faculty ? ` · ${me.supervisor.faculty}` : ""}` : "URECA Programme Admin";

  return (
    <div className="flex min-h-screen">
      <div className="w-60 shrink-0 p-3 pr-0 sticky top-0 h-screen">
      {/* Frosted glass, one layer only: translucent white, blur, a single hairline and a soft shadow. */}
      <aside className="h-full rounded-[20px] bg-white/60 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-black/[0.05] shadow-[0_4px_24px_rgba(0,0,0,0.04)] flex flex-col justify-between p-3">
        <div>
          <div className="flex items-center gap-2.5 px-2.5 pb-6 pt-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="6" cy="12" r="3.4" stroke="var(--navy)" strokeWidth="1.8" /><circle cx="18" cy="12" r="3.4" stroke="var(--navy)" strokeWidth="1.8" /><line x1="9.4" y1="12" x2="14.6" y2="12" stroke="var(--navy)" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <span className="font-display font-semibold text-[16px] tracking-[-0.02em]">URECAMatch</span>
          </div>
          <div className="eyebrow px-2.5 pb-2">{SECTION[role]}</div>
          <LiquidGlassFilter />
          <nav className="relative flex flex-col gap-0.5">
            <GlassIndicator index={activeIndex} />
            {items.map((it, i) => {
              const active = i === activeIndex;
              return (
                <Link key={it.href} href={it.href} className={`group flex items-center gap-3 h-10 px-2.5 rounded-[12px] font-display text-[14px] transition-colors ${active ? "text-text font-semibold" : "text-muted font-medium hover:bg-black/[0.03] hover:text-text"}`}>
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
        <div className="max-w-[1080px] pt-10 pb-16 pl-12 pr-10">{children}</div>
      </main>
    </div>
  );
}

/** Page title row with optional description, back link and right-hand slot (deadline chip, action). */
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
