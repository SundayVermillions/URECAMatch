/** Read an NTU examination-results transcript (PDF) in the browser.  REQ-PROF-1, REQ-PROF-3.
 *  Mirrors api/app/services/transcript_parser.py, which the live API uses, so keep the two in step.
 *  Mock mode has no server, so this reads the PDF with pdfjs-dist (loaded on first use). */

export type TranscriptFields = {
  cgpa: number | null;
  school: string;
  degree: string;
  year_of_study: number | null;
  completed_modules: string[];
};

/** One piece of text with its position on the page, as pdfjs reports it. */
export type TextPiece = { str: string; x: number; y: number; width: number };

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

// Grades that count as completed. F, W (withdrawn), IP (in progress) and absent are left out.
// PASS = pass/fail course, AT = by attendance, EX = exempted, TC = transfer credit.
const PASSING = /^(A\+|A-|A|B\+|B-|B|C\+|C|D\+|D|PASS|AT|EX|TC)$/;

// One course entry: [*] CODE name... AU grade. A row can hold two entries (left and right column).
const ENTRY = /(?<![A-Z0-9])([A-Z]{2}\d{4})(?![A-Z0-9]).*?\s\d{1,2}\.\d\s+([A-Z][A-Z+-]*)(?=\s|$)/g;
const CODE = /(?<![A-Z0-9])[A-Z]{2}\d{4}(?![A-Z0-9])/g;
const CGPA = /Cumulative\s+(?:Grade\s+Point\s+Average|GPA)\s*:?\s*(\d(?:\.\d{1,2})?)/gi;
const PROGRAMME = /PROGRAMME[ \t]*:?[ \t]*(.+?)[ \t]*:?(?:[ \t]{3,}|$)/m;
const MATRIC = /(?<![A-Z0-9])U(\d{2})\d{5}[A-Z](?![A-Z0-9])/;
const PRINT_DATE = /Print\s+date\s*:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i;
const SEMESTER = /(\d{4})\s*-\s*(\d{4})\s+SEMESTER\s+\d/gi;

// [pattern on the upper-cased programme, school code, degree name used by the profile page dropdown].
// First match wins, so combined programmes (Business & Computer Science) come before the single ones they contain.
const PROGRAMMES: [RegExp, string, string][] = [
  [/MATHEMATICS\s*(?:&|AND)\s*COMPUTER SCIENCE/, "SPMS", "Mathematics & Computer Science"],
  [/ACCOUNTANCY.*DATA SCIENCE/, "NBS", "Accountancy & Data Science and AI"],
  [/BUSINESS.*COMPUTER SCIENCE|COMPUTER SCIENCE.*BUSINESS/, "NBS", "Business & Computer Science"],
  [/BIOMEDICAL SCIENCES.*CHINESE MEDICINE/, "SBS", "Biomedical Sciences & Chinese Medicine"],
  [/COMPUTER SCIENCE/, "CCDS", "Computer Science"],
  [/DATA SCIENCE\s*(?:&|AND)\s*(?:AI|ARTIFICIAL)/, "CCDS", "Data Science & Artificial Intelligence"],
  [/COMPUTER ENGINEERING/, "CCDS", "Computer Engineering"],
  [/AI\s*(?:&|AND)\s*SOCIETY/, "CCDS", "AI & Society"],
  [/INFORMATION ENGINEERING/, "EEE", "Information Engineering & Media"],
  [/ELECTRICAL/, "EEE", "Electrical & Electronic Engineering"],
  [/BIOMEDICAL SCIENCES/, "SBS", "Biomedical Sciences & BioBusiness"],
  [/BIOLOGICAL SCIENCES/, "SBS", "Biological Sciences"],
  [/AEROSPACE/, "MAE", "Aerospace Engineering"],
  [/MECHANICAL/, "MAE", "Mechanical Engineering"],
  [/MATHEMATICAL SCIENCES/, "SPMS", "Mathematical Sciences"],
  [/PHYSICS/, "SPMS", "Physics / Applied Physics"],
  [/CHEMISTRY/, "SPMS", "Chemistry & Biological Chemistry"],
  [/ACCOUNTANCY/, "NBS", "Accountancy"],
  [/BUSINESS/, "NBS", "Business"],
  [/CIVIL/, "CEE", "Civil Engineering"],
  [/ENVIRONMENTAL/, "CEE", "Environmental Engineering"],
  [/MARITIME/, "CEE", "Maritime Studies"],
  [/MATERIALS/, "MSE", "Materials Engineering"],
];

