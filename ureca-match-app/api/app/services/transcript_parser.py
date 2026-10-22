"""Read an NTU examination-results transcript (PDF) into profile fields.  REQ-PROF-1, REQ-PROF-3.

    parse_transcript_pdf(pdf_bytes) -> {"cgpa", "school", "degree", "year_of_study", "completed_modules"}

NTU transcripts print semesters in two side-by-side columns, so plain text extraction lists every code, then every
grade, and loses which grade belongs to which course. pypdf's "layout" mode keeps rows together, so the module
scan runs on that and falls back to a code-only scan of the plain text when layout mode finds nothing.
Anything that cannot be found comes back as None, "" or [] so the caller can ask the student to fill it in.
"""

from __future__ import annotations

import re
from datetime import date
from io import BytesIO
from typing import TypedDict

from pypdf import PdfReader

MONTHS = {
    m: i
    for i, m in enumerate(
        [
            "JANUARY",
            "FEBRUARY",
            "MARCH",
            "APRIL",
            "MAY",
            "JUNE",
            "JULY",
            "AUGUST",
            "SEPTEMBER",
            "OCTOBER",
            "NOVEMBER",
            "DECEMBER",
        ],
        1,
    )
}

# Grades that count as completed. F, W (withdrawn), IP (in progress) and absent are left out.
# PASS = pass/fail course, AT = by attendance, EX = exempted, TC = transfer credit.
PASSING_GRADES = r"A\+|A-|A|B\+|B-|B|C\+|C|D\+|D|PASS|AT|EX|TC"

# One course entry: [*] CODE name... AU grade. A layout row can hold two entries (left and right column).
ENTRY = re.compile(r"(?<![A-Z0-9])([A-Z]{2}\d{4})(?![A-Z0-9]).*?\s\d{1,2}\.\d\s+([A-Z][A-Z+-]*)(?=\s|$)")
CODE = re.compile(r"(?<![A-Z0-9])[A-Z]{2}\d{4}(?![A-Z0-9])")
CGPA = re.compile(r"Cumulative\s+(?:Grade\s+Point\s+Average|GPA)\s*:?\s*(\d(?:\.\d{1,2})?)", re.I)
PROGRAMME = re.compile(r"PROGRAMME[ \t]*:?[ \t]*(.+?)[ \t]*:?(?:[ \t]{3,}|$)", re.M)
MATRIC = re.compile(r"(?<![A-Z0-9])U(\d{2})\d{5}[A-Z](?![A-Z0-9])")
PRINT_DATE = re.compile(r"Print\s+date\s*:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", re.I)
SEMESTER = re.compile(r"(\d{4})\s*-\s*(\d{4})\s+SEMESTER\s+\d", re.I)

# (pattern on the upper-cased programme, school code, degree name used by the profile page dropdown).
# First match wins, so combined programmes (Business & Computer Science) come before the single ones they contain.
PROGRAMMES: list[tuple[str, str, str]] = [
    (r"MATHEMATICS\s*(?:&|AND)\s*COMPUTER SCIENCE", "SPMS", "Mathematics & Computer Science"),
    (r"ACCOUNTANCY.*DATA SCIENCE", "NBS", "Accountancy & Data Science and AI"),
    (r"BUSINESS.*COMPUTER SCIENCE|COMPUTER SCIENCE.*BUSINESS", "NBS", "Business & Computer Science"),
    (r"BIOMEDICAL SCIENCES.*CHINESE MEDICINE", "SBS", "Biomedical Sciences & Chinese Medicine"),
    (r"COMPUTER SCIENCE", "CCDS", "Computer Science"),
    (r"DATA SCIENCE\s*(?:&|AND)\s*(?:AI|ARTIFICIAL)", "CCDS", "Data Science & Artificial Intelligence"),
    (r"COMPUTER ENGINEERING", "CCDS", "Computer Engineering"),
    (r"AI\s*(?:&|AND)\s*SOCIETY", "CCDS", "AI & Society"),
    (r"INFORMATION ENGINEERING", "EEE", "Information Engineering & Media"),
    (r"ELECTRICAL", "EEE", "Electrical & Electronic Engineering"),
    (r"BIOMEDICAL SCIENCES", "SBS", "Biomedical Sciences & BioBusiness"),
    (r"BIOLOGICAL SCIENCES", "SBS", "Biological Sciences"),
    (r"AEROSPACE", "MAE", "Aerospace Engineering"),
    (r"MECHANICAL", "MAE", "Mechanical Engineering"),
    (r"MATHEMATICAL SCIENCES", "SPMS", "Mathematical Sciences"),
    (r"PHYSICS", "SPMS", "Physics / Applied Physics"),
    (r"CHEMISTRY", "SPMS", "Chemistry & Biological Chemistry"),
    (r"ACCOUNTANCY", "NBS", "Accountancy"),
    (r"BUSINESS", "NBS", "Business"),
    (r"CIVIL", "CEE", "Civil Engineering"),
    (r"ENVIRONMENTAL", "CEE", "Environmental Engineering"),
    (r"MARITIME", "CEE", "Maritime Studies"),
    (r"MATERIALS", "MSE", "Materials Engineering"),
]


