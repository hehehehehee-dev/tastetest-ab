import { test, expect } from "@playwright/test";
import { createPredictionWork } from "../../shared/predictionWork.mjs";

const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
];
const movies = ids.map((entity_id, index) => ({
  entity_id,
  name: `Movie ${index ? "B" : "A"}`,
  category: "Film/TV",
  releaseYear: index ? 2020 : 1995,
}));
const config = {
  mode: "real",
  configured: true,
  ai: { configured: true, model: "fixture-model" },
};
test("exact option confirmation is required, persists through mode switches, and submits the chosen IDs", async ({
  page,
  request,
}) => {
  const sample = await (await request.get("/api/sample")).json();
  await page.route("**/api/config", (route) => route.fulfill({ json: config }));
  await page.route("**/api/search?**", (route) =>
    route.fulfill({
      json: {
        mode: "real",
        results: {
          entities:
            new URL(route.request().url()).searchParams.get("type") ===
            "Film/TV"
              ? movies
              : sample.seeds,
        },
      },
    }),
  );
  let submitted;
  await page.route("**/api/tests", (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({
      status: 502,
      json: {
        error: "Qloo did not return affinity for both options. Fixture only.",
      },
    });
  });
  await page.goto("/create?optionA=Movie%20A&optionB=Movie%20B");
  await expect(
    page.getByRole("button", { name: "Custom ideas", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Known items in Qloo" }).click();
  const contextMeter = page.getByRole("progressbar", {
    name: "Test context completeness",
  });
  await expect(contextMeter).toHaveAttribute("aria-valuemax", "12");
  await page.getByLabel("Item category").selectOption("Film/TV");
  await page
    .getByLabel("Describe the idea")
    .nth(0)
    .fill("A movie for the club screening.");
  await page
    .getByLabel("Describe the idea")
    .nth(1)
    .fill("Another movie for the same screening.");
  await expect(page.locator(".qloo-option-confirmed")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Confirm Option A: Movie A/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Predict & freeze", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Confirm the exact Qloo entity",
  );
  expect(submitted).toBeUndefined();
  await page
    .getByRole("button", {
      name: /Confirm Option A: Movie A · Film\/TV · 1995/,
    })
    .click();
  await page
    .getByRole("button", {
      name: /Confirm Option B: Movie B · Film\/TV · 2020/,
    })
    .click();
  await expect(page.locator(".qloo-option-confirmed")).toHaveCount(2);
  await expect(contextMeter).toHaveAttribute("aria-valuenow", "6");
  await page
    .getByRole("textbox", { name: "Search taste seeds" })
    .fill("Fixture tastes");
  for (const seed of sample.seeds.slice(0, 3))
    await page.getByRole("button", { name: seed.name, exact: true }).click();
  await page.getByRole("button", { name: "Record as evidence" }).click();
  await page.getByRole("button", { name: "Quick test", exact: true }).click();
  await expect(page.locator(".qloo-option-confirmed")).toHaveCount(2);
  await expect(page.locator(".selected-seeds .chip")).toHaveCount(3);
  await expect(contextMeter).toHaveAttribute("aria-valuenow", "9");
  await page
    .getByRole("button", { name: "Predict & freeze", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Fixture only");
  expect(submitted.comparisonKind).toBe("entities");
  expect(submitted.options.map((o) => o.entityId)).toEqual(ids);
  expect(submitted.compareAi).toBe(true);
  await page.getByLabel("Give it a name").nth(0).fill("Changed title");
  await expect(page.locator(".qloo-option-confirmed")).toHaveCount(1);
  await expect(contextMeter).not.toHaveAttribute(
    "aria-valuetext",
    /Required decision context complete/,
  );
  await page.getByLabel("Item category").selectOption("Music");
  await expect(page.locator(".qloo-option-confirmed")).toHaveCount(0);
});

test("results expose recorded direct affinities and custom audience signals without claiming mock data is real", async ({
  page,
  request,
}) => {
  const sample = await (await request.get("/api/sample")).json();
  const id = "00000000-0000-4000-8000-000000000901";
  const work = createPredictionWork({ mode: "real", context: "quick-test" });
  work.steps.forEach((step) => {
    step.status = "done";
    step.elapsedMs = 1;
    step.detail = "Synthetic browser fixture.";
  });
  work.sha256 = "a".repeat(64);
  let result = {
    ...sample,
    id,
    isSample: false,
    mode: "real",
    isPairedComparison: true,
    closedAt: null,
    pollOpenedAt: null,
    totalVotes: 0,
    votes: [0, 0],
    predictionWork: work,
    comparison: {
      sha256: work.sha256,
      payload: {
        model: "fixture-model",
        qlooEvidence: {
          source: "Qloo API",
          seeds: sample.seeds.map(({ entity_id, name }) => ({
            entity_id,
            name,
          })),
          tasteProfile: {
            mode: "real",
            status: "available",
            tagType: "urn:tag:genre:media",
            tags: [
              {
                tag_id: "urn:tag:genre:media:drama",
                name: "Fixture Drama",
                affinity: 0.9,
              },
              {
                tag_id: "urn:tag:genre:media:comedy",
                name: "Fixture Comedy",
                affinity: 0.8,
              },
            ],
          },
          recommendations: movies.map((movie) => ({
            entity_id: movie.entity_id,
            name: movie.name,
            explainability: {
              "signal.interests.entities": sample.seeds
                .slice(0, 3)
                .map((seed, index) => ({
                  entity_id: seed.entity_id,
                  score: [0.5, 0.3, 0.2][index],
                })),
            },
          })),
        },
        committedAt: "2026-10-13T12:00:00Z",
        aiOnly: {
          choice: "A",
          confidence: 60,
          rationale: "Fixture reasoning.",
        },
        aiQloo: {
          choice: "A",
          confidence: 60,
          rationale: "Fixture reasoning with Qloo.",
        },
        qloo: {
          choice: "A",
          confidence: 80,
          rationale: "Direct confirmed option affinity. Fixture only.",
          source: "Direct Qloo entity affinity",
          method: "direct-entity-affinity",
          fallback: false,
          affinities: movies.map((m, i) => ({
            entityId: m.entity_id,
            name: m.name,
            label: i ? "B" : "A",
            affinity: i ? 0.3 : 0.8,
          })),
        },
      },
    },
  };
  await page.route("**/api/config", (route) => route.fulfill({ json: config }));
  await page.route(`**/api/tests/${id}**`, (route) =>
    route.fulfill({ json: result }),
  );
  await page.goto(`/test/${id}?view=prediction`);
  await expect(
    page.getByRole("heading", { name: "Direct A/B affinity received" }),
  ).toBeVisible();
  await expect(page.locator(".qloo-evidence-signals")).toContainText(
    "A · Movie A",
  );
  await expect(page.locator(".qloo-evidence-signals")).toContainText("0.800");
  await expect(page.locator(".qloo-evidence-signals")).toContainText("0.300");
  await expect(
    page.getByRole("heading", { name: "Audience taste profile" }),
  ).toBeVisible();
  await expect(page.locator(".qloo-profile-tags")).toContainText(
    "Fixture Drama",
  );
  await expect(page.locator(".qloo-profile-tags")).toContainText("0.900");
  await expect(page.locator(".qloo-explanation")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.locator(".qloo-explanation > summary").click();
  await expect(page.locator(".qloo-explanation-grid h4").first()).toHaveText(
    "A · Movie A",
  );
  await expect(page.locator(".qloo-explanation-grid")).toContainText(
    sample.seeds[0].name,
  );
  await expect(page.locator(".qloo-explanation-grid meter")).toHaveCount(6);
  await expect(
    page.locator(".qloo-explanation-grid strong").first(),
  ).toHaveText("0.500");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".ai-comparison .qloo-fallback-badge")).toHaveCount(
    0,
  );
  await expect(
    page.locator(".ai-comparison .prediction-step-feed"),
  ).not.toHaveAttribute("open", "");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  result = {
    ...result,
    prediction: result.prediction.map((score, index) => ({
      ...score,
      score: index ? 97.44375620794193 : 97.5500767906894,
    })),
    comparison: {
      ...result.comparison,
      payload: {
        ...result.comparison.payload,
        qloo: { ...result.comparison.payload.qloo, choice: "TIE" },
      },
    },
  };
  await page.reload();
  await expect(page.locator(".taste-flow-output h3")).toHaveText(
    "Too close to call",
  );
  await expect(page.locator(".taste-flow-scores .is-winner")).toHaveCount(0);
  await expect(page.locator(".no-signal-note")).toHaveCount(0);
  await expect(page.locator(".taste-flow-scores strong").first()).toHaveText(
    "97.6",
  );
  result = {
    ...result,
    comparison: {
      ...result.comparison,
      payload: {
        ...result.comparison.payload,
        qloo: {
          ...result.comparison.payload.qloo,
          choice: "A",
          decisionPolicy: "higher-score-v1",
          scoreGap: 0.10632058274747,
          lowSeparation: true,
        },
      },
    },
  };
  await page.reload();
  await expect(
    page
      .locator(".ai-choice")
      .filter({ has: page.getByRole("heading", { name: "Qloo", exact: true }) })
      .locator(".ai-pick"),
  ).toHaveText("Option A");
  const qlooCard = page
    .locator(".ai-choice")
    .filter({ has: page.getByRole("heading", { name: "Qloo", exact: true }) });
  expect((await qlooCard.innerText()).match(/Low separation/g)).toHaveLength(1);
  await expect(page.locator(".qloo-separation-summary")).toContainText(
    "Affinity gap: 0.001063",
  );
  await expect(page.locator(".qloo-separation-summary")).toContainText(
    "not Qloo-reported prediction confidence",
  );
  await expect(page.locator(".qloo-separation-summary")).not.toContainText(
    "40/100",
  );
  await expect(page.locator(".ai-choice").first()).toContainText(
    "Self-reported confidence: 60/100",
  );
  await expect(page.locator(".taste-flow-output h3")).toHaveText("Qloo pick");
  await expect(page.locator(".taste-flow-output")).toContainText(
    "the pick follows higher affinity",
  );
  // Distinct close values must not render as an apparent equal score.
  result.comparison.payload.qloo.affinities[0].affinity = 0.80001;
  result.comparison.payload.qloo.affinities[1].affinity = 0.80002;
  result.comparison.payload.qloo.choice = "B";
  result.comparison.payload.qloo.scoreGap = 0.001;
  await page.reload();
  await expect(page.locator(".qloo-evidence-signals")).toContainText("0.80001");
  await expect(page.locator(".qloo-evidence-signals")).toContainText("0.80002");
  await expect(qlooCard.locator(".ai-pick")).toHaveText("Option B");
  result = {
    ...result,
    insights: [{ name: "Fixture audience taste", affinity: 0.912 }],
    provenance: { ...result.provenance, qlooOptionSignal: false },
    comparison: {
      ...result.comparison,
      payload: {
        ...result.comparison.payload,
        qloo: {
          choice: "TIE",
          confidence: 40,
          rationale: "No direct option signal. Fixture fallback.",
          fallback: true,
          noSignalTie: false,
        },
      },
    },
  };
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Qloo audience signals received" }),
  ).toBeVisible();
  await expect(page.locator(".qloo-evidence-signals")).toContainText("0.912");
  await expect(qlooCard.locator(".qloo-fallback-badge")).toHaveText(
    "Qloo: no data — heuristic fallback",
  );
  const feed = page.locator(".ai-comparison .prediction-step-feed");
  await expect(feed).not.toHaveAttribute("open", "");
  await expect(feed.locator("summary .qloo-fallback-badge")).toBeVisible();
  await expect(feed.locator("summary .qloo-fallback-badge")).toHaveText(
    "Qloo: no data — heuristic fallback",
  );
  await expect(page.locator(".no-signal-note")).toHaveText(
    "No affinity signal for either option — prediction abstains.",
  );
  result.comparison.payload.qloo.choice = "A";
  await page.reload();
  await expect(qlooCard.locator(".ai-pick")).toHaveText("Option A");
  await expect(page.locator(".no-signal-note")).toHaveCount(0);
  result = { ...result, mode: "mock" };
  await page.reload();
  await expect(page.locator(".qloo-evidence")).toHaveCount(0);
  result = {
    ...result,
    mode: "real",
    comparison: {
      ...result.comparison,
      payload: {
        ...result.comparison.payload,
        qlooEvidence: {
          ...result.comparison.payload.qlooEvidence,
          tasteProfile: { mode: "real", status: "empty", tags: [] },
        },
      },
    },
  };
  await page.reload();
  await expect(page.locator(".qloo-profile-unavailable")).toContainText(
    "no taste-profile tags",
  );
  await expect(page.locator(".qloo-profile-tags")).toHaveCount(0);
  const frozenEvidence = result.comparison.payload.qlooEvidence;
  result = {
    ...result,
    comparison: {
      ...result.comparison,
      payload: {
        ...result.comparison.payload,
        qlooEvidence: undefined,
        aiQloo: {
          ...result.comparison.payload.aiQloo,
          prompt: { input: JSON.stringify({ qlooSignals: frozenEvidence }) },
        },
      },
    },
  };
  await page.reload();
  await page.locator(".qloo-explanation > summary").click();
  await expect(page.locator(".qloo-explanation-grid meter")).toHaveCount(6);
});
