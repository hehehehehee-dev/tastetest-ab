import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
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
        freeze: makeFreeze(
          {
            ...run,
            proxySkipLlm: body.llmMode === "skip",
            proxyVisitorPick: body.visitorPick,
          },
          { ...body, metadata: run.benchmarkMetadata },
        ),
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
            {
              correct: grade === "✓" ? 1 : 0,
              total: grade === "NOT RUN" ? 0 : 1,
            },
          ]),
        ),
      };
    }
    await route.fulfill({ json: run });
  });
  await page.goto("/benchmark");
  await page
    .locator(".benchmark-drawer > summary")
    .filter({ hasText: "Proxy benchmark" })
    .click();
  await expect(
    page.locator(".benchmark-overview article").first().locator("strong"),
  ).toHaveText("LLM 0/0 · Qloo 0/0 · Agent 0/0");
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
  await expect(
    page.getByRole("heading", { name: "Your guess · optional" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reveal proxy outcome" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "B · Fixture candidate B",
      exact: true,
    })
    .click();
  await expect(page.locator(".proxy-outcome")).toHaveCount(0);
  await page.getByRole("button", { name: "Show results", exact: true }).click();
  await expect(page).toHaveURL(/\/benchmark\/proxy\/run\//);
  await expect(
    page.getByRole("heading", { name: "Segment winner: Option A" }),
  ).toBeVisible();
  const reportHeadings = await page
    .locator(
      ".proxy-outcome .verdict-report-section > div:last-child > h2, .proxy-outcome .verdict-report-section > div:last-child > h3",
    )
    .allTextContents();
  expect(reportHeadings).toEqual([
    "The Verdict",
    "Where we disagreed",
    "What surprised us",
    "How this verdict was built",
  ]);
  await expect(page.locator(".proxy-outcome")).toContainText(
    /Historical preferences, not business results/,
  );
  await expect(
    page.getByRole("link", {
      name: /Without Qloo \/ keyword baseline comparison/,
    }),
  ).toBeVisible();
  await expect(page.locator(".proxy-outcome")).toContainText("mean 4.300/5");
  expect(
    await page
      .locator("main")
      .evaluate(
        (el) =>
          !!(
            el
              .querySelector(".proxy-outcome")
              .compareDocumentPosition(el.querySelector(".benchmark-table")) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
  ).toBe(true);
  await expect(
    page.getByRole("row").filter({ hasText: "LLM-only (manual paste)" }),
  ).toContainText("NOT RUN");
  await mkdir("artifacts", { recursive: true });
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share verdict image" }).click();
  const download = await downloadEvent;
  const bytes = await readFile(await download.path());
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.length).toBeGreaterThan(10000);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".proxy-verdict-actions")).toBeHidden();
  await expect(
    page.locator(".proxy-outcome .verdict-report-section"),
  ).toHaveCount(4);
  if (testInfo.project.name === "desktop") {
    expect(
      (await page.locator(".proxy-outcome").boundingBox()).height,
    ).toBeLessThan(900);
    const pdf = await page.pdf({
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
      path: `artifacts/proxy-verdict-print-${testInfo.project.name}.pdf`,
    });
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length).toBe(1);
  }
  await page.emulateMedia({ media: "screen" });
  await page.screenshot({
    path: `artifacts/proxy-reveal-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "View separate proxy tally" }).click();
  await page
    .locator(".benchmark-drawer > summary")
    .filter({ hasText: "Proxy benchmark" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Mock proxy workflow · 1 completed cases",
    }),
  ).toBeVisible();
  await expect(page.locator(".proxy-section")).toContainText("AI 0/0");
  await expect(
    page.locator(".benchmark-overview article").first().locator("strong"),
  ).toHaveText("LLM 0/0 · Qloo 0/0 · Agent 0/0");
  expect(
    (await (await request.get("/api/benchmark")).json()).tally.evaluableCases,
  ).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("the fixed GPT-5 model runs and reveals without manual prediction fields", async ({
  page,
}) => {
  const id = "00000000-0000-4000-8000-000000000222";
  const input = {
    id: "PX-001",
    seeds: [{ title: "Fixture seed", year: 1995, genres: ["Drama"] }],
    options: [
      { title: "Fixture A", year: 1995, genres: ["Drama"] },
      { title: "Fixture B", year: 1995, genres: ["Drama"] },
    ],
    audienceDefinition: "Synthetic audience",
  };
  const llmPrediction = {
    pick: "A",
    confidence: 70,
    source: "openai/gpt-5:" + "a".repeat(64),
    provider: "replicate",
    method: "automatic blind API",
    recordedAt: "2026-10-11T12:00:00Z",
    answer: "Fixture API answer",
  };
  const run = {
    id,
    input,
    options: input.options,
    seeds: [],
    mode: "real",
    scoringVersion: "qloo-candidate-affinity-v1",
    prediction: [{ score: 80 }, { score: 81 }],
    proxyDecisionPolicy: "always-pick-v1",
    llmPrediction: null,
  };
  await page.addInitScript(
    ({ id }) =>
      localStorage.setItem("tastetest-proxy-owner-" + id, "fixture-owner"),
    { id },
  );
  await page.route("**/api/proxy", (route) =>
    route.fulfill({
      json: {
        cases: [input],
        ai: {
          configured: true,
          enabled: true,
          model: "openai/gpt-5",
          models: [{ id: "openai/gpt-5", label: "GPT-5" }],
        },
      },
    }),
  );
  await page.route("**/api/proxy/runs/" + id, (route) =>
    route.fulfill({ json: run }),
  );
  await page.route("**/api/proxy/runs/" + id + "/ai", (route) => {
    expect(route.request().postDataJSON().model).toBeUndefined();
    return route.fulfill({ json: { ...run, llmPrediction } });
  });
  let frozen = false;
  await page.route("**/api/proxy/runs/" + id + "/freeze", (route) => {
    const body = route.request().postDataJSON();
    expect(body.llmMode).toBe("automatic");
    expect(body.beforeReveal).toBe(true);
    frozen = true;
    return route.fulfill({
      json: {
        ...run,
        freeze: {
          payload: {
            branches: { llm: llmPrediction },
            timing: "Fixture timing",
            note: "fixture",
          },
          sha256: "a".repeat(64),
        },
        frozenAt: "2026-10-11T12:01:00Z",
      },
    });
  });
  await page.route("**/api/proxy/runs/" + id + "/reveal", (route) =>
    route.fulfill({
      json: {
        ...run,
        freeze: {
          payload: { branches: { llm: llmPrediction }, visitorPick: null },
          sha256: "a".repeat(64),
        },
        result: { actual: "B", grades: { llm: "✗" } },
        outcome: {
          actual: "B",
          segmentUsers: 30,
          options: [
            { movieId: "1", mean: 3.7, count: 25, overallRatings: 500 },
            { movieId: "2", mean: 4.3, count: 22, overallRatings: 500 },
          ],
        },
      },
    }),
  );
  await page.goto("/benchmark/proxy/run/" + id);
  await expect(page.getByLabel("AI model · Replicate")).toHaveCount(0);
  await expect(page.locator("main input, main textarea")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Skip my guess → Show results", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Comparison results" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Replicate");
  await expect(page.getByRole("table")).toContainText("GPT-5");
  await expect(page.getByRole("table")).not.toContainText("a".repeat(64));
  await expect(page.getByRole("table")).not.toContainText("Agent");
  await expect(page.locator(".proxy-winner-letter")).toHaveText("B");
  await expect(
    page.locator(".proxy-outcome .verdict-report-section"),
  ).toHaveCount(4);
  const grade = page
    .locator('.proxy-branch-table td[data-label="Result"]')
    .first();
  await grade.scrollIntoViewIfNeeded();
  await expect(grade).toBeInViewport();
  await expect(page.locator(".proxy-verdict-option.is-winner")).toContainText(
    "Fixture B",
  );
  await expect(
    page.getByRole("heading", { name: "Your guess · optional" }),
  ).toHaveCount(0);
  expect(frozen).toBe(true);
});
