"use client";
/** "Uri's picks": the recommendation panel at the top of Browse. REQ-BROWSE-4.
 *  Shows the best three projects for the student, each with its match score, the reasons behind it and a
 *  breakdown (interests, readiness, chance). The scoring is transparent on purpose: "How it works" explains it,
 *  and supervisors never see these scores. Picks exist only in an application window. Outside one Uri reports where
 *  the cycle is instead: early (no cycle yet, or pre-application), round under review, waiting for results, results
 *  out (an offer to respond to, or not matched), or cycle closed.
 *  A student who declined or missed an offer gets a sad Uri and a kind explanation instead of a banner.
 *  States: early, review, waiting, results, closed, loading, no interests yet, nothing fits, placed, out, offer. */
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { I } from "@/components/shell/icons";
import { fmtDeadline } from "@/components/ui";
import type { Recommendation } from "@/lib/api/models";
import { Uri, type UriMood } from "./uri";

const HIDE_KEY = "urecamatch.uri.hidden";
const MAX = { interests: 50, readiness: 30, chance: 20 } as const;
const stillMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** "Hide Uri" is remembered per browser. Read through useSyncExternalStore so the server render (shown) and
 *  the browser value never disagree during hydration. Private mode or blocked storage: always shown. */
const hiddenStore = {
  listeners: new Set<() => void>(),
  get: () => { try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } },
  set(v: boolean) { try { localStorage.setItem(HIDE_KEY, v ? "1" : "0"); } catch { /* ignore */ } hiddenStore.listeners.forEach((l) => l()); },
  subscribe(l: () => void) { hiddenStore.listeners.add(l); return () => { hiddenStore.listeners.delete(l); }; },
};

type Props = {
  name: string;
  interests: string[];
  picks: Recommendation[] | null; // null while loading
  placedIn: string | null;
  window?: string; // the cycle's current window (me.phase.window)
  phaseLabel?: string; // me.phase.label, e.g. "Applications open 25 Aug, 5:00 pm SGT"
  roundNumber?: number | null;
  out?: { kind: "declined" | "timed_out" | "other"; title?: string } | null; // no longer eligible this cycle
  appliedThisRound?: boolean; // whether the student applied in the current round
  offer?: { title: string; expires: string | null } | null; // an offer the student has not answered yet
  nextRound?: { number: number; rollover: boolean } | null; // the round after the current one, if any
  onShowAll?: () => void;
};

/** Ambient light behind the glass panel: soft, natural colours that the frosted glass turns into a gentle
 *  sheen. Each orb drifts slowly ([left, top, size, colour, seconds]). Motion stops for reduced motion. */
const AMBIENT = [
  ["-4%", "-30%", 420, "#9ec5ff", 18],
  ["30%", "-45%", 380, "#cdbdff", 22],
  ["62%", "35%", 420, "#b5ead7", 26],
  ["85%", "-25%", 320, "#ffd6b8", 20],
] as const;
function Ambient({ scale = 1, radius = 28 }: { scale?: number; radius?: number }) {
  // Clipped to the panel's shape, so the light shows only through the glass and never tints the page around it.
  return (
    <div aria-hidden className="absolute inset-0 -z-10 pointer-events-none overflow-hidden" style={{ borderRadius: radius }}>
      {AMBIENT.map(([left, top, size, colour, secs], i) => (
        <div key={colour} className="absolute rounded-full blur-3xl opacity-80"
          style={{ left, top, width: size * scale, height: size * scale, background: colour, animation: `uri-aurora ${secs}s ease-in-out infinite ${i % 2 ? "reverse" : ""}` }} />
      ))}
    </div>
  );
}

/** Fixed sparkle positions around Uri ([left %, top %, size px, delay s]), so server and browser render alike. */
const STARS = [[3, 14, 3, 0], [15, 6, 2, 1.2], [20, 30, 2.5, 2.1], [2, 52, 2, 0.6], [19, 70, 3, 1.7], [7, 86, 2, 2.6], [23, 88, 2, 0.3], [11, 40, 1.5, 3]] as const;

