import { expect, test } from "@playwright/test";

const questions = [
  "Which poster gets them in?",
  "Which special sells out first?",
  "Which name do fans remember?",
  "Which theme fills the room?",
  "Which poster gets them in?",
];

test("homepage hero rotates all four questions in order without shifting", async ({
  page,
}) => {
  const testTime = new Date("2026-10-13T12:00:00Z");
  await page.clock.install({ time: testTime });
  await page.clock.pauseAt(testTime);
  await page.goto("/");
  const rotator = page.locator(".hero-question-rotator");
  await expect(page.locator(".sample-hero-heading .status-tag")).toHaveCount(0);
  await expect(
    page.locator(".sample-hero-heading .audience-strip"),
  ).toHaveCount(0);
  const headingBox = await rotator.boundingBox();
  const tagsBox = await page
    .locator(".prediction-section .audience-strip")
    .boundingBox();
  expect(tagsBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
  const initialHeight = await rotator.evaluate(
    (element) => element.getBoundingClientRect().height,
  );

  for (let index = 0; index < questions.length; index += 1) {
    await expect(rotator).toHaveText(questions[index]);
    await expect(rotator).toHaveAttribute(
      "data-question-index",
      String(index % 4),
    );
    expect(
      await rotator.evaluate(
        (element) => element.getBoundingClientRect().height,
      ),
    ).toBe(initialHeight);
    if (index < questions.length - 1) await page.clock.fastForward(4300);
  }
});

test("reduced motion keeps one static first question and starts no rotation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const testTime = new Date("2026-10-13T12:00:00Z");
  await page.clock.install({ time: testTime });
  await page.clock.pauseAt(testTime);
  await page.goto("/");
  const rotator = page.locator(".hero-question-rotator");

  await expect(rotator).toHaveAttribute("data-rotation", "static");
  await expect(rotator).toHaveText(questions[0]);
  await expect(rotator.locator(".hero-question")).toHaveCount(1);
  await page.clock.fastForward(20000);
  await expect(rotator).toHaveText(questions[0]);
  await expect(rotator).toHaveAttribute("data-question-index", "0");
});
