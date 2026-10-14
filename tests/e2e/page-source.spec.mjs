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
  await expect(page.locator(".mock-pill")).toHaveCount(0);
  await expect(page.locator("main")).toContainText(
    "No real Qloo API calls for this example",
  );
  await page.getByRole("link", { name: "New test", exact: true }).click();
  await expect(page.locator(".mock-pill")).toHaveText(
    "New tests · Qloo API configured",
  );
  await page.locator(".brand").click();
  await expect(page.locator(".mock-pill")).toHaveCount(0);
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
  await expect(page.locator(".mock-pill")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("header context links explain the source and New test resets its form", async ({
  page,
}) => {
  await page.goto("/create");
  const firstOption = page.getByPlaceholder("Your first concept");
  await firstOption.fill("A draft that should be cleared");

  await page.getByRole("link", { name: "New test", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(firstOption).toHaveValue("");

  await page
    .getByRole("link", { name: /Read the data-source explanation/ })
    .click();
  await expect(page).toHaveURL(/\/faq#data-sources$/);
  await expect(page.locator("#data-sources")).toHaveAttribute("open", "");
  await expect(page.locator("#data-sources")).toBeInViewport();
  await expect(page.locator("#data-sources .faq-answer")).toBeVisible();
});
