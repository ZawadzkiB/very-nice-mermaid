import { test, expect } from "@playwright/test";
import { exportHtmlFromDsl } from "./helpers.js";

/**
 * v0.7.3 - `accTitle` / `accDescr` name and describe the diagram in the exported
 * HTML, wired like mermaid 11.16.0 (accessibility.ts addSVGa11yTitleDescription):
 * `<title>` / `<desc>` in the svg, referenced by aria-labelledby / aria-describedby.
 * Checked through the computed accessible name and description in Chromium.
 */
test("accTitle / accDescr give the exported diagram an accessible name and description", async ({ page }) => {
  const dsl = [
    "flowchart TD",
    "  accTitle: Order flow",
    "  accDescr {",
    "    Cart goes to checkout.",
    "  }",
    "  A[Cart] --> B[Checkout]",
  ].join("\n");
  await page.goto(exportHtmlFromDsl(dsl, "light", "a11y.html"));
  await page.waitForSelector(".vnm-node");
  const svg = page.locator("svg.vnm-edges");
  await expect(svg).toHaveAccessibleName("Order flow");
  await expect(svg).toHaveAccessibleDescription("Cart goes to checkout.");
  const titleId = await svg.getAttribute("aria-labelledby");
  expect(titleId).toMatch(/^chart-title-vnm-[0-9a-z]+$/);
  await expect(page.locator(`[id="${titleId}"]`)).toHaveCount(1);
});
