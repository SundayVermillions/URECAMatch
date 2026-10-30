# Demo setup

One shared plan so everyone runs the demo the same way. Plain steps, copy and paste.

## The setup in one line

Web app in **live mode**, API in **mock mode** (data lives in the API's memory), e-mail caught by **Mailpit**. One laptop runs everything. Several browser tabs act as the student, supervisor and admin.

| Part | Setting | Why |
| --- | --- | --- |
| Web app | `NEXT_PUBLIC_API_MODE=live` | Real calls to the API, one login per tab |
| API | `API_MODE=mock` | No database, resets by restarting, no network risk |
| E-mail | `EMAIL_MODE=smtp` and Mailpit | Real e-mails on screen, nothing leaves the laptop |
| Clock | Fake clock on the API | Move through the whole cycle in minutes |

Backups, in order: this setup, then the browser-only mock (`NEXT_PUBLIC_API_MODE=mock`), then the Supabase set-up in section 9.

## 1. What you need

- Node 20 or newer, Python 3.12, [uv](https://docs.astral.sh/uv/).
- Mailpit for Windows: download the zip from <https://github.com/axllent/mailpit/releases>, unzip it, you get `mailpit.exe`.
- The latest `main`: `git checkout main` then `git pull`.

## 2. Set the files

Never commit these two files. Both are ignored by git.

**`ureca-match-app/api/.env`**

```
API_MODE=mock
DEBUG_CLOCK=true
EMAIL_MODE=smtp
EMAIL_ALLOWLIST=student1@e.ntu.edu.sg,student2@e.ntu.edu.sg
```

- Put your own two student addresses in `EMAIL_ALLOWLIST`, comma separated, no spaces.
- Nothing after the `=` on that line. A `# comment` on the same line becomes the value and blocks all e-mail.
- Only listed addresses get e-mail. Seeded accounts get none, which keeps Mailpit clean.
- Leave the Supabase keys as they are. They are not used in this setup.

**`ureca-match-app/web/.env.local`**

```
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_DEBUG_CLOCK=true
NEXT_PUBLIC_DEMO_ACCOUNTS=true
```

## 3. Start everything

Use three terminals. Start them in this order.

| Terminal | Folder | Command |
| --- | --- | --- |
| 1 Mailpit | the unzipped Mailpit folder | `.\mailpit.exe` |
| 2 API | `ureca-match-app\api` | `uv run fastapi dev app/main.py` |
| 3 Web | `ureca-match-app\web` | `npm run dev` |

Restart a terminal after you change its `.env`.

Checks:

- `http://localhost:8025` shows the Mailpit inbox.
- `http://localhost:8000/health` shows `{"ok":true}`.
- `http://localhost:8000/debug/clock` shows `"enabled": true` and a date in November.
- `http://localhost:3000` shows the sign-in page.

If `uv run fastapi` says "Failed to spawn", you are in the wrong folder. Go to `api`.

## 4. Open the tabs

Use one browser window. Type `localhost:3000` into a **new empty tab** for each actor. Never use Duplicate tab. Use `localhost`, not `127.0.0.1`.

| Tab | Who | Sign in |
| --- | --- | --- |
| 1 | Student #1 | Sign up with an address from `EMAIL_ALLOWLIST` |
| 2 | Student #2 | Sign up with the other listed address |
| 3 | Supervisor #1 | `marcus.chua@ntu.edu.sg` |
| 4 | Admin #1 | `jonathan.teo@ntu.edu.sg` |
| 5 | Mailpit | `http://localhost:8025` |

- Seeded accounts use the password `password`.
- Sign-up codes arrive in Mailpit. The shortcut code `000000` also works in this setup.
- Each tab keeps its own login. They share the same API, so they see the same data.
- After someone acts, **refresh** the other tab. Nothing pushes between tabs.

## 5. The clock

The demo starts on its own at **3 Nov 2026, 5:00 pm SGT**, the opening of Round 2 applications. Use the clock chip at the top right to move time. Times are Singapore time.

| Step | Set the clock to | What happens |
| --- | --- | --- |
| Start | 3 Nov 2026, 5:00 pm | Round 2 applications are open |
| Review window | 8 Nov 2026, 6:00 pm | Supervisors rank applicants |
| Approval window | 10 Nov 2026, 6:00 pm | Matches exist. Supervisors can decline. Admin can assign and unassign. |
| Results | 12 Nov 2026, 6:00 pm | Offers are visible. Students accept or decline. |
| Round 3 applications | 15 Nov 2026, 6:00 pm | Unmatched students apply again |
| After Round 3 | 20 Nov 2026, 6:00 pm | New applications are refused |

After each jump, refresh the tabs once or twice. Matching and publishing run on the next request.

## 6. Demo flow

Order matters. Some steps only work in the right window.

0. **Supervisor first.** Create the demo project before students apply: 1 slot, a cover image, three photos, a video link. Use the demo texts file.
1. **Student #1.** Create account. Upload the weaker transcript and check the autofill. Set interests. Browse and change interests to show the picks change. Apply to the demo project. Send a self-proposal to the same supervisor. Rank preferences.
2. **Student #2.** Sign up. Upload the stronger transcript. Apply to the same project. Rank.
3. **Supervisor.** Decline Student #1's proposal with a reason. This works in the application window.
   - **Optional, chat (REQ-CHAT).** Student #1 opens Messages, New message, picks the supervisor and asks a question. The supervisor sees the Messages badge and a notification, opens the conversation (the badge clears) and replies. In the seed, Prof. Chua (sup-1) already has an unread message from Chloe Lim.
4. **Clock to the review window.** Supervisor opens the applicants, filters, uses the AI button, sorts, ranks Student #2 first.
5. **Admin, review window.** Open Cycle settings. Try a start date for Round 3 that overlaps Round 2 (for example 13 Nov) and show the refusal. To extend Round 3's review window, move "Cycle closes" later first, then extend. Manual assign works here.
6. **Clock to the approval window.** Supervisor declines a proposed match with a reason. Admin unassigns and assigns. Show the audit log.
7. **Clock to results.** Student #2 opens the offer, accepts. Show the e-mail in Mailpit. The project now shows as full. Student #1 sees "not matched".
8. **Clock to Round 3.** Student #1 sees the full project, reads the decline reason, sends a new proposal.
9. **Supervisor accepts the proposal.** Student #1 is now placed. Applying is refused.
10. **Optional.** Clock to 20 Nov. New applications are refused.

## 7. Reset between runs

1. Stop the API (Ctrl+C) and start it again. All data and accounts return to the seed and the clock to 3 Nov.
2. Close all tabs. Open fresh tabs and sign in again.
3. Clear Mailpit: the bin icon, or `curl.exe -X DELETE http://localhost:8025/api/v1/messages`.

## 8. Troubleshooting

| Problem | Fix |
| --- | --- |
| "Failed to spawn: fastapi" | Run it from the `api` folder |
| No clock chip | `NEXT_PUBLIC_DEBUG_CLOCK=true` is missing, or the web app was not restarted |
| Clock chip does nothing | `DEBUG_CLOCK=true` is missing in `api/.env`, or the API was not restarted |
| Sent to the sign-in page | Two actors in one tab, or the session ran out. Open a fresh tab and sign in again. |
| One tab shows another person | You duplicated a tab. Close it and open a new one. |
| Mailpit stays empty | Check `EMAIL_MODE=smtp`, the Mailpit window is open, the address is in `EMAIL_ALLOWLIST`, and there is no comment on that line |
| "Sent 0 of 11" from the sample script | The allowlist excludes that address. Test with a listed one. |
| Broken cover image | The API must be on the latest `main` (images are fixed in mock mode) |
| Nothing updates after a clock jump | Refresh once or twice. Admin: open Matching Rounds. |
| Port 3000, 8000 or 8025 is busy | Close the older terminal that still runs it |

## 9. Other setups

**Browser mock (backup).** In `web/.env.local` set `NEXT_PUBLIC_API_MODE=mock` and restart the web app. No API needed. Data lives in one tab: use one tab only, switch actors with Sign out and Sign in, and do not press F5.

**Supabase (shared database).** `API_MODE=supabase`, `DEBUG_CLOCK=true`, `SCHEDULER_ON_REQUEST=true`, and the SQL in `supabase/migrations/2026-10-31-shared-debug-clock.sql` applied once. All laptops share the data and one clock. The shared database must be reset to the November seed first, and requests are slow (2 to 4 seconds each) until the speed fix lands. Not the first choice for a live demo.

## 10. Known issues

- The verbose "Application cycle dates changed" notification appears when the admin edits dates. It has no link.
- "Cycle closes" must be moved before Round 3's review window can be extended, because the seed leaves no slack after offers.
- A cycle can still be created with an opening date in the past.
- My applications can list rows from a closed cycle.
- Sign-up for the demo accounts needs an address in `EMAIL_ALLOWLIST` to receive e-mail.
