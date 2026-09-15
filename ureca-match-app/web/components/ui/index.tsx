"use client";
/** Shared components. Source of truth: mockups/style-guide 04 (feedback) and 05 (components).
 *  Keep these small and dumb; screens own the data. */
import { useEffect } from "react";
import { I } from "@/components/shell/icons";
import type { ApiError, MatchStatus, ProposalStatus, ApplicationStatus, AccountStatus, RoundStatus } from "@/lib/api/models";

// ------------------------------------------------------------------ buttons

type Variant = "primary" | "secondary" | "soft" | "destructive" | "text";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-ink disabled:bg-neutral-soft disabled:text-faint",
  secondary: "bg-surface text-muted border border-border-strong hover:bg-sunken hover:text-text disabled:text-faint disabled:border-border",
  soft: "bg-accent-soft text-accent-ink border border-accent-border hover:bg-[#d2e5fb] disabled:bg-surface disabled:text-faint disabled:border-border",
  destructive: "bg-bad text-white hover:bg-bad-ink disabled:bg-neutral-soft disabled:text-faint",
  text: "text-accent hover:text-accent-ink hover:underline px-1 disabled:text-faint",
};
const sizes = { lg: "h-11 px-[22px] text-[14px]", md: "h-[38px] px-4 text-[13px]", sm: "h-[30px] px-3 text-[12px]" };

