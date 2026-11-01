"use client";
/** Demo only: a "Fill demo" section that types the prepared text into the page's form, so a live demo does not wait on typing.
 *  Shown only when NEXT_PUBLIC_DEBUG_CLOCK=true, inside the debug clock panel. A page registers what its button does with useDemoFill. Each browser tab remembers
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

/** Lives inside the debug clock panel, so it never shows in normal use. It appears only on a page that registered a fill. */
export function DemoFillPanel({ onStart }: { onStart: () => void }) {
  const handler = useSyncExternalStore(subscribe, () => current, () => null);
  const role = useSyncExternalStore(subscribe, getRole, () => "s1" as DemoRole);
  const [busy, setBusy] = useState(false);
  if (!DEMO_FILL_ON || !handler) return null;
  async function run() {
    if (!handler || busy) return;
    setBusy(true); onStart();
    try { await handler(role); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-2 border-t border-black/[0.08] pt-3">
      <div className="font-semibold text-[13.5px]">Fill demo</div>
      <div className="grid grid-cols-2 gap-2">
        {(["s1", "s2"] as DemoRole[]).map((r) => (
          <button key={r} type="button" onClick={() => setRole(r)} aria-pressed={role === r}
            className={`h-8 rounded-pill text-[12.5px] font-medium transition-colors ${role === r ? "bg-accent text-white" : "bg-neutral-soft text-muted hover:text-text"}`}>
            {DEMO[r].label}
          </button>
        ))}
      </div>
      <button type="button" onClick={run} disabled={busy}
        className="h-9 rounded-pill bg-text text-[13px] font-semibold text-white disabled:opacity-60">
        {busy ? "Filling..." : "Fill this page"}
      </button>
    </div>
  );
}
