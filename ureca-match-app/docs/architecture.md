# Architecture

Boundary, Control, Entity (for the lab report):

| Layer | Where | Examples |
|---|---|---|
| Boundary | `web/app/**` routes and `web/components/**` | BrowseProjectPage, ApplicantAndRankingsPage, MatchingRoundsPage |
| Control | `api/app/routers/**` (request handling) and `api/app/services/**` (rules) | windows.phase, matching.algorithm.match, notify, audit |
| Entity | `api/app/models`, `supabase/schema.sql` | User, ProjectListing, Application, MatchingRound, MatchResult |

Request path: browser -> `web/lib/api/client.ts` -> (mock in browser | HTTPS to FastAPI) -> router -> service -> store -> Supabase.

Design patterns in use:
- Strategy: `ApiClient` has two implementations (mock, live) chosen at runtime.
- Repository: `Store` protocol with `MockStore` and `SupabaseStore`.
- Pure function core: `services/matching/algorithm.py` has no I/O so it is unit-testable and swappable.
- Single source of truth: models generate the OpenAPI contract, the TS types, the seed JSON and the seed SQL.
