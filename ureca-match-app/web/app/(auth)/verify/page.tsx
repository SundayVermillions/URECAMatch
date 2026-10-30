"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Banner, Button, Field, Input, Reveal } from "@/components/ui";
import { getClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/models";

function VerifyForm() {
  const router = useRouter();
  const email = useSearchParams().get("email") ?? "";
  const [code, setCode] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentMsg, setResentMsg] = useState<string | null>(null);
  useEffect(() => { if (!resentMsg) return; const t = setTimeout(() => setResentMsg(null), 3000); return () => clearTimeout(t); }, [resentMsg]); // the "code sent" note goes away by itself

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResentMsg(null);
    try {
      await (await getClient()).verify({ email, code });
      router.push("/sign-in?verified=1");
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (!email || resending) return;
    setResending(true);
    setError(null);
    setResentMsg(null);
    try {
      await (await getClient()).resendCode(email);
      setResentMsg("A new verification code has been sent to your e-mail.");
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-[22px]">Check your e-mail</h1>
        <div className="text-[13px] text-muted mt-1">
          Enter the 6-digit code we sent to <strong>{email}</strong>. It expires in 10 minutes.
        </div>
      </div>
      {error && !error.field && <Banner tone="bad">{error.message}</Banner>}
      <Reveal show={!!resentMsg}><Banner tone="good">{resentMsg}</Banner></Reveal>
      <Field label="Verification code" error={error?.field === "code" ? error.message : null} hint="Use the code sent to your e-mail.">
        <Input
          id="code"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="tracking-[0.3em] font-mono text-center text-[18px]"
          required
          invalid={error?.field === "code"}
        />
      </Field>
      <Button type="submit" size="lg" disabled={busy || code.length !== 6}>
        {busy ? "Verifying..." : "Activate account"}
      </Button>
      <button
        type="button"
        onClick={handleResend}
        disabled={resending || !email}
        className="text-[13px] text-accent font-semibold disabled:opacity-50"
      >
        {resending ? "Sending code..." : "Resend code"}
      </button>
    </form>
  );
}

export default function Verify() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
