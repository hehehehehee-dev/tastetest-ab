import { test, expect } from "@playwright/test";

test("historical case reveals directly with honest branch availability", async ({
  page,
}) => {
  await page.goto("/benchmark-lab/historical-case-01");
  await expect(
    page.getByRole("heading", { name: "Historical case 01" }),
  ).toBeVisible();
  await expect(page.getByText("19.02%")).toHaveCount(0);
  await expect(page.locator("main input, main textarea")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Commit prediction" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal observed result" }).click();
  await expect(page.getByText("19.02%")).toBeVisible();
  await expect(page.getByText("18.20%")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Observed winner: A/ }),
  ).toBeVisible();
  const table = page.getByRole("table");
  await expect(
    table.getByRole("row", { name: /AI \(LLM-only\)/ }),
  ).toContainText("Not recorded");
  await expect(table.getByRole("row", { name: /^Qloo/ })).toContainText(
    "Not available",
  );
  await expect(
    table.getByRole("row", { name: /^Observed data/ }),
  ).toContainText("A · gate at level 30");
  await expect(
    page.getByText("Possibly memorized — famous public case"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cookie Cats · the result" }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(
    "excluded from all benchmark accuracy tallies",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("home stays a completed cafe example with a separate always-open live twin", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Verdict", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The audience has spoken." }),
  ).toBeVisible();
  await expect(page.locator(".verdict-main")).toContainText("52 votes");
  await page.getByRole("button", { name: "Prediction", exact: true }).click();
  await expect(page.locator(".mock-pill")).toHaveText(
    "Cafe demo · synthetic signals",
  );
  await page.getByText("How to read these scores", { exact: true }).click();
  await expect(page.getByText("High heuristic confidence")).toBeVisible();
  await page.getByRole("checkbox", { name: "Keyword baseline" }).check();
  await expect(
    page.getByText("Too close to call", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".agent-badge")).toHaveCount(0);
  await page.getByRole("button", { name: "Sample — live, vote here" }).click();
  await expect(
    page.getByRole("heading", { name: "Which one speaks to you?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Slow mornings club/ }).click();
  await expect(
    page.getByText("Vote recorded. Thanks for weighing in."),
  ).toBeVisible();
  await page.getByRole("link", { name: /Benchmark lab/ }).click();
  await expect(
    page.getByRole("heading", { name: "Historical case 01" }),
  ).toBeVisible();
});

test("visible case navigation opens film and music catalogues from historical page", async ({
  page,
}) => {
  await page.goto("/benchmark-lab/historical-case-01");
  await expect(
    page.getByRole("link", { name: "Explore cases", exact: true }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Explore benchmark cases" });
  await expect(
    nav.getByRole("link", { name: "Film · start PX-001 ↗", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Music · start MX-001 ↗", exact: true }),
  ).toBeVisible();
  await nav
    .getByRole("link", { name: "Browse 40 film cases", exact: true })
    .click();
  await expect(page.locator("#film-cases")).toHaveAttribute("open", "");
  await expect(page.locator("#film-cases .proxy-case-list")).toHaveAttribute(
    "open",
    "",
  );
  await expect(page.locator("#film-cases .proxy-case-entry a")).toHaveCount(40);
  await page
    .getByRole("navigation", { name: "Explore benchmark cases" })
    .getByRole("link", { name: "Browse 40 music cases", exact: true })
    .click();
  await expect(page.locator("#music-cases")).toHaveAttribute("open", "");
  await expect(page.locator("#music-cases .proxy-case-list")).toHaveAttribute(
    "open",
    "",
  );
  await expect(page.locator("#music-cases .proxy-case-entry a")).toHaveCount(
    40,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
