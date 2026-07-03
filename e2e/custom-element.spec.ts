import { test, expect } from "@playwright/test";
import { customElementPage } from "./helpers.js";

/**
 * The self-registering <very-nice-mermaid> web component in a bare page.
 * Requires a Chromium install (`npx playwright install chromium`).
 */

test("custom element upgrades and mounts an interactive diagram", async ({ page }) => {
  await page.goto(customElementPage("dark", "element.html"));
  await page.waitForSelector("very-nice-mermaid .vnm-viewport");
  expect(await page.locator("very-nice-mermaid .vnm-node").count()).toBeGreaterThan(2);
});

test("changing the theme attribute re-renders with the new theme", async ({ page }) => {
  await page.goto(customElementPage("light", "element-theme.html"));
  await page.waitForSelector("very-nice-mermaid .vnm-viewport");
  const bgLight = await page
    .locator("very-nice-mermaid .vnm-viewport")
    .evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);

  await page.locator("very-nice-mermaid").evaluate((el) => el.setAttribute("theme", "dark"));
  await page.waitForTimeout(50);
  const bgDark = await page
    .locator("very-nice-mermaid .vnm-viewport")
    .evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);

  expect(bgDark).not.toBe(bgLight);
});
