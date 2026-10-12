import { expect, test } from "@playwright/test";

const examples = [
  ["Two poster designs", "Two poster designs — which one gets people in?"],
  ["Two menu specials", "Two menu specials — which one sells out first?"],
  ["Two event themes", "Two event themes — which one fills the room?"],
];

test("example chips fill the hero decision input", async ({ page }) => {
  await page.goto("/");
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
