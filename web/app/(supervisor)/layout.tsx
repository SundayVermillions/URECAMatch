"use client";
import { AppShell } from "@/components/shell/app-shell";
import { useApi } from "@/lib/use-api";

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  const { data } = useApi((api) => api.supervisorDashboard().catch(() => null), []);
  return <AppShell role="supervisor" badges={{ proposals: data?.pending_proposals ?? 0, approvals: data?.pending_approvals ?? 0 }}>{children}</AppShell>;
}
