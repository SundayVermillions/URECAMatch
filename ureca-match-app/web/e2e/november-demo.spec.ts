/** REQ-CYCLE-1, REQ-ROUND-1. Local mock mode only; no live data is changed.
 * NOVEMBER_DEMO_E2E=1 E2E_BASE_URL=http://127.0.0.1:3000 npm run e2e -- november-demo
 */
import { expect, test } from "@playwright/test";

test.skip(process.env.NOVEMBER_DEMO_E2E !== "1", "Requires a local mock-mode web server.");
test.use({ channel: process.env.E2E_BROWSER_CHANNEL, timezoneId: "Asia/Singapore", reducedMotion: "reduce" });

test("REQ-CYCLE-1, REQ-ROUND-1: admin cycle settings show the November seed", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("urecamatch.intro.seen", "1");
    sessionStorage.setItem("urecamatch.session", JSON.stringify({
      userId: "adm-1", role: "admin", name: "Jonathan Teo", expiresAt: Date.now() + 30 * 60_000,
    }));
  });
  await page.goto("/rounds");
  const roundTwo = page.getByRole("button").filter({ hasText: "Round 2" });
  await expect(roundTwo).toContainText("3 Nov");
  await expect(roundTwo).toContainText("8 Nov");
  await page.getByRole("button", { name: "Cycle settings", exact: true }).click();
  await expect(page.getByLabel("Cycle opens", { exact: true })).toHaveValue("2026-10-16");
  await expect(page.getByLabel("Cycle closes", { exact: true })).toHaveValue("2026-11-30");
  await expect(page.getByLabel("Round 1 starts", { exact: true })).toHaveValue("2026-10-23");
  await expect(page.getByLabel("Round 2 starts", { exact: true })).toHaveValue("2026-11-03");
  await expect(page.getByLabel("Round 3 starts", { exact: true })).toHaveValue("2026-11-14");
});
