import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { exportHtml } from "./helpers.js";

/**
 * Drives the standalone exported HTML for a NATIVE state diagram over file:// —
 * the artifact from `vnm render order-state.mmd -o out.html`. State machines are
 * node-graphs, so they reuse the flowchart vnmRuntime: full draggable states
 * with live transition re-routing + pan/zoom/fit. Requires a Chromium install.
 */

let url: string;
test.beforeAll(() => {
  url = exportHtml("order-state.mmd", "dark", "exported-state.html");
});

test.beforeEach(async ({ page }) => {
  await page.goto(url);
  await page.waitForSelector(".vnm-node");
});

const worldTransform = (page: Page) =>
  page.locator(".vnm-world").evaluate((el) => (el as HTMLElement).style.transform);

test("renders state cards with their labels", async ({ page }) => {
  const texts = (await page.locator(".vnm-node").allInnerTexts()).join(" ");
  expect(texts).toContain("Idle");
  expect(texts).toContain("Running");
});

test("dragging a state re-routes its transition edges", async ({ page }) => {
  const edges = page.locator("svg.vnm-edges path[marker-end]");
  const before = await edges.evaluateAll((ps) => ps.map((p) => p.getAttribute("d")));

  // Running has several incident transitions, so dragging it must re-route them.
  const node = page.locator(".vnm-node", { hasText: "Running" }).first();
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 110, { steps: 8 });
  await page.mouse.up();

  const after = await edges.evaluateAll((ps) => ps.map((p) => p.getAttribute("d")));
  expect(after).not.toEqual(before);
});

test("wheel zooms and background drag pans the view", async ({ page }) => {
  const before = await worldTransform(page);
  await page.locator(".vnm-viewport").hover({ position: { x: 200, y: 200 } });
  await page.mouse.wheel(0, -300);
  const zoomed = await worldTransform(page);
  expect(zoomed).not.toBe(before);

  await page.mouse.move(160, 160);
  await page.mouse.down();
  await page.mouse.move(300, 280, { steps: 8 });
  await page.mouse.up();
  const panned = await worldTransform(page);
  expect(panned).not.toBe(zoomed);
});

test("a full interaction session produces no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const node = page.locator(".vnm-node", { hasText: "Idle" }).first();
  const nb = (await node.boundingBox())!;
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await page.mouse.down();
  await page.mouse.move(nb.x + 130, nb.y + 90, { steps: 6 });
  await page.mouse.up();
  await page.locator(".vnm-viewport").hover({ position: { x: 200, y: 200 } });
  await page.mouse.wheel(0, -240);

  await page.waitForTimeout(50);
  expect(errors).toEqual([]);
});
