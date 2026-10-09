import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test("Track B freeze, same-tab poll, three-branch grading and excluded mock ledger", async ({
  page,
  request,
  context,
}, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const caseLabel = `UI-${testInfo.project.name}-${crypto.randomUUID().slice(0, 8)}`;
  await page.goto("/benchmark");
  await expect(
    page.locator(".benchmark-overview article").first().locator("small"),
  ).toHaveText("not enough cases yet");
  await page.getByRole("link", { name: "Create a new case" }).click();
  await page.getByLabel("Give it a name").nth(0).fill("Quiet vinyl cafe");
  await page
    .getByLabel("Describe the idea")
    .nth(0)
    .fill("Warm cozy indie vinyl night with handmade art and local coffee.");
  await page.getByLabel("Give it a name").nth(1).fill("Neon pop cafe");
  await page
    .getByLabel("Describe the idea")
    .nth(1)
    .fill("Bright playful colorful pop party with upbeat community energy.");
  for (const name of ["Phoebe Bridgers", "Tame Impala", "Taylor Swift"])
    await page.getByRole("button", { name, exact: true }).click();
  await page
    .getByRole("button", { name: "Get agent prediction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open live poll" }),
  ).toBeDisabled();
  await page.getByLabel("Case label", { exact: true }).fill(caseLabel);
  await page
    .getByLabel("This is a fresh unpublished case, with no public outcome.")
    .check();
  await page
    .getByLabel("The planned voters actually share the recorded taste seeds.")
    .check();
  await page.getByLabel("Pick", { exact: true }).selectOption("B");
  await page.getByLabel("Confidence (0–100)").fill("60");
  await page.getByLabel("Source (exact model/version or human)").fill("human");
  await page
    .getByLabel("Paste the original answer")
    .fill(
      "Synthetic browser fixture: choose B. This is not real model evidence.",
    );
  await page
    .getByLabel(
      "All predictions were recorded before collecting any outcome or vote.",
    )
    .check();
  await page.getByRole("button", { name: "Freeze predictions" }).click();
  await expect(
    page.getByRole("heading", { name: /^Frozen at / }),
  ).toBeVisible();
  const id = page.url().match(/test\/([^?]+)/)[1];
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /^Frozen at / }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Freeze predictions" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Open live poll" }).click();
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(
    page.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy link", exact: true }),
  ).toBeVisible({ timeout: 5000 });
  const ownerUrl = page.url();
  await page.getByRole("link", { name: "Open poll", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/poll/${id}`));
  expect(context.pages()).toHaveLength(1);
  await page.getByRole("button", { name: /Quiet vinyl cafe/ }).click();
  await expect(
    page.getByText("Vote recorded. Thanks for weighing in."),
  ).toBeVisible();
  for (let i = 0; i < 19; i++) {
    const vote = await request.post(`/api/tests/${id}/vote`, {
      data: { option: i < 14 ? 0 : 1, voterId: crypto.randomUUID() },
    });
    expect(vote.status()).toBe(200);
  }
  await page.goto(ownerUrl);
  await expect(page.locator(".vote-count")).toContainText("20 votes");
  await page.getByRole("button", { name: "Close test", exact: true }).click();
  await page.getByRole("button", { name: "Close & reveal verdict" }).click();
  await page.getByRole("button", { name: "Prediction", exact: true }).click();
  await expect(page.locator(".freeze-panel")).toContainText(
    "Excluded from the tally",
  );
  await expect(page.locator(".freeze-panel")).toContainText(
    "mock signals, workflow only",
  );
  const row = page
    .locator(".freeze-panel tr")
    .filter({ hasText: "LLM-only (manual paste)" });
  await expect(row).toContainText("✗");
  await page.getByRole("link", { name: "View benchmark ledger" }).click();
  await expect(
    page.locator(".benchmark-overview article").first().locator("small"),
  ).toHaveText("not enough cases yet");
  await page
    .locator(".benchmark-drawer > summary")
    .filter({ hasText: "Closed case ledger" })
    .click();
  await expect(page.locator("tr").filter({ hasText: caseLabel })).toContainText(
    "mock signals, workflow only",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: `artifacts/benchmark-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
test("prediction cards start above the 1080p fold and taste controls have 44px targets", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const sample = await (await request.get("/api/sample")).json();
  const created = await (
    await request.post("/api/tests", {
      data: {
        options: sample.options,
        seedEntityIds: sample.seeds.map((s) => s.entity_id),
      },
    })
  ).json();
  await page.addInitScript(
    ({ id, token }) => localStorage.setItem(`tastetest-owner-${id}`, token),
    { id: created.test.id, token: created.ownerToken },
  );
  await page.goto(`/test/${created.test.id}?view=prediction`);
  await expect(
    page.locator(".prediction-section .option-grid > *"),
  ).toHaveCount(2);
  for (const card of await page
    .locator(".prediction-section .option-grid > *")
    .all())
    expect((await card.boundingBox()).y).toBeLessThan(1080);
  for (const target of await page
    .locator(".chip, .toggle-label, .map-node")
    .all()) {
    const box = await target.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/prediction-1080p.png" });
});
test("external manual entry stores all three original answers with distinct timestamps", async ({
  page,
  request,
}) => {
  const sample = await (await request.get("/api/sample")).json();
  const created = await (
    await request.post("/api/tests", {
      data: {
        options: sample.options,
        seedEntityIds: sample.seeds.map((s) => s.entity_id),
      },
    })
  ).json();
  await page.addInitScript(
    ({ id, token }) => localStorage.setItem(`tastetest-owner-${id}`, token),
    { id: created.test.id, token: created.ownerToken },
  );
  await page.goto(`/test/${created.test.id}?view=prediction`);
  await page
    .getByLabel(
      "Record external predictions manually (all three branches required)",
    )
    .check();
  await page
    .getByLabel("Original prediction timestamp")
    .fill("2026-01-01T12:00");
  const groups = page.locator(".manual-branch");
  await expect(groups).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await groups
      .nth(i)
      .getByLabel("Pick", { exact: true })
      .selectOption(i === 1 ? "A" : "B");
    await groups
      .nth(i)
      .getByLabel("Source (exact model/version or human)")
      .fill("human");
    await groups
      .nth(i)
      .getByLabel("Paste the original answer")
      .fill(
        `External synthetic fixture branch ${i}, explicitly not real evidence.`,
      );
  }
  await page
    .getByLabel(
      "All predictions were recorded before collecting any outcome or vote.",
    )
    .check();
  await page.getByRole("button", { name: "Freeze predictions" }).click();
  await expect(page.locator(".freeze-panel")).toContainText("manual");
  await expect(page.locator(".freeze-panel")).toContainText(
    "Owner-declared original timestamp",
  );
  await expect(page.locator(".freeze-panel")).toContainText(
    "not independently audited",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download freeze receipt" }).click();
  const { readFile } = await import("node:fs/promises");
  const receipt = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  expect(receipt.payload.mode).toBe("manual");
  expect(receipt.payload.originalRecordedAt).not.toBe(receipt.payload.frozenAt);
  expect(Object.keys(receipt.payload.branches)).toEqual([
    "llm",
    "qloo",
    "agent",
  ]);
  expect(JSON.stringify(receipt)).not.toContain(created.ownerToken);
});
