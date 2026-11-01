"""Recommended projects for a student (REQ-BROWSE-4, 6, 7). A local, explainable fit score; no AI needed.

Score out of 100:
- interests 50: the student's research interests against the project's topic tags. Both come from the
  standard topic list, so matches are exact: one shared topic earns 40, two or more earn 50. Topic groups are
  too broad to count ("Computing and AI" holds 20 topics), so a near miss earns nothing rather than a vague claim.
- readiness 30: the share of the project's prerequisites the student has passed (no prerequisites: 30).
- chance 20: fewer applicants per open slot scores higher. This spreads students across projects instead of
  everyone piling onto the same few, which helps both sides of the match.
The mock client mirrors this file (web/lib/mock/client.ts, recommendations()).
"""

from __future__ import annotations

from app.models import FitParts, Listing, Recommendation, StudentProfile

INTEREST_PTS = {0: 0, 1: 40}  # two or more shared topics: 50


def _round(x: float) -> int:
    """Half rounds up, like Math.round in the mock client (Python's round() would round 0.5 to even)."""
    return int(x + 0.5)


def fit(lst: Listing, sp: StudentProfile) -> Recommendation:
    shared = [t for t in lst.topic_tags if t in sp.research_interests]
    interest_pts = INTEREST_PTS.get(len(shared), 50)

    met = [p for p in lst.prerequisites if p in sp.completed_modules]
    missing = [p for p in lst.prerequisites if p not in sp.completed_modules]
    readiness_pts = _round(30 * len(met) / len(lst.prerequisites)) if lst.prerequisites else 30

    open_slots = max(lst.available_slots - lst.filled_slots, 1)
    per_slot = (lst.applicant_count or 0) / open_slots
    chance_pts = _round(20 / (1 + per_slot / 2))

    reasons, gaps = [], []
    if shared:
        reasons.append("Matches your interest in " + " and ".join(shared[:2]))
    if met:
        reasons.append("You have " + ", ".join(met))
    elif not lst.prerequisites:
        reasons.append("No prerequisites")
    if missing:
        gaps.append("Missing " + ", ".join(missing))
    if per_slot <= 2:
        reasons.append("Few applicants so far" if per_slot else "No applicants yet")
    elif per_slot > 5:
        gaps.append(f"High demand: {_round(per_slot)} applicants per slot")

    parts = FitParts(interests=interest_pts, readiness=readiness_pts, chance=chance_pts)
    return Recommendation(listing=lst, score=interest_pts + readiness_pts + chance_pts, parts=parts, reasons=reasons, gaps=gaps)


def recommend(listings: list[Listing], sp: StudentProfile, limit: int) -> list[Recommendation]:
    """Best fit first. Projects with no interest overlap are left out: a recommendation must be about the student."""
    scored = [fit(lst, sp) for lst in listings]
    scored = [r for r in scored if r.parts.interests > 0]
    scored.sort(key=lambda r: (-r.score, r.listing.title))
    return scored[:limit]
