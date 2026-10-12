import { test, expect } from "@playwright/test";
import {
  beginPredictionStep,
  createPredictionWork,
  failPredictionStep,
  finishPredictionStep,
  predictionWorkStages,
} from "../../shared/predictionWork.mjs";

async function fillTrackCase(page) {
  await page.getByLabel("Give it a name").nth(0).fill("Morning bakery");
  await page
    .getByLabel("Describe the idea")
    .nth(0)
    .fill("Warm cardamom buns for a quiet morning social.");
  await page.getByLabel("Give it a name").nth(1).fill("Evening bakery");
  await page
    .getByLabel("Describe the idea")
    .nth(1)
    .fill("Brown butter croissants for a lively evening social.");
  await page.getByRole("button", { name: "Phoebe Bridgers" }).click();
  await page.getByRole("tab", { name: "Film/TV" }).click();
  await page.getByRole("button", { name: "A24 films" }).click();
  await page.getByRole("tab", { name: "Dining" }).click();
  await page.getByRole("button", { name: "Independent coffee shops" }).click();
}

test("mock Track B feed follows all six stages and collapses after freeze", async ({
  page,
}) => {
  await page.goto("/benchmark/new");
  await fillTrackCase(page);
  await page.route("**/api/tests", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  const feed = page.locator(".prediction-step-feed");
  await page.getByRole("button", { name: "Get agent prediction" }).click();
  await expect(feed.locator("li.is-active")).toHaveCount(1);
  await expect(feed.locator("li.is-pending")).toHaveCount(5);
  await expect(page).toHaveURL(/\/test\//);
  await expect(
    feed.getByText(/Mock signals — synthetic affinities/),
  ).toBeVisible();
  await expect(feed.locator("li")).toHaveCount(6);
  await expect(feed.locator("li").nth(0)).toContainText(
    "3 of 3 seeds resolved",
  );
  await expect(feed.locator("li.is-done")).toHaveCount(4);
  await expect(feed.locator("li.is-pending")).toHaveCount(2);
  await page
    .getByLabel("Source (exact model/version or human)")
    .fill("Human test");
  await page
    .getByLabel("Paste the original answer")
    .fill("Pick: A. Confidence: 55. Test fixture only.");
  await page
    .getByLabel(
      "All predictions were recorded before collecting any outcome or vote.",
    )
    .check();
  await page.getByRole("button", { name: "Freeze predictions" }).click();
  await expect(
    page.getByRole("heading", { name: "Prediction frozen" }),
  ).toBeVisible();
  await expect(feed.locator("summary")).toContainText(
    /6 steps · (?:<0\.1s|\d+\.\d+s) · frozen #[a-f0-9]{6}/,
  );
  await expect(feed).not.toHaveAttribute("open", "");
  await feed.locator("summary").click();
  await expect(feed.locator("li.is-done")).toHaveCount(6);
  await expect(feed.locator("li strong")).toHaveText(
    predictionWorkStages.map(([, label]) => label),
  );
  await expect(feed).toContainText(
    "Showing the agent's work — this does not prove the prediction is correct.",
  );
});

test("real-mode Qloo failure marks the exact stage without exposing a traceback", async ({
  page,
}) => {
  const work = createPredictionWork({ mode: "real", context: "proxy-music" });
  for (const id of ["resolve-seeds", "resolve-candidates"]) {
    beginPredictionStep(work, id, 1000);
    finishPredictionStep(work, id, `${id} done`, 1100);
  }
  beginPredictionStep(work, "fetch-affinities", 1200);
  failPredictionStep(
    work,
    "fetch-affinities",
    "Couldn't reach Qloo for candidate affinities. No prediction was recorded.",
    1300,
  );
  await page.route("**/api/music-proxy", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: { ...body, available: true, mode: "real" },
    });
  });
  await page.route("**/api/music-proxy/cases/MX-001/start", (route) =>
    route.fulfill({
      status: 502,
      json: {
        error: "Qloo is temporarily unavailable.",
        predictionWork: work,
      },
    }),
  );
  await page.goto("/benchmark/music/MX-001");
  await page
    .getByRole("button", { name: "Skip my guess → Show results" })
    .click();
  const feed = page.locator(".prediction-step-feed");
  await expect(feed.locator("li.is-failed")).toHaveCount(1);
  await expect(feed.locator("li.is-failed")).toContainText(
    "Couldn't reach Qloo for candidate affinities. No prediction was recorded.",
  );
  await expect(feed.getByText(/Mock signals/)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/trace|stack|socket/i);
});