/** Rebuild text rows from positioned pieces. Pieces on the same baseline form one row, left to right,
 *  with a wide gap written as three spaces so the two semester columns stay apart. */
export function linesFromPieces(pieces: TextPiece[]): string[] {
  const rows = new Map<number, TextPiece[]>();
  for (const p of pieces) {
    if (!p.str.trim()) continue;
    const key = Math.round(p.y / 2); // a row's pieces can differ by a fraction of a point
    rows.set(key, [...(rows.get(key) ?? []), p]);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // PDF y grows upward
    .map(([, row]) => {
      row.sort((a, b) => a.x - b.x);
      let line = "";
      let end = 0;
      row.forEach((p, i) => {
        const gap = p.x - end;
        line += i === 0 ? p.str : gap > 12 ? `   ${p.str}` : gap > 1 ? ` ${p.str}` : p.str;
        end = p.x + p.width;
      });
      return line.trim();
    });
}

function schoolAndDegree(programme: string): [string, string] {
  const upper = programme.toUpperCase();
  for (const [pattern, school, degree] of PROGRAMMES) if (pattern.test(upper)) return [school, degree];
  const title = programme.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return ["", title]; // unknown programme: keep the printed name and let the student pick the school
}

function printDate(text: string): Date {
  const m = PRINT_DATE.exec(text);
  const month = m ? MONTHS.indexOf(m[2].toUpperCase()) : -1;
  return m && month >= 0 ? new Date(Number(m[3]), month, Number(m[1])) : new Date();
}

/** Years since admission, counting from the academic year that starts in August. The matric number gives the
 *  admission year (U25xxxxxE joined in 2025); without one the earliest printed semester stands in for it. */
function yearOfStudy(text: string, asOf: Date): number | null {
  const m = MATRIC.exec(text);
  let admitted: number;
  if (m) admitted = 2000 + Number(m[1]);
  else {
    const starts = [...text.matchAll(SEMESTER)].map((s) => Number(s[1]));
    if (!starts.length) return null;
    admitted = Math.min(...starts);
  }
  const academicYear = asOf.getMonth() >= 7 ? asOf.getFullYear() : asOf.getFullYear() - 1;
  return Math.max(1, Math.min(5, academicYear - admitted + 1));
}

/** The parsing rules on rows of text. `asOf` pins the date used for the year of study. */
export function parseTranscriptLines(lines: string[], asOf?: Date): TranscriptFields {
  const text = lines.join("\n");

  const passed = new Set<string>();
  for (const line of lines) for (const [, code, grade] of line.matchAll(ENTRY)) if (PASSING.test(grade)) passed.add(code);
  // No rows found: codes only, so a failed course may slip in. Stop at the grading key on the last page.
  const modules = passed.size ? passed : new Set(text.split(/\bGRADINGS\b/)[0].match(CODE) ?? []);

  const cgpas = [...text.matchAll(CGPA)].map((m) => Number(m[1]));
  const cgpa = cgpas.length ? cgpas[cgpas.length - 1] : null; // a full transcript can repeat it per semester; the last is current

  const programme = (PROGRAMME.exec(text)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const [school, degree] = schoolAndDegree(programme);

  return {
    cgpa: cgpa !== null && cgpa >= 0 && cgpa <= 5 ? cgpa : null,
    school,
    degree: programme ? degree : "",
    year_of_study: yearOfStudy(text, asOf ?? printDate(text)),
    completed_modules: [...modules].sort(),
  };
}

/** Read a transcript PDF. Throws when the file is not a readable PDF or holds no text. */
export async function parseTranscriptFile(file: File, asOf?: Date): Promise<TranscriptFields> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const lines: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      const pieces = content.items.flatMap((it) =>
        "str" in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width }] : [],
      );
      lines.push(...linesFromPieces(pieces));
    }
    if (!lines.length) throw new Error("The PDF has no selectable text (scanned image?).");
    return parseTranscriptLines(lines, asOf);
  } finally {
    void task.destroy();
  }
}
