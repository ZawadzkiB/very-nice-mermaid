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
  //
  // v0.6.4 (edge-label-halo) moved every label OFF its own line (perpendicular
  // offset), by design. On this tight anti-parallel pair the two home lines are
  // only JOG_GAP (26px) apart, so a label's offset plate can end up geometrically
  // CLOSER to the neighbour's line than to its own — nearest-point-to-label-center
  // is no longer a reliable way to correlate a label to "its" path. Correlate by
  // graph structure instead (which node each path starts/ends at) — robust to
  // where the label plate itself sits.
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

    // Node cards are positioned via style.left/top in the SAME coordinate space as
    // the edge paths (both live unTransformed inside .vnm-world), so offsetLeft/Top
    // can be compared directly against path.getPointAtLength() with no unit conversion.
    function nodeBox(label: string) {
      const card = [...document.querySelectorAll<HTMLElement>(".vnm-node")].find(
        (n) => n.textContent?.trim() === label,
      )!;
      const x = card.offsetLeft;
      const y = card.offsetTop;
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      return { x, y, w, h };
    }
    const running = nodeBox("Running");
    const paused = nodeBox("Paused");

    function nearBox(pt: { x: number; y: number }, box: { x: number; y: number; w: number; h: number }, pad = 6) {
      return (
        pt.x >= box.x - pad &&
        pt.x <= box.x + box.w + pad &&
        pt.y >= box.y - pad &&
        pt.y <= box.y + box.h + pad
      );
    }

    let pausePath: SVGPathElement | null = null;
    let resumePath: SVGPathElement | null = null;
    for (const p of paths) {
      const len = p.getTotalLength();
      const start = p.getPointAtLength(0);
      const end = p.getPointAtLength(len);
      if (nearBox(start, running) && nearBox(end, paused)) pausePath = p; // Running --> Paused
      if (nearBox(start, paused) && nearBox(end, running)) resumePath = p; // Paused --> Running
    }

    return {
      pauseJogY: pausePath ? jogY(pausePath) : null,
      resumeJogY: resumePath ? jogY(resumePath) : null,
    };
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
