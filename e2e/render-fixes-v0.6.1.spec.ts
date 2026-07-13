import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { exportHtml, exportHtmlFromDsl } from "./helpers.js";

// Mirrors examples/src/flowchart.mmd (Issue 2's gallery source) verbatim — kept
// inline (exportHtmlFromDsl) rather than pointed at examples/src/ so this spec
// doesn't silently start passing/failing on unrelated future edits to that file.
const FLOWCHART_DSL = `flowchart TD
  start([Push to main]) --> lint{Lint passes?}
  lint -->|yes| test[Run tests]
  lint -->|no| fail[(Report failure)]
  test --> deploy{{Deploy?}}
  deploy -->|prod| prod[/Ship to prod/]
  deploy -->|staging| stg[Ship to staging]
  prod --> done((Done))
  stg --> done
  fail --> done`;

/**
 * Browser-level coverage for feature `diagram-render-fixes-v0.6.1` FR2
 * (perpendicular final-approach into a node border) and FR3 (an edge label
 * escapes a bisecting FOREIGN parallel run) — the gap found in test round 1:
 * both fixes already had unit coverage (test/geometry.test.ts) and fake-DOM
 * byte-parity coverage (test/dom-runtime-parity.test.ts, REV-001), but nothing
 * drove the REAL rendered SVG in a REAL browser for the exact
 * `fixtures/state-machine.mmd` shapes the plan names — the idle→Loading
 * arrowhead and the "give up" label — nor the flowchart `Done` side-entries
 * (Issue 2, same FR2 mechanism). Driven over file:// via the real Playwright
 * test runner (the bundled gogo-playwright MCP blocks file:// navigation).
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

/**
 * Client-space (post pan/zoom-transform) end-point + the point 4px before it
 * for every rendered edge path, via `getPointAtLength` + `getScreenCTM` — the
 * DOM's own idea of where each path visually terminates and which direction
 * its closing segment runs, independent of `d`-string parsing or model.edges
 * ordering.
 */
function edgeGeometry(page: Page) {
  return page.evaluate(() => {
    const paths = Array.from(document.querySelectorAll("svg.vnm-edges path[marker-end]")) as SVGPathElement[];
    return paths.map((path) => {
      const len = path.getTotalLength();
      const ctm = path.getScreenCTM()!;
      const toClient = (pt: DOMPoint) => {
        const dp = new DOMPoint(pt.x, pt.y).matrixTransform(ctm);
        return { x: dp.x, y: dp.y };
      };
      return {
        d: path.getAttribute("d") ?? "",
        end: toClient(path.getPointAtLength(len)),
        penult: toClient(path.getPointAtLength(Math.max(0, len - 4))),
      };
    });
  });
}

function nodeAnchor(page: Page, text: string) {
  return page.evaluate((needle) => {
    const node = Array.from(document.querySelectorAll(".vnm-node")).find((el) => el.textContent?.trim() === needle);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
  }, text);
}

/** The plate <rect> immediately preceding a label's <text> element (mirrors bridges-and-labels.spec.ts). */
function labelPlateRect(page: Page, text: string) {
  return page.evaluate((needle) => {
    const t = Array.from(document.querySelectorAll("text")).find((el) => el.textContent === needle);
    if (!t) return null;
    let rect: Element | null = null;
    let sib: Element | null = t.previousElementSibling;
    while (sib && !rect) {
      if (sib.tagName === "rect") rect = sib;
      sib = sib.previousElementSibling;
    }
    if (!rect) return null;
    const r = rect.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
  }, text);
}

/** Every edge path's sample-point hit count against a plate rect, in DOM order. */
function edgeHitsAgainstPlate(page: Page, plate: { x: number; y: number; right: number; bottom: number }) {
  return page.evaluate((p) => {
    const paths = Array.from(document.querySelectorAll("svg.vnm-edges path[marker-end]")) as SVGPathElement[];
    return paths.map((path) => {
      const len = path.getTotalLength();
      const ctm = path.getScreenCTM()!;
      const step = Math.max(1, len / 60);
      let hits = 0;
      for (let d = 0; d <= len; d += step) {
        const pt = path.getPointAtLength(d);
        const cp = new DOMPoint(pt.x, pt.y).matrixTransform(ctm);
        if (cp.x >= p.x && cp.x <= p.right && cp.y >= p.y && cp.y <= p.bottom) hits++;
      }
      return hits;
    });
  }, plate);
}

