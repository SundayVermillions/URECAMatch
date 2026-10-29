"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Banner, Button, Field, Input } from "@/components/ui";
import { useMe } from "@/components/shell/app-provider";
import { API_MODE, getClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/models";
import { homeFor, setSession } from "@/lib/session";

const DEMO = [
  { id: "stu-1", label: "Student · Wei Ling Tan" },
  { id: "stu-33", label: "Student with an accepted offer · Divya Nair" },
  { id: "sup-1", label: "Supervisor · Prof. Marcus Chua" },
  { id: "adm-1", label: "Admin · Jonathan Teo" },
];
// Demo buttons sign in by user id (X-Demo-User), which only an API in API_MODE=mock accepts.
// NEXT_PUBLIC_DEMO_ACCOUNTS=true shows them in live mode too, for a local live web app against a local mock API.
const SHOW_DEMO = API_MODE === "mock" || process.env.NEXT_PUBLIC_DEMO_ACCOUNTS === "true";

export default function SignIn() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isExpired = searchParams.get("reason") === "session_expired";

  const { refresh } = useMe();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await (await getClient()).signIn({ email, password });
      setSession({ userId: s.user.id, role: s.user.role, name: s.user.name, token: s.access_token });
      await refresh();
      router.replace(homeFor(s.user.role));
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function demo(id: string) {
    setSession({ userId: id, role: id.startsWith("stu") ? "student" : id.startsWith("sup") ? "supervisor" : "admin", name: "" });
    await refresh();
    router.replace(homeFor(id.startsWith("stu") ? "student" : id.startsWith("sup") ? "supervisor" : "admin"));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-[28px]">Welcome back</h1>
        <div className="text-[14px] text-muted mt-1">Sign in with your NTU e-mail address.</div>
      </div>

      {isExpired && !error && (
        <Banner tone="warn">Your session has expired due to inactivity. Please sign in again.</Banner>
      )}
      {error && !error.field && <Banner tone="bad">{error.message}</Banner>}

      <Field label="NTU e-mail" error={error?.field === "email" ? error.message : null}>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@e.ntu.edu.sg"
          autoComplete="username"
          required
          invalid={error?.field === "email"}
        />
      </Field>

      <Field label="Password">
        <div className="relative">
          <Input
            id="password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pr-16"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-accent"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </Field>

      <Button type="submit" size="lg" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>

      <div className="text-[13px] text-muted text-center">
        New here?{" "}
        <Link href="/create-account" className="font-semibold">
          Create an account
        </Link>
      </div>

      {SHOW_DEMO && (
        <div className="border-t border-border pt-4 mt-1">
          <div className="eyebrow mb-2">Demo accounts (password: password)</div>
          <div className="flex flex-col gap-1.5">
            {DEMO.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => demo(d.id)}
                className="text-left text-[13px] px-3 py-2 rounded-button border border-white/70 bg-white/50 hover:bg-white/80 transition-colors"
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}