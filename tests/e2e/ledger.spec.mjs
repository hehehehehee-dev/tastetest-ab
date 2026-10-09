import { test, expect } from "@playwright/test";
test("Track B excluded-note registry and CSV preserve unknown TB-001 timing without scoring it", async ({
  page,
  request,
}, testInfo) => {
  await page.goto("/benchmark");
  await page
    .locator(".benchmark-drawer > summary")
    .filter({ hasText: "Track B case register" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Track B case register", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".excluded-record-notes")).toContainText(
    "excluded from the record count and every Track B tally",
  );
  const data = await (await request.get("/api/benchmark")).json();
  expect(data.pending.some((row) => row.caseLabel === "TB-001")).toBe(false);
  expect(data.rows.some((row) => row.caseLabel === "TB-001")).toBe(false);
  expect(data.openCases.some((row) => row.caseLabel === "TB-001")).toBe(false);
  expect(
    data.excludedNotes.find((row) => row.caseLabel === "TB-001").status,
  ).toBe("closed — unverifiable / excluded from evidence");
  await expect(
    page.getByRole("heading", {
      name: "TB-001 · closed — unverifiable / excluded from evidence",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Entered into ledger on 2026-10-09/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Export Track B CSV", exact: true }),
  ).toHaveAttribute("href", "/api/benchmark/export.csv");
  const csv = await request.get("/api/benchmark/export.csv");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain(
    '"TB-001","closed — unverifiable / excluded from evidence"',
  );
  await page.screenshot({
    path: `artifacts/track-b-register-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