export function UriPicks({ name, interests, picks, placedIn, window: cycleWindow, phaseLabel, roundNumber, appliedThisRound, offer, nextRound, out, onShowAll }: Props) {
  const hidden = useSyncExternalStore(hiddenStore.subscribe, hiddenStore.get, () => false);
  const hide = hiddenStore.set;
  const [explain, setExplain] = useState(false);

  // Everything but the surname: "Wei Ling Tan" -> "Wei Ling", "Divya Nair" -> "Divya".
  const parts = name.trim().split(/\s+/);
  const first = (parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0]) || "there";
  const top = (picks ?? []).slice(0, 3);
  const pickable = !cycleWindow || cycleWindow === "application";
  const outside = { before_cycle: "early", pre_application: "early", review: "review", approval: "waiting", awaiting_results: "waiting", results: "results", closed: "closed" } as const;
  const state: "loading" | "placed" | "out" | "offer" | "early" | "review" | "waiting" | "results" | "closed" | "setup" | "none" | "picks" =
    placedIn ? "placed"
    : out ? "out"
    : offer ? "offer"
    : !pickable ? outside[cycleWindow as keyof typeof outside] ?? "early"
    : !interests.length ? "setup" : picks === null ? "loading" : top.length ? "picks" : "none";

  // One call to action under Uri's words, when there is somewhere useful to go.
  const cta = state === "offer" ? { href: "/my-applications", label: "See my offer" }
    : state === "results" && appliedThisRound ? { href: "/my-applications", label: "See my applications" }
    : state === "setup" || state === "none" ? { href: "/profile", label: state === "setup" ? "Add my interests" : "Update my interests" } : null;

  const mood: UriMood = state === "out" ? "sad" : state === "loading" ? "think" : (state === "placed" || state === "offer") ? "cheer" : state === "picks" || state === "early" ? "wave" : "idle";
  const topics = interests.slice(0, 2).join(" and ");
  const glowText = (t: string) => <span className="bg-gradient-to-r from-[#0071e3] to-[#7c5cf6] bg-clip-text text-transparent">{t}</span>;
  const headline = {
    loading: <>Finding your {glowText("best matches")}…</>,
    placed: <>You&apos;re in, {glowText(first)}!</>,
    out: out?.kind === "declined" ? <>Sorry to see you {glowText("go")}, {first}</>
      : out?.kind === "timed_out" ? <>That offer {glowText("slipped away")}</> : <>You&apos;re {glowText("out")} for this cycle</>,
    early: <>You&apos;re {glowText("early")}, {first}!</>,
    review: <>Round {roundNumber} is under {glowText("review")}</>,
    waiting: <>Waiting for Round {roundNumber} {glowText("results")}</>,
    offer: <>You have an {glowText("offer")}, {first}!</>,
    results: <>Round {roundNumber} results are {glowText("out")}</>,
    closed: <>This cycle has {glowText("closed")}</>,
    setup: <>Let&apos;s find {glowText("your project")}, {first}</>,
    none: <>Nothing fits {glowText("just yet")}</>,
    picks: <>{glowText(`${top.length} ${top.length === 1 ? "project" : "projects"}`)} picked for you</>,
  }[state];
  const line = {
    loading: `Hi ${first}! I'm reading through every open project for you.`,
    placed: `You're registered to ${placedIn}. Enjoy the research, and see you next cycle.`,
    out: out?.kind === "declined"
      ? `You declined ${out.title ?? "your offer"}, so you are out of the remaining rounds this cycle. You can still browse every project, and I'll have picks ready when the next cycle opens.`
      : out?.kind === "timed_out"
        ? `The offer for ${out.title ?? "your project"} ran out before you answered, so you are out of the remaining rounds this cycle. You can still browse every project, and I'll have picks ready when the next cycle opens.`
        : "You can no longer apply or propose this cycle. You can still browse every project, and I'll have picks ready when the next cycle opens.",
    early: `${cycleWindow === "pre_application" && phaseLabel ? phaseLabel : "No application cycle is open yet"}. Browse and shortlist projects now, and I'll pick the ones that fit you once applications open.`,
    review: "Applications are closed and supervisors are ranking their applicants. Results come after matching, and I'll tell you here as soon as they are out.",
    waiting: "The rankings are in and the matches are being finalised. Check back soon, the news will show up here.",
    offer: `${offer?.title} is waiting for your answer${offer?.expires ? ` until ${fmtDeadline(offer.expires)}` : ""}. Answer it in My applications, as you cannot apply to other projects while it is open.`,
    results: appliedThisRound
        ? `You were not matched to a project in Round ${roundNumber}. ${nextRound
          ? nextRound.rollover ? `Your applications carry over to Round ${nextRound.number}, where you can reorder or withdraw them.` : `You can apply again in Round ${nextRound.number}.`
          : "There are no more rounds this cycle."}`
        : `You did not apply in Round ${roundNumber}. ${nextRound ? `Round ${nextRound.number} is next, and I'll pick projects for you when it opens.` : "There are no more rounds this cycle."}`,
    closed: "Thanks for taking part. Projects stay open for browsing until the next cycle starts.",
    setup: "Tell me which topics you're into and I'll pick the projects that fit you best.",
    none: `No open project is tagged ${topics} right now. Add a few more interests, or explore everything below.`,
    picks: `Hi ${first}! These fit your interest in ${topics} best, scored on topics, courses and competition.`,
  }[state];

  if (hidden) {
    return (
      <div className="relative isolate mb-6 w-fit">
        <Ambient scale={0.35} radius={999} />
        <div className="glass-panel flex items-center gap-3 rounded-pill pl-1.5 pr-1.5 py-1.5">
          <span className="w-9 h-9 rounded-full bg-white/70 overflow-hidden flex items-end justify-center"><Uri size={34} mood="idle" /></span>
          <span className="text-[13.5px] text-text">{state === "picks" ? <>Uri has <b>{top.length} picks</b> for you</> : "Uri, your project guide"}</span>
          <button type="button" onClick={() => hide(false)} className="relative z-10 h-8 px-3.5 rounded-pill bg-[#1c2566] text-white text-[12.5px] font-semibold hover:brightness-110">Show</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate mb-8">
      <Ambient />
      <section aria-label="Uri's picks for you" className="glass-panel overflow-hidden rounded-[28px] text-text">
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          {STARS.map(([x, y, s, d]) => (
            <span key={`${x}-${y}`} className="absolute rounded-full bg-white" style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, animation: `uri-twinkle 3.2s ease-in-out ${d}s infinite` }} />
          ))}
        </div>

        <div className="relative z-[1] p-7 pt-6">
          <div className="flex items-center gap-6">
            {/* Uri on a pedestal of light */}
            <div className="relative shrink-0 w-[150px] flex flex-col items-center">
              <div aria-hidden className="absolute -top-6 left-1/2 -translate-x-1/2 w-[220px] h-[220px] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.85),rgba(255,255,255,0))]" />
              <Uri size={132} mood={mood} className="relative drop-shadow-[0_12px_22px_rgba(60,80,200,0.28)]" />
              <div aria-hidden className="-mt-3 w-[150px] h-[22px] rounded-[50%] bg-[radial-gradient(closest-side,rgba(90,105,220,0.28),rgba(90,105,220,0))]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-1.5 rounded-pill bg-white/70 ring-1 ring-white px-3 py-1 text-[12px] font-semibold text-accent-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <Spark size={11} /> Uri · your project guide
              </div>
              <h2 className="mt-3 text-[32px] leading-[1.12] font-semibold tracking-[-0.025em] text-text">{headline}</h2>
              <TypeLine key={line} text={line} />
              {cta && (
                <Link href={cta.href} className="glass-btn mt-5 inline-flex items-center gap-2 h-10 px-5 rounded-pill text-[14px] font-semibold !text-[#1c2566]">
                  <Spark size={14} /> {cta.label}
                </Link>
              )}
            </div>

            <div className="shrink-0 self-start flex items-center gap-1.5">
              {(state === "picks" || state === "none") && (
                <button type="button" onClick={() => setExplain((v) => !v)} aria-expanded={explain}
                  className={`h-8 px-3 rounded-pill text-[12.5px] font-medium inline-flex items-center gap-1.5 transition-colors ${explain ? "bg-[#1c2566] text-white" : "bg-white/70 text-text ring-1 ring-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-white"}`}>
                  <I.Info size={14} /> How it works
                </button>
              )}
              <button type="button" onClick={() => hide(true)} aria-label="Hide Uri's picks" title="Hide"
                className="w-8 h-8 rounded-full bg-white/70 ring-1 ring-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] inline-flex items-center justify-center text-muted hover:text-text hover:bg-white"><I.X size={13} /></button>
            </div>
          </div>

          <div className="min-w-0 flex flex-col">
            {explain && <HowItWorks />}

            {state === "loading" && <div className="grid grid-cols-3 gap-4 mt-6">{[0, 1, 2].map((i) => <Skeleton key={i} />)}</div>}
            {state === "picks" && (
              <>
                <div className={`grid gap-4 mt-6 ${top.length === 1 ? "grid-cols-[minmax(0,360px)]" : top.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {top.map((r, i) => <PickCard key={r.listing.id} r={r} rank={i} />)}
                </div>
                {onShowAll && (picks?.length ?? 0) > top.length && (
                  <button type="button" onClick={onShowAll} className="self-start mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-accent hover:text-accent-ink">
                    See all {picks!.length} matches, best first <span className="-rotate-90"><I.ChevronDown size={13} /></span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/** Uri's line under the headline. Types once (instantly for reduced motion); keyed on the text, so a new
 *  message remounts it and types from the beginning. */
function TypeLine({ text }: { text: string }) {
  const [n, setN] = useState(() => (stillMotion() ? text.length : 0));
  useEffect(() => {
    if (stillMotion()) return;
    const t = setInterval(() => setN((v) => (v >= text.length ? (clearInterval(t), v) : v + 1)), 14);
    return () => clearInterval(t);
  }, [text]);
  return (
    <p className="mt-2 min-h-[24px] text-[15.5px] leading-[1.55] text-muted max-w-[680px]" aria-label={text}>
      <span aria-hidden>{text.slice(0, n)}</span>
      {n < text.length && <span aria-hidden className="inline-block w-[2px] h-[1.05em] align-[-2px] ml-0.5 bg-accent" style={{ animation: "uri-caret 0.9s steps(1) infinite" }} />}
    </p>
  );
}

function PickCard({ r, rank }: { r: Recommendation; rank: number }) {
  const [why, setWhy] = useState(false);
  const l = r.listing;
  return (
    <article className={`group relative flex flex-col rounded-[18px] bg-white overflow-hidden ${rank === 0
      ? "shadow-[0_22px_44px_-20px_rgba(80,100,220,0.5),0_2px_6px_rgba(0,0,0,0.04)]"
      : "ring-1 ring-black/[0.06] shadow-[0_10px_30px_-18px_rgba(28,37,102,0.35)]"} transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-20px_rgba(0,80,180,0.35)]`}
      style={{ animation: `uri-rise .55s cubic-bezier(.2,.8,.2,1) ${0.25 + rank * 0.12}s both` }}>
      {rank === 0 && (
        // Best fit: a soft gradient rim in the colours of the light behind the glass, not a hard outline
        <span aria-hidden className="grad-rim absolute inset-0 z-20 rounded-[18px] pointer-events-none" />
      )}
      <div className="relative h-[128px] bg-sunken overflow-hidden">
        {l.cover_url && <img src={l.cover_url} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-black/0 to-black/0" />
        {rank === 0 && (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-pill bg-white/90 backdrop-blur px-2.5 py-1 text-[11.5px] font-semibold text-[#1c2566]">
            <Spark size={11} /> Best fit
          </span>
        )}
      </div>
      <div className="absolute right-3.5 top-[98px]"><MatchRing score={r.score} delay={0.35 + rank * 0.12} /></div>

      <div className="flex-1 flex flex-col px-4 pt-3 pb-3.5">
        <div className="pr-16 text-[12px] text-faint truncate">{l.offering_faculty} · {l.supervisor_name}</div>
        <Link href={`/projects/${l.id}`} className="mt-0.5 pr-14 text-[15.5px] font-semibold leading-[1.3] tracking-[-0.01em] !text-text line-clamp-2 after:absolute after:inset-0">{l.title}</Link>
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {r.reasons.map((t) => <Reason key={t} text={t} />)}
          {r.gaps.slice(0, 1).map((t) => <Reason key={t} text={t} gap />)}
        </ul>
        <div className="mt-auto pt-3">
          <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why}
            className="relative z-10 inline-flex items-center gap-1 text-[12.5px] font-medium text-muted hover:text-text">
            Why this match <span className={`transition-transform ${why ? "rotate-180" : ""}`}><I.ChevronDown size={12} /></span>
          </button>
          {why && (
            <div className="relative z-10 mt-2 flex flex-col gap-1.5">
              <Bar label="Interests" value={r.parts.interests} max={MAX.interests} color="#7c5cff" />
              <Bar label="Readiness" value={r.parts.readiness} max={MAX.readiness} color="#22a06b" />
              <Bar label="Chance" value={r.parts.chance} max={MAX.chance} color="#3d7bff" />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** Circular score that fills and counts up. */
function MatchRing({ score, delay }: { score: number; delay: number }) {
  const [shown, setShown] = useState(() => (stillMotion() ? score : 0));
  useEffect(() => {
    if (stillMotion()) return;
    let raf = 0; const start = performance.now() + delay * 1000; const dur = 900;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / dur));
      setShown(Math.round(score * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, delay]);
  const r = 22, c = 2 * Math.PI * r;
  const id = `ring${score}${Math.round(delay * 100)}`;
  return (
    <div className="relative w-[58px] h-[58px] rounded-full bg-white shadow-[0_6px_16px_-6px_rgba(28,37,102,0.45)] ring-1 ring-black/[0.04]" title={`${score}% match`}>
      <svg viewBox="0 0 58 58" className="absolute inset-0 -rotate-90">
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3d7bff" /><stop offset="1" stopColor="#a35cff" /></linearGradient></defs>
        <circle cx="29" cy="29" r={r} fill="none" stroke="#eef0f7" strokeWidth="5" />
        <circle cx="29" cy="29" r={r} fill="none" stroke={`url(#${id})`} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[15px] font-bold tabular text-[#1c2566]">{shown}<span className="text-[10px]">%</span></span>
        <span className="text-[8.5px] font-semibold uppercase tracking-[0.06em] text-faint mt-0.5">match</span>
      </div>
    </div>
  );
}

function Reason({ text, gap }: { text: string; gap?: boolean }) {
  const kind = gap ? "gap" : text.startsWith("Matches") ? "interest" : text.startsWith("You have") || text.startsWith("No prerequisites") ? "ready" : "chance";
  const style = {
    interest: { bg: "bg-[#f1ecff]", fg: "text-[#6a46e5]", icon: <Spark size={11} /> },
    ready: { bg: "bg-good-soft", fg: "text-good-ink", icon: <I.Tick size={11} /> },
    chance: { bg: "bg-[#e9f1ff]", fg: "text-[#2f65d9]", icon: <I.Users size={11} /> },
    gap: { bg: "bg-warn-soft", fg: "text-warn-ink", icon: <I.Warn size={10} /> },
  }[kind];
  return (
    <li className="flex items-start gap-2 text-[12.5px] leading-[1.4] text-text">
      <span className={`mt-px w-[18px] h-[18px] shrink-0 rounded-full inline-flex items-center justify-center ${style.bg} ${style.fg}`}>{style.icon}</span>
      <span className={gap ? "text-warn-ink" : ""}>{text}</span>
    </li>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = requestAnimationFrame(() => setW(value / max)); return () => cancelAnimationFrame(t); }, [value, max]);
  return (
    <div className="grid grid-cols-[66px_1fr_38px] items-center gap-2 text-[11.5px]">
      <span className="text-muted">{label}</span>
      <span className="h-1.5 rounded-full bg-[#eef0f7] overflow-hidden">
        <span className="block h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${w * 100}%`, background: color }} />
      </span>
      <span className="text-right tabular text-muted">{value}/{max}</span>
    </div>
  );
}

