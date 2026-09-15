# URECAMatch (SC2006, SCEF Group 4)

Team repo. Lab deliverables in LAB1/ and LAB2/ (the SRS is LAB2/LAB 2 (SRS).pdf and is the source of truth).
The application lives in `ureca-match-app/`.

## Layout
- `ureca-match-app/web`  Next.js 16 + Tailwind v4. Runs alone in mock mode: `npm run dev`.
- `ureca-match-app/api`  FastAPI (Python 3.12, uv). `uv run fastapi dev app/main.py`, tests `uv run pytest`.
- `ureca-match-app/supabase`  schema.sql and generated seed.sql.
- `ureca-match-app/shared/openapi.json` and `web/lib/api/types.ts` are generated: `uv run python -m app.db.export` then `npm run gen`.
- Plan, contributing guide, traceability: `ureca-match-app/docs/`.
- UI prototype and style guide: `../mockups/` (sibling folder, not in this repo).

## Rules
- Follow the SRS where it differs from the prototype.
- Guards live in the API routers, never only in the UI. Tag code and tests with REQ-IDs.
- Never edit generated files. Never insert into notifications or audit_log directly (use services).
- Work on branches, PR to main with one review. CI: ruff, pytest, lint, typecheck, build.
- Writing style for docs and copy: plain English, no em-dashes, minimal prose.

## Demo
Fixed clock 7 Sep 2026 (Round 2 application window). Accounts stu-1, stu-33 (has offer), sup-1, adm-1. Password "password". Verify code 000000.
