import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test("sample, creation, independent voter, live update, closure and print", async ({
  page,
  browser,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "The audience has spoken." }),
  ).toBeVisible();
  await expect(page.getByText("52 votes", { exact: true })).toBeVisible();
  const scores = page.locator(".score-number");
  await expect(scores.first()).toContainText("100");
  await page.waitForTimeout(700);
  const before = await scores.allTextContents();
  await page.getByRole("checkbox", { name: "Without Qloo" }).check();
  await page.waitForTimeout(700);
  expect(await scores.allTextContents()).not.toEqual(before);
  await expect(page.getByText(/Keyword baseline/)).toBeVisible();
  await page.getByRole("checkbox", { name: "Without Qloo" }).uncheck();
  await expect(scores.first()).toHaveText("100/ 100");
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: `artifacts/sample-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  await page.getByRole("link", { name: "New test" }).click();
  await page.getByLabel("Give it a name").nth(0).fill("Slow mornings club");
  await page
    .getByLabel("Describe the idea")
    .nth(0)
    .fill(
      "A cozy local coffee ritual with nostalgic indie vinyl and handmade artful lettering.",
    );
  await page.getByLabel("Give it a name").nth(1).fill("Weekend, turned up");
  await page
    .getByLabel("Describe the idea")
    .nth(1)
    .fill("A bold colorful pop campaign with bright playful community energy.");
  await page.getByRole("button", { name: "Phoebe Bridgers" }).click();
  await page.getByRole("tab", { name: "Film/TV" }).click();
  await page.getByRole("button", { name: "A24 films" }).click();
  await page.getByRole("tab", { name: "Dining" }).click();
  await page.getByRole("button", { name: "Independent coffee shops" }).click();
  await page
    .getByLabel("Anything else about your audience?")
    .fill("IU students near campus");
  await page.screenshot({
    path: `artifacts/create-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Get agent prediction" }).click();
  await expect(page).toHaveURL(/\/test\//);
  await page.getByRole("button", { name: "Open live poll" }).click();
  await expect(
    page.getByText("Your first vote starts the story."),
  ).toBeVisible();
  const link = await page.getByLabel("Your audience link").inputValue();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const voter = await context.newPage();
  await voter.goto(link);
  await expect(
    voter.getByRole("heading", { name: "Which one speaks to you?" }),
  ).toBeVisible();
  await voter.getByRole("button", { name: /Slow mornings club/ }).click();
  await expect(
    voter.getByText("Vote recorded. Thanks for weighing in."),
  ).toBeVisible();
  await voter.reload();
  await expect(
    voter.getByRole("heading", { name: "You’re part of the decision." }),
  ).toBeVisible();
  await expect(
    voter.getByRole("button", { name: /Slow mornings club/ }),
  ).toBeDisabled();
  await expect(page.locator(".vote-count")).toContainText("1 vote");
  await voter.screenshot({
    path: `artifacts/poll-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close test", exact: true }).click();
  await page.getByRole("button", { name: "Close & reveal verdict" }).click();
  await expect(
    page.getByRole("heading", { name: "The audience has spoken." }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".verdict-number")).toHaveText("100%", {
    timeout: 10000,
  });
  await expect(
    voter.getByRole("heading", { name: "The results are in." }),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print report" })).toBeHidden();
  await page.screenshot({
    path: `artifacts/print-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await context.close();
  expect(errors).toEqual([]);
});
