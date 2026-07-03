import { test, expect } from "@playwright/test";
import { exportHtml } from "./helpers.js";

/**
 * Drives the standalone exported HTML over file:// — the same artifact a user
 * gets from `vnm render -o out.html`. Requires a Chromium install
 * (`npx playwright install chromium`).
 */

let url: string;
test.beforeAll(() => {
  url = exportHtml("ci-pipeline.mmd", "light", "exported.html");
});

test.beforeEach(async ({ page }) => {
  await page.goto(url);
  await page.waitForSelector(".vnm-node");
});

test("renders node cards and routed edges", async ({ page }) => {
  expect(await page.locator(".vnm-node").count()).toBeGreaterThan(3);
  expect(await page.locator("svg.vnm-edges path[d]").count()).toBeGreaterThan(3);
});

test("fit-to-view sets a world transform", async ({ page }) => {
  await page.locator(".vnm-toolbar button", { hasText: "⤢" }).click();
  const transform = await page.locator(".vnm-world").evaluate((el) => (el as HTMLElement).style.transform);
  expect(transform).toContain("scale(");
});

// Regression test for a real bug found via hands-on exploration (test round 1,
// TEST-001): clicking a toolbar button is a real pointerdown+pointerup, which
// bubbles to the viewport's own pointerdown handler and (mis)treats it as a
// background pan, capturing the pointer and swallowing the button's click.
// The test above only asserts the transform *contains* "scale(" — true both
// before and after any click, so it can't detect the button doing nothing.
// This test pans away first and asserts fit-to-view actually restores the
// original centered transform via a real mouse click (not element.click()).
test("fit-to-view actually resets the transform after a real mouse click", async ({ page }) => {
  const world = page.locator(".vnm-world");
  const initial = await world.evaluate((el) => (el as HTMLElement).style.transform);

  // Pan away via a background click-drag (empty canvas, not a node).
  await page.mouse.move(150, 150);
  await page.mouse.down();
  await page.mouse.move(280, 240, { steps: 8 });
  await page.mouse.up();
  const panned = await world.evaluate((el) => (el as HTMLElement).style.transform);
  expect(panned).not.toBe(initial);

  // Real mouse click (down+up) on the fit-to-view button, as a user would.
  const btn = page.locator(".vnm-toolbar button", { hasText: "⤢" });
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(100);

  const afterFit = await world.evaluate((el) => (el as HTMLElement).style.transform);
  expect(afterFit).toBe(initial);
});

test("minimap drag recenters the main view", async ({ page }) => {
  const world = page.locator(".vnm-world");
  const before = await world.evaluate((el) => (el as HTMLElement).style.transform);

  const minimap = page.locator("canvas.vnm-minimap");
  const box = (await minimap.boundingBox())!;
  await page.mouse.move(box.x + 15, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 15, box.y + box.height - 15, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(50);

  const after = await world.evaluate((el) => (el as HTMLElement).style.transform);
  expect(after).not.toBe(before);
});

test("dragging a node re-routes its edges live", async ({ page }) => {
  const node = page.locator(".vnm-node").first();
  const edge = page.locator("svg.vnm-edges path[marker-end]").first();
  const dBefore = await edge.getAttribute("d");

  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 90, { steps: 8 });
  await page.mouse.up();

  const dAfter = await edge.getAttribute("d");
  expect(dAfter).not.toBe(dBefore);
});

test("drag position persists across reload", async ({ page }) => {
  const node = page.locator(".vnm-node").first();
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  const leftAfter = await node.evaluate((el) => (el as HTMLElement).style.left);

  // layout persistence is debounced (400ms) — wait for the write before reload
  await page.waitForTimeout(700);
  await page.reload();
  await page.waitForSelector(".vnm-node");
  const leftReloaded = await page.locator(".vnm-node").first().evaluate((el) => (el as HTMLElement).style.left);
  expect(leftReloaded).toBe(leftAfter);
});

test("wheel zooms at the cursor", async ({ page }) => {
  const world = page.locator(".vnm-world");
  const scaleBefore = await world.evaluate((el) => (el as HTMLElement).style.transform);
  await page.locator(".vnm-viewport").hover({ position: { x: 200, y: 200 } });
  await page.mouse.wheel(0, -300);
  const scaleAfter = await world.evaluate((el) => (el as HTMLElement).style.transform);
  expect(scaleAfter).not.toBe(scaleBefore);
});

test("minimap is drawn to scale", async ({ page }) => {
  const canvas = page.locator("canvas.vnm-minimap");
  await expect(canvas).toBeVisible();
  const w = await canvas.evaluate((el) => (el as HTMLCanvasElement).width);
  expect(w).toBeGreaterThan(0);
});
