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

app = FastAPI(
    title="URECAMatch API",
    version="0.1.0",
    description="Boundary for the URECAMatch web app. Every rule from SRS section 4 is enforced here.",
    # REQ-EXEC-4, REQ-PUB-3: before any request is handled, run whatever the clock says is due (matching, publishing,
    # offer timeouts), so nobody has to be awake when a window closes.
    dependencies=[Depends(matching.keep_schedule)],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://*.vercel.app"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, profile, users, listings, proposals, applications, rankings, cycles, matching, notifications, debug):
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
