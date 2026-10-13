"""Slice E. SRS 5.3.2: every request is authorised by role.

One case per endpoint in shared/openapi.json and per role that must be refused. Admin and
supervisor endpoints are recognised by prefix; student-only endpoints are listed below.
"""

import json
import re
from pathlib import Path

import pytest

OPENAPI = json.loads((Path(__file__).resolve().parents[2] / "shared" / "openapi.json").read_text(encoding="utf-8"))
ENDPOINTS = [(m.upper(), p) for p, ops in OPENAPI["paths"].items() for m in ops]

# Skipped, no role to check:
#   public: POST /auth/register, /auth/verify, /auth/resend, /auth/sign-in; GET /health;
#           POST /internal/tick (guarded by the cron secret, not a role); GET /debug/clock (DEBUG_CLOCK gate)
#   auth-only, any active role: GET /me, /cycle, /listings, /listings/{listing_id}, /supervisors,
#           /documents/{document_id}/view (owner or supervisor rule, see REQ-VRANK-3),
#           /me/notifications; POST /me/notifications/{notification_id}/read; PUT, DELETE /debug/clock
PUBLIC = {
    ("POST", "/auth/register"), ("POST", "/auth/verify"), ("POST", "/auth/resend"), ("POST", "/auth/sign-in"),
    ("GET", "/health"), ("POST", "/internal/tick"), ("GET", "/debug/clock"),
}
AUTH_ONLY = {
    ("GET", "/me"), ("GET", "/cycle"), ("GET", "/listings"), ("GET", "/listings/{listing_id}"), ("GET", "/supervisors"),
    ("GET", "/documents/{document_id}/view"), ("GET", "/me/notifications"),
    ("POST", "/me/notifications/{notification_id}/read"), ("PUT", "/debug/clock"), ("DELETE", "/debug/clock"),
}
STUDENT_ONLY = {
    ("GET", "/me/profile"), ("PUT", "/me/profile"), ("POST", "/me/documents"),
    ("POST", "/proposals"), ("GET", "/me/proposals"),
    ("GET", "/me/applications"), ("POST", "/applications"), ("DELETE", "/applications/{application_id}"),
    ("PUT", "/me/ranking"), ("GET", "/me/match"), ("POST", "/me/match/accept"), ("POST", "/me/match/decline"),
}
DEMO_USER = {"student": "stu-1", "supervisor": "sup-1", "admin": "adm-1"}


def allowed_role(method: str, path: str) -> str | None:
    if (method, path) in PUBLIC | AUTH_ONLY:
        return None
    if path.startswith("/admin/"):
        return "admin"
    if path.startswith("/supervisor/"):
        return "supervisor"
    if (method, path) in STUDENT_ONLY:
        return "student"
    raise AssertionError(f"{method} {path} is not classified; add it to a set in {__file__}")


MATRIX = [
    pytest.param(method, path, wrong, id=f"{method} {path} as {wrong}")
    for method, path in ENDPOINTS
    if (role := allowed_role(method, path))
    for wrong in DEMO_USER
    if wrong != role
]


def test_NFR_5_3_2_every_endpoint_classified():
    for method, path in ENDPOINTS:
        allowed_role(method, path)  # raises for a new endpoint nobody has classified


@pytest.mark.parametrize("method,path,wrong_role", MATRIX)
def test_NFR_5_3_2_role_matrix(method, path, wrong_role, client_for):
    url = re.sub(r"\{[^}]+\}", "x-1", path)  # the role guard runs before any lookup, so ids need not exist
    r = client_for(DEMO_USER[wrong_role]).request(method, url, json={} if method in ("POST", "PUT", "PATCH") else None)
    assert r.status_code == 403, f"{method} {path} as {wrong_role}: {r.status_code} {r.text}"
    assert r.json()["code"] == "forbidden"
