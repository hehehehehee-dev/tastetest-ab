import { test, expect } from "@playwright/test";

test("context meter counts useful fields, permits three seeds, and never treats text length as confidence", async ({
  page,
  request,
}, testInfo) => {
  const sample = await (await request.get("/api/sample")).json();
  const seeds = [
    ...sample.seeds,
    {
      entity_id: "extra-fixture-taste",
      name: "Fifth fixture taste",
      category: "Music",
    },
  ];
  await page.route("**/api/search?**", (route) =>
    route.fulfill({ json: { results: { entities: seeds } } }),
  );
  await page.goto("/create");
  const meter = page.getByRole("progressbar", {
    name: "Test context completeness",
  });
  await expect(meter).toHaveAttribute("aria-valuenow", "0");
  await expect(meter).toHaveAttribute("aria-valuemax", "10");
  await page.getByLabel("Give it a name").nth(0).fill("Tea tasting");
  await page
    .getByLabel("Describe the idea")
    .nth(0)
    .fill("A relaxed tea tasting for the club.");
  await page.getByLabel("Give it a name").nth(1).fill("Coffee tasting");
  await page
    .getByLabel("Describe the idea")
    .nth(1)
    .fill("A relaxed coffee tasting at the same price.");
  await expect(meter).toHaveAttribute("aria-valuenow", "4");
  for (const seed of seeds.slice(0, 3))
    await page.getByRole("button", { name: seed.name, exact: true }).click();
  await expect(meter).toHaveAttribute("aria-valuenow", "7");
  await expect(meter).toHaveAttribute(
    "aria-valuetext",
    /Required decision context complete/,
  );
  await expect(page.locator(".test-context-next")).toContainText(
    "Ready to predict",
  );
  await expect(page.locator(".test-context-meter")).toContainText("optional");
  let submitted;
  await page.route("**/api/tests", (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({
      status: 503,
      json: { error: "Fixture prediction unavailable" },
    });
  });
  await page
    .getByRole("button", { name: "Predict & freeze", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Fixture prediction unavailable",
  );
  expect(submitted.seedEntityIds).toHaveLength(3);
  for (const seed of seeds.slice(3))
    await page.getByRole("button", { name: seed.name, exact: true }).click();
  await page
    .getByLabel("Anything else about your audience?")
    .fill("A student club comparing two social events.");
  await expect(meter).toHaveAttribute("aria-valuenow", "10");
  await page
    .getByLabel("Describe the idea")
    .nth(0)
    .fill("Extra text. ".repeat(70));
  await expect(meter).toHaveAttribute("aria-valuenow", "10");
  await expect(page.locator(".test-context-meter")).toContainText(
    "completeness, not prediction confidence",
  );
  await page
    .getByRole("button", { name: "Record as evidence", exact: true })
    .click();
  await expect(page.locator(".test-context-next")).toContainText(
    "Finish the evidence record below",
  );
  await expect(page.locator(".test-context-meter")).not.toContainText(
    "Ready to predict",
  );
  await page.getByRole("button", { name: "Quick test", exact: true }).click();
  await expect(meter).toHaveAttribute("aria-valuenow", "10");
  await page
    .getByRole("button", { name: `Remove ${seeds[4].name}`, exact: true })
    .click();
  await expect(meter).toHaveAttribute("aria-valuenow", "9");
  await page.getByLabel("Describe the idea").nth(0).fill(" ");
  await expect(meter).toHaveAttribute("aria-valuenow", "8");
  await expect(page.locator(".test-context-next")).toContainText("Option A");
  await expect(meter).not.toHaveAttribute(
    "aria-valuetext",
    /Required decision context complete/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: `artifacts/test-context-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
