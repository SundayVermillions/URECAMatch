import { AuthShell } from "@/components/auth/auth-shell";

/** Spinning-globe intro, then the NTU and URECA marks beside the form (SRS 3.1.2). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
