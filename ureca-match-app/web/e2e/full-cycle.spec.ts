/**
 * Full-cycle journey: the demo in the Development Guide, section 2, on a fresh live seed.
 * Needs E2E_BASE_URL (the Vercel preview) and a live API whose clock moves through the round windows.
 * Not passing yet: it depends on slices A to D going live. Skipped in CI and when E2E_BASE_URL is unset.
 */
import { expect, test, type Page } from "@playwright/test";

test.skip(!!process.env.CI, "Full cycle runs manually against the preview until every slice is live.");
test.skip(!process.env.E2E_BASE_URL, "Set E2E_BASE_URL to the deployment to test.");

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

/** Topic and course pickers only take values from the catalogue, so type and choose the matching option. */
async function pick(page: Page, label: string, value: string) {
  await page.getByLabel(label).fill(value);
  await page.getByRole("option", { name: new RegExp(`^${value}`) }).first().click();
}

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
    await pick(page, "Research interests", "Machine Learning");
    await pick(page, "Completed modules", "SC1015");
    await pick(page, "Completed modules", "SC2001");
    await page.locator("input[type=file]").first().setInputFiles("public/sample-transcript.pdf");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
  });

  await test.step("2. supervisor publishes a listing with a cover; student finds it by tag and school (slice B)", async () => {
    await signIn(page, SUPERVISOR);
    await page.goto("/projects/new");
    await page.getByLabel("Title").fill(listingTitle);
    await page.getByLabel("Description").fill("End-to-end test listing for the full-cycle journey.");
    await pick(page, "Topic tags", "Machine Learning");
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

  await test.step("4. admin executes, supervisor approves, admin reassigns and publishes (slice D)", async () => {
    // Needs the live clock past the review window. On a fresh seed, set the round dates first.
    await signIn(page, ADMIN);
    await page.goto("/rounds");
    await page.getByRole("button", { name: "Run matching" }).click();

    await signIn(page, SUPERVISOR);
    await page.goto("/approvals");
    await page.getByRole("button", { name: "Approve" }).first().click();

    await signIn(page, ADMIN);
    await page.goto("/rounds");
    await page.getByRole("button", { name: "Review matches" }).click();
    await page.getByRole("button", { name: "Reassign" }).first().click();
    await page.getByLabel("Move to project").selectOption({ index: 1 });
    await page.getByLabel("Justification").fill("E2E: moved to balance supervisor load.");
    await page.getByRole("button", { name: "Reassign" }).last().click();
    await page.getByRole("button", { name: "Publish results" }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
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
    await signIn(page, STUDENT_2);
    await page.goto("/propose");
    await page.getByPlaceholder("Search by name or school").fill("Daniel Ho");
    await page.getByText("Prof. Daniel Ho").first().click();
    await page.getByLabel("Title").fill(proposalTitle);
    await page.getByLabel("Description").fill("A self-proposed project created by the end-to-end test.");
    await pick(page, "Research interests", "Machine Learning");
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
