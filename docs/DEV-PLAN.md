# Development plan

Full plan: `docs/URECAMatch-Development-Plan.docx` (also https://claude.ai/artifact/KcKFNG7kw97VBZhECLjjff).

## Slices

| Slice | Scope | Routers | Screens |
|---|---|---|---|
| A Accounts and profile | register, verify, sign in, profile, documents, admin users | auth, profile, users | sign-in, create-account, verify, profile, users |
| B Projects and proposals | listings CRUD, browse, self-proposed projects | listings, proposals | browse, projects/[id], projects/new, projects/[id]/edit, propose, proposals |
| C Applications and rankings | apply, withdraw, student ranking, supervisor ranking, PDF viewer | applications, rankings | apply/[id], my-applications, projects/[id]/applicants |
| D Cycle, rounds, matching | cycle, rounds, execute, review, publish, approvals, offers, audit, cron | cycles, matching | rounds, rounds/[id]/matches, approvals, my-applications (offer), audit |
| E Platform | notifications, dashboards, shared UI, CI, deploy, e2e, docs | notifications | notifications, dashboard |

## Definition of done for a PR

- Endpoint implemented in the service; mock removed for that router (`SupabaseStore`)
- Models final; `uv run python -m app.db.export` and `npm run gen` committed
- Guards enforced in the API, not only in the UI
- pytest per REQ-ID, named `test_REQ_XXX_n_...`
- `docs/traceability.md` row updated
- One reviewer from another slice