class TranscriptData(TypedDict):
    cgpa: float | None
    school: str
    degree: str
    year_of_study: int | None
    completed_modules: list[str]


def _read_pages(file_bytes: bytes) -> tuple[str, str]:
    """Text of every page, once in layout mode (row-aligned) and once in plain mode."""
    reader = PdfReader(BytesIO(file_bytes))
    layout = "\n".join(page.extract_text(extraction_mode="layout") or "" for page in reader.pages)
    plain = "\n".join(page.extract_text() or "" for page in reader.pages)
    return layout, plain


def _cgpa(text: str) -> float | None:
    found = CGPA.findall(text)
    if not found:
        return None
    value = float(found[-1])  # a full transcript can repeat the figure per semester; the last one is current
    return value if 0 <= value <= 5 else None


def _programme(*texts: str) -> str:
    for text in texts:
        m = PROGRAMME.search(text)
        if m and m.group(1).strip():
            return re.sub(r"\s+", " ", m.group(1)).strip()
    return ""


def _school_and_degree(programme: str) -> tuple[str, str]:
    """Map the printed programme, for example COMPUTING (COMPUTER SCIENCE), to a school code and a dropdown degree."""
    upper = programme.upper()
    for pattern, school, degree in PROGRAMMES:
        if re.search(pattern, upper):
            return school, degree
    return "", programme.title()  # unknown programme: keep the printed name and let the student pick the school


def _modules(layout: str, plain: str) -> list[str]:
    passed: set[str] = set()
    for line in layout.splitlines():
        for code, grade in ENTRY.findall(line):
            if re.fullmatch(PASSING_GRADES, grade):
                passed.add(code)
    if passed:
        return sorted(passed)
    # Layout mode found no rows. Codes only, so a failed course may slip in; stop at the grading key on the last page.
    results = re.split(r"\bGRADINGS\b", plain)[0]
    return sorted(set(CODE.findall(results)))


def _as_of(text: str) -> date:
    """Date the transcript was printed, else today."""
    m = PRINT_DATE.search(text)
    if m and m.group(2).upper() in MONTHS:
        try:
            return date(int(m.group(3)), MONTHS[m.group(2).upper()], int(m.group(1)))
        except ValueError:
            pass
    return date.today()


def _year_of_study(text: str, as_of: date) -> int | None:
    """Years since admission, counting from the academic year that starts in August.

    The matric number gives the admission year: U25xxxxxE joined in 2025. Without one, the earliest semester printed
    on the transcript stands in for it (wrong for transfer students, who have no better signal here).
    """
    m = MATRIC.search(text)
    if m:
        admitted = 2000 + int(m.group(1))
    else:
        starts = [int(s) for s, _ in SEMESTER.findall(text)]
        if not starts:
            return None
        admitted = min(starts)
    academic_year = as_of.year if as_of.month >= 8 else as_of.year - 1
    return max(1, min(5, academic_year - admitted + 1))


def parse_transcript_text(layout: str, plain: str, as_of: date | None = None) -> TranscriptData:
    """The parsing rules on already-extracted text. `as_of` pins the date used for the year of study."""
    school, degree = _school_and_degree(_programme(layout, plain))
    return {
        "cgpa": _cgpa(layout) if CGPA.search(layout) else _cgpa(plain),
        "school": school,
        "degree": degree,
        "year_of_study": _year_of_study(plain or layout, as_of or _as_of(plain or layout)),
        "completed_modules": _modules(layout, plain),
    }


def parse_transcript_pdf(file_bytes: bytes, as_of: date | None = None) -> TranscriptData:
    """Parse an NTU transcript PDF. Raises ValueError when the file is not a readable PDF or holds no text."""
    try:
        layout, plain = _read_pages(file_bytes)
    except Exception as exc:  # pypdf raises several unrelated types on bad input
        raise ValueError("Could not read the PDF.") from exc
    if not (layout.strip() or plain.strip()):
        raise ValueError("The PDF has no selectable text (scanned image?).")
    return parse_transcript_text(layout, plain, as_of)


if __name__ == "__main__":
    import json
    import sys

    for path in sys.argv[1:]:
        with open(path, "rb") as fh:
            print(path, json.dumps(parse_transcript_pdf(fh.read()), indent=2))
