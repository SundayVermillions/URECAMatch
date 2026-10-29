"use client";
/** Small charts for the admin screens, drawn as plain HTML and SVG so they stay light and sharp. Numbers are always shown as text
 *  as well as marks, so nothing depends on colour alone. Marks grow in once when they appear. Nothing here reads data: screens pass
 *  rows in. Motion is skipped for people who ask for less of it (the global reduced-motion rule also stops the CSS transitions). */
import { useEffect, useState } from "react";
import { I } from "@/components/shell/icons";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/** True one tick after mount, so marks can grow from zero. */
export function useGrown() {
  const [grown, setGrown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setGrown(true), 60); return () => clearTimeout(t); }, []);
  return grown;
}

/** A number that counts up to its value when it appears. */
export function CountUp({ value, decimals = 0, ms = 1100 }: { value: number; decimals?: number; ms?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { const t = setTimeout(() => setN(value), 0); return () => clearTimeout(t); }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setN(value * (1 - Math.pow(1 - p, 4))); // fast at first, easing to a stop
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className="tabular">{n.toFixed(decimals)}</span>;
}

/** A headline figure: an icon tile, the label, a counting number and one line of context. Lifts a little on hover. */
export function KpiTile({ icon, label, value, note, decimals }: { icon: React.ReactNode; label: string; value: number; note?: string; decimals?: number }) {
  return (
    <div className="card-surface group px-5 py-4 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-accent-soft text-accent-ink shadow-[inset_0_0_0_1px_var(--accent-border)]">{icon}</span>
        <span className="text-[13px] font-medium text-muted">{label}</span>
      </div>
      <div className="mt-3 font-display text-[34px] font-semibold leading-none tracking-[-0.03em] text-text"><CountUp value={value} decimals={decimals} /></div>
      {note && <div className="mt-2 text-[12px] text-faint">{note}</div>}
    </div>
  );
}

export type DemandRow = { label: string; applications: number; slots: number; projects: number };

/** Supply against demand per school: a long bar for applications and a short one for the slots still open, on one scale, with the
 *  applications per open slot at the end. More than 5 per slot is the app's "high demand" line (see isHighDemand). */
export function DemandBars({ rows }: { rows: DemandRow[] }) {
  const grown = useGrown();
  const max = Math.max(1, ...rows.map((r) => Math.max(r.applications, r.slots)));
  return (
    <ul className="flex flex-col gap-[18px]">
      {rows.map((r, i) => {
        const per = r.slots > 0 ? r.applications / r.slots : null;
        const hot = per != null && per > 5;
        return (
          <li key={r.label} title={`${r.label}: ${r.applications} applications, ${r.slots} open slots, ${r.projects} projects`}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-baseline gap-2">
                <span className="text-[14px] font-semibold text-text">{r.label}</span>
                <span className="text-[12px] text-faint">{r.projects} {r.projects === 1 ? "project" : "projects"}</span>
              </span>
              <span className="flex items-center gap-2.5">
                <span className="text-[12.5px] tabular text-muted"><b className="font-display font-semibold text-text">{r.applications}</b> applied · {r.slots} open</span>
                {per != null && (
                  <span className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11.5px] font-semibold tabular ${hot ? "bg-warn-soft text-warn-ink" : "bg-neutral-soft text-muted"}`}>
                    {hot && <I.Flame size={12} />}{per.toFixed(1)} per slot
                  </span>
                )}
              </span>
            </div>
            <div className="mt-2 h-[9px] rounded-full bg-[#e8eef7]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#6fa8ee] to-accent"
                style={{ width: grown ? `${(r.applications / max) * 100}%` : "0%", minWidth: r.applications > 0 ? 9 : 0, transition: `width 800ms ${EASE} ${i * 90}ms` }} />
            </div>
            <div className="mt-1 h-[5px] rounded-full bg-[#eef3fa]">
              <div className="h-full rounded-full bg-[#3b6fb6]/55"
                style={{ width: grown ? `${(r.slots / max) * 100}%` : "0%", minWidth: r.slots > 0 ? 5 : 0, transition: `width 800ms ${EASE} ${i * 90 + 120}ms` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export type Ring = { label: string; value: number; of: number; hint: string };
const RING_COLOURS = ["#0071e3", "#3b6fb6", "#6fa8ee"];

/** Concentric progress rings, one per measure, each out of its own total. The key beside them carries the numbers.
 *  Hovering a row in the key brings its ring forward. The centre shows the first ring as a percentage. */
export function Rings({ rings }: { rings: Ring[] }) {
  const grown = useGrown();
  const [on, setOn] = useState<number | null>(null);
  const size = 184, stroke = 9, gap = 7;
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          {rings.map((r, i) => {
            const rad = size / 2 - stroke / 2 - i * (stroke + gap);
            const c = 2 * Math.PI * rad;
            const frac = r.of > 0 ? Math.min(1, r.value / r.of) : 0;
            return (
              <g key={r.label} style={{ opacity: on == null || on === i ? 1 : 0.28, transition: "opacity 250ms" }}>
                <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="#e8eef7" strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={RING_COLOURS[i % RING_COLOURS.length]} strokeWidth={stroke} strokeLinecap="round"
                  strokeDasharray={c} strokeDashoffset={grown ? c * (1 - frac) : c} style={{ transition: `stroke-dashoffset 1200ms ${EASE} ${i * 160}ms` }} />
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="font-display text-[30px] font-semibold leading-none tracking-[-0.03em] text-text">
              <CountUp value={rings[0].of > 0 ? (rings[0].value / rings[0].of) * 100 : 0} /><span className="text-[17px] text-faint">%</span>
            </div>
            <div className="mt-1 text-[11px] text-faint">eligible</div>
          </div>
        </div>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-3.5">
        {rings.map((r, i) => (
          <li key={r.label} onMouseEnter={() => setOn(i)} onMouseLeave={() => setOn(null)} title={r.hint}
            className="flex cursor-default items-center gap-2.5" style={{ opacity: on == null || on === i ? 1 : 0.45, transition: "opacity 250ms" }}>
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RING_COLOURS[i % RING_COLOURS.length] }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium leading-tight text-text">{r.label}</span>
              <span className="block truncate text-[12px] text-faint">{r.hint}</span>
            </span>
            <span className="font-display text-[14px] font-semibold tabular text-text">{r.value}<span className="text-[12px] font-normal text-faint"> / {r.of}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type Segment = { label: string; value: number; color: string };

/** One bar split into parts, with a key under it that carries the numbers. Parts are separated by a 2px gap. */
export function SegmentBar({ segments, legend = true }: { segments: Segment[]; legend?: boolean }) {
  const grown = useGrown();
  const total = segments.reduce((n, s) => n + s.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-[#e8eef7]" role="img"
        aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
        {shown.map((s, i) => (
          <div key={s.label} title={`${s.label}: ${s.value}`} className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ background: s.color, width: grown ? `${(s.value / total) * 100}%` : "0%", transition: `width 700ms ${EASE} ${i * 80}ms` }} />
        ))}
      </div>
      {legend && (
        <ul className="mt-4 flex flex-wrap gap-x-7 gap-y-3">
          {segments.map((s) => (
            <li key={s.label}>
              <div className="flex items-center gap-1.5 text-[12.5px] text-muted"><span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />{s.label}</div>
              <div className="mt-0.5 font-display text-[20px] font-semibold leading-tight tracking-[-0.02em] tabular text-text">{s.value}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
