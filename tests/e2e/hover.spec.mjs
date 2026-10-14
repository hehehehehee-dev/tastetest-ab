import { test, expect } from "@playwright/test";

test("taste flow explains the real case pipeline in three fixed stages", async ({
  page,
}) => {
  await page.goto("/");
  const flow = page.getByRole("figure", {
    name: "How TasteTest turns audience tastes into an A/B prediction",
  });
  await expect(flow).toBeVisible();
  await expect(flow.locator(".taste-flow-stage")).toHaveCount(3);
  await expect(flow).toContainText("01 · INPUT");
  await expect(flow).toContainText("Phoebe Bridgers");
  await expect(flow).toContainText("02 · QLOO");
  await expect(flow).toContainText("Small-batch & handmade");
  await expect(flow).toContainText("Synthetic demo signals");
  await expect(flow).toContainText("03 · A/B FIT");
  await expect(flow).toContainText("A · Slow mornings club");
  await expect(flow).toContainText("Freeze the prediction");
  await expect(flow).toContainText("poll real people");
  await expect(flow).toContainText("reveal the verdict");
});

test("taste flow stays inside the viewport without overlapping at narrow widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const flow = page.locator(".taste-flow");
  await flow.scrollIntoViewIfNeeded();
  const box = await flow.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
