import { test, expect } from "@playwright/test";
test("historical results reveal only after a persisted commitment", async ({
  page,
}) => {
  await page.goto("/case-study/cookie-cats");
  await expect(page.getByText("19.02%")).toHaveCount(0);
  await expect(page.getByText(/may already be in a model/)).toBeVisible();
  await page
    .getByLabel("Model or source")
    .fill("Human illustrative hypothesis");
  await page.getByLabel("Committed answer").selectOption("B");
  await page
    .getByLabel("Original rationale")
    .fill("Illustrative hypothesis only; not a measured model prediction.");
  await page.getByRole("button", { name: "Commit answer & reveal" }).click();
  await expect(page.getByText("19.02%")).toBeVisible();
  await expect(page.getByText("18.20%")).toBeVisible();
  await expect(page.getByText(/choice differs/)).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download commitment receipt" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^cookie-cats-.*\.json$/);
});
