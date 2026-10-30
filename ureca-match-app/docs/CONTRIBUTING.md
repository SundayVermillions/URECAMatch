# How to work on URECAMatch

Every step, from a clean laptop to your first merged feature. Follow it top to bottom once; after that you only need Part D.

---

## Part A. Install the tools (once, about 15 minutes)

You need four things. Check what you already have by opening a terminal (Mac: Terminal app; Windows: PowerShell or Git Bash) and typing:

```bash
node -v        # need 20 or newer
python3 --version   # need 3.12
uv --version   # Python package manager we use instead of pip
git --version
```

Install whatever is missing:

| Tool | Why | Mac | Windows |
|---|---|---|---|
| Node.js 20+ | runs the Next.js web app | `brew install node` | nodejs.org, LTS installer |
| Python 3.12 | runs the FastAPI backend | `brew install python@3.12` | python.org 3.12 installer, tick "Add to PATH" |
| uv | installs Python packages and runs the API | `brew install uv` | `powershell -c "irm https://astral.sh/uv/install.ps1 \| iex"` |
| Git | version control | comes with Xcode tools: `xcode-select --install` | git-scm.com |
| VS Code | editor (recommended) | code.visualstudio.com | same |

Tell Git who you are (this name appears on your commits):
```bash
git config --global user.name "Your Name"
git config --global user.email "you@e.ntu.edu.sg"
```

---

## Part B. Get the code and run it (once, about 10 minutes)

**1. Choose a folder** where you keep projects, for example `~/Projects`. In the terminal:
```bash
mkdir -p ~/Projects && cd ~/Projects
```

**2. Clone the repo.** This downloads the whole project, including its history:
```bash
git clone https://github.com/softwarelab3/2006-SCEF-A4.git
cd 2006-SCEF-A4/ureca-match-app
```
If GitHub asks you to sign in, use your GitHub username and a personal access token (GitHub → Settings → Developer settings → Personal access tokens → Generate new token, scope `repo`). Your account must be a collaborator on the repo; ask Robin if it is not.

**3. Open it in VS Code:**
```bash
code .
```
You will see `web/` (front end), `api/` (back end), `supabase/` (database), `docs/` (this file and the plan).

**4. Run the web app.** It runs entirely in your browser on sample data, so nothing else is needed yet.
```bash
cd web
cp .env.example .env.local    # settings file. API_MODE=mock means "use sample data"
npm install                   # downloads the JavaScript packages (one time, 1 to 2 minutes)
npm run dev                   # starts the app
```
Open http://localhost:3000. Click a demo button (Student, Supervisor, Admin) to sign in. Click through everything. Leave this terminal running.

**5. Run the API** in a second terminal. Only needed when you work on backend code, but do it once now to confirm it works:
```bash
cd ~/Projects/2006-SCEF-A4/ureca-match-app/api
cp .env.example .env          # settings. API_MODE=mock means in-memory data, no database
uv sync                       # creates .venv and installs packages (one time)
uv run pytest                 # runs the tests: expect "44 passed"
uv run fastapi dev app/main.py
```
Open http://localhost:8000/docs. This is the auto-generated API reference; you can call any endpoint from that page. For a protected endpoint, click **Authorize** and put a demo user id (`stu-1`, `sup-1`, `adm-1`) in the `X-Demo-User` header field.

Demo accounts: any seeded e-mail with password `password`. Verification code `000000`. The clock is fixed at 3 Nov 2026, 17:00 SGT, when Round 2 applications open.

---

## Part C. Understand the project (30 minutes of reading)

Read in this order:

1. **SRS section 4** (`LAB2/LAB 2 (SRS).pdf`): find your features. Each has REQ-IDs like `REQ-REG-1`. Those IDs are how we track everything.
2. **`docs/URECAMatch-Development-Guide.docx`**, your slice section (6.A to 6.E) and section 7: what exists, what to build in order, the tests to ship, and who to talk to. **`docs/DEV-PLAN.md`** is the progress board; tick it in your PRs.
3. **This map of the code:**

