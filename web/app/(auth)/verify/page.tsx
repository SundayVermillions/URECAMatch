"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Banner, Button, Field, Input } from "@/components/ui";
import { getClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/models";

function VerifyForm() {
  const router = useRouter();
  const email = useSearchParams().get("email") ?? "";
  const [code, setCode] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await (await getClient()).verify({ email, code }); router.push("/sign-in?verified=1"); }
    catch (err) { setError(err as ApiError); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="bg-surface border border-border rounded-modal p-7 flex flex-col gap-4">
      <div><h1 className="text-[22px]">Check your e-mail</h1><div className="text-[13px] text-muted mt-1">Enter the 6-digit code we sent to <strong>{email}</strong>. It expires in 10 minutes.</div></div>
      {error && !error.field && <Banner tone="bad">{error.message}</Banner>}
      <Field label="Verification code" error={error?.field === "code" ? error.message : null} hint="Demo code: 000000">
        <Input id="code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="tracking-[0.3em] font-mono text-center text-[18px]" required invalid={error?.field === "code"} />
      </Field>
      <Button type="submit" size="lg" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Activate account"}</Button>
      <button type="button" className="text-[13px] text-accent font-semibold">Resend code</button>
    </form>
  );
}
export default function Verify() { return <Suspense><VerifyForm /></Suspense>; }
