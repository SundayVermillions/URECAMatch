"use client";
import dynamic from "next/dynamic";
import Image from "next/image";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

// WebGL cannot render on the server.
const AuthOrb = dynamic(() => import("./auth-orb"), { ssr: false });

const EASE = [0.16, 1, 0.3, 1] as const; // ease-out-expo, used for every move so the sequence feels like one gesture
const INTRO_MS = 3800;
const SEEN_KEY = "urecamatch.intro.seen";

type Tone = {
  bg: string;
  blobs: [string, string, string];
  head: [string, string]; // headline gradient
  rim: [string, string, string, string, string]; // lens rim stops
  handle: [string, string]; // lens handle, top to bottom
  tint: string; // accent as "r,g,b"
  orbBody: string; // ball edge
  orbCore: string; // ball core
  orbDots: string[]; // continents, a few light blues
  orbLinks: string[]; // links, one blue each
  orbNodes: string[]; // nodes
  orbRim: string; // rim and pulses
};

const tone: Tone = {
  bg: "#eef3fa",
  blobs: ["#bcd3f2", "#d9e4f5", "#c5d0e8"],
  head: ["#0b1f3a", "#3b6fb6"],
  rim: ["#ffffff", "#c9d6ea", "#ffffff", "#9db4d6", "#e8eef8"],
  handle: ["#34507a", "#0b1f3a"],
  tint: "59,111,182",
  orbBody: "#2f64b4",
  orbCore: "#6fa8ee",
  orbDots: ["#ffffff", "#e6f4ff", "#bfe3ff"],
  orbLinks: ["#ffffff", "#d6f0ff", "#7be0ff", "#a8d0ff"],
  orbNodes: ["#ffffff", "#7be0ff"],
  orbRim: "#e8f2ff",
};

type Dims = { vw: number; vh: number; desktop: boolean };

const STEPS = ["Browse", "Rank", "Match"];
const LEFT = 0.56; // share of the sheet given to the brand half; the form half is the rest

function readSeen() {
  try { return sessionStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
}
function markSeen() {
  try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode: the intro just plays again */ }
}

/**
 * A fine glass magnifier around the globe: URECA is about looking closely at research.
 * Drawn in a 100x100 box that matches the globe canvas; the globe fills about 79% of the canvas,
 * so a ring at radius 41.8 sits just outside it. The handle runs past the box on purpose.
 */
