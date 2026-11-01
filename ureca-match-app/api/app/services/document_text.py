"""Read the text of an uploaded PDF for AI match (REQ-VRANK-4). Runs once, at upload.

Contact details and ID numbers are removed before the text is stored, so they never reach Gemini.
A scan has no text layer and comes back as "", which the supervisor is told about.
"""

from __future__ import annotations

import logging
import re
from io import BytesIO

from pypdf import PdfReader

log = logging.getLogger(__name__)

MAX_PAGES = 15
MAX_CHARS = 30_000
PRIVATE = [
    re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),  # e-mail
    re.compile(r"(?<![A-Za-z0-9])U\d{7}[A-Z](?![A-Za-z0-9])"),  # NTU matric number
    re.compile(r"(?<![A-Za-z0-9])[STFGM]\d{7}[A-Z](?![A-Za-z0-9])"),  # NRIC or FIN
    re.compile(r"(?<![\d.])(?:\+?65[ -]?)?[689]\d{3}[ -]?\d{4}(?!\d)"),  # Singapore phone number
]


def scrub(text: str) -> str:  # REQ-VRANK-10
    for pattern in PRIVATE:
        text = pattern.sub("[removed]", text)
    return text


def extract_text(data: bytes) -> str:
    """The PDF's text, tidied and without private details. "" when none can be read. Never raises."""
    try:
        pages = PdfReader(BytesIO(data)).pages[:MAX_PAGES]
        text = "\n".join(p.extract_text() or "" for p in pages)
    except Exception as e:  # a damaged PDF can still be stored and viewed; it just cannot be read for scoring
        log.info("Could not read a PDF's text: %s", type(e).__name__)
        return ""
    text = re.sub(r"[ \t]+", " ", text.replace("\x00", ""))  # Postgres text cannot hold NUL
    return scrub(re.sub(r"\n\s*\n+", "\n", text)).strip()[:MAX_CHARS]
