import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { predictProxy, scoreProxyFreeze } from "../../server/proxy.mjs";
import { makeFreeze } from "../../server/benchmark.mjs";
test("proxy UI hides ratings until an immutable freeze then reveals separate mock grades", async ({
  page,
  request,
}, testInfo) => {
  const input = {
    id: "PX-001",
    dataset: "synthetic-browser-fixture",
    seeds: [1, 2, 3].map((i) => ({
      movieId: String(i),
      title: `Fixture seed ${i}`,
      year: 1995,
      genres: ["Drama"],
    })),
    options: [
      {
        movieId: "4",
        title: "Fixture candidate A",
        year: 1995,
        genres: ["Drama", "Crime"],
      },
      {
        movieId: "5",
        title: "Fixture candidate B",
        year: 1995,
        genres: ["Comedy"],
      },
    ],
    audienceDefinition:
      "Synthetic fixture: users who rated all three seeds >=4.",
  };
  const id = "00000000-0000-4000-8000-000000000111",
    ownerToken = "synthetic-proxy-owner-not-evidence";
  let run = {
      ...(await predictProxy(input, undefined, true)),
      id,
      proxyCaseId: input.id,
      input,
      caseSetHash: "synthetic-fixture-hash",
      createdAt: "2026-01-01T00:00:00Z",
      lifecycle: "draft",
    },
    revealed = false;
  const catalog = {
    cases: [input],
    manifest: { dataset: input.dataset, rules: { minOverallRatings: 500 } },
    available: true,
    tally: {
      real: {
        cases: 0,
        counts: {
          llm: { correct: 0, total: 0 },
          qloo: { correct: 0, total: 0 },
          agent: { correct: 0, total: 0 },
        },
      },
      mock: {
        cases: 0,
        counts: {
          llm: { correct: 0, total: 0 },
          qloo: { correct: 0, total: 0 },
          agent: { correct: 0, total: 0 },
        },
      },
    },
  };
  await page.route("**/api/proxy", (route) => route.fulfill({ json: catalog }));
  await page.route("**/api/proxy/cases/PX-001/start", (route) =>
    route.fulfill({ status: 201, json: { run, ownerToken } }),
  );
  await page.route(`**/api/proxy/runs/${id}**`, async (route) => {
    if (route.request().url().endsWith("/freeze")) {
      const body = route.request().postDataJSON();
      run = {
        ...run,
        freeze: makeFreeze(run, { ...body, metadata: run.benchmarkMetadata }),
        lifecycle: "predictions frozen",
      };
      run.frozenAt = run.freeze.payload.frozenAt;
    }
    if (route.request().url().endsWith("/reveal")) {
      const outcome = {
        actual: "A",
        segmentUsers: 100,
        options: [
          { movieId: "4", mean: 4.3, count: 30, overallRatings: 900 },
          { movieId: "5", mean: 3.7, count: 40, overallRatings: 1000 },
        ],
      };
      run = {
        ...run,
        outcome,
        result: scoreProxyFreeze(run.freeze, outcome),
        lifecycle: "revealed",
      };
      revealed = true;
      catalog.tally.mock = {
        cases: 1,
        counts: Object.fromEntries(
          Object.entries(run.result.grades).map(([key, grade]) => [
            key,
            { correct: grade === "✓" ? 1 : 0, total: 1 },
          ]),
        ),
      };
    }
    await route.fulfill({ json: run });
  });
  await page.goto("/benchmark");
  await expect(page.locator(".track-b-counts")).toHaveText(
    "LLM-only 0/0 · Qloo 0/0 · Agent 0/0",
  );
  await expect(
    page.getByRole("heading", {
      name: "Proxy benchmark — real preference data",
    }),
  ).toBeVisible();
  await page.getByText("Browse 1 proxy cases").click();
  await page
    .getByRole("link", { name: /PX-001 · Fixture candidate A/ })
    .click();
  await expect(page.locator(".proxy-outcome")).toHaveCount(0);
  await page.getByRole("button", { name: "Start proxy case" }).click();
  await expect(page).toHaveURL(/\/benchmark\/proxy\/run\//);
  await expect(
    page.getByRole("button", { name: "Reveal proxy outcome" }),
  ).toHaveCount(0);
  await page.getByLabel("LLM pick", { exact: true }).selectOption("B");
  await page.getByLabel("Exact model/version or human").fill("human");
  await page
    .getByLabel("Paste original LLM answer")
    .fill(
      "Synthetic UI fixture: choosing option B, not a real model prediction.",
    );
  await page
    .getByLabel(
      "I have not viewed this segment's outcome before recording these predictions.",
    )
    .check();
  await page.getByRole("button", { name: "Freeze proxy predictions" }).click();
  await expect(
    page.getByRole("heading", { name: /^Frozen at / }),
  ).toBeVisible();
  expect(revealed).toBe(false);
  await expect(page.locator(".proxy-outcome")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Freeze proxy predictions" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal proxy outcome" }).click();
  await expect(
    page.getByRole("heading", { name: "Segment winner: Option A" }),
  ).toBeVisible();
  await expect(page.locator(".proxy-outcome")).toContainText("mean 4.300/5");
  await expect(
    page.getByRole("row").filter({ hasText: "LLM-only (manual paste)" }),
  ).toContainText("✗");
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: `artifacts/proxy-reveal-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "View separate proxy tally" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Mock proxy workflow · 1 completed cases",
    }),
  ).toBeVisible();
  await expect(page.locator(".proxy-section")).toContainText("LLM-only 0/1");
  await expect(page.locator(".track-b-counts")).toHaveText(
    "LLM-only 0/0 · Qloo 0/0 · Agent 0/0",
  );
  expect(
    (await (await request.get("/api/benchmark")).json()).tally.evaluableCases,
  ).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