```
api/app/models/__init__.py   the CONTRACT: every request and response shape. Shared by web and API.
api/app/routers/<slice>.py   one file per feature. Receives the request, checks the rules, calls the store.
api/app/services/            reusable rules. windows.py says what phase the cycle is in right now.
api/app/db/store.py          MockStore keeps data in memory. SupabaseStore is where real DB queries go later.
api/app/db/seed_data.py      the sample data. Add rows here if your feature needs some.
api/tests/test_REQ_*.py      tests. One file per feature, names carry the REQ-ID.

web/app/<role>/<screen>/     one folder per screen, matching the dialog map page names.
web/components/ui/index.tsx  shared buttons, pills, drawers, banners. Reuse these.
web/lib/api/client.ts        the list of functions screens can call (mirrors the API routers).
web/lib/mock/client.ts       the in-browser copy of the API rules, so screens work without the API.
web/lib/api/types.ts         GENERATED from the API. Never edit by hand.
```

4. **Your slice:**

| Slice | Routers | Screens |
|---|---|---|
| A Accounts and profile | `auth.py` `profile.py` `users.py` | `(auth)/*` `(student)/profile` `(admin)/users` |
| B Projects and proposals | `listings.py` `proposals.py` | `(student)/browse` `projects/[id]` `propose` `(supervisor)/projects/*` `proposals` |
| C Applications and rankings | `applications.py` `rankings.py` | `(student)/apply/[id]` `my-applications` `(supervisor)/projects/[id]/applicants` |
| D Cycle, rounds, matching | `cycles.py` `matching.py` `services/matching/` | `(admin)/rounds/*` `(supervisor)/approvals` offer card in `my-applications` |
| E Platform | `notifications.py` `services/notify.py` `services/audit.py` | `notifications` `(admin)/dashboard` `components/ui` CI, deploy, e2e |

5. **Find your work in the code.** Every place waiting for you is marked:
```bash
grep -rn "TODO(slice A)" api/app web/app      # use your letter
```
Every guard that already exists is tagged with its REQ-ID, so `grep -rn "REQ-PROJ-3" api` shows you where a rule is enforced.

---

## Part D. Build one feature (the loop you repeat)

Worked example: **REQ-REG-2, verification code** (slice A). Today `POST /auth/verify` accepts the fixed code `000000`. The requirement: the user must enter the correct code that was sent.

**1. Start from a fresh `main`.** Always. Otherwise you build on stale code.
```bash
cd ~/Projects/2006-SCEF-A4
git checkout main
git pull
```

**2. Create a branch** named `<slice>/<short-name>`. Your work lives here until it is reviewed.
```bash
git checkout -b slice-a/verify-code
```

**3. Read the requirement** in the SRS (4.19, REQ-REG-2) and find the marker:
```bash
grep -rn "REQ-REG-2" ureca-match-app/api/app
# api/app/routers/auth.py:  if body.code != "000000":  # TODO(slice A): check stored code and 10-minute expiry (REQ-REG-2)
```

**4. Write the test first.** It describes the behaviour you want, and it fails until you build it. Create `ureca-match-app/api/tests/test_REQ_REG.py`:
```python
def test_REQ_REG_2_wrong_code_rejected(anon, fresh_store):
    anon.post("/auth/register", json={"name": "New Student", "email": "new001@e.ntu.edu.sg", "password": "password1", "role": "student"})
    r = anon.post("/auth/verify", json={"email": "new001@e.ntu.edu.sg", "code": "123456"})
    assert r.status_code == 422 and r.json()["field"] == "code"


def test_REQ_REG_2_correct_code_activates(anon, fresh_store):
    anon.post("/auth/register", json={"name": "New Student", "email": "new001@e.ntu.edu.sg", "password": "password1", "role": "student"})
    code = fresh_store.verification_codes["new001@e.ntu.edu.sg"]
    r = anon.post("/auth/verify", json={"email": "new001@e.ntu.edu.sg", "code": code})
    assert r.status_code == 200
```
`anon` and `fresh_store` come from `tests/conftest.py`: an unauthenticated client and a clean copy of the sample data. Run it:
```bash
cd ureca-match-app/api && uv run pytest tests/test_REQ_REG.py
```
It fails. That is correct at this point.