function HowItWorks() {
  const rows = [
    { c: "#7c5cff", t: "Interests, up to 50", d: "Topics you chose in your profile that the project is tagged with." },
    { c: "#22a06b", t: "Readiness, up to 30", d: "How many of the project's prerequisite courses you have passed." },
    { c: "#3d7bff", t: "Chance, up to 20", d: "Fewer applicants per open slot scores higher, so students spread out and more of you get a place." },
  ];
  return (
    <div className="mt-5 rounded-[16px] bg-white/80 backdrop-blur ring-1 ring-black/[0.06] p-4 grid grid-cols-3 gap-4" style={{ animation: "uri-rise .35s ease-out both" }}>
      {rows.map((r) => (
        <div key={r.t} className="flex gap-2.5">
          <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.c }} />
          <div><div className="text-[13px] font-semibold text-text">{r.t}</div><div className="text-[12.5px] text-muted leading-[1.45] mt-0.5">{r.d}</div></div>
        </div>
      ))}
      <div className="col-span-3 text-[12px] text-faint border-t border-border pt-3 -mb-1">
        Uri only suggests. It never applies for you, and supervisors never see these scores.
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="rounded-[18px] bg-white ring-1 ring-black/[0.05] overflow-hidden">
      <div className="h-[128px] bg-[linear-gradient(90deg,#eef0f7_0%,#f7f8fc_50%,#eef0f7_100%)] bg-[length:960px_100%]" style={{ animation: "uri-shimmer 1.4s linear infinite" }} />
      <div className="p-4 flex flex-col gap-2">
        <div className="h-3.5 w-4/5 rounded bg-[#eef0f7]" /><div className="h-3 w-3/5 rounded bg-[#f2f3f8]" /><div className="h-3 w-2/3 rounded bg-[#f2f3f8]" />
      </div>
    </div>
  );
}

function Spark({ size = 12 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg>;
}