function Lens({ tone }: { tone: Tone }) {
  const [r0, r1, r2, r3, r4] = tone.rim;
  return (
    <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
      <defs>
        <linearGradient id="lens-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={r0} />
          <stop offset="0.28" stopColor={r1} />
          <stop offset="0.55" stopColor={r2} />
          <stop offset="0.8" stopColor={r3} />
          <stop offset="1" stopColor={r4} />
        </linearGradient>
        <linearGradient id="lens-handle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tone.handle[0]} />
          <stop offset="1" stopColor={tone.handle[1]} />
        </linearGradient>
        <linearGradient id="lens-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#b7bdcc" />
          <stop offset="1" stopColor="#f2f4fa" />
        </linearGradient>
        <radialGradient id="lens-glass" cx="0.32" cy="0.28" r="0.85">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.2" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.08" />
        </radialGradient>
        <linearGradient id="lens-glint" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="dial-sweep" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={r3} stopOpacity="0" />
          <stop offset="1" stopColor={tone.orbRim} stopOpacity="0.95" />
        </linearGradient>
        <filter id="lens-shadow" x="-20%" y="-20%" width="150%" height="150%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1.8" floodColor="#1d1d1f" floodOpacity="0.22" />
        </filter>
      </defs>
      {/* The dial behind the lens: a tick bezel on the glass plate, a scanning arc, a radar ping, and two orbit rings */}
      <g stroke={tone.head[0]} strokeOpacity="0.38" strokeWidth="0.16">
        {Array.from({ length: 120 }, (_, i) => {
          const a = (i / 120) * Math.PI * 2;
          const r1 = i % 10 === 0 ? 52.6 : i % 5 === 0 ? 53.6 : 54.4;
          return <line key={i} x1={50 + Math.cos(a) * r1} y1={50 + Math.sin(a) * r1} x2={50 + Math.cos(a) * 56} y2={50 + Math.sin(a) * 56} />;
        })}
      </g>
      <circle cx="50" cy="50" r="49.5" fill="none" stroke={tone.head[0]} strokeOpacity="0.2" strokeWidth="0.14" strokeDasharray="0.5 1.1" />
      <circle cx="50" cy="50" r="44" fill="none" stroke={r3} strokeWidth="0.3" style={{ transformOrigin: "50px 50px", animation: "ping-ring 5s ease-out infinite" }} />
      <g style={{ transformOrigin: "50px 50px", animation: "spin 16s linear infinite" }}>
        <path d="M 50 -1.5 A 51.5 51.5 0 0 1 95.4 25" fill="none" stroke="url(#dial-sweep)" strokeWidth="0.45" strokeLinecap="round" strokeOpacity="0.8" />
      </g>
      <circle cx="50" cy="50" r="63" fill="none" stroke={tone.head[0]} strokeOpacity="0.22" strokeWidth="0.14" strokeDasharray="0.6 1.2" />
      <circle cx="50" cy="50" r="66.5" fill="none" stroke={tone.head[0]} strokeOpacity="0.14" strokeWidth="0.14" />
      {[20, 80, 140, 200, 260, 320].map((d) => (
        <circle key={d} cx={50 + Math.cos((d * Math.PI) / 180) * 66.5} cy={50 + Math.sin((d * Math.PI) / 180) * 66.5} r="0.7" fill={tone.head[0]} fillOpacity="0.4" />
      ))}
      <g style={{ transformOrigin: "50px 50px", animation: "spin 44s linear infinite reverse" }}>
        <circle cx="113" cy="50" r="1.1" fill={r3} />
      </g>
      <g filter="url(#lens-shadow)">
        <circle cx="50" cy="50" r="41.8" fill="url(#lens-glass)" />
        <g transform="rotate(48 50 50)">
          <rect x="92" y="47.3" width="6.5" height="5.4" rx="1.2" fill="url(#lens-metal)" />
          <rect x="97" y="47.9" width="30" height="4.2" rx="2.1" fill="url(#lens-handle)" />
        </g>
        <circle cx="50" cy="50" r="41.8" fill="none" stroke="url(#lens-rim)" strokeWidth="1.7" />
      </g>
      <circle cx="50" cy="50" r="40.6" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.25" />
      {/* One soft glint, fading at both ends */}
      <path d="M 21 36 A 33 33 0 0 1 38 20" fill="none" stroke="url(#lens-glint)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Auth screens. Desktop: a full-screen globe-in-a-lens intro, then the globe moves left
 * while one glass sheet fades in around it and the form slides onto the right half.
 * Plays once per session, skippable, and is skipped for reduced motion. Below 1024px: just the form.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const [dims, setDims] = useState<Dims | null>(null);
  const [split, setSplit] = useState(false);
  const [instant, setInstant] = useState(false);

  useEffect(() => {
    const read = () => setDims({ vw: window.innerWidth, vh: window.innerHeight, desktop: window.innerWidth >= 1024 });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  const desktop = dims?.desktop ?? false;
  useEffect(() => {
    if (!desktop) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const skip = reduced || readSeen();
    const t = setTimeout(() => {
      if (skip) setInstant(true);
      setSplit(true);
    }, skip ? 0 : INTRO_MS);
    return () => clearTimeout(t);
  }, [desktop]);

  useEffect(() => {
    if (split) markSeen();
  }, [split]);

  if (dims && !dims.desktop) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-[420px]">
          <Image src="/ntu-logo.png" alt="NTU" width={150} height={54} className="mx-auto mb-8" priority />
          <div className="glass-panel rounded-modal p-8">{children}</div>
        </div>
      </div>
    );
  }

  const { vw = 1440, vh = 900 } = dims ?? {};
  const intro = Math.round(Math.min(vh * 0.62, vw * 0.5)); // canvas size, fixed so WebGL is never resized mid-animation
  const leftW = (vw - 32) * LEFT;
  const final = Math.min(leftW * 0.8, vh * 0.54);
  const finalX = 16 + leftW / 2 - vw / 2; // globe centre lands in the middle of the brand half
  const dur = (s: number) => (instant ? 0 : s);

  return (
    <div className="relative min-h-screen overflow-hidden text-text" style={{ backgroundColor: tone.bg }}>
      {/* Soft colour behind the glass */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-32 w-[640px] h-[640px] rounded-full opacity-70 blur-[110px]" style={{ background: tone.blobs[0], animation: "uri-aurora 16s ease-in-out infinite" }} />
        <div className="absolute top-1/4 -right-40 w-[560px] h-[560px] rounded-full opacity-60 blur-[110px]" style={{ background: tone.blobs[1], animation: "uri-aurora 20s ease-in-out -7s infinite" }} />
        <div className="absolute -bottom-48 left-1/3 w-[620px] h-[620px] rounded-full opacity-60 blur-[120px]" style={{ background: tone.blobs[2], animation: "uri-aurora 24s ease-in-out -12s infinite" }} />
      </div>

      {/* One glass sheet holds both halves, so the page reads as a single object */}
      <motion.div
        className="glass-panel absolute z-0 inset-4 rounded-[36px]"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={split ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.97 }}
        transition={{ duration: dur(1.2), delay: split ? dur(0.25) : 0, ease: EASE }}
      >
        {/* Fine dot grid fading out from the lens */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-[inherit]"
          style={{
            backgroundImage: "radial-gradient(rgba(0,0,0,0.12) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
            maskImage: `radial-gradient(ellipse 42% 62% at ${LEFT * 50}% 46%, #000 10%, transparent 75%)`,
            WebkitMaskImage: `radial-gradient(ellipse 42% 62% at ${LEFT * 50}% 46%, #000 10%, transparent 75%)`,
          }}
        />
      </motion.div>

      {/* Globe in its lens: glow, globe and lens move and scale together */}
      {dims && (
        <motion.div
          className="absolute z-10"
          style={{ width: intro, height: intro, left: "50%", top: "50%", marginLeft: -intro / 2, marginTop: -intro / 2 }}
          initial={{ opacity: 0, scale: 0.86, x: 0, y: vh * -0.04 }}
          animate={split
            ? { opacity: 1, scale: final / intro, x: finalX, y: vh * -0.1 }
            : { opacity: 1, scale: 1, x: 0, y: vh * -0.04 }}
          transition={split ? { duration: dur(1.4), ease: EASE } : { duration: 1.8, ease: EASE }}
        >
          {/* Frosted plate the lens sits on, lifted off the page by a soft blue shadow */}
          <div aria-hidden className="absolute -inset-[8%] rounded-full pointer-events-none" style={{ boxShadow: "0 40px 70px -28px rgba(47,111,224,0.5)" }} />
          <div aria-hidden className="glass-panel absolute -inset-[8%] rounded-full pointer-events-none" />
          <div className="absolute inset-0">
            <AuthOrb size={intro} dots={tone.orbDots} links={tone.orbLinks} nodes={tone.orbNodes} accent={tone.orbRim} body={tone.orbBody} core={tone.orbCore} />
          </div>
          <Lens tone={tone} />
        </motion.div>
      )}

      {/* Intro wordmark, replaced by the corner logo once the layout splits */}
      <motion.div
        aria-hidden={split}
        className="absolute z-20 left-0 right-0 bottom-[7%] flex flex-col items-center pointer-events-none"
        initial={{ opacity: 0, y: 16 }}
        animate={split ? { opacity: 0, y: -8 } : { opacity: 1, y: 0 }}
        transition={split ? { duration: dur(0.5), ease: EASE } : { duration: 1.2, delay: 1.2, ease: EASE }}
      >
        <div className="font-display text-[44px] font-semibold tracking-[-0.04em]">URECAMatch</div>
      </motion.div>

      {/* Left half: brand and headline */}
      <motion.div
        className="absolute z-20 left-4 top-4 bottom-4 flex flex-col justify-between p-10 pointer-events-none"
        style={{ width: `calc((100% - 2rem) * ${LEFT})` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: split ? 1 : 0 }}
        transition={{ duration: dur(1.1), delay: split ? dur(0.6) : 0, ease: EASE }}
      >
        <div className="flex items-center gap-4">
          <Image src="/ureca-logo.png" alt="URECA" width={64} height={64} className="rounded-2xl bg-white p-2 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)]" />
          <div className="font-display text-[20px] font-semibold tracking-[-0.02em]">URECAMatch</div>
        </div>
        <div className="flex items-end justify-between gap-8">
          <div className="font-display text-[46px] font-semibold leading-[1.04] tracking-[-0.04em] max-w-md">
            Nurturing the next generation of{" "}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, ${tone.head[0]}, ${tone.head[1]})` }}>researchers.</span>
          </div>
          {/* The three stages, as a small timeline */}
          <ol className="relative flex flex-col gap-4 pb-2 pr-2">
            <div aria-hidden className="absolute left-[13px] top-3 bottom-3 w-px" style={{ background: `linear-gradient(180deg, ${tone.rim[3]}, transparent)` }} />
            {STEPS.map((s, i) => (
              <motion.li
                key={s}
                className="relative flex items-center gap-3"
                initial={{ opacity: 0, y: 10 }}
                animate={split ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                transition={{ duration: dur(0.8), delay: split ? dur(1 + i * 0.12) : 0, ease: EASE }}
              >
                <span
                  className="size-[27px] rounded-full grid place-items-center text-[11px] font-semibold tabular"
                  style={{ color: tone.head[0], background: `rgba(${tone.tint},${0.14 + i * 0.1})`, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.85)" }}
                >
                  0{i + 1}
                </span>
                <span className="text-[14px] font-medium text-text/80">{s}</span>
              </motion.li>
            ))}
          </ol>
        </div>
      </motion.div>

      {/* Right half: the form, a lighter pane of the same sheet */}
      <motion.div
        className="absolute z-30 right-4 top-4 bottom-4 rounded-r-[36px] flex items-center justify-center p-6 overflow-y-auto border-l border-white/80"
        style={{
          width: `calc((100% - 2rem) * ${1 - LEFT})`,
          background: "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.3))",
        }}
        initial={{ opacity: 0, x: 48 }}
        animate={split ? { opacity: 1, x: 0 } : { opacity: 0, x: 48 }}
        transition={{ duration: dur(1.2), delay: split ? dur(0.55) : 0, ease: EASE }}
      >
        <div className="relative w-full max-w-[400px] my-auto">
          <Image src="/ntu-logo.png" alt="NTU" width={128} height={46} className="mx-auto mb-6" priority />
          {children}
        </div>
      </motion.div>

      {!split && (
        <button
          type="button"
          onClick={() => setSplit(true)}
          className="absolute z-40 bottom-6 right-8 text-[12px] font-medium text-muted hover:text-text transition-colors"
        >
          Skip intro
        </button>
      )}
    </div>
  );
}
