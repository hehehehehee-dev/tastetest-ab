import { expect, test } from "@playwright/test";

async function contrastRatio(page, foregroundSelector, backgroundSelector) {
  return page.evaluate(
    ({ foregroundSelector, backgroundSelector }) => {
      const parse = (value) =>
        value
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number);
      const luminance = (rgb) => {
        const values = rgb.map((value) => {
          const channel = value / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
      };
      const foreground = parse(
        getComputedStyle(document.querySelector(foregroundSelector)).color,
      );
      const background = parse(
        getComputedStyle(document.querySelector(backgroundSelector))
          .backgroundColor,
      );
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return (light + 0.05) / (dark + 0.05);
    },
    { foregroundSelector, backgroundSelector },
  );
}

test("header toggles light and dark themes and remembers the choice", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("button", { name: "Switch to dark mode" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("link", { name: "Explore cases", exact: true }).click();
  await expect(page).toHaveURL(/\/benchmark$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("link", { name: "TasteTest A/B — Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("theme control is a 44px target without horizontal overflow", async ({
  page,
}) => {
  await page.goto("/");
  const toggle = await page.locator(".theme-toggle").boundingBox();
  expect(toggle.width).toBeGreaterThanOrEqual(44);
  expect(toggle.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
});

test("key text keeps AA contrast in dark and light modes", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("heading", { name: /Which .*\?/ })
    .waitFor({ state: "visible" });

  for (const mode of ["dark", "light"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== mode) {
      await page.locator(".theme-toggle").click();
    }
    for (const [foreground, background] of [
      [".mock-pill", ".mock-pill"],
      [".header-new", ".header-new"],
      [".prediction-card h3", ".prediction-card"],
      [".prediction-card .score-caption", ".prediction-card"],
      [".prediction-audience .chip", ".prediction-audience .chip"],
      [".faq-drawer > summary span:first-child", ".faq-drawer"],
      [".faq-drawer > summary span:last-child", ".faq-drawer"],
    ]) {
      expect(
        await contrastRatio(page, foreground, background),
      ).toBeGreaterThanOrEqual(4.5);
    }

    await page.locator(".faq-drawer > summary").click();
    expect(
      await contrastRatio(page, ".faq-question > summary", ".faq-drawer"),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await contrastRatio(page, ".faq-answer", ".faq-drawer"),
    ).toBeGreaterThanOrEqual(4.5);
    await page.locator(".faq-drawer > summary").click();
  }
});
