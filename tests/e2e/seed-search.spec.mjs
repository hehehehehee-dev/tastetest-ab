import { test, expect } from "@playwright/test";

test("studio lookup changes category explicitly; a broad cafe preference never becomes a venue seed", async ({
  page,
}) => {
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { mode: "real", configured: true } }),
  );
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  let submissions = 0,
    payload;
  await page.route("**/api/search?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const type = params.get("type"),
      q = params.get("q");
    const entities =
      type === "Brands" && q === "A24"
        ? [
            {
              entity_id: id(1),
              name: "A24",
              category: "Brands",
              types: ["urn:entity:brand"],
              tags: [],
            },
          ]
        : type === "Dining" && q === "independent coffee shops"
          ? [
              "12 Main St · Bloomington · United States",
              "88 Other St · Another City · United States",
            ].map((locationLabel, i) => ({
              entity_id: id(i + 2),
              name: "Fixture Cafe",
              category: "Dining",
              types: ["urn:entity:place"],
              tags: [],
              locationLabel,
            }))
          : type === "Music"
            ? [
                {
                  entity_id: id(4),
                  name: "Fixture Artist",
                  category: "Music",
                  types: ["urn:entity:artist"],
                  tags: [],
                },
              ]
            : [];
    return route.fulfill({ json: { mode: "real", results: { entities } } });
  });
  await page.route("**/api/tests", (route) => {
    submissions++;
    payload = route.request().postDataJSON();
    return route.fulfill({
      status: 400,
      json: { error: "Synthetic test stops before creating a prediction." },
    });
  });
  await page.goto("/create");
  await page.getByRole("tab", { name: "Film/TV", exact: true }).click();
  await page.getByRole("textbox", { name: "Search taste seeds" }).fill("A24");
  await expect(page.locator(".seed-query-help")).toContainText(
    "A24 is a studio",
  );
  await page.getByRole("button", { name: "Search A24 in Brands" }).click();
  await expect(
    page.getByRole("tab", { name: "Brands", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "A24", exact: true }).click();
  await expect(page.locator(".selection-count")).toContainText("1 / 5");
  expect(submissions).toBe(0);
  await page.getByRole("tab", { name: "Dining", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search taste seeds" })
    .fill("independent coffee shops");
  await expect(page.locator(".seed-query-help")).toContainText(
    "specific businesses",
  );
  await expect(page.locator(".seed-results")).toContainText("12 Main St");
  await expect(page.locator(".seed-results")).toContainText("88 Other St");
  await page
    .getByRole("button", { name: "Add concept to audience note" })
    .click();
  await expect(
    page.getByLabel("Anything else about your audience?"),
  ).toHaveValue("independent coffee shops");
  await expect(page.locator(".selection-count")).toContainText("1 / 5");
  expect(submissions).toBe(0);
  await page
    .getByRole("button", {
      name: "Fixture Cafe · 12 Main St · Bloomington · United States",
      exact: true,
    })
    .click();
  await expect(page.locator(".selected-seeds")).toContainText(
    "12 Main St · Bloomington",
  );
  await expect(page.locator(".selected-seeds")).not.toContainText(
    "88 Other St",
  );
  await page.getByRole("tab", { name: "Music", exact: true }).click();
  await page
    .getByRole("button", { name: "Fixture Artist", exact: true })
    .click();
  await expect(page.locator(".selection-count")).toContainText("3 / 5");
  for (let i = 0; i < 2; i++) {
    await page.getByLabel("Give it a name").nth(i).fill(`Fixture option ${i}`);
    await page
      .getByLabel("Describe the idea")
      .nth(i)
      .fill("Synthetic browser fixture, no actual model or customer evidence.");
  }
  await page
    .getByRole("button", { name: "Get agent prediction", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Synthetic test stops");
  expect(payload.seedEntityIds).toEqual([id(1), id(2), id(4)]);
  expect(payload.audienceNote).toBe("independent coffee shops");
  expect(submissions).toBe(1);
  for (const target of await page
    .locator(
      ".header-new, .category-tabs button, .seed-button, .selected-seeds button, .seed-query-help button",
    )
    .all()) {
    const box = await target.boundingBox();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("question stays one line and the header action is a 44px target", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const heading = page.locator(".experiment-heading h1");
    await expect(heading).toBeVisible();
    const size = await heading.evaluate((n) => ({
      height: n.getBoundingClientRect().height,
      line: parseFloat(getComputedStyle(n).lineHeight),
      font: parseFloat(getComputedStyle(n).fontSize),
    }));
    expect(size.height).toBeLessThanOrEqual(size.line + 1);
    expect(size.font).toBeLessThanOrEqual(24);
    const action = await page.locator(".header-new").boundingBox();
    expect(action.height).toBeGreaterThanOrEqual(44);
    expect(action.width).toBeGreaterThanOrEqual(44);
  }
});
