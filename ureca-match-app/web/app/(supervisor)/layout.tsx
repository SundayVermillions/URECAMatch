"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { BADGES_EVENT } from "@/components/shell/badges";
import { useApi } from "@/lib/use-api";

/** The sidebar counts (proposals waiting, matches to approve) are read again on every page change and whenever a page says it
 *  changed them, so they never lag behind what the screens show. */
export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data, reload } = useApi((api) => api.supervisorDashboard().catch(() => null), [pathname]);
  useEffect(() => {
    window.addEventListener(BADGES_EVENT, reload);
    return () => window.removeEventListener(BADGES_EVENT, reload);
  }, [reload]);
  return <AppShell role="supervisor" badges={{ proposals: data?.pending_proposals ?? 0, approvals: data?.pending_approvals ?? 0 }}>{children}</AppShell>;
}