export function Button({ variant = "primary", size = "md", className = "", children, ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes }) {
  return (
    <button {...rest} className={`inline-flex items-center justify-center gap-2 rounded-button font-display font-semibold whitespace-nowrap ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </button>
  );
}

export function IconButton({ className = "", children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} className={`w-[26px] h-[26px] rounded-icon inline-flex items-center justify-center text-muted hover:bg-neutral-soft disabled:text-border-strong disabled:hover:bg-transparent ${className}`}>{children}</button>;
}

// ------------------------------------------------------------------ status

type Tone = "good" | "warn" | "bad" | "accent" | "neutral";
const tones: Record<Tone, string> = {
  good: "bg-good-soft text-good-ink", warn: "bg-warn-soft text-warn-ink", bad: "bg-bad-soft text-bad-ink",
  accent: "bg-accent-soft text-accent-ink", neutral: "bg-neutral-soft text-muted",
};
export function Pill({ tone = "neutral", children, className = "" }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-bold rounded-pill px-2.5 py-[3px] ${tones[tone]} ${className}`}>{children}</span>;
}

/** One vocabulary for every entity status (SRS 3.1.3). */
const STATUS: Record<string, { label: string; tone: Tone }> = {
  submitted: { label: "Submitted", tone: "accent" }, withdrawn: { label: "Withdrawn", tone: "neutral" }, matched: { label: "Matched", tone: "good" }, unmatched: { label: "Unmatched", tone: "neutral" },
  accepted: { label: "Accepted", tone: "good" }, declined: { label: "Declined", tone: "bad" },
  proposed: { label: "Awaiting supervisor", tone: "warn" }, approved: { label: "Approved", tone: "good" }, rejected: { label: "Rejected", tone: "bad" },
  reassigned: { label: "Reassigned", tone: "warn" }, published: { label: "Offer sent", tone: "accent" }, timed_out: { label: "Timed out", tone: "bad" },
  active: { label: "Active", tone: "good" }, inactive: { label: "Inactive", tone: "neutral" }, pending_verification: { label: "Unverified", tone: "warn" },
  scheduled: { label: "Scheduled", tone: "neutral" }, application_window: { label: "Applications open", tone: "accent" }, review_window: { label: "Review window", tone: "accent" },
  awaiting_publication: { label: "Awaiting publication", tone: "warn" }, completed: { label: "Completed", tone: "good" },
  draft: { label: "Draft", tone: "neutral" }, closed: { label: "Closed", tone: "neutral" },
};
export function Status({ value, kind }: { value: MatchStatus | ProposalStatus | ApplicationStatus | AccountStatus | RoundStatus | string; kind?: "round" }) {
  const s = kind === "round" && value === "published" ? { label: "Published", tone: "good" as Tone } : STATUS[value] ?? { label: value, tone: "neutral" as Tone };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export function Avatar({ name, size = 30, tone = "neutral" }: { name: string; size?: number; tone?: "navy" | "neutral" }) {
  const initials = name.replace(/^(Prof\.|Dr\.|Assoc\. Prof\.)\s*/, "").split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  return (
    <div className={`rounded-full flex items-center justify-center font-display font-bold shrink-0 ${tone === "navy" ? "bg-navy text-white" : "bg-neutral-soft text-muted"}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>{initials}</div>
  );
}

export function RankBadge({ n, tone = "accent" }: { n: number; tone?: "accent" | "empty" | "good" }) {
  const cls = tone === "accent" ? "bg-accent text-white" : tone === "good" ? "bg-good-soft text-good-ink" : "border-[1.5px] border-dashed border-border-strong text-faint";
  return <div className={`w-6 h-6 rounded-icon flex items-center justify-center font-display text-[12px] font-bold shrink-0 ${cls}`}>{n}</div>;
}

export function DeadlineChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 bg-warn-soft border border-[#e9d5b8] rounded-button px-3 py-2 text-[13px] font-semibold text-warn-ink whitespace-nowrap">
      <I.Calendar size={15} /> {children}
    </span>
  );
}

export function Chip({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`text-[11.5px] font-semibold px-2.5 py-[5px] rounded-[7px] border whitespace-nowrap ${active ? "border-accent-border bg-accent-soft text-accent-ink" : "border-border bg-surface text-muted hover:bg-sunken"}`}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ surfaces

export function Card({ children, className = "", padded = true }: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return <div className={`bg-surface border border-border rounded-card ${padded ? "p-[18px]" : ""} ${className}`}>{children}</div>;
}

export function Stat({ label, value, note, tone }: { label: string; value: string | number; note?: string; tone?: "good" | "bad" }) {
  return (
    <div className="bg-sunken rounded-row px-4 py-3.5">
      <div className="text-[11.5px] text-muted font-semibold">{label}</div>
      <div className={`font-display text-[24px] font-extrabold tracking-tight mt-0.5 tabular ${tone === "good" ? "text-good-ink" : tone === "bad" ? "text-bad-ink" : ""}`}>{value}</div>
      {note && <div className="text-[11.5px] text-faint mt-0.5">{note}</div>}
    </div>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  return <div className="h-1.5 bg-neutral-soft rounded overflow-hidden"><div className="h-full bg-accent rounded" style={{ width: `${max ? Math.round((value / max) * 100) : 0}%` }} /></div>;
}

export function Empty({ title, note, children }: { title: string; note?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 text-center border border-dashed border-border-strong rounded-card px-5 py-10">
      <div className="font-display text-[13.5px] font-bold">{title}</div>
      {note && <div className="text-[12.5px] text-muted max-w-md">{note}</div>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px] font-semibold">
      <div className="w-[18px] h-[18px] rounded-full border-[2.5px] border-accent-border border-t-accent" style={{ animation: "spin 0.8s linear infinite" }} />
      {label}
    </div>
  );
}

export function Loading() { return <div className="text-muted text-[13px] py-6">Loading…</div>; }

// ------------------------------------------------------------------ feedback (style sheet 04)

export function Banner({ tone, title, children, action }: { tone: "bad" | "warn" | "accent" | "good"; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const icon = tone === "good" ? <I.CheckCircle /> : tone === "warn" ? <I.Calendar size={16} /> : tone === "accent" ? <I.Info /> : <I.Alert />;
  return (
    <div className={`flex items-start gap-2.5 rounded-row px-3.5 py-3 text-[13px] leading-[1.45] ${tones[tone]}`}>
      <span className="shrink-0 mt-px">{icon}</span>
      <span className="flex-1">{title && <strong>{title} </strong>}{children}</span>
      {action}
    </div>
  );
}

/** Shows an ApiError as a banner; field errors are shown by the input instead. */
export function ErrorBanner({ error }: { error: ApiError | null }) {
  if (!error || error.field) return null;
  return <Banner tone="bad">{error.message}</Banner>;
}

export function Field({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold">{label}</span>
      {children}
      {error ? <span className="flex items-center gap-1.5 text-[12px] text-bad-ink font-medium"><I.Alert size={13} /> {error}</span>
        : hint ? <span className="text-[11.5px] text-faint">{hint}</span> : null}
    </label>
  );
}

export const inputCls = (invalid?: boolean) =>
  `h-10 px-3 rounded-button border bg-surface text-[13px] outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft ${invalid ? "border-bad ring-[3px] ring-bad-soft" : "border-border-strong"}`;
export function Input({ invalid, className = "", ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...rest} className={`${inputCls(invalid)} ${className}`} />;
}
export function Textarea({ invalid, className = "", ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...rest} className={`${inputCls(invalid)} h-auto py-2.5 leading-[1.5] ${className}`} />;
}
export function Select({ invalid, className = "", children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select {...rest} className={`${inputCls(invalid)} ${className}`}>{children}</select>;
}

/** Drawer: 460 px, from the right, scrim 28% (style sheet 03). Esc closes. */
export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-30 bg-[rgba(26,32,41,0.28)]" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 z-40 w-[460px] max-w-full bg-surface border-l border-border shadow-[-16px_0_40px_rgba(26,32,41,0.12)] flex flex-col">
        <div className="flex items-center justify-between px-[22px] pt-[18px]">
          <span className="overline">{title}</span>
          <IconButton onClick={onClose} aria-label="Close"><I.X size={16} /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-[22px] pt-3.5 pb-[22px] flex flex-col gap-4">{children}</div>
        {footer && <div className="px-[22px] py-3.5 border-t border-border flex items-center gap-3">{footer}</div>}
      </div>
    </>
  );
}

/** Modal: 520 px, centred, for confirmations before irreversible actions. */
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-30 bg-[rgba(26,32,41,0.28)]" onClick={onClose} />
      <div className="fixed z-40 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-w-[calc(100vw-32px)] bg-surface border border-border rounded-modal shadow-[0_24px_60px_rgba(26,32,41,0.18)] p-6 flex flex-col gap-3">
        <h2 className="text-[17px]">{title}</h2>
        <div className="text-[13px] text-muted leading-[1.5]">{children}</div>
        {footer && <div className="flex justify-end gap-2 mt-2">{footer}</div>}
      </div>
    </>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="inline-flex items-center gap-2 text-[12px] text-muted">
      <span className={`w-[34px] h-[19px] rounded-pill flex items-center p-0.5 ${on ? "bg-accent justify-end" : "bg-border-strong justify-start"}`}><span className="w-[15px] h-[15px] rounded-full bg-white" /></span>
      {label}
    </button>
  );
}

export function Stepper({ value, onChange, min, max, format }: { value: number; onChange: (v: number) => void; min: number; max: number; format?: (v: number) => string }) {
  const btn = "w-8 h-8 rounded-[7px] border border-border-strong bg-surface text-[15px] font-bold text-muted hover:bg-sunken disabled:text-border-strong";
  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span className="text-[13.5px] font-bold min-w-[60px] text-center tabular">{format ? format(value) : value}</span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

export const fmtDate = (iso?: string | null, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  iso ? new Date(iso).toLocaleDateString("en-SG", opts) : "";
export const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
