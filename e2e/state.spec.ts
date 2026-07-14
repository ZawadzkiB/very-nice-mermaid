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

test("anti-parallel jog de-cramp (v0.6.2): pause/resume stagger onto distinct lanes in the LIVE-rendered runtime", async ({ page }) => {
  // order-state.mmd has a genuine anti-parallel bundle: Running --> Paused : pause
  // and Paused --> Running : resume. Pre-v0.6.2 both edges' naive-elbow jogs landed
  // on the identical mid-y and merged into one crossbar (the reported bug, fixed by
  // separateAntiParallelJogs). This drives the REAL exported runtime (not a fake DOM
  // or the static SVG) and asserts the live geometry is actually staggered — the
  // dom-runtime-parity unit test already byte-compares the twin under jsdom; this
  // closes the loop with a genuine browser-rendered check.
  const found = await page.evaluate(() => {
    // Longest contiguous near-horizontal run of sampled points == the interior jog;
    // its (constant) y is the "lane" the pass staggers onto.
    function jogY(path: SVGPathElement): number | null {
      const len = path.getTotalLength();
      const N = 200;
      const pts = Array.from({ length: N + 1 }, (_, i) => path.getPointAtLength((len * i) / N));
      let bestRunLen = 0;
      let bestY: number | null = null;
      let runStart = 0;
      for (let i = 1; i <= pts.length; i++) {
        const prev = pts[i - 1]!;
        const curr = i < pts.length ? pts[i] : undefined;
        const horizontal = curr !== undefined && Math.abs(curr.y - prev.y) < 0.05 && Math.abs(curr.x - prev.x) > 0.001;
        if (!horizontal) {
          const runLen = i - runStart;
          if (runLen > bestRunLen) {
            bestRunLen = runLen;
            bestY = pts[runStart]!.y;
          }
          runStart = i;
        }
      }
      return bestY;
    }

    const edgesLayer = document.querySelector("svg.vnm-edges")!;
    const paths = [...edgesLayer.querySelectorAll<SVGPathElement>("path[marker-end]")];
    const labelGroup = [...edgesLayer.children].find((g) => g.querySelector("text"))!;
    const rects = [...labelGroup.querySelectorAll("rect")];
    const texts = [...labelGroup.querySelectorAll("text")];

    // Correlate each label to its edge path by proximity (closest sampled point on
    // the path to the label's center) — real geometry, no assumption about DOM order.
    function closestDistance(path: SVGPathElement, x: number, y: number): number {
      const len = path.getTotalLength();
      let best = Infinity;
      for (let i = 0; i <= 40; i++) {
        const p = path.getPointAtLength((len * i) / 40);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < best) best = d;
      }
      return best;
    }

    function pathFor(label: string): SVGPathElement {
      const idx = texts.findIndex((t) => t.textContent === label);
      const r = rects[idx]!.getBBox();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      let bestPath: SVGPathElement | undefined = paths[0];
      let bestDist = Infinity;
      for (const p of paths) {
        const d = closestDistance(p, cx, cy);
        if (d < bestDist) {
          bestDist = d;
          bestPath = p;
        }
      }
      return bestPath!;
    }

    const pausePath = pathFor("pause");
    const resumePath = pathFor("resume");
    return { pauseJogY: jogY(pausePath), resumeJogY: jogY(resumePath) };
  });

  expect(found.pauseJogY).not.toBeNull();
  expect(found.resumeJogY).not.toBeNull();
  // Pre-fix both landed on the identical mid-y (diff 0). Fixed: staggered >= JOG_GAP
  // (26) apart — assert a safe margin below that as the layout invariant, not an
  // exact hardcoded value.
  expect(Math.abs(found.pauseJogY! - found.resumeJogY!)).toBeGreaterThan(20);
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
