"use client";
/** Where the cycle is, as a capsule: a progress ring (the round number inside, the application window filling as it runs down)
 *  and the time left. The first time a student sees it in a session the full sentence ("Round 2 closes 10 Sep, ...") is shown,
 *  then folds into the capsule. Hover, focus or a tap brings it back with the rounds on a quiet rail.
 *  Every round's state comes from the clock and the current round (phase), the same source as the sentence, never from a stored status.
 *  Reads the cycle and the demo clock (phase.now); changes nothing. */
import { useEffect, useId, useState } from "react";
import { useMe } from "@/components/shell/app-provider";
import { I } from "@/components/shell/icons";
import { fmtDate } from "@/components/ui";
import { useApi } from "@/lib/use-api";

const SEEN_KEY = "urecamatch.timeline.seen";
const INTRO_MS = 3400;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

function seen() {
  try { return sessionStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
}
function markSeen() {
  try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode: it just plays again */ }
}
function stillMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** "3 days left", "5 hours left", "20 min left", or "" once it has passed. Uses the app's clock, not the machine's. */
function left(endsAt: string | null | undefined, now: string | undefined) {
  if (!endsAt || !now) return "";
  const ms = Date.parse(endsAt) - Date.parse(now);
  if (ms <= 0) return "";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min left`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} ${h === 1 ? "hour" : "hours"} left`;
  return `${Math.round(h / 24)} days left`;
}

/** What the current round is doing, from the phase window. */
const NOW_WORDS: Record<string, string> = {
  application: "Applications open", review: "Supervisors ranking", approval: "Final checks", awaiting_results: "Results pending", results: "Results out",
};

function Ring({ progress, label, live }: { progress: number; label: React.ReactNode; live: boolean }) {
  const id = useId();
  const r = 9.5, c = 2 * Math.PI * r;
  return (
    <span className="relative w-6 h-6 shrink-0 grid place-items-center">
      <svg viewBox="0 0 24 24" className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6fa8ee" /><stop offset="1" stopColor="#2f64b4" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r={r} fill="none" stroke="#dbe5f3" strokeWidth="2" />
        <circle cx="12" cy="12" r={r} fill="none" stroke={live ? `url(#${id})` : "#9db4d6"} strokeWidth="2" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - progress)} style={{ transition: `stroke-dashoffset 900ms ${EASE}` }} />
      </svg>
      <span className="relative text-[10px] font-semibold tabular text-[#0b1f3a]">{label}</span>
    </span>
  );
}

