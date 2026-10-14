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
  await expect(table.getByRole("row", { name: /AI-only/ })).toContainText(
    "Not recorded",
  );
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
  await expect(page.locator(".verdict-branch")).toHaveCount(0);
  await expect(page.locator(".verdict-empty-branches")).toContainText(
    "This demo records one concept-fit prediction: Option A",
  );
  const chat = page.locator(".verdict-chat");
  await expect(chat).toContainText("Ask about this result");
  await page
    .getByRole("button", { name: "Ask about this result", exact: true })
    .click();
  await expect(chat).toHaveAttribute("open", "");
  await chat.getByRole("button", { name: "Why this pick?" }).click();
  await expect(chat.locator(".verdict-chat-messages")).toContainText(
    "Option A had the stronger synthetic concept fit",
  );
  await page.getByRole("button", { name: "Prediction", exact: true }).click();
  await expect(page.locator(".vote-bar-label strong").first()).toContainText(
    "71%",
  );
  await expect(page.locator(".mock-pill")).toHaveCount(0);
  await page.getByText("How to read these scores", { exact: true }).click();
  await expect(page.getByText("High heuristic confidence")).toBeVisible();
  await page.getByRole("checkbox", { name: "Keyword baseline" }).check();
  await expect(
    page.getByText("Too close to call", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".agent-badge")).toHaveCount(0);
  await page.getByRole("button", { name: "Open the live poll" }).click();
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

test("brand always resets the sample homepage, even from another home view", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Verdict", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The audience has spoken." }),
  ).toBeVisible();

  await page.getByRole("link", { name: "TasteTest A/B — Home" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "What the taste signals suggest" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The audience has spoken." }),
  ).toHaveCount(0);
});

test("homepage live sample records a vote without leaving the hero", async ({
  page,
}) => {
  await page.goto("/");
  const poll = page.getByRole("region", { name: "Live sample poll" });
  await expect(poll).toBeVisible();
  await expect(
    page.locator(".sample-hero-heading .hero-live-poll"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".prediction-card")];
      const inlinePoll = document.querySelector(".sample-inline-poll");
      return Boolean(
        cards.at(-1)?.compareDocumentPosition(inlinePoll) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }),
  ).toBe(true);
  await expect(poll.locator(".hero-live-poll-thumb")).toHaveCount(2);
  await expect
    .poll(() =>
      poll
        .locator(".hero-live-poll-thumb")
        .evaluateAll((images) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
    )
    .toBe(true);
  await poll.getByRole("button", { name: /Slow mornings club/ }).click();
  await expect(poll).toContainText("Your vote is in.");
  await expect(page).toHaveURL(/\/$/);
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
    nav.getByRole("link", { name: "Film · start PX-001", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Film · start PX-001", exact: true }),
  ).toHaveAttribute("href", "/benchmark/film/PX-001");
  await expect(
    nav.getByRole("link", { name: "Music · start MX-001", exact: true }),
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
  await expect(
    page.locator("#film-cases .proxy-case-entry a").first(),
  ).toHaveAttribute("href", /\/benchmark\/film\/PX-\d{3}/);
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

test("unknown routes offer a direct path back to benchmark", async ({
  page,
}) => {
  await page.goto("/this-page-does-not-exist");
  await expect(
    page.getByRole("heading", { name: "That page isn’t here." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to benchmark" }).click();
  await expect(page).toHaveURL(/\/benchmark$/);
  await expect(
    page.getByRole("heading", { name: "Evidence before claims." }),
  ).toBeVisible();
});
