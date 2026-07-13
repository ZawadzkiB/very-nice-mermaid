import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { readFileSync } from "node:fs";
import { XMLValidator } from "fast-xml-parser";
import { exportHtmlStyled } from "./helpers.js";

/**
 * End-to-end coverage for the `sketch-style` feature (v0.5.0, phase ④ test
 * round 01): the Excalidraw-like hand-drawn `--style sketch` rendering mode —
 * wobbly multi-stroke outlines, open sketchy arrowheads, the bundled Kalam
 * handwriting font (embedded, zero network) — driven interactively over the
 * standalone exported HTML with REAL pointer events, matching the project's
 * established e2e conventions (interactive-editing.spec.ts / state.spec.ts).
 */

/** Collect console errors + page errors for the lifetime of a test. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

test.describe("interactive sketch flowchart (--style sketch)", () => {
  let url: string;
  test.beforeAll(() => {
    url = exportHtmlStyled("ci-pipeline.mmd", "sketch", "light", "sketch-flowchart.html");
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(url);
    await page.waitForSelector(".vnm-node");
  });

  test("renders hand-drawn wavy node outlines and edges (not crisp rects)", async ({ page }) => {
    // Sketch mode draws each node's outline as rough multi-stroke <path>s (with
    // quadratic " Q " bows) into svg.vnm-edges (nested in the FR1 z-layer <g>
    // groups — vnm-edge-layer / vnm-node-layer — not a direct child of the svg).
    const shapePaths = page.locator("svg.vnm-edges path[stroke]:not([stroke='none'])");
    const ds = await shapePaths.evaluateAll((ps) => ps.map((p) => p.getAttribute("d") ?? ""));
    expect(ds.length).toBeGreaterThan(0);
    expect(ds.some((d) => d.includes(" Q "))).toBe(true);
  });

  test("labels use the embedded Kalam handwriting font", async ({ page }) => {
    const styleText = await page.locator("style").allInnerTexts();
    const joined = styleText.join("\n");
    expect(joined).toContain("Kalam");
    expect(joined).toContain("@font-face");
    // zero network: the font is base64-embedded, not linked.
    expect(joined).not.toMatch(/url\(\s*['"]?https?:\/\//i);
  });

  test("dragging a node re-routes its rough edges live and keeps the wobble", async ({ page }) => {
    const edges = page.locator("svg.vnm-edges path");
    const before = await edges.evaluateAll((ps) => ps.map((p) => p.getAttribute("d")));

    const node = page.locator(".vnm-node", { hasText: "Push to main" }).first();
    const box = (await node.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 + 90, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(50);

    const after = await edges.evaluateAll((ps) => ps.map((p) => p.getAttribute("d")));
    expect(after).not.toEqual(before);
    // still rough after the re-route, not a straight-line fallback.
    const changed = after.filter((d, i) => d !== before[i] && d);
    expect(changed.some((d) => (d as string).includes(" Q "))).toBe(true);
  });

  test("edges use open hand-drawn arrowheads, not the clean filled-triangle marker", async ({ page }) => {
    const markerEndCount = await page.locator("svg.vnm-edges path[marker-end]").count();
    expect(markerEndCount).toBe(0);
  });

  test("Save SVG downloads sketch SVG (rough strokes + embedded font, no marker-end)", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    const btn = page.locator(".vnm-toolbar button", { hasText: "SVG" });
    const box = (await btn.boundingBox())!;
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      (async () => {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.up();
      })(),
    ]);
    const path = await download.path();
    const svg = readFileSync(path!, "utf8");
    expect(XMLValidator.validate(svg)).toBe(true);
    expect(svg).toContain(" Q ");
    expect(svg).toContain("@font-face");
    expect(svg).toContain("Kalam");
    expect(svg).not.toContain("marker-end");
    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });

  test("a full drag + export session produces no console errors", async ({ page }) => {
    const errors = trackErrors(page);
    const node = page.locator(".vnm-node").first();
    const box = (await node.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 80, { steps: 6 });
    await page.mouse.up();
    await page.locator(".vnm-viewport").hover({ position: { x: 200, y: 200 } });
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });
});

test.describe("sketch vs clean — visual axis is orthogonal", () => {
  test("the same diagram renders visibly different markup between clean and sketch", async ({
    page,
  }) => {
    const cleanUrl = exportHtmlStyled("ci-pipeline.mmd", "clean", "light", "sketch-cmp-clean.html");
    const sketchUrl = exportHtmlStyled("ci-pipeline.mmd", "sketch", "light", "sketch-cmp-sketch.html");

    await page.goto(cleanUrl);
    await page.waitForSelector(".vnm-node");
    const cleanMarkerEnd = await page.locator("svg.vnm-edges path[marker-end]").count();

    await page.goto(sketchUrl);
    await page.waitForSelector(".vnm-node");
    const sketchMarkerEnd = await page.locator("svg.vnm-edges path[marker-end]").count();
    const sketchFontDefs = await page.locator("style").allInnerTexts();

    expect(cleanMarkerEnd).toBeGreaterThan(0); // clean uses the filled-triangle marker
    expect(sketchMarkerEnd).toBe(0); // sketch draws its own open arrowheads
    expect(sketchFontDefs.join("\n")).toContain("Kalam");
  });
});

test.describe("sketch native tiers — sequence / class / state render without console errors", () => {
  // Sequence has no participant drag: it's static-SVG-in-a-pan/zoom-shell (per
  // the as-built notes), so it waits on ".vnm-world svg" like e2e/sequence.spec.ts
  // does, not ".vnm-node" (that's the flowchart/class/state draggable overlay).
  test("sequence: renders hand-drawn boxes + open arrowheads", async ({ page }) => {
    const errors = trackErrors(page);
    const url = exportHtmlStyled("order-sequence.mmd", "sketch", "light", "sketch-sequence.html");
    await page.goto(url);
    await page.waitForSelector(".vnm-world svg");
    const paths = page.locator(".vnm-world svg path[d]");
    const ds = await paths.evaluateAll((ps) => ps.map((p) => p.getAttribute("d") ?? ""));
    expect(ds.some((d) => d.includes(" Q "))).toBe(true);
    // sketch draws its own open arrowheads — no filled-triangle marker-end.
    const markerEndCount = await page.locator(".vnm-world svg path[marker-end]").count();
    expect(markerEndCount).toBe(0);
    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });

  test("class: renders hand-drawn card outlines without console errors", async ({ page }) => {
    const errors = trackErrors(page);
    const url = exportHtmlStyled("shop-class.mmd", "sketch", "light", "sketch-class.html");
    await page.goto(url);
    await page.waitForSelector(".vnm-node");
    const shapePaths = page.locator("svg.vnm-edges path[stroke]:not([stroke='none'])");
    const ds = await shapePaths.evaluateAll((ps) => ps.map((p) => p.getAttribute("d") ?? ""));
    expect(ds.some((d) => d.includes(" Q "))).toBe(true);
    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });

  test("state: renders hand-drawn transitions without console errors", async ({ page }) => {
    const errors = trackErrors(page);
    const url = exportHtmlStyled("order-state.mmd", "sketch", "light", "sketch-state.html");
    await page.goto(url);
    await page.waitForSelector(".vnm-node");
    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });

  // Regression guard (TEST-001, found via hands-on exploration, round 01): the
  // static native renderer (src/native/state/svg.ts renderState()) explicitly
  // keeps `[*]` start/end pseudo-state markers CLEAN even in sketch mode (a
  // solid dot / ringed "bullseye" — the as-built plan calls this out as a
  // deliberate semantic exception). The INTERACTIVE runtime's sketch path
  // (src/render/dom/runtime.ts) has no such exception: it rough-draws every
  // node uniformly, including the two pseudo-state circles, so both the live
  // view and its "Save SVG" / "Save PNG" exports currently render start AND
  // end as near-identical scribbled blobs — losing the start/end distinction
  // that the static SVG/PNG output (and the plan's as-built notes) promise.
  // This test intentionally fails until that parity gap is fixed; see
  // .gogo/work/feature-sketch-style/test/issues.json TEST-001.
  test("state pseudo-state start/end markers stay CLEAN circles in the interactive/exported SVG too (parity with the static renderer)", async ({
    page,
  }) => {
    const url = exportHtmlStyled("order-state.mmd", "sketch", "light", "sketch-state-pseudo.html");
    await page.goto(url);
    await page.waitForSelector(".vnm-node");

    const btn = page.locator(".vnm-toolbar button", { hasText: "SVG" });
    const box = (await btn.boundingBox())!;
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      (async () => {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.up();
      })(),
    ]);
    const path = await download.path();
    const svg = readFileSync(path!, "utf8");

    // The static renderer's clean pseudo-state markers are plain <circle>
    // elements (a solid-fill start dot + a ringed end dot) — never rough paths.
    expect(svg).toContain("<circle");
  });
});
