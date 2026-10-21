"""Refresh app/db/catalog/ntu_courses.json from NTU's public Content of Courses.

  uv run python -m app.db.scrape_courses

One keyword search per vowel per semester returns every course whose title contains it, so six
searches cover a semester. The newest semester wins when a course appears more than once.
Run it once a semester, then `uv run python -m app.db.export` to refresh seed.sql and the web mock.
"""

from __future__ import annotations

import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

URL = "https://wish.wis.ntu.edu.sg/webexe/owa/AUS_SUBJ_CONT.main_display1"
SEMESTERS = ["2024_1", "2024_2", "2025_1", "2025_2", "2026_1", "2026_2"]  # oldest first
OUT = Path(__file__).resolve().parent / "catalog" / "ntu_courses.json"
CELL = r'<TD WIDTH="{w}"><B><FONT SIZE=2 COLOR=#0000FF>\s*(.*?)</FONT></B></TD>\s*'
ROW = re.compile(CELL.format(w=100) + CELL.format(w=400) + CELL.format(w=100) + CELL.format(w=100), re.S)


def search(semester: str, keyword: str) -> list[tuple[str, str, str, str]]:
    acad, sem = semester.split("_")
    form = {"acadsem": semester, "r_course_yr": "", "r_subj_code": keyword, "boption": "Search", "acad": acad, "semester": sem}
    page = urllib.request.urlopen(urllib.request.Request(URL, urllib.parse.urlencode(form).encode()), timeout=180)
    return ROW.findall(page.read().decode("latin-1"))


def main() -> None:
    courses: dict[str, dict] = {}
    for semester in SEMESTERS:
        for keyword in "AEIOUY":
            for code, title, au, dept in search(semester, keyword):
                courses[code] = {
                    "code": code,
                    "title": html.unescape(title).strip(),
                    "au": float(au) if au else None,
                    "dept": html.unescape(dept).strip(),
                    "last_offered": semester,
                }
            print(semester, keyword, len(courses))
            time.sleep(1)  # be polite to NTU's server
    OUT.write_text(json.dumps(sorted(courses.values(), key=lambda c: c["code"]), indent=0, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(courses)} courses to {OUT}")


if __name__ == "__main__":
    main()
