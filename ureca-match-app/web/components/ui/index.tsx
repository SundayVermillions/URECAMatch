"use client";
/** Shared components. Source of truth: mockups/style-guide 04 (feedback) and 05 (components).
 *  Keep these small and dumb; screens own the data. */
import { useEffect, useId, useRef, useState } from "react";
import { I } from "@/components/shell/icons";
import type { ApiError, MatchStatus, ProposalStatus, ApplicationStatus, AccountStatus, RoundStatus } from "@/lib/api/models";

// ------------------------------------------------------------------ buttons

type Variant = "primary" | "secondary" | "soft" | "destructive" | "text";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] hover:bg-accent-ink active:scale-[0.98] disabled:bg-neutral-soft disabled:text-faint disabled:shadow-none",
  secondary: "bg-neutral-soft text-text hover:bg-[#e8e8ed] active:scale-[0.98] disabled:text-faint disabled:hover:bg-neutral-soft",
  soft: "bg-accent-soft text-accent-ink hover:bg-accent-border active:scale-[0.98] disabled:bg-neutral-soft disabled:text-faint",
  destructive: "bg-bad text-white hover:bg-bad-ink active:scale-[0.98] disabled:bg-neutral-soft disabled:text-faint",
  text: "text-accent hover:text-accent-ink px-1 disabled:text-faint",
};
const sizes = { lg: "h-11 px-6 text-[15px]", md: "h-9 px-4 text-[13.5px]", sm: "h-7 px-3 text-[12.5px]" };

export function Button({ variant = "primary", size = "md", className = "", children, ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes }) {
  return (
    <button {...rest} className={`inline-flex items-center justify-center gap-2 rounded-button font-display font-medium whitespace-nowrap transition-[background-color,transform] duration-150 ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </button>
  );
}

export function IconButton({ className = "", children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-muted transition-colors hover:bg-neutral-soft hover:text-text disabled:text-border-strong disabled:hover:bg-transparent ${className}`}>{children}</button>;
}

// ------------------------------------------------------------------ status

type Tone = "good" | "warn" | "bad" | "accent" | "neutral";
const tones: Record<Tone, string> = {
  good: "bg-good-soft text-good-ink", warn: "bg-warn-soft text-warn-ink", bad: "bg-bad-soft text-bad-ink",
  accent: "bg-accent-soft text-accent-ink", neutral: "bg-neutral-soft text-muted",
};
export function Pill({ tone = "neutral", children, className = "" }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium rounded-pill px-2.5 py-0.5 ${tones[tone]} ${className}`}>{children}</span>;
}

/** One vocabulary for every entity status (SRS 3.1.3). */
const STATUS: Record<string, { label: string; tone: Tone }> = {
  submitted: { label: "Submitted", tone: "accent" }, withdrawn: { label: "Withdrawn", tone: "neutral" }, matched: { label: "Matched", tone: "good" }, unmatched: { label: "Unmatched", tone: "neutral" },
  accepted: { label: "Accepted", tone: "good" }, declined: { label: "Declined", tone: "bad" },
  proposed: { label: "Awaiting supervisor", tone: "warn" }, approved: { label: "Approved", tone: "good" }, rejected: { label: "Rejected", tone: "bad" },
  reassigned: { label: "Reassigned", tone: "warn" }, published: { label: "Offer sent", tone: "accent" }, timed_out: { label: "Timed out", tone: "bad" },
  active: { label: "Active", tone: "good" }, inactive: { label: "Inactive", tone: "neutral" }, pending_verification: { label: "Unverified", tone: "warn" },
  scheduled: { label: "Scheduled", tone: "neutral" }, application_window: { label: "Applications open", tone: "accent" }, review_window: { label: "Review window", tone: "accent" },
  awaiting_publication: { label: "Awaiting publication", tone: "warn" }, ready_for_matching: { label: "Ready for matching", tone: "warn" }, completed: { label: "Completed", tone: "good" },
  draft: { label: "Draft", tone: "neutral" }, closed: { label: "Closed", tone: "neutral" },
};
/** `kind` disambiguates words shared by several entities: "published" is "Offer sent" for a match but "Published" for a round or listing. */
export function Status({ value, kind }: { value: MatchStatus | ProposalStatus | ApplicationStatus | AccountStatus | RoundStatus | string; kind?: "round" | "listing" }) {
  const s = (kind === "round" || kind === "listing") && value === "published" ? { label: "Published", tone: "good" as Tone } : STATUS[value] ?? { label: value, tone: "neutral" as Tone };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export function Avatar({ name, size = 30, tone = "neutral" }: { name: string; size?: number; tone?: "navy" | "neutral" }) {
  const initials = name.replace(/^(Prof\.|Dr\.|Assoc\. Prof\.)\s*/, "").split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  return (
    <div className={`rounded-full flex items-center justify-center font-display font-semibold shrink-0 ${tone === "navy" ? "bg-gradient-to-b from-[#a1a1a6] to-[#6e6e73] text-white" : "bg-neutral-soft text-muted"}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>{initials}</div>
  );
}