export function CycleTimeline() {
  const { me } = useMe();
  const cycle = useApi((api) => api.cycle(), []);
  const [intro, setIntro] = useState(() => !(seen() || stillMotion())); // the first look in a session
  const [hover, setHover] = useState(false);
  const [held, setHeld] = useState(false); // a tap or click keeps it open
  const phase = me?.phase;
  const rounds = cycle.data?.rounds ?? [];

  // The hold starts when the capsule is really on screen (phase and rounds loaded), not when the component first mounts.
  const ready = !!phase && rounds.length > 0;
  useEffect(() => {
    if (!intro || !ready) return;
    const t = setTimeout(() => { setIntro(false); markSeen(); }, INTRO_MS);
    return () => clearTimeout(t);
  }, [intro, ready]);

  if (!phase) return null;

  const open = phase.window === "application";
  const remaining = left(phase.window_ends_at, phase.now);

  // Without rounds (before a cycle exists) there is nothing to draw: say where things stand.
  if (!rounds.length) {
    return <span className="shrink-0 inline-flex items-center gap-2 text-[13px] font-medium text-muted"><span aria-hidden className={`w-1.5 h-1.5 rounded-full ${open ? "bg-good" : "bg-warn"}`} />{phase.label}</span>;
  }

  const now = Date.parse(phase.now);
  const cur = phase.round_number;
  const stateOf = (r: (typeof rounds)[number]): "done" | "current" | "upcoming" => {
    if (cur != null) return r.number < cur ? "done" : r.number === cur ? "current" : "upcoming";
    return Date.parse(r.approval_end) <= now ? "done" : "upcoming"; // between rounds or after the cycle
  };
  const current = rounds.find((r) => stateOf(r) === "current");
  const progress = (() => {
    if (!current) return 0;
    if (!open) return 1; // applications are over for this round; it is in review, approval or waiting
    const a = Date.parse(current.application_start), b = Date.parse(current.application_end);
    return b > a ? Math.min(1, Math.max(0.05, (now - a) / (b - a))) : 1;
  })();

  const showCard = hover || held;
  const wide = intro || showCard; // the sentence is out
  const sentence = remaining ? phase.label : ""; // with no countdown, the label itself is the collapsed text

  return (
    <div className="relative z-40 shrink-0" onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setHeld(false); }}
      onFocus={() => setHover(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHover(false); }}>
      <button type="button" aria-expanded={showCard} onClick={() => setHeld((v) => !v)} aria-label={`${phase.label}${remaining ? `. ${remaining}` : ""}. Show the rounds`}
        className="inline-flex items-center h-9 pl-1.5 pr-3.5 rounded-pill bg-white/60 backdrop-blur-xl text-[12.5px] shadow-[inset_0_0_0_1px_rgba(15,40,90,0.06)] outline-none transition-colors hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-accent/50">
        <Ring progress={progress} label={cur ?? (phase.window === "closed" ? <I.Tick size={11} /> : "–")} live={open} />
        {sentence && (
          // 0fr to 1fr animates the width without measuring anything; the right edge stays put, so it folds toward the right.
          <span className="grid overflow-hidden" style={{ gridTemplateColumns: wide ? "1fr" : "0fr", opacity: wide ? 1 : 0, transition: `grid-template-columns 650ms ${EASE}, opacity 350ms ease` }}>
            <span className="overflow-hidden whitespace-nowrap"><span className="block font-medium text-text pl-2.5">{sentence}<span aria-hidden className="mx-2 text-faint">·</span></span></span>
          </span>
        )}
        <span className={`whitespace-nowrap ${sentence ? "pl-2 font-semibold text-accent-ink" : "pl-2 font-medium text-text"}`}>{remaining || phase.label}</span>
      </button>

      <div role="group" aria-label="The rounds" aria-hidden={!showCard}
        className="absolute right-0 top-full mt-2 w-[284px] rounded-[18px] bg-white/80 backdrop-blur-2xl px-4 py-3.5 shadow-[inset_0_0_0_1px_rgba(15,40,90,0.06),0_28px_56px_-24px_rgba(30,60,120,0.4)]"
        style={{ opacity: showCard ? 1 : 0, transform: showCard ? "none" : "translateY(-6px) scale(0.98)", transformOrigin: "top right", visibility: showCard ? "visible" : "hidden", transition: `opacity 250ms ease, transform 350ms ${EASE}, visibility 250ms` }}>
        <ol className="relative flex flex-col gap-3.5">
          <span aria-hidden className="absolute left-[4.5px] top-2 bottom-2 w-px bg-[#d6e2f3]" />
          {rounds.map((r) => {
            const st = stateOf(r);
            const words = st === "done" ? "Results out" : st === "current" ? NOW_WORDS[phase.window] ?? "In progress" : "Scheduled";
            return (
              <li key={r.id} className="relative flex items-start gap-3.5" aria-current={st === "current" ? "step" : undefined}>
                <span aria-hidden className="relative z-[1] mt-[5px] w-[10px] h-[10px] shrink-0 grid place-items-center">
                  {st === "current" && <span className="absolute -inset-[3px] rounded-full bg-accent/15" />}
                  <span className={`block rounded-full ${st === "done" ? "w-[9px] h-[9px] bg-[var(--brand-steel)]" : st === "current" ? "w-[10px] h-[10px] bg-accent" : "w-[9px] h-[9px] bg-white shadow-[inset_0_0_0_1.5px_#b9c7dc]"}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] leading-[1.3] ${st === "current" ? "font-semibold text-text" : "font-medium text-text/80"}`}>Round {r.number}</span>
                  <span className={`block text-[12px] leading-[1.4] ${st === "current" ? "text-accent-ink" : "text-faint"}`}>{words}</span>
                </span>
                <span className="text-[12px] leading-[1.3] mt-[3px] text-muted tabular whitespace-nowrap">{fmtDate(r.application_start)} – {fmtDate(r.application_end)}</span>
              </li>
            );
          })}
        </ol>
        {cycle.data?.closing_date && <div className="mt-3.5 pt-3 border-t border-[#e3eaf5] text-[12px] text-faint">Cycle closes <span className="text-muted font-medium">{fmtDate(cycle.data.closing_date)}</span></div>}
      </div>
    </div>
  );
}
