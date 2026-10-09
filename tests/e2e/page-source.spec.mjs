import { test, expect } from "@playwright/test";

test("page badges use the saved case source even when the server is configured for real Qloo", async ({
  page,
  request,
}) => {
  const sample = await (await request.get("/api/sample")).json();
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        mode: "real",
        configured: true,
        ai: { provider: "manual", configured: false },
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".mock-pill")).toHaveText(
    "Cafe demo · synthetic signals",
  );
  await expect(page.locator("main")).toContainText(
    "No real Qloo API calls for this example",
  );
  await page.getByRole("link", { name: "New test", exact: true }).click();
  await expect(page.locator(".mock-pill")).toHaveText(
    "New tests · Qloo API configured",
  );
  await page.locator(".brand").click();
  await expect(page.locator(".mock-pill")).toHaveText(
    "Cafe demo · synthetic signals",
  );
  const id = "00000000-0000-4000-8000-000000000991";
  let source = "mock";
  await page.route(`**/api/tests/${id}`, (route) =>
    route.fulfill({ json: { ...sample, id, isSample: false, mode: source } }),
  );
  await page.goto(`/test/${id}`);
  await expect(page.locator(".mock-pill")).toHaveText(
    "This case · synthetic signals",
  );
  source = "real";
  await page.reload();
  await expect(page.locator(".mock-pill")).toHaveText(
    "This case · Qloo data + local scoring",
  );
  await page.goto("/benchmark");
  await expect(page.locator(".mock-pill")).toHaveText(
    "Benchmark · see each case’s data source",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