export function RankBadge({ n, tone = "accent" }: { n: number; tone?: "accent" | "empty" | "good" }) {
  const cls = tone === "accent" ? "bg-accent text-white" : tone === "good" ? "bg-good-soft text-good-ink" : "border-[1.5px] border-dashed border-border-strong text-faint";
  return <div className={`w-6 h-6 rounded-full flex items-center justify-center font-display text-[12px] font-semibold tabular shrink-0 ${cls}`}>{n}</div>;
}

export function DeadlineChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 bg-warn-soft rounded-pill px-3.5 py-1.5 text-[13px] font-medium text-warn-ink whitespace-nowrap">
      <I.Calendar size={15} /> {children}
    </span>
  );
}

export function Chip({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`text-[12.5px] font-medium px-3 py-1 rounded-pill whitespace-nowrap transition-colors ${active ? "bg-text text-white" : "bg-surface text-muted shadow-[inset_0_0_0_1px_var(--border)] hover:text-text"}`}>
      {children}
    </button>
  );
}

/** Compact filter dropdown for toolbars: "School  Any ⌄", opening a popover list with a check on the current choice.
 *  Custom instead of a native <select> so the list is styled consistently; keyboard support is rebuilt:
 *  Enter/Space/↓ opens, ↑/↓ move, Enter selects, Esc or a click outside closes. ARIA listbox roles for screen readers. */
