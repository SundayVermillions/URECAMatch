/**
 * Full-cycle journey: the demo in the Development Guide, section 2, on a fresh seed.
 * The test moves the clock through Round 2's windows with the debug clock, so it needs DEBUG_CLOCK=true on the API
 * and NEXT_PUBLIC_DEBUG_CLOCK=true on the web app, in live mode. Run it against one freshly started API process
 * (for example `uv run fastapi dev app/main.py` locally): the clock override, rounds and matches live in that
 * process's memory, so a Vercel preview with several instances cannot pass it until rounds and matches are saved in
 * Supabase. Skipped in CI and when E2E_BASE_URL is unset.
 */
import { expect, test, type Page } from "@playwright/test";

test.skip(!!process.env.CI, "Full cycle runs manually against a single API process until every slice is live.");
test.skip(!process.env.E2E_BASE_URL, "Set E2E_BASE_URL to the web app to test.");
test.use({ timezoneId: "Asia/Singapore" }); // the debug clock's date and time box reads local time

const PASSWORD = "password";
const CODE = "000000";
const run = Date.now().toString().slice(-6);
const newStudent = { name: `E2E Student ${run}`, email: `e2e${run}@e.ntu.edu.sg` };
const listingTitle = `E2E listing ${run}`;
const proposalTitle = `E2E proposal ${run}`;
const SUPERVISOR = "marcus.chua@ntu.edu.sg"; // sup-1
const SUPERVISOR_2 = "daniel.ho@ntu.edu.sg"; // sup-2
const ADMIN = "jonathan.teo@ntu.edu.sg"; // adm-1
const STUDENT_2 = "bryan002@e.ntu.edu.sg"; // stu-2

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.evaluate(() => localStorage.clear());
  await page.getByLabel("NTU e-mail").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/sign-in/);
}

/** Sets the API clock with the debug clock (Singapore time, "YYYY-MM-DDTHH:mm"). Matching and publishing run on the
 *  next request after a window closes (REQ-EXEC-4, REQ-PUB-3), and the debug clock sends one straight away. */
async function setClock(page: Page, local: string) {
  await page.getByRole("button", { name: "Debug clock" }).click();
  await page.locator('input[type="datetime-local"]').fill(local);
  const ticked = page.waitForResponse((r) => r.url().includes("/internal/tick"));
  await page.getByRole("button", { name: "Set this time" }).click();
  await ticked;
  await page.reload();
}

test.afterEach(async ({ page }) => {
  // The override applies to the whole API, so put the real clock back even when a step failed.
  await page.goto("/notifications").catch(() => {});
  const clock = page.getByRole("button", { name: "Debug clock" });
  if (await clock.isVisible().catch(() => false)) {
    await clock.click();
    await page.getByRole("button", { name: "Back to the real clock" }).click({ timeout: 5_000 }).catch(() => {});
  }
});

async function expectNotification(page: Page, text: RegExp) {
  await page.goto("/notifications");
  await expect(page.getByText(text).first()).toBeVisible();
}

