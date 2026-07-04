import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { exportHtml } from "./helpers.js";

/**
 * Drives the standalone exported HTML for a NATIVE sequence diagram over
 * file:// — the artifact a user gets from `vnm render order-sequence.mmd
 * -o out.html`. Sequence interactivity is themed + pan/zoom/fit/minimap (no
 * participant drag), so this asserts the interactive floor. Requires a Chromium
 * install (`npx playwright install chromium`).
 */

let url: string;
test.beforeAll(() => {
  url = exportHtml("order-sequence.mmd", "dark", "exported-sequence.html");
});

test.beforeEach(async ({ page }) => {
  await page.goto(url);
  await page.waitForSelector(".vnm-world svg");
});

const worldTransform = (page: Page) =>
  page.locator(".vnm-world").evaluate((el) => (el as HTMLElement).style.transform);

test("renders the themed sequence SVG (participants + messages)", async ({ page }) => {
  // participant labels + at least one message arrow are present in the SVG.
  // (SVG <text> has no innerText, so read textContent.)
  const texts = await page.locator(".vnm-world svg text").allTextContents();
  expect(texts.join(" ")).toContain("User");
  expect(texts.join(" ")).toContain("DB");
  expect(await page.locator(".vnm-world svg [marker-end]").count()).toBeGreaterThan(0);
});

test("fit-to-view sets a world transform with a scale", async ({ page }) => {
  const btn = page.locator(".vnm-toolbar button", { hasText: "⤢" });
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(50);
  expect(await worldTransform(page)).toContain("scale(");
});

test("wheel zooms at the cursor (transform changes)", async ({ page }) => {
  const before = await worldTransform(page);
  await page.locator(".vnm-viewport").hover({ position: { x: 200, y: 160 } });
  await page.mouse.wheel(0, -300);
  const after = await worldTransform(page);
  expect(after).not.toBe(before);
});

test("background click-drag pans the view", async ({ page }) => {
  const before = await worldTransform(page);
  await page.mouse.move(160, 160);
  await page.mouse.down();
  await page.mouse.move(300, 260, { steps: 8 });
  await page.mouse.up();
  const after = await worldTransform(page);
  expect(after).not.toBe(before);
});

test("minimap is drawn to scale", async ({ page }) => {
  const canvas = page.locator("canvas.vnm-minimap");
  await expect(canvas).toBeVisible();
  const w = await canvas.evaluate((el) => (el as HTMLCanvasElement).width);
  expect(w).toBeGreaterThan(0);
});

test("a full interaction session produces no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.locator(".vnm-viewport").hover({ position: { x: 200, y: 160 } });
  await page.mouse.wheel(0, -240);
  await page.mouse.wheel(0, 180);
  await page.mouse.move(160, 160);
  await page.mouse.down();
  await page.mouse.move(280, 240, { steps: 6 });
  await page.mouse.up();
  const fit = page.locator(".vnm-toolbar button", { hasText: "⤢" });
  const fb = (await fit.boundingBox())!;
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
  await page.mouse.down();
  await page.mouse.up();

  await page.waitForTimeout(50);
  expect(errors).toEqual([]);
});
