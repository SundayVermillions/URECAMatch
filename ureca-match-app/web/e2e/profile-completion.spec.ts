/** REQ-PROF-1. Local mock mode only, no live accounts or database.
 * NEXT_PUBLIC_API_MODE=mock npm run dev
 * PROFILE_GATE_E2E=1 E2E_BASE_URL=http://127.0.0.1:3000 npm run e2e -- profile-completion
 */
import { expect, test, type Page } from "@playwright/test";
import seed from "../lib/mock/seed.json";

test.skip(process.env.PROFILE_GATE_E2E !== "1", "Requires a local mock-mode web server.");
test.use({ channel: process.env.E2E_BROWSER_CHANNEL, reducedMotion: "reduce" });

const warning = "Please complete your profile first.";
const incomplete = seed.students.find((profile) => !profile.profile_complete)!;

async function signIn(page: Page, userId = incomplete.user_id) {
  const user = seed.users.find((user) => user.id === userId)!;
  await page.addInitScript((user) => {
    sessionStorage.setItem("urecamatch.intro.seen", "1");
    sessionStorage.setItem("urecamatch.session", JSON.stringify({
      userId: user.id, role: user.role, name: user.name,
      expiresAt: Date.now() + 30 * 60_000,
    }));
  }, user);
}

for (const path of ["/browse", "/my-applications", "/propose", "/notifications"]) {
  test(`REQ-PROF-1: direct ${path} access explains the profile redirect`, async ({ page }) => {
    await signIn(page);
    await page.goto(path);
    await expect(page).toHaveURL(/\/profile(?:\?|$)/);
    await expect(page.getByText(warning, { exact: true })).toBeVisible();
  });
}

test("REQ-PROF-1: each sidebar attempt warns and preserves unfinished entries", async ({ page }) => {
  await signIn(page);
  await page.goto("/profile");
  const cgpa = page.getByRole("spinbutton", { name: /^CGPA/ });
  await cgpa.fill("4.25");
  for (const name of ["Browse projects", "My applications", "Propose a project", "Notifications"]) {
    const link = page.getByRole("link", { name, exact: true });
    // Also cover keyboard navigation through the sidebar.
    await link.focus();
    await link.press("Enter");
    const toast = page.getByRole("status").filter({ hasText: warning });
    await expect(toast).toBeVisible();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(cgpa).toHaveValue("4.25");
    await toast.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(toast).toHaveCount(0);
  }
});

test("REQ-PROF-1: saving a completed profile unlocks navigation", async ({ page }) => {
  await signIn(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await expect(page.getByText(warning, { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Browse projects", exact: true }).click();
  await expect(page).toHaveURL(/\/browse$/);
});

test("REQ-PROF-1: a student with a saved complete profile can browse normally", async ({ page }) => {
  await signIn(page, "stu-1");
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "My profile", exact: true })).toBeVisible();
  await expect(page.getByText(warning, { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Browse projects", exact: true }).click();
  await expect(page).toHaveURL(/\/browse$/);
});