test("one URECA cycle end to end", async ({ page }) => {
  await test.step("1. student registers, verifies, completes profile, uploads transcript (slice A)", async () => {
    await page.goto("/create-account");
    await page.getByLabel("Full name").fill(newStudent.name);
    await page.getByLabel("NTU e-mail").fill(newStudent.email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page).toHaveURL(/verify/);
    await page.getByLabel("Verification code").fill(CODE);
    await page.getByRole("button", { name: "Activate account" }).click();
    await signIn(page, newStudent.email);
    await page.goto("/profile");
    await page.getByLabel("CGPA").fill("4.2");
    await page.getByLabel("Research interests").fill("Machine Learning");
    await page.getByLabel("Completed modules").fill("SC1015, SC2001");
    await page.locator("input[type=file]").first().setInputFiles("public/sample-transcript.pdf");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
  });

  await test.step("2. supervisor publishes a listing with a cover; student finds it by tag and school (slice B)", async () => {
    await signIn(page, SUPERVISOR);
    await setClock(page, "2026-09-07T10:00"); // Round 2's application window
    await page.goto("/projects/new");
    await page.getByLabel("Title").fill(listingTitle);
    await page.getByLabel("Description").fill("End-to-end test listing for the full-cycle journey.");
    await page.getByLabel("Topic tags").fill("Machine Learning");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /publish/i }).click();
    await expect(page.getByText(listingTitle)).toBeVisible();

    await signIn(page, newStudent.email);
    await page.goto("/browse");
    await page.getByPlaceholder("Search projects, topics or keywords").fill("Machine Learning");
    await expect(page.getByText(listingTitle)).toBeVisible();
  });

  await test.step("3. student applies and ranks; supervisor reads the transcript and ranks (slice C)", async () => {
    await page.getByText(listingTitle).click();
    await page.getByRole("link", { name: /apply/i }).click();
    await page.getByLabel("Statement of interest").fill("I want to work on this because it matches my ML coursework.");
    await page.getByRole("button", { name: /submit/i }).click();
    await page.goto("/my-applications");
    await expect(page.getByText(listingTitle)).toBeVisible();

    await signIn(page, SUPERVISOR);
    await page.goto("/projects");
    await page.getByText(listingTitle).click();
    await page.getByRole("link", { name: /applicants/i }).click();
    await page.getByText(newStudent.name).click();
    await expect(page.getByRole("document", { name: /transcript/i })).toBeVisible(); // PdfViewer in the drawer
    await page.getByRole("button", { name: "Add to ranking" }).click();
    await page.getByRole("button", { name: /submit ranking|save ranking/i }).click();
  });

  await test.step("4. matching runs by itself; supervisor declines the student; admin reassigns them; results publish (slice D)", async () => {
    await setClock(page, "2026-09-12T17:01"); // Round 2's review window has closed, so matching runs (REQ-EXEC-4)
    await page.goto("/approvals");
    await expect(page.getByText(/Approval window open until/)).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: newStudent.name });
    await row.getByRole("button", { name: "Decline" }).click();
    await page.getByLabel("Reason for the URECA office").fill("E2E: lab is full this term.");
    await page.getByRole("button", { name: "Decline" }).last().click(); // the modal's confirm
    await expect(row.getByText("Rejected", { exact: true })).toBeVisible(); // the status pill (SRS Figure 3.8)

    await signIn(page, ADMIN);
    await page.goto("/rounds");
    await page.getByRole("button", { name: "Review matches" }).click();
    await page.getByRole("button", { name: "Rejected", exact: true }).click(); // only the student just declined
    await page.getByRole("button", { name: "Reassign" }).first().click();
    await page.getByLabel("Move to project").selectOption({ index: 1 });
    await page.getByLabel("Justification").fill("E2E: supervisor declined; moved to another project.");
    await page.getByRole("button", { name: "Reassign" }).last().click();

    await setClock(page, "2026-09-14T17:01"); // the approval window has closed, so results publish (REQ-PUB-3)
    await page.goto("/rounds");
    await expect(page.getByText("Results published.")).toBeVisible();
  });

  await test.step("5. student accepts the offer; affected users are notified (slices D and E)", async () => {
    await signIn(page, newStudent.email);
    await expectNotification(page, /match offer/i);
    await page.goto("/my-applications");
    await page.getByRole("button", { name: "Accept offer" }).click();
    await expect(page.getByText("Accepted.")).toBeVisible();

    await signIn(page, SUPERVISOR);
    await expectNotification(page, /match|approved|published/i);
  });

  await test.step("6. a second student proposes a project; supervisor accepts and registers them (slice B)", async () => {
    await setClock(page, "2026-09-16T10:00"); // Round 3's application window: proposals are open (REQ-PROPOSE-3)
    await signIn(page, STUDENT_2);
    await page.goto("/propose");
    await page.getByPlaceholder("Search by name or school").fill("Daniel Ho");
    await page.getByText("Prof. Daniel Ho").first().click();
    await page.getByLabel("Title").fill(proposalTitle);
    await page.getByLabel("Description").fill("A self-proposed project created by the end-to-end test.");
    await page.getByLabel("Research interests").fill("Machine Learning");
    await page.keyboard.press("Enter");
    await page.getByLabel("Statement").fill("I would like this supervisor for the project.");
    await page.getByRole("button", { name: /submit|propose/i }).click();

    await signIn(page, SUPERVISOR_2);
    await page.goto("/proposals");
    await page.getByText(proposalTitle).click();
    await page.getByRole("button", { name: "Accept and register" }).click();

    await signIn(page, STUDENT_2);
    await expectNotification(page, /proposal was accepted/i);
  });
});