**5. Implement**, smallest change that makes the test pass:
- `api/app/db/store.py`: in `MockStore.__init__`, add `self.verification_codes: dict[str, str] = {}`.
- `api/app/routers/auth.py`, `register`: generate a code, `store.verification_codes[body.email] = code`. In mock mode `print(code)` so you can try it in the browser.
- `api/app/routers/auth.py`, `verify`: compare with the stored code; on success delete it and set the user active.

Run the test again until it passes. Then run everything:
```bash
uv run ruff check app tests     # style and mistakes
uv run pytest                   # all tests
```

**6. Mirror the rule in the browser mock**, so the screen behaves the same when the API is not running. In `web/lib/mock/client.ts`, `register()` stores a code and `verify()` checks it. Keep `000000` accepted there so demos stay easy.

**7. Check the screen.** With `npm run dev` running: go to `/create-account`, register, then `/verify`. A wrong code shows the red message under the field; the right code goes to sign-in. Then:
```bash
cd ../web && npm run lint && npm run typecheck
```

**8. Commit and push.** A commit is a saved checkpoint with a message; the message starts with the REQ-ID.
```bash
cd ~/Projects/2006-SCEF-A4
git add -A
git commit -m "REQ-REG-2: store and check the verification code"
git push -u origin slice-a/verify-code
```

**9. Open a pull request.** GitHub prints a link after the push, or go to the repo and click **Compare & pull request**.
- Title: `REQ-REG-2: store and check the verification code`
- Description: what changed, how you tested it
- Reviewers: one person from a different slice
- Wait for the two checks, `ci / api` and `ci / web`, to turn green. If one is red, click Details; it runs the same commands as steps 5 and 7.

**10. Update `docs/traceability.md`**: find the REQ-REG-2 row, fill in the test name, set status to `mock`. Commit it on the same branch.

**11. Merge.** When approved and green, click **Squash and merge**, then **Delete branch**. Go back to step 1 for the next requirement.

Later, when Supabase is connected, the dictionary becomes a query in `SupabaseStore`. Your router and tests do not change. That is why we keep rules in routers and services, not in the store.

---

## Part E. If you change the contract

Adding or renaming a field in `api/app/models/__init__.py`, or changing a route, changes what the web app expects. Regenerate and commit the results in the same PR:
```bash
cd ureca-match-app/api && uv run python -m app.db.export   # shared/openapi.json, web/lib/mock/seed.json, supabase/seed.sql
cd ../web && npm run gen                                    # web/lib/api/types.ts
```
CI fails if these are stale, so you cannot forget.

---

## Part F. Rules that keep five people from colliding

1. Rules and guards live in the API (`invalid(...)`, `conflict(...)` from `api/app/errors.py`). The UI only shows the result.
2. Never insert into `notifications` or `audit_log` yourself. Call `notify()` and `audit()` from `api/app/services/`.
3. Do not rename store methods. Every service depends on them.
4. Do not edit another slice's router. Open a PR to its owner instead.
5. One branch, one requirement or one screen. Merge within a few days.
6. Error messages are plain language: what went wrong and what to do next.
7. Ask in the group chat before adding a shared component or a database table.

---

## Part G. When something breaks

| Symptom | Cause | Fix |
|---|---|---|
| `npm run dev` fails to start | packages not installed or wrong Node | `node -v` is 20+, then `rm -rf node_modules && npm install` |
| `uv run pytest` says module not found | venv not created | `uv sync` in `api/` |
| Screen is blank | an API call failed | open the browser console (F12); the `ApiError` says which guard fired |
| TypeScript complains about `types.ts` | model changed, types not regenerated | Part E |
| CI red on PR | lint, tests or build failing | click Details, run the same command locally |
| `git pull` conflict | someone changed the same lines | `git status` shows the file; fix the `<<<<<<<` markers, `git add`, `git commit` |
