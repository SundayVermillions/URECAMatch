/** Playwright e2e (slice E). Run against a deployment: E2E_BASE_URL=https://<preview> npx playwright test */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 10 * 60_000, // SRS goal: one full cycle in under 10 minutes
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    actionTimeout: 15_000, // a missing button fails fast instead of waiting out the whole journey
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
