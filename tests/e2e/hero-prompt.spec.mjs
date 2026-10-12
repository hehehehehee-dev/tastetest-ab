import { expect, test } from "@playwright/test";

const examples = [
  ["Two poster designs", "Two poster designs — which one gets people in?"],
  ["Two menu specials", "Two menu specials — which one sells out first?"],
  ["Two event themes", "Two event themes — which one fills the room?"],
];

test("example chips fill the hero decision input", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("Freeze a prediction. Poll the audience. Get a verdict.", {
      exact: true,
    }),
  ).toBeVisible();
  const input = page.getByLabel("Start with your decision");

  for (const [label, value] of examples) {
    await page.getByRole("button", { name: label }).click();
    await expect(input).toHaveValue(value);
  }
});

test("hero decision submits into the existing create form", async ({
  page,
}) => {
  await page.goto("/");
  const decision = "Two storefront posters for a new cafe opening";
  await page.getByLabel("Start with your decision").fill(decision);
  await page.getByLabel("Start with your decision").press("Enter");

  await expect(page).toHaveURL(
    `/create?prompt=${encodeURIComponent(decision)}`,
  );
  await expect(page.getByLabel("Give it a name").first()).toHaveValue(decision);
  await expect(page.getByRole("status")).toContainText(
    "Your decision is ready to edit.",
  );
});

test("empty hero submit stays on the homepage and returns focus", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("Start with your decision");
  await page
    .getByRole("button", { name: "Create a test from this decision" })
    .click();

  await expect(page).toHaveURL(/\/$/);
  await expect(input).toBeFocused();
});

test("direct create route stays empty and prompt controls remain touch sized", async ({
  page,
}) => {
  await page.goto("/create");
  await expect(page.getByLabel("Give it a name").first()).toHaveValue("");

  await page.goto("/");
  for (const button of await page
    .locator(".hero-prompt-examples button")
    .all()) {
    const box = await button.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
});

test("remix carries the complete sample into a new draft", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Remix this demo" }).click();

  await expect(page).toHaveURL(/\/create\?remix=sample$/);
  await expect(page.getByRole("status")).toContainText(
    "The demo is ready to remix.",
  );
  await expect(page.getByLabel("Give it a name").nth(0)).toHaveValue(
    "Slow mornings club",
  );
  await expect(page.getByLabel("Give it a name").nth(1)).toHaveValue(
    "Weekend, turned up",
  );
  await expect(page.locator(".selected-seeds .chip")).toHaveCount(4);
});
