"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, Button, Field, Input, Select } from "@/components/ui";
import { getClient } from "@/lib/api/client";
import { ApiError, type Role } from "@/lib/api/models";
import { TITLES } from "@/lib/titles";

export default function CreateAccount() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", password: "", role: "student" as Role, title: "" });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await (await getClient()).register(f); router.push(`/verify?email=${encodeURIComponent(f.email)}`); }
    catch (err) { setError(err as ApiError); } finally { setBusy(false); }
  }
  const err = (k: string) => (error?.field === k ? error.message : null);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div><h1 className="text-[22px]">Create account</h1><div className="text-[13px] text-muted mt-1">We will send a verification code to your NTU e-mail.</div></div>
      {error && !error.field && <Banner tone="bad">{error.message}</Banner>}
      <Field label="I am a">
        <div className="grid grid-cols-2 gap-2">
          {(["student", "supervisor"] as Role[]).map((r) => (
            <button key={r} type="button" onClick={() => setF({ ...f, role: r })} className={`h-10 rounded-button border text-[13px] font-semibold ${f.role === r ? "border-accent bg-accent-soft text-accent-ink" : "border-border-strong text-muted"}`}>
              {r === "student" ? "Student" : "Project Supervisor"}
            </button>
          ))}
        </div>
      </Field>
      {f.role === "supervisor" && (
        <Field label="Title" error={err("title")} hint="Shown in front of your name">
          <Select id="title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} invalid={!!err("title")}>
            <option value="">No title</option>
            {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Full name" hint={f.role === "supervisor" ? "Without the title" : undefined} error={err("name")}><Input id="name" value={f.name} onChange={set("name")} required invalid={!!err("name")} /></Field>
      <Field label="NTU e-mail" error={err("email")} hint="@e.ntu.edu.sg or @ntu.edu.sg"><Input id="email" type="email" value={f.email} onChange={set("email")} required invalid={!!err("email")} /></Field>
      <Field label="Password" error={err("password")} hint="At least 8 characters">
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={f.password}
            onChange={set("password")}
            required
            minLength={8}
            invalid={!!err("password")}
            className="w-full pr-16"
          />
           <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-accent"
           >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </Field>
      <Button type="submit" size="lg" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
      <div className="text-[13px] text-muted text-center">Already registered? <Link href="/sign-in" className="font-semibold">Sign in</Link></div>
    </form>
  );
}
