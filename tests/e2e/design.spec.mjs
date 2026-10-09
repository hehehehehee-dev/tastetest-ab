import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";

test("product fits the first desktop viewport; posters, touch targets and reduced motion remain usable", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator(".prediction-card .option-image")).toHaveCount(2);
    await expect
      .poll(() =>
        page
          .locator(".prediction-card .option-image")
          .evaluateAll((images) =>
            images.every((i) => i.complete && i.naturalWidth > 0),
          ),
      )
      .toBe(true);
    for (const target of await page
      .locator(".prediction-card, .agent-badge, .confidence-note")
      .all()) {
      const box = await target.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThan(viewport.height);
    }
    const evidence = await page.locator(".supporting-evidence").boundingBox();
    const card = await page.locator(".prediction-card").last().boundingBox();
    expect(evidence.y).toBeGreaterThan(card.y + card.height);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  for (const target of await page
    .locator(".report-tabs button, .toggle-label, .chip, .map-node")
    .all()) {
    const box = await target.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".score-fill")
      .first()
      .evaluate((n) => getComputedStyle(n).animationName),
  ).toBe("none");
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: `artifacts/design-mobile-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("baseline verdict has one score set, exports a real PNG and prints only one white verdict sheet", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "desktop")
    await page.setViewportSize({ width: 1440, height: 900 });
  const sample = await (await page.request.get("/api/sample")).json();
  await page.goto("/");
  await page.getByRole("checkbox", { name: "Keyword baseline" }).check();
  await page.getByRole("button", { name: "Verdict", exact: true }).click();
  const card = page.locator(".verdict-artefact");
  await expect(card).toContainText("KEYWORD BASELINE VIEW");
  await expect(card.locator(".verdict-bar-label").first()).toContainText(
    sample.baseline
      .map((s, i) => `${i ? "B" : "A"} ${s.score}/100`)
      .join(" · "),
  );
  await expect(page.locator(".prediction-card")).toHaveCount(0);
  await expect(card).not.toContainText("100/100");
  await expect(card).not.toContainText("supports the mock cultural prediction");
  await page.getByRole("checkbox", { name: "Keyword baseline" }).uncheck();
  await expect(card).toContainText("SYNTHETIC CAFE EXAMPLE");
  await expect(card.locator(".verdict-bar-label").first()).toContainText(
    "A 100/100 · B 16/100",
  );
  await expect(card.locator(".verdict-number")).toHaveText("71%");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share verdict image" }).click();
  const download = await downloadEvent;
  const bytes = await readFile(await download.path());
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.length).toBeGreaterThan(10000);
  await expect(page.getByRole("status")).toContainText(
    "Verdict image downloaded",
  );
  await mkdir("artifacts", { recursive: true });
  await download.saveAs(
    `artifacts/verdict-export-${testInfo.project.name}.png`,
  );
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".experiment-heading")).toBeHidden();
  await expect(page.locator(".verdict-actions")).toBeHidden();
  await expect(card).toBeVisible();
  expect(await card.evaluate((n) => getComputedStyle(n).backgroundColor)).toBe(
    "rgb(255, 255, 255)",
  );
  if (testInfo.project.name === "desktop")
    expect((await card.boundingBox()).height).toBeLessThan(1000);
  const pdf = await page.pdf({
    format: "A4",
    preferCSSPageSize: true,
    printBackground: true,
    path: `artifacts/verdict-print-${testInfo.project.name}.pdf`,
  });
  expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length).toBe(1);
});

test("benchmark opens with three tiles and hides audit details until requested", async ({
  page,
}) => {
  await page.goto("/benchmark");
  await expect(page.locator(".benchmark-overview > article")).toHaveCount(3);
  await expect(page.locator(".benchmark-overview")).toContainText(
    "not enough cases yet",
  );
  expect(await page.locator(".benchmark-drawer[open]").count()).toBe(0);
  await expect(
    page.locator(".benchmark-drawer").last().locator("summary").first(),
  ).toContainText("Methodology & calibration");
  await page
    .locator(".benchmark-drawer > summary")
    .filter({ hasText: "Track B case register" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "TB-001 · closed — unverifiable / excluded from evidence",
    }),
  ).toBeVisible();
});
