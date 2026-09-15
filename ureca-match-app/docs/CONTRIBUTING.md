# How to work on URECAMatch

Read this once. It takes 10 minutes and covers everything you need to ship your slice.

## 1. Set up (once, 10 minutes)

Install: Node 20+, Python 3.12, [uv](https://docs.astral.sh/uv/). Mac: `brew install node python@3.12 uv`.

```bash
git clone https://github.com/softwarelab3/2006-SCEF-A4.git
cd 2006-SCEF-A4/ureca-match-app

# web app (all screens work on sample data, no backend needed)
cd web && cp .env.example .env.local && npm install && npm run dev      # http://localhost:3000

# API (second terminal)
cd ../api && cp .env.example .env && uv sync && uv run pytest           # 44 tests pass
uv run fastapi dev app/main.py                                          # http://localhost:8000/docs
```

Sign in at localhost:3000 with a demo button, or any seeded e-mail with password `password`. Demo code for e-mail verification is `000000`. The demo clock is fixed at 7 Sep 2026, inside Round 2's application window.

## 2. Know your slice

| Slice | Owner | API routers (`api/app/routers/`) | Screens (`web/app/`) |
|---|---|---|---|
| A Accounts and profile | | `auth.py` `profile.py` `users.py` | `(auth)/*` `(student)/profile` `(admin)/users` |
| B Projects and proposals | | `listings.py` `proposals.py` | `(student)/browse` `projects/[id]` `propose` `(supervisor)/projects/*` `proposals` |
| C Applications and rankings | | `applications.py` `rankings.py` | `(student)/apply/[id]` `my-applications` `(supervisor)/projects/[id]/applicants` |
| D Cycle, rounds, matching | | `cycles.py` `matching.py` `services/matching/` | `(admin)/rounds/*` `(supervisor)/approvals` offer card in `my-applications` |
| E Platform | | `notifications.py` `services/notify.py` `services/audit.py` | `notifications` `(admin)/dashboard` `components/ui` CI, deploy, e2e |

Your requirements are in the SRS section 4 and listed per slice in `docs/DEV-PLAN.md`. Every place that needs your work is marked in the code:

```bash
grep -rn "TODO(slice A)" api/app web/app      # replace A with your letter
```

## 3. Where things live

```
api/app/models/__init__.py   the contract. Change a field here, regenerate (step 5), commit both.
api/app/routers/<yours>.py   request handling and guards. Already returns seed data.
api/app/services/            business rules. windows.py answers "what phase is it now".
api/app/db/store.py          MockStore (in memory) and SupabaseStore (yours to fill for your tables).
api/app/db/seed_data.py      demo data. Add rows here if your feature needs them.
api/tests/test_REQ_*.py      one file per feature, test names carry the REQ-ID.
web/lib/api/client.ts        the interface screens call. Mirrors the routers.
web/lib/mock/client.ts       browser mock. If you change a rule in the API, change it here too.
web/lib/api/types.ts         GENERATED. Never edit.
web/components/ui/index.tsx  shared components. Reuse before writing new ones.
```

## 4. The daily loop

```bash
git checkout main && git pull
git checkout -b slice-a/verify-code          # slice letter / short name
# ... work (step 6) ...
cd api && uv run ruff check app tests && uv run pytest        # must pass
cd ../web && npm run lint && npm run typecheck                # must pass
git add -A && git commit -m "REQ-REG-2: store and check verification code"
git push -u origin slice-a/verify-code
```
Open the pull request on GitHub. Title starts with the REQ-ID. Ask one reviewer from another slice. Wait for `ci / api` and `ci / web` to be green. Squash and merge. Delete the branch.

Keep a branch to one requirement or one screen change. Two to three days, then merge.

## 5. When you change the contract

Any change to `api/app/models/__init__.py` or a route signature:

```bash
cd api && uv run python -m app.db.export     # shared/openapi.json, web/lib/mock/seed.json, supabase/seed.sql
cd ../web && npm run gen                     # web/lib/api/types.ts
```
Commit the generated files in the same PR. CI fails if they are stale.

## 6. Worked example: REQ-REG-2, verification code (slice A)

Today `POST /auth/verify` accepts the hard-coded code `000000`. The requirement: the user must enter the correct code that was sent.

**a. Find the spot**
```bash
grep -rn "REQ-REG-2" api/app
# api/app/routers/auth.py:  if body.code != "000000":  # TODO(slice A): check stored code and 10-minute expiry (REQ-REG-2)
```

**b. Write the test first** in `api/tests/test_REQ_REG.py`
```python
def test_REQ_REG_2_wrong_code_rejected(anon, fresh_store):
    anon.post("/auth/register", json={"name": "New Student", "email": "new001@e.ntu.edu.sg", "password": "password1", "role": "student"})
    r = anon.post("/auth/verify", json={"email": "new001@e.ntu.edu.sg", "code": "123456"})
    assert r.status_code == 422 and r.json()["field"] == "code"

def test_REQ_REG_2_correct_code_activates(anon, fresh_store):
    anon.post("/auth/register", json={"name": "New Student", "email": "new001@e.ntu.edu.sg", "password": "password1", "role": "student"})
    code = fresh_store.verification_codes["new001@e.ntu.edu.sg"]        # the store you are about to add
    r = anon.post("/auth/verify", json={"email": "new001@e.ntu.edu.sg", "code": code})
    assert r.status_code == 200
```
Run `uv run pytest tests/test_REQ_REG.py`. It fails. Good.

**c. Implement**
- `store.py`: add `verification_codes: dict[str, str]` to `MockStore.__init__`.
- `auth.py` register: generate a 6-digit code, `store.verification_codes[email] = code` (in mock mode also `print` it so you can test in the browser).
- `auth.py` verify: compare against the stored code, delete it on success.

Run the tests again. Green.

**d. Mirror in the browser mock** so the UI behaves the same without the API: in `web/lib/mock/client.ts`, `register()` stores a code and `verify()` checks it. Keep `000000` working there so the demo stays easy.

**e. Check the screen** at `/create-account` then `/verify`. Wrong code shows the red field message. Right code lands on sign-in.

**f. PR**: title `REQ-REG-2: verification code stored and checked`. Add the row in `docs/traceability.md`. Reviewer from slice B to E.

Later, when Supabase is connected, the same code moves the dict to the `verification_codes` table in `SupabaseStore`. Your router does not change.

## 7. Rules that keep five people from colliding

1. Guards live in the API (`invalid(...)`, `conflict(...)` in `api/app/errors.py`). The UI only reflects them.
2. Never insert into `notifications` or `audit_log` directly. Call `notify()` and `audit()` from `api/app/services/`.
3. Do not rename store methods. Services depend on them.
4. Do not touch another slice's router without a PR to its owner.
5. Copy for errors is plain language: what went wrong and what to do. See `docs/../mockups/style-guide/04_feedback.png`.
6. Ask in the group chat before adding a new shared component or a new table.

## 8. Stuck?

- Screen shows nothing: open the browser console. `ApiError` messages tell you which guard fired.
- `types.ts` complains: you changed a model and did not run step 5.
- CI red: click Details. It runs exactly the commands in step 4.
