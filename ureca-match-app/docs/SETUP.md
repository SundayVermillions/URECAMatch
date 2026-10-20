# URECAMatch

Application and allocation portal for NTU URECA. SC2006 Software Engineering, SCEF Group 4.

Front end: Next.js 16 + TypeScript + Tailwind. Back end: FastAPI (Python 3.12). Database: Supabase. Hosting: Vercel.

## Run it in 5 minutes

Requirements: Node 20+, Python 3.12, [uv](https://docs.astral.sh/uv/).

```bash
# 1. Web app (works on its own with sample data)
cd web
cp .env.example .env.local        # NEXT_PUBLIC_API_MODE=mock
npm install
npm run dev                       # http://localhost:3000

# 2. API (only needed when a screen is switched to live mode)
cd api
cp .env.example .env              # API_MODE=mock
uv sync
uv run fastapi dev app/main.py    # http://localhost:8000/docs
uv run pytest                     # 44 tests
```

Sign in with any seeded account (password `password`) or use the demo buttons on the sign-in page:

| Role | Account |
|---|---|
| Student | stu-1 Wei Ling Tan, stu-33 Kavya Nair (has an offer) |
| Supervisor | sup-1 Prof. Marcus Chua |
| Admin | adm-1 Jonathan Teo |

The demo clock is fixed at 7 Sep 2026 (inside Round 2's application window) so every screen has data.

## How it fits together

```
web/lib/api/client.ts   ApiClient interface: the one contract screens use
web/lib/mock/client.ts  in-browser implementation, seeded from lib/mock/seed.json   (NEXT_PUBLIC_API_MODE=mock)
web/lib/api/live.ts     HTTP implementation against the FastAPI app                 (NEXT_PUBLIC_API_MODE=live)
web/lib/api/types.ts    GENERATED from shared/openapi.json. Never edit by hand.

api/app/models/         Pydantic models = the contract
api/app/routers/        one file per feature, tagged with the owning slice and REQ-IDs
api/app/services/       business rules; matching/algorithm.py is a pure function
api/app/db/store.py     MockStore (in memory) and SupabaseStore (fill in per slice)
api/app/db/seed_data.py single source of demo data

supabase/schema.sql     tables, enums, audit_log append-only trigger
supabase/policies.sql   RLS and storage policies: no direct client access, API only
supabase/seed.sql       GENERATED demo rows
supabase/catalog.sql    GENERATED reference lists: standard topics and NTU courses (safe to re-run)
supabase/migrations/    one-off changes for a database created from an older schema.sql
shared/openapi.json     GENERATED contract
```

### Change the contract

1. Edit a model in `api/app/models/__init__.py` or a route.
2. `cd api && uv run python -m app.db.export` (writes `shared/openapi.json`, `web/lib/mock/seed.json`, `supabase/seed.sql`).
3. `cd web && npm run gen` (writes `web/lib/api/types.ts`).
4. Commit all of it in the same PR.

### Switch a screen to live

Set `NEXT_PUBLIC_API_MODE=live` in `web/.env.local` and run the API. Mock mode sends `X-Demo-User`; live mode sends the Supabase JWT. Both are read by `api/app/deps.py`.

### Fake clock (testing a cycle without waiting)

Add `NEXT_PUBLIC_DEBUG_CLOCK=true` to `web/.env.local` and restart `npm run dev`. A clock chip appears top right. Open it to set any date and time, jump +1 hour, day or week, skip past the current window, or go back to the real clock. Every screen reloads for the new time.

In live mode the API must also allow it: put `DEBUG_CLOCK=true` in `api/.env` and restart the API. The clock moves for every user on that API, is held in memory only, and a restart resets it. Leave both flags off in production.

## Work split

Owners: Edwin (A), Robin (B), Ian (C), Nicholas (D), Benjamin (E). The full guide is `URECAMatch-Development-Guide.docx`: goal, per-slice build steps, tests, who to talk to. [DEV-PLAN.md](DEV-PLAN.md) is the live progress board. Traceability from REQ-ID to code and tests lives in [traceability.md](traceability.md).

## Deploy

- Web: import the repo into Vercel with root `ureca-match-app/web`. Env: `NEXT_PUBLIC_API_MODE=live`, `NEXT_PUBLIC_API_URL=<api url>`.
- API: second Vercel project with root `ureca-match-app/api` (Python runtime, entry `api/index.py`), or Render. Env from `api/.env.example` with `API_MODE=supabase`.
- Database: in the Supabase SQL editor, run `supabase/schema.sql`, then `supabase/policies.sql`, then `supabase/seed.sql`, then `supabase/catalog.sql`. `policies.sql` and `catalog.sql` are safe to run again. A database made before a change in `supabase/migrations/` needs those files run once, oldest first.
