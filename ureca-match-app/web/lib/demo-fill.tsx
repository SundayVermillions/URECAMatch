"use client";
/** Demo only: a floating "Fill demo" button that types the prepared text into the page's form, so a live demo does not wait on typing.
 *  Shown only when NEXT_PUBLIC_DEBUG_CLOCK=true. A page registers what its button does with useDemoFill. Each browser tab remembers
 *  which student it plays. The text lives in lib/demo-data.ts. */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DEMO, type DemoRole } from "@/lib/demo-data";

export const DEMO_FILL_ON = process.env.NEXT_PUBLIC_DEBUG_CLOCK === "true";
const ROLE_KEY = "urecamatch.demo.role";

type Handler = (role: DemoRole) => Promise<void>;
let current: Handler | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Register what the Fill demo button does on this page. The latest closure is used, so it always sees current state. */
export function useDemoFill(fill: Handler) {
  const latest = useRef(fill);
  useEffect(() => { latest.current = fill; });
  useEffect(() => {
    if (!DEMO_FILL_ON) return;
    const h: Handler = (role) => latest.current(role);
    current = h; emit();
    return () => { if (current === h) { current = null; emit(); } };
  }, []);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Type text into a field one slice at a time. Long text types faster, so no field takes more than about 1.6 seconds. */
export async function typeText(set: (v: string) => void, text: string) {
  const total = Math.min(1600, text.length * 28);
  const step = Math.max(1, Math.ceil(text.length / (total / 16)));
  for (let i = step; i < text.length + step; i += step) { set(text.slice(0, Math.min(i, text.length))); await sleep(16); }
}

/** Fetch a prepared file from /public/demo as a File, the same as if the person had chosen it. */
export async function demoFile(url: string): Promise<File> {
  const blob = await (await fetch(url)).blob();
  return new File([blob], url.split("/").pop() ?? "document.pdf", { type: "application/pdf" });
}

const getRole = (): DemoRole => { try { return sessionStorage.getItem(ROLE_KEY) === "s2" ? "s2" : "s1"; } catch { return "s1"; } };
const setRole = (r: DemoRole) => { try { sessionStorage.setItem(ROLE_KEY, r); } catch { /* the tab just forgets it */ } emit(); };

export function DemoFillButton() {
  const handler = useSyncExternalStore(subscribe, () => current, () => null);
  const role = useSyncExternalStore(subscribe, getRole, () => "s1" as DemoRole);
  const [busy, setBusy] = useState(false);
  if (!DEMO_FILL_ON || !handler) return null;
  async function run() {
    if (!handler || busy) return;
    setBusy(true);
    try { await handler(role); } finally { setBusy(false); }
  }
  return (
    <div className="fixed bottom-4 right-20 z-50 flex items-center gap-1.5 rounded-pill bg-white/85 p-1.5 pl-3 shadow-[0_8px_28px_-10px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.08] backdrop-blur-xl">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Demo</span>
      {(["s1", "s2"] as DemoRole[]).map((r) => (
        <button key={r} type="button" onClick={() => setRole(r)} aria-pressed={role === r}
          className={`h-7 rounded-pill px-3 text-[12px] font-medium transition-colors ${role === r ? "bg-accent text-white" : "text-muted hover:bg-black/[0.05]"}`}>
          {DEMO[r].label}
        </button>
      ))}
      <button type="button" onClick={run} disabled={busy}
        className="h-7 rounded-pill bg-text px-3.5 text-[12px] font-semibold text-white disabled:opacity-60">
        {busy ? "Filling..." : "Fill"}
      </button>
    </div>
  );
}
