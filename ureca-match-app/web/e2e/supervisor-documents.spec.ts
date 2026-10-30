/** REQ-VRANK-3, REQ-REVPROP-1. Local mock mode only, no live accounts or database.
 * SUPERVISOR_DOCUMENTS_E2E=1 E2E_BASE_URL=http://127.0.0.1:3000 npm run e2e -- supervisor-documents
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import seed from "../lib/mock/seed.json";

test.skip(process.env.SUPERVISOR_DOCUMENTS_E2E !== "1", "Requires a local mock-mode web server.");
test.use({ channel: process.env.E2E_BROWSER_CHANNEL, reducedMotion: "reduce" });

async function openDocument(page: Page, screen: "applicants" | "proposals") {
  await page.addInitScript(() => {
    sessionStorage.setItem("urecamatch.intro.seen", "1");
    sessionStorage.setItem("urecamatch.session", JSON.stringify({
      userId: "sup-1", role: "supervisor", name: "Prof. Marcus Chua", expiresAt: Date.now() + 30 * 60_000,
    }));
  });
  const entry = screen === "applicants"
    ? seed.applications.find((application) => application.listing_id === "lst-1")!
    : seed.proposals.find((proposal) => proposal.supervisor_id === "sup-1" && proposal.status === "submitted")!;
  const student = seed.users.find((user) => user.id === entry.student_id)!;
  const file = seed.students.find((profile) => profile.user_id === student.id)!.documents
    .find((file) => entry.document_ids.includes(file.id))!;
  await page.goto(screen === "applicants" ? "/projects/lst-1/applicants" : "/proposals");
  if (screen === "applicants") await page.getByRole("button", { name: student.name, exact: true }).click();
  else await page.getByRole("button", { name: "View profile", exact: true }).click();
  await page.locator("summary").filter({ hasText: file.file_name }).click();
  return file;
}

async function expectOriginalDownload(page: Page, name: string) {
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(name);
  expect(await download.failure()).toBeNull();
  expect(await readFile((await download.path())!)).toEqual(await readFile(path.resolve("public/sample-transcript.pdf")));
  expect(page.context().pages()).toHaveLength(1);
}

for (const screen of ["applicants", "proposals"] as const) {
  test(`REQ-VRANK-3, REQ-REVPROP-1: ${screen} shows a read-only PDF and downloads the original`, async ({ page }) => {
    const file = await openDocument(page, screen);
    const preview = page.getByRole("document", { name: file.file_name, exact: true });
    await expect(preview).toHaveAttribute("aria-busy", "false");
    await expect(preview.locator("canvas").first()).toBeVisible();
    await expect(page.locator("iframe, embed, object")).toHaveCount(0);
    await expectOriginalDownload(page, file.file_name);
    await expect(preview).toBeVisible();
  });
}

test("REQ-VRANK-3: a failed download shows a message and can be retried", async ({ page }) => {
  let failDownload = false;
  await page.route("**/sample-transcript.pdf", (route) => failDownload
    ? route.fulfill({ status: 403, body: "Link expired" })
    : route.continue());
  const file = await openDocument(page, "applicants");
  await expect(page.getByRole("document", { name: file.file_name, exact: true })).toHaveAttribute("aria-busy", "false");
  failDownload = true;
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const error = page.getByRole("alert").filter({ hasText: "The PDF could not be downloaded." });
  await expect(error).toHaveText("The PDF could not be downloaded. Please try again.");
  failDownload = false;
  await expectOriginalDownload(page, file.file_name);
  await expect(error).toHaveCount(0);
});

test("REQ-REVPROP-1: the original PDF can be downloaded even if the preview fails", async ({ page }) => {
  let failPreview = true;
  await page.route("**/sample-transcript.pdf", (route) => failPreview
    ? route.fulfill({ status: 503, body: "Unavailable" })
    : route.continue());
  const file = await openDocument(page, "proposals");
  await expect(page.getByText("This document could not be shown.", { exact: false })).toBeVisible();
  failPreview = false;
  await expectOriginalDownload(page, file.file_name);
});
