import { expect, test } from "@playwright/test";

const examples = [
  ["Two poster designs", "Minimal poster vs Colorful poster"],
  ["Two menu specials", "Phở gà vs Bún chả"],
  ["Two event themes", "Acoustic night vs Dance party"],
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
    await input.press("Enter");
    const [optionA, optionB] = value.split(" vs ");
    await expect(page.getByLabel("Give it a name").nth(0)).toHaveValue(optionA);
    await expect(page.getByLabel("Give it a name").nth(1)).toHaveValue(optionB);
    await expect(page.getByLabel("Describe the idea").nth(0)).toHaveValue("");
    await expect(page.getByLabel("Describe the idea").nth(1)).toHaveValue("");
    await page.goto("/");
  }
});

test("hero decision submits into the existing create form", async ({
  page,
}) => {
  await page.goto("/");
  const decision = "Two storefront posters for a new cafe opening";
  await page.getByLabel("Start with your decision").fill(decision);
  await page.getByLabel("Start with your decision").press("Enter");

  await expect(
    page.getByRole("button", { name: "Create a test from this decision" }),
  ).toBeDisabled({ timeout: 250 });
  await expect(page.getByRole("status")).toHaveText("Setting up your test…", {
    timeout: 250,
  });

  await expect(page).toHaveURL(
    `/create?prompt=${encodeURIComponent(decision)}`,
  );
  await expect(page.getByLabel("Give it a name").first()).toHaveValue(decision);
  await expect(page.getByRole("status")).toContainText(
    "Your decision is ready to edit.",
  );
});

test("hero decision splits supported A/B separators into both options", async ({
  page,
}) => {
  // Hold the short transition until its feedback has been asserted.
  // The real-time timer can otherwise expire between browser round trips.
  await page.clock.install({ time: new Date() });
  await page.clock.pauseAt(new Date());
  const cases = [
    ["Poster A vs Poster B", "Poster A", "Poster B"],
    ["Coffee vs. Tea", "Coffee", "Tea"],
    ["Morning or Evening", "Morning", "Evening"],
    ["Trong nhà hay ngoài trời", "Trong nhà", "ngoài trời"],
    ["Nhạc sống hoặc DJ", "Nhạc sống", "DJ"],
    [
      "pho ga - bun cha — which should VSA sell at the fundraiser?",
      "pho ga",
      "bun cha",
    ],
  ];

  for (const [decision, optionA, optionB] of cases) {
    await page.goto("/");
    await page.getByLabel("Start with your decision").fill(decision);
    await page.getByLabel("Start with your decision").press("Enter");
    await expect(page.getByRole("status")).toHaveText("Setting up your test…");
    await page.clock.runFor(500);
    await expect(page).toHaveURL(/\/create\?/);
    await expect(page.getByLabel("Give it a name").nth(0)).toHaveValue(optionA);
    await expect(page.getByLabel("Give it a name").nth(1)).toHaveValue(optionB);
    await expect(page.getByRole("status")).toContainText(
      "Both options are ready to edit.",
    );
  }
});

test("separator with an empty side falls back to the single prompt", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Start with your decision").fill("Poster A vs ");
  await page.getByLabel("Start with your decision").press("Enter");

  await expect(page).toHaveURL(
    `/create?prompt=${encodeURIComponent("Poster A vs")}`,
  );
  await expect(page.getByLabel("Give it a name").nth(0)).toHaveValue(
    "Poster A vs",
  );
  await expect(page.getByLabel("Give it a name").nth(1)).toHaveValue("");
});

test("audience tail prefills the editable audience note conservatively", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Start with your decision")
    .fill("pho ga or bun cha for VSA students");
  await page.getByLabel("Start with your decision").press("Enter");

  await expect(page).toHaveURL(
    `/create?optionA=pho%20ga&optionB=bun%20cha&audience=VSA%20students`,
  );
  await expect(page.getByLabel("Give it a name").nth(0)).toHaveValue("pho ga");
  await expect(page.getByLabel("Give it a name").nth(1)).toHaveValue("bun cha");
  await expect(
    page.getByLabel("Anything else about your audience? optional"),
  ).toHaveValue("VSA students");

  await page.goto("/");
  await page
    .getByLabel("Start with your decision")
    .fill("phở gà hoặc bún chả dành cho sinh viên VSA");
  await page.getByLabel("Start with your decision").press("Enter");
  await expect(page.getByLabel("Give it a name").nth(1)).toHaveValue("bún chả");
  await expect(
    page.getByLabel("Anything else about your audience? optional"),
  ).toHaveValue("sinh viên VSA");
});

test("one-word audience tail stays in option B", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("Start with your decision")
    .fill("Poster A vs Poster B for VSA");
  await page.getByLabel("Start with your decision").press("Enter");

  await expect(page.getByLabel("Give it a name").nth(1)).toHaveValue(
    "Poster B for VSA",
  );
  await expect(
    page.getByLabel("Anything else about your audience? optional"),
  ).toHaveValue("");
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

test("slash focuses the hero decision input", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "The slash shortcut targets physical keyboards.",
  );
  await page.goto("/");
  const input = page.getByLabel("Start with your decision");
  await page.locator("body").click({ position: { x: 8, y: 8 } });
  await page.keyboard.press("/");
  await expect(input).toBeFocused();
});

test("direct create route stays empty and prompt controls remain touch sized", async ({
  page,
}) => {
  await page.goto("/create");
  await expect(page.getByLabel("Give it a name").first()).toHaveValue("");
  const descriptions = page.getByLabel("Describe the idea");
  await expect(descriptions).toHaveCount(2);
  await expect(descriptions.nth(0)).toHaveAttribute("required", "");
  await expect(descriptions.nth(1)).toHaveAttribute("required", "");

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
