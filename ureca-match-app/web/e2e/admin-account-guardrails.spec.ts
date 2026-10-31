/** REQ-USER-3. Local mock mode only, no live accounts or database.
 * ADMIN_ACCOUNTS_E2E=1 E2E_BASE_URL=http://127.0.0.1:3000 npm run e2e -- admin-account-guardrails
 */
import { expect, test, type Page } from "@playwright/test";
import seed from "../lib/mock/seed.json";

test.skip(process.env.ADMIN_ACCOUNTS_E2E !== "1", "Requires a local mock-mode web server.");
test.use({ channel: process.env.E2E_BROWSER_CHANNEL, reducedMotion: "reduce" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("urecamatch.intro.seen", "1");
    sessionStorage.setItem("urecamatch.session", JSON.stringify({
      userId: "adm-1", role: "admin", name: "Jonathan Teo", expiresAt: Date.now() + 30 * 60_000,
    }));
  });
  await page.goto("/users");
});

async function findUser(page: Page, idOrEmail: string) {
  const email = seed.users.find((user) => user.id === idOrEmail)?.email ?? idOrEmail;
  await page.getByPlaceholder("Name or e-mail", { exact: true }).fill(email);
  const row = page.locator("div.group.grid").filter({ hasText: email });
  await expect(row).toBeVisible();
  return row;
}

async function editRole(page: Page, userId: string, role: string) {
  const row = await findUser(page, userId);
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator("#edit-role").selectOption(role);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Confirm role change", exact: true })).toBeVisible();
  return row;
}

test("REQ-USER-3: own deactivate, role and status controls are disabled", async ({ page }) => {
  const row = await findUser(page, "adm-1");
  await expect(row.getByRole("button", { name: "Deactivate", exact: true })).toBeDisabled();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator("#edit-role")).toBeDisabled();
  await expect(page.locator("#edit-status")).toBeDisabled();
  await expect(page.getByText("You cannot change your own role. Ask another administrator.", { exact: true })).toBeVisible();
  await expect(page.getByText("You cannot deactivate your own account. Ask another administrator.", { exact: true })).toBeVisible();
});

test("REQ-USER-3: cancelling a role change without active items leaves the user unchanged", async ({ page }) => {
  const row = await editRole(page, "stu-39", "supervisor");
  await expect(page.getByText(/from Student to Project Supervisor\./)).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row).toContainText("Student");
  await expect(row).not.toContainText("Project Supervisor");
});

test("REQ-USER-3: a student without active items changes role only after confirmation", async ({ page }) => {
  const row = await editRole(page, "stu-39", "supervisor");
  await expect(row).toContainText("Student");
  await page.getByRole("button", { name: "Change role", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Confirm role change", exact: true })).toHaveCount(0);
  await expect(row).toContainText("Project Supervisor");
});

test("REQ-USER-3: a supervisor without active items also needs role confirmation", async ({ page }) => {
  await page.getByRole("button", { name: "New user", exact: true }).click();
  await page.locator("#new-role").selectOption("supervisor");
  await page.locator("#new-name").fill("Empty Supervisor");
  await page.locator("#new-email").fill("empty.supervisor@ntu.edu.sg");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New user", exact: true })).toHaveCount(0);
  const row = await editRole(page, "empty.supervisor@ntu.edu.sg", "student");
  await expect(row).toContainText("Project Supervisor");
  await page.getByRole("button", { name: "Change role", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Confirm role change", exact: true })).toHaveCount(0);
  await expect(row).toContainText("Student");
  await expect(row).not.toContainText("Project Supervisor");
});

test("REQ-USER-3: cancelling the active-application warning leaves the student role unchanged", async ({ page }) => {
  const row = await editRole(page, "stu-1", "supervisor");
  await page.getByRole("button", { name: "Change role", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Warning: active items will be closed", exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "The student's active applications will be withdrawn." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change role and close items", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row).toContainText("Student");
});

test("REQ-USER-3: supervisor listings show a prominent impact warning requiring acknowledgement", async ({ page }) => {
  const row = await editRole(page, "sup-1", "student");
  await page.getByRole("button", { name: "Change role", exact: true }).click();
  const warning = page.getByRole("alert").filter({ hasText: "Published listings will be closed" });
  await expect(warning).toBeVisible();
  await expect(warning).toHaveClass(/border-bad/);
  await expect(warning).toContainText("Changing the role or status back will not restore these items.");
  await expect(page.getByText("Open project listings (3)", { exact: true })).toBeVisible();
  const confirm = page.getByRole("button", { name: "Change role and close items", exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByRole("checkbox", { name: "I understand that the listed items will be closed, withdrawn or cancelled.", exact: true }).check();
  await confirm.click();
  await expect(page.getByRole("heading", { name: "Warning: active items will be closed", exact: true })).toHaveCount(0);
  await expect(row).toContainText("Student");
  await expect(row).not.toContainText("Project Supervisor");
});

test("REQ-USER-3: deactivating another user with active items requires the stronger warning", async ({ page }) => {
  const row = await findUser(page, "sup-1");
  await row.getByRole("button", { name: "Deactivate", exact: true }).click();
  await page.getByRole("button", { name: "Deactivate", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Warning: active items will be closed", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deactivate and close items", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row).toContainText("Active");
});

test("REQ-USER-3: bypassing the role control still cannot change own role in mock mode", async ({ page }) => {
  const row = await findUser(page, "adm-1");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  // Intentionally bypass the UI restriction to verify that the mock client independently enforces the guard.
  await page.locator("#edit-role").evaluate((select) => select.removeAttribute("disabled"));
  await page.locator("#edit-role").selectOption("student");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Change role", exact: true }).click();
  await expect(page.getByText("You cannot change your own role. Ask another administrator to change it.", { exact: true })).toBeVisible();
  await expect(row).toContainText("Admin");
});

test("REQ-USER-3: bypassing the status control still cannot deactivate own account in mock mode", async ({ page }) => {
  const row = await findUser(page, "adm-1");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator("#edit-status").evaluate((select) => select.removeAttribute("disabled"));
  await page.locator("#edit-status").selectOption("inactive");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("You cannot deactivate your own account. Ask another administrator to deactivate it.", { exact: true })).toBeVisible();
  await expect(row).toContainText("Active");
});
