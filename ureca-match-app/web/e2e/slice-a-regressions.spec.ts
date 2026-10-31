/** Slice A: REQ-REG-2 and REQ-PROF-2/3. Run against a local web build with
 * NEXT_PUBLIC_API_MODE=live and NEXT_PUBLIC_API_URL=http://127.0.0.1:8009.
 * SLICE_A_E2E=1 E2E_BASE_URL=http://127.0.0.1:3100 npm run e2e -- slice-a-regressions
 * Every API response is intercepted. No live database or account is used. */
import { expect, test, type Page } from "@playwright/test";
import seed from "../lib/mock/seed.json";
import type { StudentProfile } from "../lib/api/models";

test.skip(process.env.SLICE_A_E2E !== "1", "Requires the local live-client test build and intercepted API.");
test.use({ channel: process.env.E2E_BROWSER_CHANNEL, reducedMotion: "reduce" });

async function profileApi(page: Page) {
  const student = seed.users.find((u) => u.id === "stu-1")!;
  const profile = structuredClone(seed.students.find((p) => p.user_id === student.id)!) as StudentProfile;
  profile.profile_complete = true;
  profile.school = "CCDS";
  profile.degree = "Computer Science";
  const document = profile.documents[0];
  profile.documents = [
    { ...document, id: "transcript", kind: "transcript", file_name: "transcript.pdf" },
    { ...document, id: "portfolio", kind: "supporting", file_name: "portfolio.pdf" },
  ];
  const state = { profile, deleted: [] as string[], saves: 0, failSave: false, failDelete: false as boolean | string, missingFile: false };
  await page.addInitScript(({ user }) => {
    sessionStorage.setItem("urecamatch.intro.seen", "1");
    localStorage.setItem("urecamatch.session", JSON.stringify({ userId: user.id, role: user.role,
      name: user.name, token: "isolated-test-token", expiresAt: Date.now() + 30 * 60_000 }));
  }, { user: student });
  await page.route("http://127.0.0.1:8009/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
    const respond = (data: unknown, status = 200) => route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(data) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path === "/me") return respond({ user: student, student: profile, supervisor: null, unread_notifications: 0,
      phase: { cycle_id: "cyc-2627s1", round_id: "rnd-2", round_number: 2, window: "application",
        window_ends_at: "2026-09-10T08:59:59Z", label: "Round 2 applications open", now: "2026-09-07T10:00:00Z" } });
    if (path === "/me/profile" && request.method() === "PUT") {
      state.saves += 1;
      if (state.failSave) return respond({ code: "invalid", message: "Profile could not be saved." }, 422);
      Object.assign(profile, request.postDataJSON());
      return respond(profile);
    }
    if (path.startsWith("/me/documents/") && request.method() === "DELETE") {
      const id = path.split("/").pop()!;
      if (state.failDelete === true || state.failDelete === id) return respond({ code: "unavailable", message: "Document removal failed. Try again." }, 503);
      state.deleted.push(id);
      profile.documents = profile.documents.filter((d) => d.id !== id);
      return respond({ ok: true });
    }
    if (path.startsWith("/documents/")) {
      const doc = profile.documents.find((d) => path === `/documents/${d.id}/view`)!;
      return respond({ ...doc, url: state.missingFile ? null : `${process.env.E2E_BASE_URL}/sample-transcript.pdf` });
    }
    if (path.startsWith("/catalog/")) return respond([]);
    return respond({ code: "unexpected_test_request", message: path }, 501);
  });
  return state;
}

test("REQ-REG-2: live verification does not show the mock code", async ({ page }) => {
  await profileApi(page);
  await page.goto("/verify?email=student@e.ntu.edu.sg");
  await expect(page.getByLabel("Verification code")).toBeVisible();
  await expect(page.getByText("Use the code sent to your e-mail.")).toBeVisible();
  await expect(page.getByText("Demo code: 000000")).toHaveCount(0);
});

test("REQ-PROF-3: cancelling a document removal keeps the file", async ({ page }) => {
  const state = await profileApi(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Delete portfolio.pdf", exact: true }).click();
  await expect(page.getByText("Will be removed when you save")).toBeVisible();
  expect(state.deleted).toEqual([]);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete portfolio.pdf", exact: true })).toBeVisible();
  expect(state.deleted).toEqual([]);
});

test("REQ-PROF-3: leaving without saving keeps the file", async ({ page }) => {
  const state = await profileApi(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Delete portfolio.pdf", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Delete portfolio.pdf", exact: true })).toBeVisible();
  expect(state.deleted).toEqual([]);
});

test("REQ-PROF-3: saving confirms a removal", async ({ page }) => {
  const state = await profileApi(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Delete portfolio.pdf", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  expect(state.deleted).toEqual(["portfolio"]);
  expect(state.saves).toBe(1);
  await expect(page.getByRole("button", { name: "View portfolio.pdf", exact: true })).toHaveCount(0);
});

test("REQ-PROF-2/3: a rejected profile save does not delete a document", async ({ page }) => {
  const state = await profileApi(page);
  state.failSave = true;
  await page.goto("/profile");
  await page.getByRole("button", { name: "Delete portfolio.pdf", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Profile could not be saved.")).toBeVisible();
  expect(state.deleted).toEqual([]);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
});

test("REQ-PROF-3: failed document removal stays pending and can be retried", async ({ page }) => {
  const state = await profileApi(page);
  state.failDelete = true;
  await page.goto("/profile");
  await page.getByRole("button", { name: "Delete portfolio.pdf", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Document removal failed. Try again.")).toBeVisible();
  expect(state.deleted).toEqual([]);
  state.failDelete = false;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  expect(state.deleted).toEqual(["portfolio"]);
});

test("REQ-PROF-3: transcript opens in the page without a popup", async ({ page }) => {
  await profileApi(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "View transcript.pdf", exact: true }).click();
  await expect(page.locator('iframe[title="transcript.pdf"]')).toHaveAttribute("src", /sample-transcript\.pdf#toolbar=0/);
  expect(page.context().pages()).toHaveLength(1);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator('iframe[title="transcript.pdf"]')).toHaveCount(0);
});

test("REQ-PROF-3: partial removal failure shows saved state and retries only remaining files", async ({ page }) => {
  const state = await profileApi(page);
  state.profile.documents.push({ ...state.profile.documents[1], id: "second", file_name: "second.pdf" });
  state.failDelete = "second";
  await page.goto("/profile");
  await page.getByRole("button", { name: "Delete portfolio.pdf", exact: true }).click();
  await page.getByRole("button", { name: "Delete second.pdf", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Document removal failed. Try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "View portfolio.pdf", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  expect(state.deleted).toEqual(["portfolio"]);
  state.failDelete = false;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  expect(state.deleted).toEqual(["portfolio", "second"]);
});

test("REQ-PROF-3: a document without a file shows an explanation", async ({ page }) => {
  const state = await profileApi(page);
  state.missingFile = true;
  await page.goto("/profile");
  await page.getByRole("button", { name: "View transcript.pdf", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This file is unavailable." })).toHaveText("This file is unavailable. Upload it again to view it.");
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
});
