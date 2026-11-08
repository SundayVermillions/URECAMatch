# Development plan and progress board

> Final submission, 8 Nov 2026: the progress table and the checklists were updated against the code, the tests and [traceability.md](traceability.md). A ticked box is done. An unticked box was not checked or was not recorded, for example a run on production.

Full guide: `docs/URECAMatch-Development-Guide.docx` (v2.0, 18 Sep 2026). It has the goal, per-slice build steps, tests, who to talk to, and cross-slice contracts. This file holds the checklists from that guide, with their final status.

## Owners

| Slice | Owner | Routers | Screens | REQ-IDs |
|---|---|---|---|---|
| A Accounts and profile | Edwin | auth, profile, users, services/storage | (auth)/*, (student)/profile, (admin)/users | REG-1..3, AUTH-1..3, PROF-1..3, USER-1..3 |
| B Projects and proposals | Robin | listings, proposals | browse, projects/[id], propose, (supervisor)/projects/*, proposals | BROWSE-1..4, PROJ-1..3, PROPOSE-1..3, REVPROP-1..3 |
| C Applications and rankings | Ian | applications, rankings | apply/[id], my-applications, projects/[id]/applicants | APPLY-1..2, SRANK-1..2, VRANK-1..3 |
| D Cycle, rounds, matching | Nicholas | cycles, matching, services/windows, services/matching | rounds, rounds/[id]/matches, approvals, audit, offer card | CYCLE-1..3, ROUND-1..3, EXEC-1..3, REV-1, PUB-1..2, ASSIGN-1..3, APPRV-1..3, OUTCOME-1..4, AUDIT-1..2 |
| E Platform | Benjamin | notifications, services/notify, services/audit, Supabase, Vercel, CI | notifications, dashboard, components/ui | NOTIF-1..2, CYCLE-3, PUB-2, NFR 5.1, 5.3, 5.4 |

Robin owns `api/app/models/__init__.py` and `api/app/db/seed_data.py`. Model changes go through Robin.

## Stages

| Stage | Exit check |
|---|---|
| 0 Onboarded | tests pass locally, every screen opens in mock, one-line PR merged |
| 1 Rules complete (mock) | every REQ-ID of the slice has a pytest and is mirrored in the mock client; traceability rows `mock` |
| 2 Live | SupabaseStore methods for the slice's tables; screens work in live mode; rows `live` |
| 3 Verified | works on the Vercel preview; part of the full-cycle demo; rows `done` |

Order for going live: E provisions Supabase, then A (sign-in and JWT), then B and C, then D, then E notifications and e-mail.

## Progress

Final status on 8 Nov 2026. The numbers come from [traceability.md](traceability.md): all 124 SRS requirements have a row there.

| Slice | Owner | Requirements | Tested | Partly tested | Untested | Gap |
|---|---|---|---|---|---|---|
| A Accounts and profile | Edwin | 24 | 19 | 0 | 1 | 4 |
| B Projects and proposals | Robin | 27 | 24 | 1 | 1 | 1 |
| C Applications and rankings | Ian | 22 | 21 | 0 | 0 | 1 |
| D Cycle, rounds, matching | Nicholas | 49 | 44 | 2 | 3 | 0 |
| E Platform | Benjamin | 2 | 2 | 0 | 0 | 0 |
| All | | 124 | 110 | 3 | 5 | 6 |

The six gaps are PROF-4, PROF-5, PROF-6, PROF-8, PROPOSE-4 and VRANK-11. The checklists below were last edited on 23 Oct 2026. A ticked box means the item is done and was checked against the code and tests on 8 Nov 2026. An unticked box was not checked or was not recorded.

## Slice A (Edwin)

Stage 0
- [x] Tools installed, tests pass locally, first PR merged

Stage 1
- [x] REG-2 codes with expiry and resend, tests green, mock client mirrors it
- [x] `services/storage.py` exists with mock implementation; names shared with B and C
- [x] PROF-1 gate confirmed in web shell; Ian informed about the API guard
- [x] PROF-3 stores a path; AUTH-1 password toggle; AUTH-3 redirect on `session_expired`
- [x] USER-1..3 screens wired; all A rows in traceability are `mock`

Stage 2
- [x] Supabase Auth register and sign-in return a real JWT; `deps.py` accepts it
- [x] `SupabaseStore` user, profile, code and document methods implemented
- [ ] `seed_auth.py` run on the dev project; all demo accounts sign in live
- [x] Deactivate bans in Auth; a deactivated user's token is refused
- [x] A rows tested in traceability.md

Stage 3
- [ ] Register-to-browse flow passes on the Vercel preview
- [ ] Demo step 1 runs on production; rows `done`

## Slice B (Robin)

Stage 0
- [x] Tools installed, tests pass locally, first PR merged

Stage 1
- [x] BROWSE-1, BROWSE-2: tests, case-insensitive filters, no cross-field keyword match; supervisor filter and early/closed banner on Browse; custom accessible FilterSelect
- [x] PROJ-1, PROJ-2: no publishing after close, drafts can be published, edit guard mirrored in mock, no blank titles; stronger PROJ-3 test; My projects, New and Edit redesigned
- [x] REVPROP-1: `Proposal` carries the student's profile and attached documents; Proposals page and drawer redesigned
- [x] REVPROP-3: accept only while the cycle is open
- [x] `round_id` rule for proposals accepted outside a round: use D's `windows.current_round()` so a match never has an empty round
- [x] PROPOSE-1..3: interests required, word limits, own documents only, active supervisors only; propose page redesigned with searchable picker
- [x] Close-listing confirmation; all B rows `mock`
- [x] UI pass on Project detail (student view): hero band and balanced detail cards
- [x] REVPROP-2, OUTCOME-1, APPLY: one project per cycle. A placed student cannot apply, propose or accept another; accepting withdraws open offers and pending proposals; student screens become view only
- [x] PROJ-1, PROF-1, PROPOSE-1: topics and NTU courses come from fixed lists (`GET /catalog/topics`, `/catalog/courses`, pickers in the UI)
- [x] PROJ-1, PROJ-2: optional project details, up to 4 photos and a YouTube or Vimeo video; project page redesigned
- [x] BROWSE-4: recommended projects, explainable fit score on Browse (`GET /me/recommendations`); search and filters in one bar

Stage 2
- [x] Covers stored in Supabase Storage via A's service (public `covers` bucket, cache-busted URL, PROJ-2 guard)
- [x] `SupabaseStore` listing and proposal methods implemented, verified live with test rows
- [ ] Browse, create, edit, close, propose, accept and decline work live; B rows `live`

Stage 3
- [ ] Demo steps 2 and 6 run on production; rows `done`

## Slice C (Ian)

Stage 0
- [x] Tools installed, tests pass locally, first PR merged

Stage 1
- [x] APPLY-1 edit endpoint plus window tests; profile guard
- [x] APPLY-2 document ownership; SRANK-1..2 tests and reorder UI
- [x] VRANK-1 filters and top-10 tests; VRANK-2 deadline test and missing-ranking warning
- [x] Document access rule tested; all C rows `mock`

Stage 2
- [x] PDF viewer renders a signed Storage URL in the drawer
- [x] `SupabaseStore` application and ranking methods implemented
- [ ] Apply, rank, filter, view, rank live; C rows `live`

Stage 3
- [ ] Demo step 3 runs on production; rows `done`

## Slice D (Nicholas)

Stage 0
- [x] Tools installed, tests pass locally, first PR merged

Stage 1
- [x] Rounds take explicit start dates; overlap and outside-cycle tests
- [x] CYCLE-1..3 tests; OUTCOME-1 withdraws others and marks ineligible
- [x] EXEC-3 rollover implemented; unassign endpoint; manual assign slot check (built and tested)
- [x] APPRV, PUB, REV, OUTCOME-3..4, AUDIT-1 tests; cron entry and tick on page load
- [x] Rounds, matches, approvals, audit screens complete; offer card on my-applications; all D rows `mock`

Stage 2
- [x] `SupabaseStore` cycle, round, match and audit methods implemented
- [ ] AUDIT-2 trigger test passes against Supabase (the trigger is checked in `schema.sql`; it has not been run against a live database)
- [ ] Round 1 executes, approves, reassigns, publishes and accepts on live seed; D rows `live`

Stage 3
- [ ] Vercel cron fires `tick` on production (the daily job is set in `api/vercel.json`; a run on production was not recorded)
- [ ] Demo steps 4 and 5 run on production; rows `done`

## Slice E (Benjamin)

Stage 0
- [x] Tools installed, tests pass locally, first PR merged

Stage 1 (platform ready)
- [x] Supabase project created; schema and seed applied; buckets and Auth settings done; keys in the shared note
- [x] Vercel web and API projects deploy (production URLs are live; previews per PR were not checked)
- [x] NOTIF-1..2 tests; unread badge; mark read and link follow in the UI
- [x] Role matrix test replaces the two hand-written role tests

Stage 2
- [ ] `seed_auth.py` run; demo accounts sign in on the preview
- [ ] Notifications persist in Supabase; e-mail sends through Resend with `EMAIL_MODE=send` in production only (code and tests done: `SupabaseStore` notification methods, `services/email.py`; not yet verified live)
- [x] Round banner on AdminDashboardPage
- [x] Shared `PdfViewer` in components/ui for Ian
- [x] Dashboards on live data; NOTIF rows `live`

Stage 3
- [ ] Playwright full-cycle journey green against the preview (spec in `web/e2e/full-cycle.spec.ts`, skipped in CI)
- [x] NFR checks recorded in traceability; rows `done`

## Definition of done for a PR

- Rule enforced in the API, not only in the UI
- pytest named `test_REQ_XXX_n_...` passes
- Mock client mirrors the rule; screen shows the error copy
- Generated files regenerated if the contract changed (`uv run python -m app.db.export`, `npm run gen`)
- `traceability.md` row updated; checkbox above ticked
- One reviewer from another slice; CI green; squash merge
