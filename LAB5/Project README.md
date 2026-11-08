# URECAMatch

**The application and allocation portal for NTU's Undergraduate Research Experience on Campus (URECA) programme.**
SC2006 Software Engineering · SCEF Group 4

![URECAMatch demo showcase](README%20Images/showcase.jpg)

| | |
|---|---|
| **Live web app** | <https://ureca-match-web.vercel.app> |
| **Live API (interactive docs)** | <https://ureca-match-api.vercel.app/docs> |
| **Repository** | <https://github.com/softwarelab3/2006-SCEF-A4> |
| **Requirements (SRS v1.0)** | [SRS.pdf](SRS.pdf) |
| **Submission Index** | [Submission Index](Submission%20Index.md) |

## Contents

1. [About the project](#about-the-project)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Repository structure](#repository-structure)
5. [Setup and usage](#setup-and-usage): A. browser-only mock · B. local API in mock mode · C. live on Vercel
6. [Using the app](#using-the-app)
7. [Testing](#testing)
8. [Documentation](#documentation)
9. [Team](#team)

## About the project

Today, URECA projects are listed on the NTU website as one long table of over 1,000 entries, with only a title, project ID and supervisor. Students apply by e-mailing professors one by one. They can't see how many others have applied or rank their choices, and one student may collect several offers while others get none. Supervisors manage every applicant by e-mail, and the URECA office has no view of the process.

URECAMatch replaces this with one system:

- **Supervisors** publish project listings.
- **Students** browse, search and filter them, apply with a statement and documents, and rank their applications.
- **Supervisors** rank their applicants, and the system matches students to projects in up to three rounds using both sets of rankings.
- **Supervisors** may decline a proposed match during an approval window. The system then publishes the results as offers, which students accept or decline.
- **Admins** configure cycles and rounds, assign students manually, manage accounts and read the audit log.

## Features

| Students | Project supervisors | Administrators |
|---|---|---|
| Register with an NTU e-mail and a 6-digit verification code | Create, publish, update and close project listings, or save drafts | Create and change application cycles |
| Build a profile; upload a transcript that **auto-fills CGPA and completed modules**; add a CV and research interests | Review applicants and view their documents inside the app | Configure up to three matching rounds and their windows |
| Browse, search and filter listings; **"picked for you" recommendations** with a match score | **AI score** for applicants (Google Gemini, or a local formula when no key is set), with per-project **score weights** | Review matching results; manually assign, reassign or unassign with a recorded reason |
| Apply with a statement and documents; **"Check my application"** gives draft tips | Rank applicants; matching uses the supervisor's ranking | Create, update and deactivate accounts, with impact previews |
| Rank applications by preference | Decline proposed matches during the approval window | Read the append-only **audit log** |
| Propose a self-designed project to a supervisor | Accept or decline self-proposed projects, with a reason | Dashboard of students, supervisors, projects and round status |
| Accept or decline offers; in-app and e-mail **notifications** | Notifications for new applications and results | View every project and its students (read only) |

### How a cycle runs

![Application cycle](README%20Images/application-cycle.jpg)

Each round has an **application window** (students apply and rank), a **review window** (supervisors rank applicants), then **matching**. An **approval window** follows, where supervisors may decline a match, then **results** (students accept or decline offers). Matching runs when the review window closes. Results are published when the approval window ends. Unmatched, eligible students carry over to the next round.

**Matching algorithm.** Student-proposing deferred acceptance (Gale–Shapley) with capacities (`api/app/services/matching/algorithm.py`):

- Each student proposes down their preference list.
- Each listing holds up to its open slots, keeping the students its supervisor ranked highest.
- A student the supervisor did not rank is never matched to that listing.

The result is **stable**: no student and project both prefer each other over the match they got.

## Architecture

![System architecture](README%20Images/architecture.jpg)

URECAMatch is a three-tier, layered client–server system. Each tier maps to a Boundary–Control–Entity stereotype from our analysis models.

| Tier | Stereotype | Technology | Responsibility |
|---|---|---|---|
| Presentation | Boundary | Next.js 16, React 19, TypeScript, Tailwind v4 | Screens for students, supervisors and admins |
| Application | Control | FastAPI, Python 3.12 | Guards (sign-in, role), routers (every rule and deadline), services (matching, notifications, audit, AI score) |
| Data | Entity | Supabase (Postgres, Auth, Storage) | Records, the append-only audit log, passwords, documents and photos |

**Third-party services:**
- **Vercel Cron** triggers the daily scheduler (`/internal/tick`).
- **Resend** delivers e-mail.
- **Google Gemini** returns AI applicant scores and application tips.

**Key design decisions:**

- **All rules live in the API.** The browser has no Supabase client. Every read and write goes through the API, which holds the service-role key. A Postgres trigger keeps the audit log append-only.
- **Swappable data layer.**
  - API: routers depend on a `Store` interface. `MockStore` keeps seed data in memory, and `SupabaseStore` uses Postgres. `API_MODE` chooses one.
  - Web app: it talks to the API through one `ApiClient` interface, served either in the browser (`MockClient`) or over HTTP (`LiveClient`). `NEXT_PUBLIC_API_MODE` chooses one.
- **One shared contract.** `shared/openapi.json` is generated from the API's Pydantic models, and the web app's TypeScript types are generated from it. CI fails if either is out of date.
- **Pure, testable matching.** The matching algorithm has no database, clock or I/O, so it is unit-tested with small fixtures.

Full details: [`ureca-match-app/docs/architecture.md`](https://github.com/softwarelab3/2006-SCEF-A4/blob/main/ureca-match-app/docs/architecture.md).

## Repository structure

```
2006-SCEF-A4/
├── LAB1/ … LAB5/              Lab deliverables (PDF / JPEG)
├── .github/workflows/ci.yml   CI: lint, tests, type check, build, contract check
└── ureca-match-app/
    ├── web/                   Next.js front end
    │   ├── app/               Route groups: (auth) (student) (supervisor) (admin) notifications
    │   ├── components/        Shared UI
    │   ├── lib/api/           ApiClient interface, LiveClient, generated types.ts
    │   ├── lib/mock/          In-browser MockClient and seed.json
    │   └── e2e/               Playwright end-to-end tests
    ├── api/                   FastAPI back end
    │   ├── app/routers/       One file per feature, tagged with REQ-IDs
    │   ├── app/services/      Business rules: matching, windows, notify, email, audit, AI match…
    │   ├── app/db/            MockStore, SupabaseStore, seed data, contract export
    │   ├── tests/             pytest suite, one file per requirement group
    │   └── vercel.json        Singapore region (sin1) and the daily cron job
    ├── supabase/              schema.sql, policies.sql, seed.sql, catalog.sql, migrations/
    ├── shared/openapi.json    Generated API contract
    └── docs/                  Setup, architecture, contributing, traceability, demo setup
```

## Setup and usage

URECAMatch runs in three ways. Choose by what you need:

| Setup | Web app | API | Data | Best for |
|---|---|---|---|---|
| **A. Browser-only mock** | `NEXT_PUBLIC_API_MODE=mock` | not needed | Inside one browser tab | Quick look at the UI |
| **B. Local mock API** *(recommended for demos)* | `NEXT_PUBLIC_API_MODE=live` | `API_MODE=mock` | In the API's memory, shared by all tabs | Full multi-role demo on one laptop |
| **C. Live on Vercel** | Deployed, `live` | Deployed, `API_MODE=supabase` | Supabase Postgres | The real, hosted system |

**Prerequisites (A and B):** Node.js 20+, Python 3.12, [uv](https://docs.astral.sh/uv/), Git. For B, [Mailpit](https://github.com/axllent/mailpit/releases) shows e-mails locally. All commands below run from `ureca-match-app/`.

```bash
git clone https://github.com/softwarelab3/2006-SCEF-A4.git
cd 2006-SCEF-A4/ureca-match-app
```

### A. Browser-only mock (no API)

```bash
cd web
echo NEXT_PUBLIC_API_MODE=mock > .env.local
npm install
npm run dev                # http://localhost:3000
```

Sign in with a demo button on the sign-in page, or with a seeded account (password `password`).

- **Data lives in one browser tab.** Use one tab and switch actors with **Sign out** and **Sign in**.
- **Don't reload the page.** Reloading resets the data.

### B. Local API in mock mode (recommended demo setup)

This setup runs everything on one laptop:
- **Web app:** `live` mode.
- **API:** `mock` mode. Data is held in memory, so restarting the API resets it.
- **Mail:** e-mails are caught by Mailpit.
- **Fake clock:** moves through the whole cycle in minutes.

Several browser tabs act as the student, supervisor and admin.

**1. Create `api/.env`.** Paste this block. Don't copy `.env.example`: its inline comments are read as values.

```
API_MODE=mock
DEBUG_CLOCK=true
EMAIL_MODE=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
EMAIL_FROM=URECAMatch <noreply@urecamatch.xyz>
EMAIL_ALLOWLIST=
APP_URL=http://localhost:3000
SESSION_MINUTES=30
APPROVED_EMAIL_DOMAINS=e.ntu.edu.sg,ntu.edu.sg
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
```

- **`EMAIL_ALLOWLIST`:** leave it empty to e-mail every account, or list your own test addresses (comma-separated, no spaces).
- **`GEMINI_API_KEY`:** leave it empty to use the local scoring formula. The app labels these results "Scored locally".

**2. Create `web/.env.local`:**

```
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_DEBUG_CLOCK=true
NEXT_PUBLIC_DEMO_ACCOUNTS=true
```

**3. Start the three processes,** each in its own terminal and in this order:

| Terminal | Folder | Command | Check |
|---|---|---|---|
| 1 Mailpit | Mailpit folder | `mailpit` (Windows: `.\mailpit.exe`) | <http://localhost:8025> shows the inbox |
| 2 API | `ureca-match-app/api` | `uv sync` then `uv run fastapi dev app/main.py` | <http://localhost:8000/health> returns `{"ok":true}`; <http://localhost:8000/docs> shows the API |
| 3 Web | `ureca-match-app/web` | `npm install` then `npm run dev` | <http://localhost:3000> shows the sign-in page |

**4. Open one new tab per actor.** Type `localhost:3000` into a fresh tab, not a duplicate tab, because each tab keeps its own sign-in. After one actor acts, refresh the other tabs.

| Role | Seeded account (password `password`) |
|---|---|
| Student | Wei Ling Tan (`stu-1`); Kavya Nair (`stu-33`, already has an offer) |
| Supervisor | Prof. Marcus Chua, `marcus.chua@ntu.edu.sg` |
| Admin | Jonathan Teo, `jonathan.teo@ntu.edu.sg` |

New students can also sign up with any `@e.ntu.edu.sg` address. The verification code arrives in Mailpit.

**5. Move through the cycle with the clock chip** (top right). The demo starts on **3 Nov 2026, 5:00 pm SGT**, when Round 2 applications open. Refresh after each jump, because matching and publishing run on the next request.

| Set the clock to | What happens |
|---|---|
| 3 Nov 2026, 5:00 pm | Round 2 applications open |
| 8 Nov 2026, 6:00 pm | Review window: supervisors rank applicants |
| 10 Nov 2026, 6:00 pm | Approval window: matches exist; supervisors may decline; admin can assign |
| 12 Nov 2026, 6:00 pm | Results: students accept or decline offers |
| 15 Nov 2026, 6:00 pm | Round 3 applications for unmatched students |

**Reset:** stop and restart the API (all data and the clock return to the seed), then close all tabs and clear Mailpit.

The step-by-step demo flow and troubleshooting are in [`docs/DEMO-SETUP.md`](https://github.com/softwarelab3/2006-SCEF-A4/blob/main/ureca-match-app/docs/DEMO-SETUP.md).

### C. Live on Vercel

**To use it:**

1. Open <https://ureca-match-web.vercel.app>.
2. Sign in with a seeded account (same names as above, password `password`).

The live site uses real dates and the shared Supabase database. Only allow-listed team addresses receive e-mail, so sign up with your own NTU address only if it is on the allowlist. Verification e-mails may land in the Junk folder in NTU Outlook.

**To deploy your own copy:**

1. **Database (Supabase, region ap-southeast-1).** In the SQL Editor, run these in order:
   1. `supabase/schema.sql`
   2. `supabase/policies.sql`
   3. `supabase/seed.sql`
   4. `supabase/catalog.sql`

   A database created from an older schema also needs the files in `supabase/migrations/`, run once, oldest first. Then create the seeded sign-ins with `uv run python seed_auth.py`, run from `api/`.
2. **API project on Vercel.**
   - Root directory: `ureca-match-app/api`. `vercel.json` sets the Singapore region and the daily cron job.
   - Environment variables:

     | Variable | Value |
     |---|---|
     | `API_MODE` | `supabase` |
     | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` | From your Supabase project |
     | `CRON_SECRET` | Any secret value |
     | `EMAIL_MODE` | `send` |
     | `RESEND_API_KEY`, `EMAIL_FROM` | From your Resend account |
     | `EMAIL_ALLOWLIST` | Recommended on any deployment with seeded data |
     | `APP_URL` | The URL of your web project |
     | `APPROVED_EMAIL_DOMAINS` | `e.ntu.edu.sg,ntu.edu.sg` |
     | `GEMINI_API_KEY` | Optional |

   - Never set `DEBUG_CLOCK=true` in production.
3. **Web project on Vercel.**
   - Root directory: `ureca-match-app/web`.
   - Environment variables: `NEXT_PUBLIC_API_MODE=live` and `NEXT_PUBLIC_API_URL=<your API URL>`.
4. **Deploy only from `main`.** Every change goes through a reviewed pull request, and CI must pass first.

## Using the app

Screenshots are from the live site, which uses the shared Supabase database and real e-mail.

### As a student

**1. Sign up** with your NTU e-mail. Choose Student or Project Supervisor.

![Create account](README%20Images/01-create-account.jpg)
*Create an account with an NTU address.*

**2. Verify your e-mail.** A 6-digit code arrives within seconds, and it works for 10 minutes. NTU Outlook may file it under **Junk**, so check there, or add `noreply@urecamatch.xyz` to your safe senders.

![Verification e-mail](README%20Images/02-verification-email.jpg)
*The verification e-mail, sent through Resend.*

**3. Complete My profile.** Upload your transcript PDF: your CGPA and completed modules fill in automatically. Then add research interests and any other documents, and save.

![My profile](README%20Images/03-profile.jpg)
*CGPA and modules auto-filled from the transcript.*

**4. Browse projects.** Search and filter by school, topic and supervisor. The counter at the top right shows how long the current round stays open.

![Browse projects](README%20Images/04-browse.jpg)
*All published projects, with slots and applicant counts.*

**5. Apply.** Write a statement of interest (at least 50 characters) and choose which documents to attach. Press **Check my application** for private tips before you submit. The supervisor never sees these tips.

![Apply with tips](README%20Images/05-apply-tips.jpg)
*The tips flag a missing prerequisite and a missing CV before submitting.*

**6. Propose your own project (optional).** A four-step form: choose a supervisor, describe the project, explain why this supervisor, then review and send.

![Propose a project](README%20Images/06-proposal-review.jpg)
*The last step of a self-proposal, before sending.*

**7. My applications.** Reorder your preferences with the arrows; matching uses this order. Self-proposals are listed separately with their status. When results are published, accept or decline your offer here.

![My applications](README%20Images/07-my-applications.jpg)
*One ranked application and one submitted self-proposal.*

### As a project supervisor

**1. My projects.** Create, edit and close listings. Open **Applicants** on a listing to review who applied.

![My projects](README%20Images/08-supervisor-projects.jpg)
*The supervisor's published projects.*

**2. Review and rank applicants.**
- Filter by prerequisites, and sort by CGPA or AI score.
- **AI score** asks Gemini to read each application and its documents, then gives a 0–100 fit score with a reason. **Weights** sets how much each factor counts for this project. Without Gemini, a local formula scores instead.
- Add applicants to **Your ranking** and drag to reorder. It saves automatically, and only ranked applicants can be matched.

![Applicants and ranking](README%20Images/09-supervisor-ranking.jpg)
*Scored by Gemini, with all three applicants ranked.*

**3. Student proposals.** Read the proposal and its documents, then **Accept and register**, or **Decline** with a reason the student will see.

![Student proposals](README%20Images/10-supervisor-proposals.jpg)
*A self-proposal waiting for the supervisor's decision.*

**4. Match approvals.** In the approval window, decline any proposed match you don't want. Matches you don't decline are accepted.

### As an administrator

**1. Application Cycle.** Create the cycle, then open **Cycle settings** to set up to three rounds. Each round has an application, a review and an approval window. The form checks the dates, for example that students have time to answer offers before the cycle closes.

![Cycle settings](README%20Images/11-admin-cycle-settings.jpg)
*Three rounds, each with application, review and approval windows.*

**2. Dashboard.** Shows the current round, a timeline of all rounds, and counts of students, supervisors, projects and applications. It also shows supply and demand by school, and round readiness.

![Admin dashboard](README%20Images/12-admin-dashboard.jpg)
*Round 1 is open, with 6 days left.*

**3. Overrides.** Manually assign, reassign or unassign a student. A written justification is required.

**4. User Management.** Edit accounts and roles, or deactivate an account:
- A role change asks for confirmation.
- Deactivating an account first shows a preview of what it affects.

**5. Audit Log.** Every administrative action: who did it, when and why.

## Testing

```bash
cd ureca-match-app/api && uv run pytest        # API unit and integration tests
cd ureca-match-app/web && npm run e2e          # Playwright end-to-end tests (full cycle, demo timeline)
cd ureca-match-app/web && npm run lint && npm run typecheck
```

- **API tests:** each test file is named after the requirements it covers (for example `test_REQ_EXEC_algorithm.py` and `test_REQ_APPRV_and_ASSIGN.py`). Tests call the API through FastAPI's test client against a fresh in-memory store.
- **End-to-end:**
  - The **Playwright** specs drive the whole application cycle in a browser.
  - The team also ran **manual end-to-end tests** on the deployed system, playing all three roles across the web app, the API, Supabase and e-mail.
- **CI** (`.github/workflows/ci.yml`) runs on every pull request and push to `main`:
  - API: Ruff lint and pytest.
  - Contract: checks that `openapi.json` and `types.ts` are up to date.
  - Web: ESLint, TypeScript type check and a production build.
- **Traceability:** `docs/traceability.md` maps every requirement ID to its endpoint, screen and test.

## Documentation

| Document | Location |
|---|---|
| Software Requirements Specification (v1.0) | [`LAB5/SRS.pdf`](SRS.pdf) |
| Setup guide | [`ureca-match-app/docs/SETUP.md`](https://github.com/softwarelab3/2006-SCEF-A4/blob/main/ureca-match-app/docs/SETUP.md) |
| Demo setup and script | [`ureca-match-app/docs/DEMO-SETUP.md`](https://github.com/softwarelab3/2006-SCEF-A4/blob/main/ureca-match-app/docs/DEMO-SETUP.md) |
| Architecture | [`ureca-match-app/docs/architecture.md`](https://github.com/softwarelab3/2006-SCEF-A4/blob/main/ureca-match-app/docs/architecture.md) |
| Contributing (branching, reviews, tests) | [`ureca-match-app/docs/CONTRIBUTING.md`](https://github.com/softwarelab3/2006-SCEF-A4/blob/main/ureca-match-app/docs/CONTRIBUTING.md) |
| Traceability matrix | [`ureca-match-app/docs/traceability.md`](https://github.com/softwarelab3/2006-SCEF-A4/blob/main/ureca-match-app/docs/traceability.md) |
| API specification (OpenAPI) | [`ureca-match-app/shared/openapi.json`](https://github.com/softwarelab3/2006-SCEF-A4/blob/main/ureca-match-app/shared/openapi.json); browsable at `/docs` on any running API |
| Class diagram | [`ureca-match-app/docs/class-diagram.mermaid`](https://github.com/softwarelab3/2006-SCEF-A4/blob/main/ureca-match-app/docs/class-diagram.mermaid); SRS Appendix C |
| Lab deliverables (Labs 1–5) | [`LAB1/` … `LAB5/`](https://github.com/softwarelab3/2006-SCEF-A4/tree/main) |

## Team

SCEF Group 4. The system was built in five vertical slices, each owning its routers, screens and tests.

| Member | Slice | Scope |
|---|---|---|
| Edwin Tan Qi Lun | A | Accounts, profiles, user management |
| Robin Teoh | B | Project listings, self-proposed projects |
| Ian Tan | C | Applications, preference and applicant rankings |
| Nicholas Ng | D | Cycles, rounds, matching, offers |
| Benjamin Ng | E | Notifications, dashboards, e-mail, audit, platform and deployment |

<sub>SC2006 Software Engineering, Nanyang Technological University, AY2026/27 Semester 1.</sub>
