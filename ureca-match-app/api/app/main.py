"""URECAMatch API.

Run locally:  uv run fastapi dev app/main.py   (docs at http://localhost:8000/docs)
Export contract:  uv run python -m app.db.export
"""

from __future__ import annotations

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.errors import ApiError
from app.routers import (
    applications,
    auth,
    catalog,
    cycles,
    debug,
    listings,
    matching,
    notifications,
    profile,
    proposals,
    rankings,
    users,
)
from app.services.session_token import EXPIRES_HEADER, TOKEN_HEADER, issue_session_token
from app.settings import get_settings

get_settings()  # fail at start-up, not on the first request, if the settings are unsafe (EMAIL_MODE=smtp in production)

app = FastAPI(
    title="URECAMatch API",
    version="0.1.0",
    description="Boundary for the URECAMatch web app. Every rule from SRS section 4 is enforced here.",
    # REQ-EXEC-6, REQ-PUB-4: before any request is handled, run whatever the clock says is due (matching, publishing,
    # offer timeouts), so nobody has to be awake when a window closes.
    dependencies=[Depends(debug.sync_clock), Depends(matching.keep_schedule)],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://*.vercel.app"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[TOKEN_HEADER, EXPIRES_HEADER],  # so the browser can read the refreshed session token
)


@app.middleware("http")
async def refresh_session(request: Request, call_next):
    """REQ-AUTH-3: sliding session. A request that a JWT authenticated (deps.current_user sets session_user) and that
    succeeded gets a fresh token, so the session ends SESSION_MINUTES after the last request, not after sign-in.
    Mock X-Demo-User requests never set session_user, so they get no token."""
    response = await call_next(request)
    user = getattr(request.state, "session_user", None)
    if user is not None and response.status_code < 400:
        settings = get_settings()
        token, expires_at = issue_session_token(user, settings, settings.now())
        response.headers[TOKEN_HEADER] = token
        response.headers[EXPIRES_HEADER] = expires_at.isoformat()
    return response


for r in (auth, profile, users, listings, proposals, applications, rankings, cycles, matching, notifications, catalog, debug):
    app.include_router(r.router)


@app.exception_handler(ApiError)
async def api_error(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.detail)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    loc = [str(x) for x in first.get("loc", []) if x not in ("body", "query")]
    return JSONResponse(
        status_code=422,
        content={"code": "invalid", "message": first.get("msg", "Invalid input."), "field": ".".join(loc) or None},
    )


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"ok": True}
