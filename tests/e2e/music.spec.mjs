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
  await page.getByText("Browse 40 proxy cases", { exact: true }).last().click();
  await page.getByRole("link", { name: /MX-001/ }).click();
  await expect(
    page.getByRole("heading", { name: "MX-001", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start proxy case", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Record the independent prediction" }),
  ).toBeVisible();
  await expect(page.locator(".proxy-outcome")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Exact model/version or human" })
    .fill("human — synthetic UI test fixture");
  await page
    .getByRole("textbox", { name: "Paste original LLM answer" })
    .fill("Synthetic UI fixture selects A before reveal.");
  await page.getByRole("checkbox", { name: /I have not viewed/ }).check();
  await page
    .getByRole("button", { name: "Freeze proxy predictions", exact: true })
    .click();
  await expect(page.getByText(/^SHA-256 /)).toBeVisible();
  await expect(page.locator(".proxy-outcome")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reveal proxy outcome", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Segment winner: Option A" }),
  ).toBeVisible();
  await expect(page.locator(".proxy-outcome")).toContainText(
    "observed listens per segment user",
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  expect(overflow).toBe(false);
});
