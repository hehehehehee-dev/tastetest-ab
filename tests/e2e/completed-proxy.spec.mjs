import { test, expect } from "@playwright/test";

for (const { kind, prefix, api } of [
  { kind: "film", prefix: "PX", api: "proxy" },
  { kind: "music", prefix: "MX", api: "music-proxy" },
]) {
  test(`${kind} catalog links and case aliases open the recorded result; a new attempt stays explicit`, async ({
    page,
    request,
  }) => {
    const sample = await (await request.get("/api/sample")).json();
    const cases = [1, 2].map((n) => ({
      id: `${prefix}-00${n}`,
      dataset: "synthetic-browser-fixture",
      seeds: [
        {
          movieId: "seed",
          artistId: "seed",
          title: "Fixture taste",
          name: "Fixture taste",
          year: 2000,
          genres: ["Drama"],
        },
      ],
      options: ["A", "B"].map((letter, index) => ({
        movieId: letter,
        artistId: letter,
        title: `Fixture ${letter}`,
        name: `Fixture ${letter}`,
        year: 2000,
        genres: ["Drama"],
      })),
      audienceDefinition: "Synthetic fixture audience.",
    }));
    const ids = [
      "00000000-0000-4000-8000-000000000721",
      "00000000-0000-4000-8000-000000000722",
    ];
    const tally = {
      cases: 2,
      counts: Object.fromEntries(
        ["llm", "qloo", "agent"].map((k) => [k, { correct: 1, total: 2 }]),
      ),
    };
    const catalog = {
      cases,
      available: true,
      mode: "real",
      manifest: {
        dataset: "synthetic-browser-fixture",
        rules: { minOverallRatings: 500 },
      },
      ai: { enabled: true, configured: true },
      tally: { real: tally, mock: { ...tally, cases: 0 } },
      completedRuns: cases.map((c, i) => ({
        id: ids[i],
        caseId: c.id,
        mode: "real-qloo",
        revealedAt: "2026-10-11T12:00:01Z",
      })),
    };
    await page.route(`**/api/${api}`, (route) =>
      route.fulfill({ json: catalog }),
    );
    let writes = 0;
    await page.route(`**/api/${api}/**`, (route) => {
      if (route.request().method() !== "GET") {
        writes++;
        return route.abort();
      }
      const index = ids.findIndex((id) =>
        route.request().url().endsWith(`/runs/${id}`),
      );
      if (index < 0) return route.abort();
      return route.fulfill({
        json: {
          id: ids[index],
          proxyCaseId: cases[index].id,
          input: cases[index],
          options: cases[index].options,
          seeds: sample.seeds,
          mode: "real",
          scoringVersion: "qloo-candidate-affinity-v1",
          lifecycle: "revealed",
          freeze: {
            sha256: "a".repeat(64),
            payload: {
              frozenAt: "2026-10-11T12:00:00Z",
              branches: {
                llm: { pick: "A", confidence: 60, source: "fixture" },
                qloo: { pick: "B", confidence: 65, gap: 20, source: "fixture" },
              },
            },
          },
          result: { actual: "A", grades: { llm: "✓", qloo: "✗" } },
          outcome: {
            actual: "A",
            segmentUsers: 100,
            options: [
              { mean: 4, count: 50 },
              { mean: 3, count: 50 },
            ],
          },
        },
      });
    });
    await page.goto(`/benchmark#${kind}-cases`);
    const section = page.locator(
      kind === "film" ? ".proxy-section" : ".music-proxy-section",
    );
    await expect(
      section.getByRole("heading", { name: /real Qloo.*2 completed cases/i }),
    ).toBeVisible();
    await expect(section.locator(".completed-proxy-index a")).toHaveCount(2);
    await section.locator(".completed-proxy-index a").nth(1).click();
    await expect(page).toHaveURL(
      new RegExp(`/benchmark/${kind}/run/${ids[1]}$`),
    );
    await expect(page.locator(".proxy-outcome")).toBeVisible();
    for (const path of [kind, ...(kind === "film" ? ["proxy"] : [])]) {
      await page.goto(`/benchmark/${path}/${cases[1].id}`);
      await expect(page).toHaveURL(
        new RegExp(`/benchmark/${kind}/run/${ids[1]}$`),
      );
      await expect(page.locator(".proxy-outcome")).toBeVisible();
      await expect(page.locator(".mock-pill")).toContainText(
        "direct Qloo affinity",
      );
      await expect(page.locator(".mock-pill")).not.toContainText(
        "prediction not started",
      );
    }
    await page.goto(`/benchmark#${kind}-cases`);
    await section.locator(".proxy-start-another").nth(1).click();
    await expect(page).toHaveURL(
      new RegExp(`/benchmark/${kind}/${cases[1].id}\\?new=1$`),
    );
    await expect(page.locator(".proxy-visitor-choice")).toBeVisible();
    await expect(page.locator(".proxy-visitor-choice p")).toHaveText(
      "AI will run automatically before the outcome is revealed. You can make your own guess or skip it.",
    );
    await expect(page.locator(".proxy-outcome")).toHaveCount(0);
    expect(writes).toBe(0);
  });
}
