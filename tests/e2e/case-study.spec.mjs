import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("historical commitment is blind, locked across reloads, then explicitly revealed", async ({
  page,
}, testInfo) => {
  await page.goto("/benchmark-lab/historical-case-01");
  await expect(
    page.getByRole("heading", { name: "Historical case 01" }),
  ).toBeVisible();
  await expect(page.getByText("19.02%")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Cookie Cats");
  await page.getByRole("radio", { name: /OPTION B/ }).check();
  await page.getByText("Human", { exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Human", exact: true }),
  ).toBeChecked();
  await page
    .getByLabel("Exact model + version")
    .fill("Human / rehearsal fixture");
  await page
    .getByLabel("Rationale before commitment")
    .fill("Illustrative hypothesis only, not a measured AI result.");
  await page.getByRole("button", { name: "Commit prediction" }).click();
  await expect(page.getByLabel("Exact model + version")).toBeEnabled();
  await page.getByLabel("Confidence (0–100%)").fill("62");
  const responsePromise = page.waitForResponse((r) =>
    r.url().endsWith("/api/historical-case/commit"),
  );
  await page.getByRole("button", { name: "Commit prediction" }).click();
  const body = await (await responsePromise).json();
  expect(body.result).toBeUndefined();
  expect(body.correct).toBeUndefined();
  await expect(page.getByText(/Committed at .* — locked/)).toBeVisible();
  await expect(page.getByLabel("Exact model + version")).toBeDisabled();
  await expect(page.getByLabel("Confidence (0–100%)")).toBeDisabled();
  await expect(page.getByText("19.02%")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Exact model + version")).toBeDisabled();
  await expect(page.getByLabel("Confidence (0–100%)")).toHaveValue("62");
  await page.getByRole("button", { name: "Reveal observed result" }).click();
  await expect(page.getByText("19.02%")).toBeVisible();
  await expect(page.getByText("18.20%")).toBeVisible();
  await expect(page.getByText("MISS", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Possibly memorized — famous public case"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cookie Cats · the result" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download commitment receipt" })
    .click();
  expect((await downloadPromise).suggestedFilename()).toMatch(
    /^historical-case-01-.*\.json$/,
  );
  await expect(page.getByText("Receipt download started.")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await mkdir("artifacts", { recursive: true });
  await page.keyboard.press("Control+Home");
  await page.screenshot({
    path: `artifacts/benchmark-${testInfo.project.name}.png`,
    fullPage: true,
  });
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
