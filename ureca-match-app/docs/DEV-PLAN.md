# Development plan and progress board

Full guide: `docs/URECAMatch-Development-Guide.docx` (v2.0, 18 Sep 2026). It has the goal, per-slice build steps, tests, who to talk to, and cross-slice contracts. This file is the live copy of its checklists. Tick items here in the same PR as the work, and update `docs/traceability.md`.

## Owners

| Slice | Owner | Routers | Screens | REQ-IDs |
|---|---|---|---|---|
| A Accounts and profile | Edwin | auth, profile, users, services/storage | (auth)/*, (student)/profile, (admin)/users | REG-1..3, AUTH-1..3, PROF-1..3, USER-1..3 |
| B Projects and proposals | Robin | listings, proposals | browse, projects/[id], propose, (supervisor)/projects/*, proposals | BROWSE-1..3, PROJ-1..3, PROPOSE-1..3, REVPROP-1..3 |
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

| Slice | Stage 0 | Stage 1 | Stage 2 | Stage 3 | REQ-IDs with a test |
|---|---|---|---|---|---|
| A Edwin | | 3 / 12 | | | REG-1, REG-3, AUTH-2 |
| B Robin | done | 12 / 12 | | | all 12: BROWSE-1..3, PROJ-1..3, PROPOSE-1..3, REVPROP-1..3 |
| C Ian | | 3 / 7 | | | APPLY-2, SRANK-2, VRANK-1 |
| D Nicholas | | 4 / 24 | | | EXEC-1, EXEC-2, EXEC-3, ASSIGN-2 |
| E Benjamin | | 0 / 2 | | | role tests only |

16 of 45 REQ-IDs have a test (18 Sep 2026).

## Slice A (Edwin)

Stage 0
- [ ] Tools installed, tests pass locally, first PR merged

Stage 1
- [ ] REG-2 codes with expiry and resend, tests green, mock client mirrors it
- [ ] `services/storage.py` exists with mock implementation; names shared with B and C
- [ ] PROF-1 gate confirmed in web shell; Ian informed about the API guard
- [ ] PROF-3 stores a path; AUTH-1 password toggle; AUTH-3 redirect on `session_expired`
- [ ] USER-1..3 screens wired; all A rows in traceability are `mock`

Stage 2
- [ ] Supabase Auth register and sign-in return a real JWT; `deps.py` accepts it
- [ ] `SupabaseStore` user, profile, code and document methods implemented
- [ ] `seed_auth.py` run on the dev project; all demo accounts sign in live
- [ ] Deactivate bans in Auth; a deactivated user's token is refused
- [ ] A rows `live`

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
- [ ] `round_id` rule for proposals accepted outside a round, agreed with D
- [x] PROPOSE-1..3: interests required, word limits, own documents only, active supervisors only; propose page redesigned with searchable picker
- [x] Close-listing confirmation; all B rows `mock`
- [ ] UI pass on Project detail (student view)

Stage 2
- [ ] Covers stored in Supabase Storage via A's service
- [ ] `SupabaseStore` listing and proposal methods implemented
- [ ] Browse, create, edit, close, propose, accept and decline work live; B rows `live`

Stage 3
- [ ] Demo steps 2 and 6 run on production; rows `done`

## Slice C (Ian)

Stage 0
- [ ] Tools installed, tests pass locally, first PR merged

Stage 1
- [ ] APPLY-1 edit endpoint plus window tests; profile guard
- [ ] APPLY-2 document ownership; SRANK-1..2 tests and reorder UI
- [ ] VRANK-1 filters and top-10 tests; VRANK-2 deadline test and missing-ranking warning
- [ ] Document access rule tested; all C rows `mock`

Stage 2
- [ ] PDF viewer renders a signed Storage URL in the drawer
- [ ] `SupabaseStore` application and ranking methods implemented
- [ ] Apply, rank, filter, view, rank live; C rows `live`

Stage 3
- [ ] Demo step 3 runs on production; rows `done`

## Slice D (Nicholas)

Stage 0
- [ ] Tools installed, tests pass locally, first PR merged

Stage 1
- [ ] Rounds take explicit start dates; overlap and outside-cycle tests
- [ ] CYCLE-1..3 tests; OUTCOME-1 withdraws others and marks ineligible
- [ ] EXEC-3 rollover implemented with Ian's review; unassign endpoint; manual assign slot check
- [ ] APPRV, PUB, REV, OUTCOME-3..4, AUDIT-1 tests; cron entry and tick on page load
- [ ] Rounds, matches, approvals, audit screens complete; offer card on my-applications; all D rows `mock`

Stage 2
- [ ] `SupabaseStore` cycle, round, match and audit methods implemented
- [ ] AUDIT-2 trigger test passes against Supabase
- [ ] Round 1 executes, approves, reassigns, publishes and accepts on live seed; D rows `live`

Stage 3
- [ ] Vercel cron fires `tick` on production
- [ ] Demo steps 4 and 5 run on production; rows `done`

## Slice E (Benjamin)

Stage 0
- [ ] Tools installed, tests pass locally, first PR merged

Stage 1 (platform ready)
- [ ] Supabase project created; schema and seed applied; buckets and Auth settings done; keys in the shared note
- [ ] Vercel web and API projects deploy; preview per PR confirmed
- [ ] NOTIF-1..2 tests; unread badge; mark read and link follow in the UI
- [ ] Role matrix test replaces the two hand-written role tests

Stage 2
- [ ] `seed_auth.py` run; demo accounts sign in on the preview
- [ ] Notifications persist in Supabase; e-mail sends through Resend with `EMAIL_MODE=send` in production only
- [ ] Dashboards on live data; NOTIF rows `live`

Stage 3
- [ ] Playwright full-cycle journey green against the preview
- [ ] NFR checks recorded in traceability; rows `done`

## Definition of done for a PR

- Rule enforced in the API, not only in the UI
- pytest named `test_REQ_XXX_n_...` passes
- Mock client mirrors the rule; screen shows the error copy
- Generated files regenerated if the contract changed (`uv run python -m app.db.export`, `npm run gen`)
- `traceability.md` row updated; checkbox above ticked
- One reviewer from another slice; CI green; squash merge