export function FilterSelect({ label, value, options, onChange, anyLabel = "Any", align = "right" }:
  { label: string; value: string | undefined; options: string[]; onChange: (v: string | undefined) => void; anyLabel?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0); // highlighted row while open
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const items: (string | undefined)[] = [undefined, ...options]; // first row = "Any"

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  useEffect(() => { // keep the highlighted row in view when moving with the keyboard
    if (open) root.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  const choose = (v: string | undefined) => { onChange(v); setOpen(false); };
  const show = () => { setHi(Math.max(0, items.indexOf(value))); setOpen(true); };
  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (["Enter", " ", "ArrowDown"].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(items[hi]); }
    else if (e.key === "Tab") setOpen(false);
  }

  return (
    <div ref={root} className="relative shrink-0">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={`${label}: ${value ?? anyLabel}`}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKey}
        className={`inline-flex items-center h-10 rounded-pill pl-4 pr-3 text-[13.5px] whitespace-nowrap transition-colors max-w-[260px] ${value
          ? "bg-accent-soft text-accent-ink shadow-[inset_0_0_0_1px_var(--accent-border)]"
          : "bg-surface text-text shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-neutral-soft"}`}>
        <span className={value ? "text-accent-ink/70" : "text-muted"}>{label}</span>
        <span className="ml-1.5 font-medium truncate">{value ?? anyLabel}</span>
        <span className={`ml-2 shrink-0 transition-transform ${open ? "rotate-180" : ""} ${value ? "text-accent-ink/70" : "text-faint"}`}><I.ChevronDown size={15} /></span>
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-label={label}
          className={`absolute ${align === "left" ? "left-0" : "right-0"} z-20 mt-2 min-w-[220px] max-w-[320px] max-h-[320px] overflow-y-auto p-1.5 rounded-[14px] bg-surface/95 backdrop-blur-xl shadow-[var(--shadow-float)] ring-1 ring-black/[0.06]`}>
          {items.map((o, i) => {
            const selected = o === value;
            return (
              <li key={o ?? "__any"} data-i={i} role="option" aria-selected={selected}
                onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}
                className={`flex items-center gap-2 h-9 px-3 rounded-[9px] text-[13.5px] cursor-pointer select-none ${i === hi ? "bg-neutral-soft" : ""} ${selected ? "text-text font-medium" : "text-text"}`}>
                <span className="flex-1 truncate">{o ?? anyLabel}</span>
                {selected && <span className="text-accent shrink-0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>}
              </li>
            );
          })}
          {options.length === 0 && <li className="px-3 py-2 text-[13px] text-faint">No options</li>}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ surfaces

export function Card({ children, className = "", padded = true }: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return <div className={`bg-surface rounded-card shadow-[var(--shadow-card)] ring-1 ring-black/[0.04] ${padded ? "p-6" : ""} ${className}`}>{children}</div>;
}

export function Stat({ label, value, note, tone }: { label: string; value: string | number; note?: string; tone?: "good" | "bad" }) {
  return (
    <div className="bg-surface rounded-card shadow-[var(--shadow-card)] ring-1 ring-black/[0.04] px-5 py-4">
      <div className="text-[13px] text-muted font-medium">{label}</div>
      <div className={`font-display text-[28px] font-semibold tracking-[-0.02em] mt-1 tabular ${tone === "good" ? "text-good-ink" : tone === "bad" ? "text-bad-ink" : ""}`}>{value}</div>
      {note && <div className="text-[11.5px] text-faint mt-0.5">{note}</div>}
    </div>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  return <div className="h-1.5 bg-neutral-soft rounded-full overflow-hidden"><div className="h-full bg-accent rounded-full transition-[width] duration-500" style={{ width: `${max ? Math.round((value / max) * 100) : 0}%` }} /></div>;
}

export function Empty({ title, note, children }: { title: string; note?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 text-center bg-surface rounded-card ring-1 ring-black/[0.04] px-6 py-14">
      <div className="font-display text-[15px] font-semibold">{title}</div>
      {note && <div className="text-[13.5px] text-muted max-w-md">{note}</div>}
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

export function Loading() { return <div className="py-10 flex justify-center"><Spinner /></div>; }

// ------------------------------------------------------------------ feedback (style sheet 04)

export function Banner({ tone, title, children, action }: { tone: "bad" | "warn" | "accent" | "good"; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const icon = tone === "good" ? <I.CheckCircle /> : tone === "warn" ? <I.Calendar size={16} /> : tone === "accent" ? <I.Info /> : <I.Alert />;
  return (
    <div className={`flex items-start gap-3 rounded-row px-4 py-3 text-[13.5px] leading-[1.5] ${tones[tone]}`}>
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
      <span className="text-[13px] font-medium">{label}</span>
      {children}
      {error ? <span className="flex items-center gap-1.5 text-[12px] text-bad-ink font-medium"><I.Alert size={13} /> {error}</span>
        : hint ? <span className="text-[11.5px] text-faint">{hint}</span> : null}
    </label>
  );
}

export const inputCls = (invalid?: boolean) =>
  `h-10 px-3.5 rounded-button border bg-surface text-[14px] outline-none transition-shadow focus:border-accent focus:ring-4 focus:ring-accent/15 ${invalid ? "border-bad ring-4 ring-bad/10" : "border-border-strong"}`;
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
      <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed top-2 right-2 bottom-2 z-40 w-[460px] max-w-[calc(100%-16px)] bg-surface rounded-[20px] shadow-[var(--shadow-float)] ring-1 ring-black/[0.06] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <h2>{title}</h2>
          <IconButton onClick={onClose} aria-label="Close" className="bg-neutral-soft"><I.X size={15} /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6 flex flex-col gap-6">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2.5">{footer}</div>}
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
      <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed z-40 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-w-[calc(100vw-32px)] bg-surface rounded-modal shadow-[var(--shadow-float)] ring-1 ring-black/[0.06] p-7 flex flex-col gap-2.5">
        <h2 className="text-[19px]">{title}</h2>
        <div className="text-[14px] text-muted leading-[1.55]">{children}</div>
        {footer && <div className="flex justify-end gap-2.5 mt-4">{footer}</div>}
      </div>
    </>
  );
}

/** Removable tags for lists like topics or course codes. Enter or comma adds; Backspace on an empty field removes the last.
 *  `normalize` can reshape each new tag, e.g. upper-casing course codes. Duplicates (ignoring case) are skipped. */
export function TagInput({ value, onChange, invalid, placeholder = "Add a tag", normalize = (t: string) => t }:
  { value: string[]; onChange: (v: string[]) => void; invalid?: boolean; placeholder?: string; normalize?: (t: string) => string }) {
  const [draft, setDraft] = useState("");
  const add = (t: string) => {
    const v = normalize(t.trim());
    if (v && !value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className={`min-h-10 flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-button border bg-surface transition-shadow focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15 ${invalid ? "border-bad" : "border-border-strong"}`}>
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-pill bg-neutral-soft text-[13px] text-text">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="w-5 h-5 rounded-full inline-flex items-center justify-center text-faint hover:text-text hover:bg-black/[0.06]"><I.X size={12} /></button>
        </span>
      ))}
      <input value={draft} onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); add(draft); }
          else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft && add(draft)}
        placeholder={value.length ? "Add another" : placeholder} className="flex-1 min-w-[120px] h-7 px-1.5 outline-none bg-transparent text-[14px]" />
    </div>
  );
}

