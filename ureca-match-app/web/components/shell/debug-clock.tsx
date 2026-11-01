"use client";
/** Developer tool: a fake clock in the top-right corner. Shown only when NEXT_PUBLIC_DEBUG_CLOCK=true.
 *  Setting it moves "now" for the whole API (live mode needs DEBUG_CLOCK=true on the server) or the mock client.
 *  After a change it runs the daily tick, refreshes the signed-in user's phase and remounts the page so it re-fetches. */
import { useEffect, useRef, useState } from "react";
import { useMe } from "./app-provider";
import { Button } from "@/components/ui";
import { ApiError, type ClockState } from "@/lib/api/models";
import { useCall } from "@/lib/use-api";

export const DEBUG_CLOCK_ON = process.env.NEXT_PUBLIC_DEBUG_CLOCK === "true";

const HOUR = 3_600_000;
const fmt = (iso: string) => new Date(iso).toLocaleString("en-SG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
/** <input type="datetime-local"> wants local time as YYYY-MM-DDTHH:mm. */
const toLocalInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function DebugClock({ onChanged }: { onChanged: () => void }) {
  const call = useCall();
  const { me, refresh } = useMe();
  const [state, setState] = useState<ClockState | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    call((api) => api.clock()).then((s) => { setState(s); setValue(toLocalInput(s.now)); }).catch((e) => setError((e as ApiError).message));
  }, [call]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function apply(fn: Parameters<typeof call<ClockState>>[0]) {
    setBusy(true); setError(null);
    try {
      const s = await call(fn);
      setState(s); setValue(toLocalInput(s.now));
      await call((api) => api.tick()).catch(() => {}); // advance round status and time out offers for the new "now"
      await refresh();
      onChanged();
    } catch (e) { setError((e as ApiError).message); }
    finally { setBusy(false); }
  }

  const shift = (ms: number) => state && apply((api) => api.setClock(new Date(Date.parse(state.now) + ms).toISOString()));
  const windowEnd = me?.phase.window_ends_at;

  return (
    <div ref={box} className="fixed top-3 right-4 z-50 text-[12.5px]">
      <button aria-label="Debug clock" onClick={() => setOpen((o) => !o)} className={`h-8 px-3 inline-flex items-center gap-2 rounded-full ring-1 backdrop-blur-xl transition-colors ${state?.overridden ? "bg-amber-100/80 ring-amber-300 text-amber-900" : "bg-white/70 ring-black/[0.08] text-muted hover:text-text"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${state?.overridden ? "bg-amber-500" : "bg-faint"}`} />
        <span className="tabular font-medium">{state ? fmt(state.now) : "Clock"}</span>
        {state?.overridden && <span className="font-semibold">fake</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[300px] rounded-[16px] bg-white/90 backdrop-blur-2xl ring-1 ring-black/[0.06] shadow-[0_8px_32px_rgba(0,0,0,0.10)] p-4 flex flex-col gap-3">
          <div className="font-semibold text-[13.5px]">Debug clock</div>
          {state && !state.enabled ? (
            <div className="text-muted leading-[1.5]">Switched off on the API. Set <b>DEBUG_CLOCK=true</b> in <b>api/.env</b> and restart it.</div>
          ) : (
            <>
              <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 rounded-[10px] px-2.5 ring-1 ring-black/[0.12] bg-white tabular" />
              <Button size="sm" disabled={busy || !value} onClick={() => apply((api) => api.setClock(new Date(value).toISOString()))}>{busy ? "Setting…" : "Set this time"}</Button>
              <div className="grid grid-cols-3 gap-2">
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => shift(HOUR)}>+1 hour</Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => shift(24 * HOUR)}>+1 day</Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => shift(7 * 24 * HOUR)}>+1 week</Button>
              </div>
              {windowEnd && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => apply((api) => api.setClock(new Date(Date.parse(windowEnd) + 60_000).toISOString()))}>
                  Skip past this window ({fmt(windowEnd)})
                </Button>
              )}
              <Button size="sm" variant="text" disabled={busy || !state?.overridden} onClick={() => apply((api) => api.resetClock())}>Back to the real clock</Button>
              <div className="text-faint leading-[1.5]">Moves the clock for every user on this API. Nothing is saved: restarting the API resets it.</div>
            </>
          )}
          {error && <div className="text-bad-ink font-medium">{error}</div>}
        </div>
      )}
    </div>
  );
}
