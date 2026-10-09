import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

test("new cases use manual LLM-only answers without paid API controls", async ({
  page,
}) => {
  await page.goto("/create");
  await expect(
    page.getByText(/LLM-only \(manual paste\), Qloo and Agent/),
  ).toBeVisible();
  await expect(page.getByText(/No paid LLM API calls/)).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Get agent prediction", exact: true }),
  ).toBeEnabled();
});

test("paired UI locks, persists, downloads a safe receipt, then shows both branch grades", async ({
  page,
  request,
}, testInfo) => {
  // Browser transport fixtures only. No credential, paid request, real prediction or audience outcome.
  const sample = await (await request.get("/api/sample")).json();
  const id = "e2e00000-0000-4000-8000-000000000001";
  const at = "2026-10-09T00:00:00.000Z";
  const fixture = {
    ...sample,
    id,
    isSample: false,
    sampleVotes: undefined,
    mode: "real",
    isPairedComparison: true,
    totalVotes: 0,
    votes: [0, 0],
    closedAt: null,
    pollOpenedAt: null,
    comparison: {
      sha256: "fixture-hash-not-evidence",
      payload: {
        model: "fixture-model-v1",
        minVotes: 10,
        committedAt: at,
        aiOnly: {
          choice: "B",
          confidence: 60,
          rationale: "Synthetic browser fixture: baseline choice.",
        },
        aiQloo: {
          choice: "A",
          confidence: 60,
          rationale: "Synthetic browser fixture: grounded choice.",
        },
      },
    },
    verdict: null,
  };
  let current = fixture;
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        mode: "real",
        configured: true,
        ai: { configured: true, model: "fixture-model-v1" },
      },
    }),
  );
  await page.route("**/api/tests", (route) =>
    route.fulfill({
      status: 201,
      json: { test: current, ownerToken: "fixture-owner-token" },
    }),
  );
  await page.route(`**/api/tests/${id}**`, async (route) => {
    const url = route.request().url();
    if (url.endsWith("/open"))
      current = { ...current, pollOpenedAt: "2026-10-09T00:00:01.000Z" };
    if (url.endsWith("/close"))
      current = {
        ...current,
        closedAt: "2026-10-09T00:00:02.000Z",
        totalVotes: 10,
        votes: [7, 3],
        verdict: {
          actual: 0,
          predicted: 0,
          share: 70,
          recommendation:
            "Synthetic fixture only; one case does not establish superiority.",
          paired: {
            status: "EVALUABLE",
            total: 10,
            actual: "A",
            minVotes: 10,
            aiOnly: "MISS",
            aiQloo: "MATCH",
          },
        },
      };
    await route.fulfill({ json: current });
  });
  await page.goto("/create");
  await page.getByLabel("Give it a name").nth(0).fill(sample.options[0].title);
  await page
    .getByLabel("Describe the idea")
    .nth(0)
    .fill(sample.options[0].description);
  await page.getByLabel("Give it a name").nth(1).fill(sample.options[1].title);
  await page
    .getByLabel("Describe the idea")
    .nth(1)
    .fill(sample.options[1].description);
  await page
    .getByRole("button", { name: "Phoebe Bridgers", exact: true })
    .click();
  await page.getByRole("button", { name: "Tame Impala", exact: true }).click();
  await page.getByRole("button", { name: "Taylor Swift", exact: true }).click();
  await page
    .getByRole("button", { name: "Get agent prediction", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "AI only vs. AI + Qloo", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("LOCKED · Awaiting audience votes")).toHaveCount(
    2,
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open live poll", exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download prediction receipt" })
    .click();
  const receipt = JSON.parse(
    await readFile(await (await downloadPromise).path(), "utf8"),
  );
  expect(JSON.stringify(receipt)).not.toContain("fixture-owner-token");
  expect(receipt.payload.model).toBe("fixture-model-v1");
  await expect(page.getByRole("status")).toContainText("downloaded");
  await page
    .getByRole("button", { name: "Open live poll", exact: true })
    .click();
  await page.getByRole("button", { name: "Close test", exact: true }).click();
  await page
    .getByRole("button", { name: "Close & reveal verdict", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "MISS", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "MATCH", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".verdict-number")).toHaveText("70%");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: `artifacts/paired-fixture-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