/** Apple-style segmented switch with optional counts. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="inline-flex p-1 rounded-pill bg-black/[0.05]" role="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(o.value)}
            className={`h-8 px-4 rounded-pill text-[13px] font-medium inline-flex items-center gap-1.5 transition-all ${on ? "bg-surface text-text shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "text-muted hover:text-text"}`}>
            {o.label}
            {o.count !== undefined && <span className={`text-[12px] tabular ${on ? "text-muted" : "text-faint"}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A listing is "in high demand" when more than 5 students compete for each open slot. Only this case is flagged. */
export const isHighDemand = (applicants: number, open: number) => open > 0 && applicants / open > 5;

/** Anonymous "avatar stack" of applicants: coloured circles, never names or initials (SRS 5.3.3). */
const STACK_COLOURS = ["from-[#c9d4ff] to-[#9fb0f5]", "from-[#ffd6e0] to-[#f5a8bd]", "from-[#c8f0e4] to-[#8fd9c2]"];
export function ApplicantStack({ count }: { count: number }) {
  if (count === 0) return <span className="text-[13px] text-faint whitespace-nowrap">No applicants yet</span>;
  const dots = Math.min(count, 3);
  return (
    <div className="flex items-center gap-2 shrink-0" title={`${count} ${count === 1 ? "student has" : "students have"} applied`}>
      <div className="flex -space-x-1.5" aria-hidden>
        {Array.from({ length: dots }, (_, i) => (
          <span key={i} className={`w-[22px] h-[22px] rounded-full bg-gradient-to-br ${STACK_COLOURS[i]} ring-2 ring-surface`} />
        ))}
        {count > dots && (
          <span className="h-[22px] min-w-[22px] px-1.5 rounded-full bg-neutral-soft ring-2 ring-surface text-[11px] font-semibold text-muted inline-flex items-center justify-center tabular">+{count - dots}</span>
        )}
      </div>
      <span className="text-[13px] text-muted">applied</span>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="inline-flex items-center gap-2 text-[12px] text-muted">
      <span className={`w-[34px] h-[19px] rounded-pill flex items-center p-0.5 transition-colors ${on ? "bg-good justify-end" : "bg-border-strong justify-start"}`}><span className="w-[15px] h-[15px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" /></span>
      {label}
    </button>
  );
}

export function Stepper({ value, onChange, min, max, format }: { value: number; onChange: (v: number) => void; min: number; max: number; format?: (v: number) => string }) {
  const btn = "w-8 h-8 rounded-full bg-neutral-soft text-[16px] font-medium text-text hover:bg-[#e8e8ed] disabled:text-border-strong";
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

// ------------------------------------------------------------------ documents

export { PdfViewer } from "./pdf-viewer";
