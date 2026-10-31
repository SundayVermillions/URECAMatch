"use client";
/** REQ-VRANK-5: a pie of how much each factor counts. Drag a handle to move share between the two parts beside it.
 *  What is unassigned is one more part of the ring, with a handle at each end, so the total can never pass 100.
 *  Keyboard users change the same values with the + and - buttons next to the pie. */
import { useRef, useState } from "react";

export type PieSlice = { key: string; color: string; label: string; value: number };

const R = 80, STROKE = 44, SIZE = 2 * R + STROKE + 16, C = SIZE / 2, STEP = 5;
const EMPTY = "#e8eef7";

const pointAt = (pct: number, radius: number) => {
  const a = (pct / 100) * 2 * Math.PI - Math.PI / 2;
  return { x: C + radius * Math.cos(a), y: C + radius * Math.sin(a) };
};
const snap = (v: number) => Math.round(v / STEP) * STEP;
const onRing = (v: number) => ((v % 100) + 100) % 100;

export function WeightsPie({ slices, onChange }: { slices: PieSlice[]; onChange: (values: number[]) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [origin, setOrigin] = useState(0); // where the first slice starts, as the handle before it can move
  // tied: the handles under the pointer. Empty parts stack handles, so the first move picks one that can go that way.
  const drag = useRef<{ tied: number[]; handle: number | null; last: number; moved: number; from: number } | null>(null);
  const values = slices.map((s) => s.value);
  const total = values.reduce((a, b) => a + b, 0);
  const ring = [...values, Math.max(100 - total, 0)]; // the factors, then what is unassigned
  // Handle k sits at the end of ring part k. The last one, after the unassigned part, is the start of the first slice.
  const ends = ring.reduce<number[]>((out, v) => [...out, (out[out.length - 1] ?? origin) + v], []);
  const startOf = (i: number) => (i ? ends[i - 1] : origin);

  function pointerPct(e: React.PointerEvent) {
    const box = svg.current!.getBoundingClientRect();
    const scale = SIZE / box.width;
    const x = (e.clientX - box.left) * scale - C, y = (e.clientY - box.top) * scale - C;
    return onRing(((Math.atan2(y, x) + Math.PI / 2) / (2 * Math.PI)) * 100);
  }
  function start(e: React.PointerEvent<SVGElement>, k: number) {
    e.preventDefault();
    svg.current!.setPointerCapture(e.pointerId);
    const tied = ends.flatMap((at, j) => (onRing(at) === onRing(ends[k]) ? [j] : []));
    drag.current = { tied, handle: null, last: pointerPct(e), moved: 0, from: 0 };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const now = pointerPct(e);
    const delta = onRing(now - d.last + 50) - 50; // the short way round, so crossing the top does not jump
    d.last = now;
    d.moved += delta;
    if (d.handle === null) {
      const k = d.tied.find((j) => (delta > 0 ? ring[(j + 1) % ring.length] : ring[j]) > 0);
      if (!delta || k === undefined) return;
      d.handle = k;
      d.from = ends[k];
    }
    const k = d.handle, next = (k + 1) % ring.length;
    const by = Math.min(Math.max(snap(d.from + d.moved - ends[k]), -ring[k]), ring[next]);
    if (!by) return;
    const updated = [...ring];
    updated[k] += by;
    updated[next] -= by;
    if (k === ring.length - 1) setOrigin(onRing(origin + by));
    onChange(updated.slice(0, values.length));
  }
  const stop = () => { drag.current = null; };

  return (
    <svg ref={svg} viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[236px] touch-none select-none" role="img"
      aria-label={`Weights: ${slices.map((s) => `${s.label} ${s.value}%`).join(", ")}`}
      onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
      <circle cx={C} cy={C} r={R} fill="none" stroke={EMPTY} strokeWidth={STROKE} />
      {slices.map((s, i) => s.value > 0 && (
        <circle key={s.key} cx={C} cy={C} r={R} fill="none" stroke={s.color} strokeWidth={STROKE} pathLength={100}
          strokeDasharray={`${s.value} ${100 - s.value}`} strokeDashoffset={25 - startOf(i)} />
      ))}
      {slices.map((s, i) => {
        if (s.value < 10) return null;
        const p = pointAt(startOf(i) + s.value / 2, R);
        return <text key={s.key} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="13" fontWeight="600" pointerEvents="none">{s.value}</text>;
      })}
      <text x={C} y={C - 7} textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="20" fontWeight="600">{total}%</text>
      <text x={C} y={C + 13} textAnchor="middle" dominantBaseline="central" fill="#6e6e73" fontSize="11">{total === 100 ? "assigned" : `${100 - total}% left`}</text>
      {ends.map((at, k) => {
        const a = pointAt(at, R + STROKE / 2), b = pointAt(at, R - STROKE / 2), h = pointAt(at, R + STROKE / 2 + 1);
        return (
          <g key={k} className="cursor-grab active:cursor-grabbing" onPointerDown={(e) => start(e, k)} data-handle={k}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={18} />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeWidth={2.5} />
            <circle cx={h.x} cy={h.y} r={7} fill="#fff" stroke="#1c2566" strokeWidth={2} />
          </g>
        );
      })}
    </svg>
  );
}
