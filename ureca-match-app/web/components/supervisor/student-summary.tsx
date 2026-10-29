"use client";
/** A student as a supervisor sees them in a side drawer: who they are, their numbers, their modules and their interests.
 *  One layout for every drawer (a proposal, a match, an applicant), so the same student always looks the same.
 *  `missing` is the modules a project asks for that the student has not completed; leave it out when there is no project to compare with. */
import { Avatar, Pill } from "@/components/ui";

export function StudentSummary({ name, email, school, degree, year, cgpa, modules, interests, missing, badge, note }: {
  name: string; email?: string | null; school?: string | null; degree?: string | null; year?: number | null; cgpa?: number | null;
  modules: string[]; interests: string[]; missing?: string[]; badge?: React.ReactNode; note?: string;
}) {
  const stats: { label: string; value: string; suffix?: string; tone?: string }[] = [
    { label: "CGPA", value: cgpa != null ? cgpa.toFixed(2) : "–", suffix: "/ 5" },
    { label: "Year", value: year != null ? String(year) : "–" },
    { label: "Modules", value: String(modules.length) },
    ...(missing ? [{ label: "Prerequisites", value: missing.length ? `${missing.length} missing` : "Met", tone: missing.length ? "text-warn-ink" : "text-good-ink" }] : []),
  ];
  return (
    <>
      <div className="flex flex-col items-center pt-1 text-center">
        <Avatar name={name} size={64} tone="navy" />
        <div className="mt-3 text-[20px] font-semibold tracking-[-0.015em]">{name}</div>
        <div className="mt-0.5 text-[13.5px] text-muted">{[school, degree, year != null ? `Year ${year}` : null].filter(Boolean).join(" · ") || "Student"}</div>
        {email && <a href={`mailto:${email}`} className="mt-1 text-[13.5px] hover:underline">{email}</a>}
        {(badge || note) && (
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-[12.5px] text-muted">{badge}{note}</div>
        )}
      </div>

      <div className={`grid rounded-row bg-bg py-3 ${stats.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        {stats.map((s, i) => (
          <div key={s.label} className={`px-2 text-center ${i ? "border-l border-border" : ""}`}>
            <div className={`${s.tone ? "text-[15px] leading-[27px]" : "text-[18px]"} font-semibold tabular ${s.tone ?? "text-text"}`}>{s.value}{s.suffix && <span className="ml-1 text-[12px] font-normal text-faint">{s.suffix}</span>}</div>
            <div className="mt-0.5 text-[12px] text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {missing && missing.length > 0 && (
        <div><div className="eyebrow mb-2">Missing prerequisites</div><div className="flex flex-wrap gap-1.5">{missing.map((m) => <Pill key={m} tone="warn">{m}</Pill>)}</div></div>
      )}
      <div>
        <div className="eyebrow mb-2">Completed modules</div>
        {modules.length ? <div className="flex flex-wrap gap-1.5">{modules.map((m) => <Pill key={m}>{m}</Pill>)}</div> : <div className="text-[13px] text-muted">None listed</div>}
      </div>
      <div>
        <div className="eyebrow mb-2">Research interests</div>
        {interests.length ? <div className="flex flex-wrap gap-1.5">{interests.map((t) => <Pill key={t}>{t}</Pill>)}</div> : <div className="text-[13px] text-muted">None listed</div>}
      </div>
    </>
  );
}
