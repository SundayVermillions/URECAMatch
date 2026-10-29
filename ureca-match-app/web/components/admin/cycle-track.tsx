"use client";
/** The cycle on one date axis. Every round is drawn to scale as three bands (applications, supervisor review, matching and approvals),
 *  the part of each band that has already happened fills in, and a marker shows where the clock is now. Reads rounds and the app's
 *  clock (phase.now, not the machine's); changes nothing. */
import { useEffect, useState } from "react";
import { fmtDate } from "@/components/ui";
import type { Round } from "@/lib/api/models";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const DAY = 86_400_000;
const BANDS = [
  { key: "application", label: "Applications", colour: "#8fbaf2" },
  { key: "review", label: "Supervisor review", colour: "#4f86d0" },
  { key: "approval", label: "Matching and approvals", colour: "#1f4f9a" },
] as const;

export function CycleTrack({ rounds, now: nowIso, current }: { rounds: Round[]; now: string; current: number | null }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setGrown(true), 80); return () => clearTimeout(t); }, []);
  if (rounds.length === 0) return null;

  const t = (iso: string) => Date.parse(iso);
  const first = t(rounds[0].application_start) - 2 * DAY;
  const last = t(rounds[rounds.length - 1].approval_end) + 2 * DAY;
  const at = (ms: number) => Math.max(0, Math.min(100, ((ms - first) / (last - first)) * 100));
  const now = t(nowIso);
  const nowPct = at(now);
  const bands = rounds.flatMap((r) => ([
    { r, ...BANDS[0], from: t(r.application_start), to: t(r.application_end) },
    { r, ...BANDS[1], from: t(r.review_start), to: t(r.review_end) },
    { r, ...BANDS[2], from: t(r.review_end), to: t(r.approval_end) },
  ]));
  const idx = (b: (typeof bands)[number]) => bands.indexOf(b);

  return (
    <div className="select-none" role="img" aria-label={`The cycle's rounds on a timeline. Today is ${fmtDate(nowIso)}.`}>
      <div className="relative" style={{ height: 122 }}>
        {/* today: a label, a stem and a pulsing dot on the rail */}
        <div className="absolute top-0 z-10 -translate-x-1/2" style={{ left: `${grown ? nowPct : at(first + 2 * DAY)}%`, transition: `left 1400ms ${EASE} 200ms` }}>
          <div className="whitespace-nowrap rounded-pill bg-[#0b1f3a] px-3 py-1 text-[11.5px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(11,31,58,0.6)]">
            Today · {fmtDate(nowIso)}
          </div>
          <div className="mx-auto h-[23px] w-px bg-[#0b1f3a]" />
          <div className="relative mx-auto -mt-px h-0 w-0">
            <span aria-hidden className="absolute -left-[9px] -top-[2px] h-[18px] w-[18px] rounded-full bg-accent/30" style={{ animation: "ping-ring 1.8s ease-out infinite" }} />
            <span aria-hidden className="absolute -left-[5px] top-[2px] h-[10px] w-[10px] rounded-full bg-white shadow-[0_0_0_2.5px_#0071e3]" />
          </div>
        </div>

        {/* the rail: every band is drawn to scale; its pale body is the whole band, the strong fill is what has already happened */}
        <div className="absolute inset-x-0" style={{ top: 46, height: 20 }}>
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#dbe5f3]" />
          {bands.map((b) => {
            const w = at(b.to) - at(b.from);
            const done = Math.max(0, Math.min(1, (now - b.from) / (b.to - b.from)));
            const live = done > 0 && done < 1;
            return (
              <div key={`${b.r.id}-${b.key}`} className="absolute top-0 h-full" title={`Round ${b.r.number}, ${b.label.toLowerCase()}: ${fmtDate(new Date(b.from).toISOString())} to ${fmtDate(new Date(b.to).toISOString())}`}
                style={{ left: `calc(${at(b.from)}% + 1px)`, width: `calc(${w}% - 2px)` }}>
                <div className="absolute inset-0 rounded-[10px]" style={{ background: b.colour, opacity: 0.22 }} />
                <div className="absolute inset-y-0 left-0 rounded-[10px]"
                  style={{ background: b.colour, width: grown ? `${done * 100}%` : "0%", transition: `width 1100ms ${EASE} ${300 + idx(b) * 120}ms`, boxShadow: live ? `0 0 14px ${b.colour}` : undefined }} />
              </div>
            );
          })}
        </div>

        {/* round names and dates under the rail */}
        {rounds.map((r) => {
          const isCurrent = r.number === current;
          return (
            <div key={r.id} className="absolute" style={{ top: 82, left: `${at(t(r.application_start))}%` }}>
              <div className={`text-[13px] font-semibold ${isCurrent ? "text-accent-ink" : "text-text"}`}>Round {r.number}</div>
              <div className="text-[12px] tabular text-faint">{fmtDate(r.application_start)} to {fmtDate(r.approval_end)}</div>
            </div>
          );
        })}
      </div>

      <ul className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[12px] text-muted">
        {BANDS.map((b) => (
          <li key={b.key} className="flex items-center gap-2"><span aria-hidden className="h-2 w-5 rounded-[3px]" style={{ background: b.colour }} />{b.label}</li>
        ))}
      </ul>
    </div>
  );
}
