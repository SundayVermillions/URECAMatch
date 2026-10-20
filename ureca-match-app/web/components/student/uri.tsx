"use client";
/** Uri, the URECAMatch guide: an original owl-bot (not an NTU mark) who presents recommendations on Browse.
 *  Pure SVG, so it stays sharp at any size. Animations come from keyframes in app/globals.css and stop
 *  for people who prefer reduced motion. Moods: idle, wave (greeting), think (loading), cheer (good news). */
import { useId } from "react";

export type UriMood = "idle" | "wave" | "think" | "cheer";

const NAVY = "#1c2566";
const AMBER = "#ffb020";

export function Uri({ size = 140, mood = "idle", className = "" }: { size?: number; mood?: UriMood; className?: string }) {
  const id = useId().replace(/:/g, "");
  const anim = (name: string, s: number, extra = "") => ({ animation: `${name} ${s}s ease-in-out infinite ${extra}` });
  const look = mood === "think" ? { dx: 3, dy: -3 } : { dx: 0, dy: 0 };
  const armUp = mood === "cheer";

  return (
    <svg viewBox="0 0 160 172" width={size} height={size * 172 / 160} className={className} role="img" aria-label="Uri, your project guide">
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a60d8" /><stop offset="1" stopColor="#1b236c" />
        </linearGradient>
        <radialGradient id={`${id}f`} cx=".42" cy=".35" r=".8">
          <stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e3e9ff" />
        </radialGradient>
        <radialGradient id={`${id}g`}>
          <stop offset="0" stopColor="#ff5a67" stopOpacity=".9" /><stop offset="1" stopColor="#ff5a67" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}s`}>
          <stop offset="0" stopColor="#ffd76a" /><stop offset="1" stopColor="#ffd76a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* shadow breathes with the float */}
      <ellipse cx="80" cy="164" rx="34" ry="5.5" fill="#151c55" style={{ ...anim("uri-shadow", 4), transformOrigin: "80px 164px" }} />

      <g style={anim("uri-float", 4)}>
        {/* antenna: the "AI" light */}
        <line x1="80" y1="34" x2="80" y2="17" stroke={NAVY} strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="80" cy="13" r="13" fill={`url(#${id}g)`} style={{ ...anim("uri-glow", 2.4), transformOrigin: "80px 13px" }} />
        <circle cx="80" cy="13" r="5.5" fill="#ff4d5a" />
        <circle cx="78.2" cy="11.2" r="1.6" fill="#fff" opacity=".85" />

        {/* ear tufts */}
        <path d="M44 52 C40 40 37 30 38 22 C47 28 56 34 62 42 Z" fill={NAVY} />
        <path d="M116 52 C120 40 123 30 122 22 C113 28 104 34 98 42 Z" fill={NAVY} />

        {/* arms: left rests, right waves (both up when cheering) */}
        <g style={{ transformOrigin: "40px 100px", transform: armUp ? "rotate(130deg)" : "rotate(12deg)", transition: "transform .4s" }}>
          <rect x="22" y="94" width="24" height="13" rx="6.5" fill={NAVY} />
        </g>
        <g style={{ transformOrigin: "120px 100px", transform: armUp ? "rotate(-130deg)" : undefined, transition: "transform .4s" }}>
          <g style={mood === "wave" ? { ...anim("uri-wave", 2.2), transformOrigin: "120px 100px" } : undefined}>
            <rect x="114" y="94" width="24" height="13" rx="6.5" fill={NAVY} style={{ transformOrigin: "120px 100px", transform: mood === "wave" ? "rotate(-55deg)" : "rotate(-12deg)" }} />
          </g>
        </g>

        {/* body */}
        <path d="M80 34 C114 34 132 60 132 94 C132 130 110 152 80 152 C50 152 28 130 28 94 C28 60 46 34 80 34 Z" fill={`url(#${id}b)`} />
        <ellipse cx="80" cy="122" rx="30" ry="24" fill="#ffffff" opacity=".07" />
        {/* chest spark */}
        <circle cx="80" cy="124" r="12" fill={`url(#${id}s)`} style={{ ...anim("uri-glow", 3, "-1s"), transformOrigin: "80px 124px" }} />
        <path d="M80 116 L82.4 121.6 L88 124 L82.4 126.4 L80 132 L77.6 126.4 L72 124 L77.6 121.6 Z" fill="#ffd166" />

        {/* face plate */}
        <ellipse cx="80" cy="80" rx="40" ry="31" fill={`url(#${id}f)`} />
        {mood === "cheer" ? (
          <g fill="none" stroke={NAVY} strokeWidth="4" strokeLinecap="round">
            <path d="M58 80 Q66 69 74 80" /><path d="M86 80 Q94 69 102 80" />
          </g>
        ) : (
          <g style={{ ...anim("uri-blink", 5), transformOrigin: "80px 78px" }}>
            {[66, 94].map((x) => (
              <g key={x}>
                <circle cx={x} cy="78" r="10.5" fill={NAVY} />
                <circle cx={x + 3 + look.dx} cy={74 + look.dy} r="3.4" fill="#fff" />
                <circle cx={x - 3 + look.dx} cy={82 + look.dy} r="1.4" fill="#fff" opacity=".7" />
              </g>
            ))}
          </g>
        )}
        {/* beak and cheeks */}
        <path d="M75.5 91 Q80 89.5 84.5 91 Q82.5 97 80 98.5 Q77.5 97 75.5 91 Z" fill={AMBER} />
        <circle cx="54" cy="92" r="5.5" fill="#ff8fa3" opacity=".5" />
        <circle cx="106" cy="92" r="5.5" fill="#ff8fa3" opacity=".5" />

        {/* feet */}
        <ellipse cx="64" cy="152" rx="12" ry="5.5" fill={AMBER} />
        <ellipse cx="96" cy="152" rx="12" ry="5.5" fill={AMBER} />
      </g>
    </svg>
  );
}
