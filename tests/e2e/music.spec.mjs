import { test, expect } from "@playwright/test";
import catalog from "../../server/data/proxy-lastfm-cases.json" with { type: "json" };
import { fileStore } from "../../server/storage.mjs";
import { musicStore, validateMusicOutcomes } from "../../server/musicProxy.mjs";
import { seedProxyOutcomes } from "../../server/proxy.mjs";
test.beforeAll(async () => {
  const outcomes = catalog.cases.map((c) => ({
    id: c.id,
    dataset: c.dataset,
    segmentUsers: 30,
    options: c.options.map((a, i) => ({
      artistId: a.artistId,
      count: 25,
      overallListeners: 200,
      mean: i ? 100 : 150,
    })),
    relativeGap: 0.5,
    actual: "A",
  }));
  await seedProxyOutcomes(
    musicStore(fileStore(".local/e2e-data")),
    catalog,
    { caseSetHash: catalog.caseSetHash, outcomes },
    validateMusicOutcomes,
  );
});
test("music drawer and case support manual freeze, hidden outcome and isolated reveal on desktop/mobile", async ({
  page,
}) => {
  await page.goto("/benchmark");
  const privateFile = await page.request.get(
    "/.local/lastfm/proxy-lastfm-outcomes.json",
  );
  expect([403, 404]).toContain(privateFile.status());
  await page
    .locator(".benchmark-drawer > summary")
    .filter({ hasText: "Proxy — music" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Proxy — music · real preference data",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Music protocol v2:/)).toBeVisible();
  await page
    .locator(".music-proxy-section details.proxy-case-list > summary")
    .click();
  await page
    .locator(".music-proxy-section .proxy-case-list")
    .getByRole("link", { name: /MX-001/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "MX-001", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your guess · optional" }),
  ).toBeVisible();
  const choiceGroup = await page
    .locator(".proxy-visitor-choice .case-navigation-links")
    .boundingBox();
  const resultActions = await page
    .locator(".proxy-visitor-choice .proxy-choice-actions")
    .boundingBox();
  expect(
    resultActions.y - (choiceGroup.y + choiceGroup.height),
  ).toBeGreaterThanOrEqual(8);
  await expect(page.locator(".proxy-outcome")).toHaveCount(0);
  await expect(page.locator(".verdict-chat")).toHaveCount(0);
  await expect(
    page.locator("main input, main select, main textarea"),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Skip my guess → Show results", exact: true })
    .click();
  await expect(page).toHaveURL(/\/benchmark\/music\/run\//);
  await expect(
    page.getByRole("heading", { name: "Segment winner: Option A" }),
  ).toBeVisible();
  await expect(page.locator(".verdict-chat")).toBeVisible();
  await expect(page.locator(".proxy-outcome")).toContainText(
    "observed listens per segment user",
  );
  await expect(page.locator(".proxy-verdict-tag")).toContainText("Proxy-music");
  await expect(
    page.locator(".proxy-outcome .verdict-report-section"),
  ).toHaveCount(4);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  expect(overflow).toBe(false);
});
