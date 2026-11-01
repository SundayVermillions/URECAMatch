"use client";
/** REQ-VRANK-5: a pie of how much each factor counts, always totalling 100%. Drag a handle to move share between the two
 *  slices beside it; neither can go under `min`. Keyboard users change the same values with the + and - buttons beside it. */
import { useRef, useState } from "react";

export type PieSlice = { key: string; color: string; label: string; value: number };

const R = 80, STROKE = 44, SIZE = 2 * R + STROKE + 16, C = SIZE / 2, STEP = 5;

const pointAt = (pct: number, radius: number) => {
  const a = (pct / 100) * 2 * Math.PI - Math.PI / 2;
  return { x: C + radius * Math.cos(a), y: C + radius * Math.sin(a) };
};
const snap = (v: number) => Math.round(v / STEP) * STEP;
const onRing = (v: number) => ((v % 100) + 100) % 100;

export function WeightsPie({ slices, min, onChange }: { slices: PieSlice[]; min: number; onChange: (values: number[]) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [origin, setOrigin] = useState(0); // where the first slice starts, as the handle before it can move
  const drag = useRef<{ handle: number; last: number; moved: number; from: number } | null>(null);
  const values = slices.map((s) => s.value);
  // Handle k sits at the end of slice k. The last one is also the start of the first slice.
  const ends = values.reduce<number[]>((out, v) => [...out, (out[out.length - 1] ?? origin) + v], []);
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
    drag.current = { handle: k, last: pointerPct(e), moved: 0, from: ends[k] };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const now = pointerPct(e);
    d.moved += onRing(now - d.last + 50) - 50; // the short way round, so crossing the top does not jump
    d.last = now;
    const k = d.handle, next = (k + 1) % values.length;
    const by = Math.min(Math.max(snap(d.from + d.moved - ends[k]), min - values[k]), values[next] - min);
    if (!by) return;
    const updated = [...values];
    updated[k] += by;
    updated[next] -= by;
    if (k === values.length - 1) setOrigin(onRing(origin + by));
    onChange(updated);
  }
  const stop = () => { drag.current = null; };

  return (
    <svg ref={svg} viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[236px] touch-none select-none" role="img"
      aria-label={`Weights: ${slices.map((s) => `${s.label} ${s.value}%`).join(", ")}`}
      onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
      {slices.map((s, i) => (
        <circle key={s.key} cx={C} cy={C} r={R} fill="none" stroke={s.color} strokeWidth={STROKE} pathLength={100}
          strokeDasharray={`${s.value} ${100 - s.value}`} strokeDashoffset={25 - startOf(i)} />
      ))}
      {slices.map((s, i) => {
        if (s.value < 10) return null;
        const p = pointAt(startOf(i) + s.value / 2, R);
        return <text key={s.key} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="13" fontWeight="600" pointerEvents="none">{s.value}</text>;
      })}
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