test.describe("FR2 — idle→Loading arrowhead enters perpendicular, no doubling-back stub (v0.6.1 Issue 1a, real browser)", () => {
  test("the edge closing into Loading's top descends straight down (exported HTML, dark, clean)", async ({ page }) => {
    const errors = trackErrors(page);
    const url = exportHtml("state-machine.mmd", "dark", "fr2-state-machine-dark.html");
    await page.goto(url);
    await page.waitForSelector(".vnm-node");

    const loading = await nodeAnchor(page, "Loading");
    expect(loading).not.toBeNull();

    const edges = await edgeGeometry(page);
    // the edge that ends nearest Loading's top-center is idle→Loading
    let best = edges[0]!;
    let bestDist = Infinity;
    for (const e of edges) {
      const dist = Math.hypot(e.end.x - loading!.cx, e.end.y - loading!.top);
      if (dist < bestDist) {
        bestDist = dist;
        best = e;
      }
    }
    expect(bestDist).toBeLessThan(5); // genuinely terminates at Loading's top border

    // the closing segment is vertical and descends INTO the box (FR2) — not a
    // sideways stub whose arrowhead would point left/right above the box.
    expect(Math.abs(best.end.x - best.penult.x)).toBeLessThan(3);
    expect(best.penult.y).toBeLessThan(best.end.y);

    expect(errors).toEqual([]);
  });

  test("stays perpendicular after a live drag re-routes it", async ({ page }) => {
    const url = exportHtml("state-machine.mmd", "dark", "fr2-state-machine-drag.html");
    await page.goto(url);
    await page.waitForSelector(".vnm-node");

    // Real pointer down/move/up on Idle — not element.click() (masks pointer-driven drag handlers).
    const idle = page.locator(".vnm-node", { hasText: "Idle" }).first();
    const box = (await idle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 220, box.y + 40, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(100);

    const loading = await nodeAnchor(page, "Loading");
    const edges = await edgeGeometry(page);
    let best = edges[0]!;
    let bestDist = Infinity;
    for (const e of edges) {
      const dist = Math.hypot(e.end.x - loading!.cx, e.end.y - loading!.top);
      if (dist < bestDist) {
        bestDist = dist;
        best = e;
      }
    }
    expect(bestDist).toBeLessThan(5);
    expect(Math.abs(best.end.x - best.penult.x)).toBeLessThan(3);
    expect(best.penult.y).toBeLessThan(best.end.y);
  });
});

test.describe("FR2 — flowchart Done side-entries enter perpendicular (v0.6.1 Issue 2, real browser)", () => {
  test("Ship-to-prod and Report-failure both close horizontally into Done's left/right border", async ({ page }) => {
    const errors = trackErrors(page);
    const url = exportHtmlFromDsl(FLOWCHART_DSL, "light", "fr2-flowchart-done.html");
    await page.goto(url);
    await page.waitForSelector(".vnm-node");

    const done = await nodeAnchor(page, "Done");
    expect(done).not.toBeNull();
    const edges = await edgeGeometry(page);

    const nearLeft = edges.filter((e) => Math.hypot(e.end.x - done!.left, e.end.y - done!.cy) < 5);
    const nearRight = edges.filter((e) => Math.hypot(e.end.x - done!.right, e.end.y - done!.cy) < 5);
    expect(nearLeft.length).toBe(1); // Ship to prod → Done
    expect(nearRight.length).toBe(1); // Report failure → Done

    // both closing segments are horizontal (perpendicular to the left/right border)
    // and approach from the correct exterior side — not the old diagonal stub.
    expect(nearLeft[0]!.end.y).toBeCloseTo(nearLeft[0]!.penult.y, 0);
    expect(nearLeft[0]!.penult.x).toBeLessThan(nearLeft[0]!.end.x); // comes from the left (exterior)

    expect(nearRight[0]!.end.y).toBeCloseTo(nearRight[0]!.penult.y, 0);
    expect(nearRight[0]!.penult.x).toBeGreaterThan(nearRight[0]!.end.x); // comes from the right (exterior)

    expect(errors).toEqual([]);
  });
});

test.describe("FR3 — 'give up' label clears the parallel retry/error run (v0.6.1 Issue 1b, real browser)", () => {
  test("no FOREIGN edge passes through the label's plate (exported HTML, dark, clean)", async ({ page }) => {
    const errors = trackErrors(page);
    const url = exportHtml("state-machine.mmd", "dark", "fr3-state-machine-dark.html");
    await page.goto(url);
    await page.waitForSelector(".vnm-node");

    const plate = await labelPlateRect(page, "give up");
    expect(plate).not.toBeNull();

    // Sample every edge path at ~60 steps and count hits inside the plate rect.
    // The label's OWN edge legitimately runs under its opaque plate (that's the
    // "reserved space" the label sits on) — so at most ONE edge may register
    // hits. Any SECOND edge with a nonzero hit count is a foreign parallel run
    // bisecting the text — the pre-fix v0.6.0 symptom.
    const hits = await edgeHitsAgainstPlate(page, plate!);
    const sorted = [...hits].sort((a, b) => b - a);
    expect(sorted[1]).toBe(0);

    expect(errors).toEqual([]);
  });

  test("holds in the light theme too", async ({ page }) => {
    const url = exportHtml("state-machine.mmd", "light", "fr3-state-machine-light.html");
    await page.goto(url);
    await page.waitForSelector(".vnm-node");

    const plate = await labelPlateRect(page, "give up");
    expect(plate).not.toBeNull();
    const hits = await edgeHitsAgainstPlate(page, plate!);
    const sorted = [...hits].sort((a, b) => b - a);
    expect(sorted[1]).toBe(0);
  });
});
