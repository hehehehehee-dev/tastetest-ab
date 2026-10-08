import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("taste network reacts to pointer movement without pressing and rests on exit", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const board = page.locator(".map-board");
  await expect(board).toBeVisible();
  await board.scrollIntoViewIfNeeded();
  const firstNode = page.locator(".map-node").first();
  const initial = await firstNode.getAttribute("style");
  const box = await board.boundingBox();
  // No mouse.down(), click(), or drag: movement alone must animate the graph.
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.48);
  if (testInfo.project.name === "mobile") {
    await expect(board).toHaveAttribute("data-hover-power", "0.00");
    await expect(firstNode).toHaveAttribute("style", initial);
    return;
  }
  await expect
    .poll(async () => Number(await board.getAttribute("data-hover-power")))
    .toBeGreaterThan(0.9);
  await expect.poll(() => firstNode.getAttribute("style")).not.toBe(initial);
  const moved = await firstNode.getAttribute("style");
  await page.mouse.move(box.x + box.width * 0.22, box.y + box.height * 0.32);
  await expect.poll(() => firstNode.getAttribute("style")).not.toBe(moved);
  await mkdir("artifacts", { recursive: true });
  await page
    .locator(".taste-map")
    .screenshot({ path: "artifacts/hover-network.png" });
  await page.mouse.move(3, 3);
  await expect(board).toHaveAttribute("data-hover-power", "0.00");
  await expect(firstNode).toHaveAttribute("style", initial);
  // Reduced motion must suppress the pointer animation even on a fine pointer.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.45);
  await expect(board).toHaveAttribute("data-hover-power", "0.00");
  await expect(firstNode).toHaveAttribute("style", initial);
  await expect(page.locator(".map-hover-halo")).toBeHidden();
});
