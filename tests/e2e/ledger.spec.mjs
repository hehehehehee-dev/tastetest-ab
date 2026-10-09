import { test, expect } from "@playwright/test";
test("Track B pending registry and CSV preserve unknown TB-001 timing without scoring it", async ({
  page,
  request,
}, testInfo) => {
  await page.goto("/benchmark");
  await expect(
    page.getByRole("heading", { name: "Track B case register", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "TB-001 · partial record — pending",
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
  expect(await csv.text()).toContain('"TB-001","partial record — pending"');
  await page.screenshot({
    path: `artifacts/track-b-register-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
