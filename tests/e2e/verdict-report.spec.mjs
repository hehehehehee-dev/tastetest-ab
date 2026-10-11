import { expect, test } from "@playwright/test";

test("four-part verdict handles matched, missed, unanimous and abstained branches", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const id = "00000000-0000-4000-8000-000000000444";
  const base = {
    id,
    title: "Fixture A vs. Fixture B",
    options: [
      { title: "Fixture A", description: "Synthetic fixture option A." },
      { title: "Fixture B", description: "Synthetic fixture option B." },
    ],
    seeds: ["One", "Two", "Three"].map((name, index) => ({
      entity_id: `fixture-${index}`,
      name,
      category: "Music",
    })),
    audienceNote: "Synthetic audience fixture.",
    createdAt: "2026-10-11T11:00:00.000Z",
    prediction: [{ score: 30 }, { score: 65 }],
    baseline: [{ score: 40 }, { score: 55 }],
    insights: [{ name: "Fixture signal", affinity: 0.8 }],
    mode: "real",
    votes: [6, 14],
    totalVotes: 20,
    closedAt: "2026-10-11T12:30:00.000Z",
    verdict: {
      actual: 1,
      predicted: 1,
      share: 70,
      recommendation: "Synthetic fixture recommendation.",
    },
  };
  let branches;
  let grades;
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { mode: "real", configured: true } }),
  );
  await page.route(`**/api/tests/${id}**`, (route) =>
    route.fulfill({
      json: {
        ...base,
        freeze: {
          sha256: "a".repeat(64),
          payload: {
            frozenAt: "2026-10-11T12:00:00.000Z",
            branches,
          },
        },
        benchmarkResult: { grades },
      },
    }),
  );

  const scenarios = [
    {
      name: "matched",
      branches: {
        llm: { pick: "A", confidence: 50, source: "fixture-llm" },
        qloo: { pick: "B", confidence: 70, gap: 35, source: "fixture-qloo" },
        agent: { pick: "B", confidence: 70, gap: 35, source: "fixture-agent" },
      },
      grades: { llm: "✗", qloo: "✓", agent: "✓" },
      note: "No surprises — the outcome tracked the signals.",
    },
    {
      name: "missed",
      branches: {
        llm: { pick: "A", confidence: 90, source: "fixture-llm" },
        qloo: { pick: "B", confidence: 60, gap: 35, source: "fixture-qloo" },
        agent: { pick: "B", confidence: 60, gap: 35, source: "fixture-agent" },
      },
      grades: { llm: "✗", qloo: "✓", agent: "✓" },
      note: "Highest-confidence branch LLM-only missed at 90/100.",
    },
    {
      name: "unanimous",
      branches: {
        llm: { pick: "A", confidence: 80, source: "fixture-llm" },
        qloo: { pick: "A", confidence: 80, gap: 35, source: "fixture-qloo" },
        agent: { pick: "A", confidence: 80, gap: 35, source: "fixture-agent" },
      },
      grades: { llm: "✗", qloo: "✗", agent: "✗" },
      note: "The unanimous Option A prediction missed the Option B outcome.",
    },
    {
      name: "abstention",
      branches: {
        llm: { pick: "B", confidence: 60, source: "fixture-llm" },
        qloo: { pick: "TIE", confidence: 40, gap: 5, source: "fixture-qloo" },
        agent: { pick: "B", confidence: 60, gap: 35, source: "fixture-agent" },
      },
      grades: { llm: "✓", qloo: "ABSTAIN", agent: "✓" },
      note: "Qloo abstained while LLM-only and Agent declared a pick.",
    },
  ];

  for (const scenario of scenarios) {
    branches = scenario.branches;
    grades = scenario.grades;
    await page.goto(`/test/${id}?view=verdict&scenario=${scenario.name}`);
    await expect(page.locator(".verdict-artefact")).toBeVisible();
    const headings = await page
      .locator(
        ".verdict-artefact .verdict-report-section > div:last-child > h2, .verdict-artefact .verdict-report-section > div:last-child > h3",
      )
      .allTextContents();
    expect(headings).toEqual([
      "The Verdict",
      "Where we disagreed",
      "What surprised us",
      "How this verdict was built",
    ]);
    await expect(page.locator(".verdict-surprises")).toContainText(
      scenario.note,
    );
  }
  expect(pageErrors).toEqual([]);
});
