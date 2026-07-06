import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { XMLValidator } from "fast-xml-parser";
import { exportHtml, exportHtmlFromDsl, repoRoot } from "./helpers.js";

/**
 * End-to-end coverage for the v0.3.0 interactive-editing feature (phase ④ test
 * round 01): resize (FR1), perimeter-distributed connectors (FR2), in-browser
 * Save SVG / Save PNG (FR3), and persistence (FR4) — all driven with REAL
 * pointer events (mouse move/down/move/up with pointer capture, not
 * `element.click()`) against the standalone HTML a real `vnm render -o
 * out.html` produces. jsdom cannot rasterize a canvas, so the PNG path in
 * particular can only be proven here, in a real Chromium.
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

const worldTransform = (page: Page) =>
  page.locator(".vnm-world").evaluate((el) => (el as HTMLElement).style.transform);

async function getScale(page: Page): Promise<number> {
  const t = await worldTransform(page);
  const m = /scale\(([-\d.]+)\)/.exec(t);
  return m ? parseFloat(m[1]!) : 1;
}

/** A real click: pointer down + up in place (no movement), as `selectNode` requires. */
async function realClick(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

/** Drag from (x,y) to (x+dx,y+dy) via real, stepped pointer events. */
async function realDrag(page: Page, x: number, y: number, dx: number, dy: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

const cardBox = async (page: Page, id: string) =>
  page.locator(`.vnm-node[data-id="${id}"]`).evaluate((el) => {
    const s = (el as HTMLElement).style;
    return { w: parseFloat(s.width), h: parseFloat(s.height), left: s.left, top: s.top };
  });

/** Parse translate(txpx,typx) scale(s) into its three numbers. */
async function getTransform(page: Page): Promise<{ tx: number; ty: number; scale: number }> {
  const t = await worldTransform(page);
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/.exec(t);
  return m ? { tx: parseFloat(m[1]!), ty: parseFloat(m[2]!), scale: parseFloat(m[3]!) } : { tx: 0, ty: 0, scale: 1 };
}

/** Convert a WORLD-space point (same frame as card style.left/top and edge path
 *  coordinates) to a SCREEN point Playwright's mouse can target, given the
 *  current pan/zoom. Mirrors the runtime's own pointerWorld() inverted. */
async function worldToScreen(page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  const vp = (await page.locator(".vnm-viewport").boundingBox())!;
  const { tx, ty, scale } = await getTransform(page);
  return { x: vp.x + tx + wx * scale, y: vp.y + ty + wy * scale };
}

/** Read the live `.vnm-subgraph` rect (world-frame x/y/width/height, top-left
 *  based) whose position matches the given `.vnm-subgraph-title` text — rects
 *  and titles are NOT in matching DOM order (rects are insertBefore'd, so their
 *  DOM order is reversed vs. titles' appendChild order), so this maps by the
 *  title's own (x,y), which the runtime derives from its rect's (x,y) + a fixed
 *  +12/+18 offset (see `renderSubgraphs()`), rather than by index. */
async function subgraphBoxByTitle(
  page: Page,
  title: string,
): Promise<{ x: number; y: number; w: number; h: number }> {
  const box = await page.evaluate((wantedTitle: string) => {
    const texts = Array.from(document.querySelectorAll(".vnm-subgraph-title"));
    const t = texts.find((el) => el.textContent === wantedTitle);
    if (!t) return null;
    const tx = parseFloat(t.getAttribute("x") ?? "0");
    const ty = parseFloat(t.getAttribute("y") ?? "0");
    const rects = Array.from(document.querySelectorAll(".vnm-subgraph"));
    let best: Element | null = null;
    let bestD = Infinity;
    for (const r of rects) {
      const rx = parseFloat(r.getAttribute("x") ?? "0");
      const ry = parseFloat(r.getAttribute("y") ?? "0");
      const d = Math.hypot(rx + 12 - tx, ry + 18 - ty);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    if (!best) return null;
    return {
      x: parseFloat(best.getAttribute("x") ?? "0"),
      y: parseFloat(best.getAttribute("y") ?? "0"),
      w: parseFloat(best.getAttribute("width") ?? "0"),
      h: parseFloat(best.getAttribute("height") ?? "0"),
    };
  }, title);
  if (!box) throw new Error(`no .vnm-subgraph found for title "${title}"`);
  return box;
}

/** Read the persisted layout sidecar straight out of localStorage (the exact
 *  `LayoutData` shape `exportLayout()`/`persistNow()` write) — lets a test on
 *  the standalone CLI export (which has no JS handle reference on the page)
 *  assert the precise `{side,offset,from,to}` anchor shape without needing one. */
async function readPersistedLayout(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("vnm-layout:"));
    if (!key) return null;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  });
}

/** Render a fixture through the built CLI with an arbitrary `--layout` JSON,
 *  returning the rendered SVG text — for exercising layout.json robustness
 *  (stale/reordered/parallel-edge anchor pins) directly at the CLI level, no
 *  browser needed. */
function renderWithLayout(dsl: string, layout: Record<string, unknown>, dir: string): string {
  const dslPath = join(dir, "input.mmd");
  const layoutPath = join(dir, "layout.json");
  writeFileSync(dslPath, dsl, "utf8");
  writeFileSync(layoutPath, JSON.stringify(layout), "utf8");
  return execFileSync("node", [
    join(repoRoot, "dist", "cli", "index.js"),
    "render",
    dslPath,
    "-f",
    "svg",
    "--theme",
    "light",
    "--layout",
    layoutPath,
  ]).toString("utf8");
}

// A "Warehouse" subgraph with 3 members (stock/pick/qc) reproducing the exact
// UAT round-1 defect scenario: dragging a member out used to leave the dashed
// box stranded/empty. `stock` is declared first INSIDE the subgraph block (so
// it counts as a member per mermaid's first-seen-subgraph rule); `intake`/
// `ship` are declared outside, so they stay non-members.
const WAREHOUSE_DSL = `flowchart TD
  subgraph Warehouse
    stock[Stock check] --> pick[Pick and pack]
    stock --> qc[Quality check]
  end
  intake[Intake] --> stock
  pick --> ship[Ship]
  qc --> ship
`;

// A depth-2 nesting: Warehouse nests inside Distribution Center. shelve/pick2
// are members of BOTH (recursive resolution); stage is a Distribution-only
// member; intake2/ship2 are outside either container.
const NESTED_DSL = `flowchart TD
  subgraph Distribution[Distribution Center]
    subgraph Warehouse
      shelve[Shelve] --> pick2[Pick]
    end
    pick2 --> stage[Stage]
  end
  intake2[Intake] --> shelve
  stage --> ship2[Ship]
`;

// Matches the unit-level FR7 fixture exactly (test/interactive-subgraph-drag.test.ts)
// for maximum cross-check confidence: A has 3 outgoing edges (0: A->B, 1: A->C,
// 2: A->D), all auto-anchored on the same (bottom, TD) side by default.
const PIN_DSL = `flowchart TD
A-->B
A-->C
A-->D
`;

// A subgraph + all ten node shapes in one diagram — beyond what the unit-level
// dom-runtime-parity guard exercises byte-for-byte, this proves the *download*
// actually rasterizes/serializes correctly end-to-end in a real browser.
const SUBGRAPH_SHAPES_DSL = `flowchart LR
  subgraph Cluster One
    a[Rectangle] --> b(Rounded)
    b --> c[[Subroutine]]
    c --> d((Circle))
    d --> e{{Hexagon}}
    e --> f[/Parallelogram/]
    f --> g[\\Parallelogram alt\\]
  end
  g --> h([Stadium])
  h --> i{Diamond}
  i --> j[(Cylinder)]
`;

// A hub node with 4 incoming + 4 outgoing edges — the readability problem FR2
// exists to fix (v2 already spread edges sharing one border *side*; a hub
// with edges approaching from every direction is the case that used to clump).
const HUB_DSL = `flowchart TD
  n1[North West] --> hub((Hub))
  n2[North] --> hub
  n3[North East] --> hub
  n4[West] --> hub
  hub --> n5[East]
  hub --> n6[South West]
  hub --> n7[South]
  hub --> n8[South East]
`;

/**
 * For each edge path touching the hub node, find the endpoint (path start or
 * end) nearest the hub's center and return it. Both the edges SVG and the
 * node cards live inside the same untransformed `.vnm-world` coordinate
 * space, so raw style left/top/width/height and SVGPathElement point
 * coordinates are directly comparable (no pan/zoom/scale conversion needed).
 */
async function hubAnchorPoints(page: Page): Promise<Array<{ x: number; y: number }>> {
  return page.evaluate(() => {
    const hub = document.querySelector('.vnm-node[data-id="hub"]') as HTMLElement;
    const left = parseFloat(hub.style.left);
    const top = parseFloat(hub.style.top);
    const w = parseFloat(hub.style.width);
    const h = parseFloat(hub.style.height);
    const cx = left + w / 2;
    const cy = top + h / 2;
    const paths = Array.from(
      document.querySelectorAll("svg.vnm-edges path[marker-end], svg.vnm-edges path[marker-start]"),
    ) as SVGPathElement[];
    return paths.map((p) => {
      const len = p.getTotalLength();
      const start = p.getPointAtLength(0);
      const end = p.getPointAtLength(len);
      const dStart = Math.hypot(start.x - cx, start.y - cy);
      const dEnd = Math.hypot(end.x - cx, end.y - cy);
      const near = dStart < dEnd ? start : end;
      return { x: near.x, y: near.y };
    });
  });
}

test.describe("Save SVG / Save PNG — real browser rasterize (FR3)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(exportHtml("ci-pipeline.mmd", "light", "export-basic.html"));
    await page.waitForSelector(".vnm-node");
  });

  test("Save SVG downloads well-formed XML with a sensible filename, no console errors", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    const btn = page.locator(".vnm-export-btn", { hasText: "SVG" });
    const box = (await btn.boundingBox())!;
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      realClick(page, box.x + box.width / 2, box.y + box.height / 2),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.svg$/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const svg = readFileSync(path!, "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(XMLValidator.validate(svg)).toBe(true);
    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });

  test("Save PNG downloads a real, valid PNG — no SecurityError / canvas taint, no console errors", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    const btn = page.locator(".vnm-export-btn", { hasText: "PNG" });
    const box = (await btn.boundingBox())!;
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      realClick(page, box.x + box.width / 2, box.y + box.height / 2),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const bytes = readFileSync(path!);
    // PNG magic number, then IHDR width/height (big-endian, offsets 16 & 20).
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(0);
    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });
});

test.describe("Save SVG / Save PNG on a subgraph + every node shape", () => {
  let url: string;
  test.beforeAll(() => {
    url = exportHtmlFromDsl(SUBGRAPH_SHAPES_DSL, "fancy", "subgraph-shapes.html");
  });
  test.beforeEach(async ({ page }) => {
    await page.goto(url);
    await page.waitForSelector(".vnm-node");
  });

  test("Save SVG is valid XML and carries the subgraph + shape-specific markup", async ({ page }) => {
    const errors = trackErrors(page);
    const btn = page.locator(".vnm-export-btn", { hasText: "SVG" });
    const box = (await btn.boundingBox())!;
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      realClick(page, box.x + box.width / 2, box.y + box.height / 2),
    ]);
    const path = await download.path();
    const svg = readFileSync(path!, "utf8");
    expect(XMLValidator.validate(svg)).toBe(true);
    expect(svg).toContain("Cluster One"); // subgraph title
    expect(svg).toContain('stroke-dasharray="4 4"'); // subgraph dashed border
    expect(svg).toContain("<ellipse"); // circle shape
    expect(svg).toContain("<polygon"); // hexagon / parallelogram shapes
    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });

  test("Save PNG rasterizes the same diagram without error", async ({ page }) => {
    const errors = trackErrors(page);
    const btn = page.locator(".vnm-export-btn", { hasText: "PNG" });
    const box = (await btn.boundingBox())!;
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      realClick(page, box.x + box.width / 2, box.y + box.height / 2),
    ]);
    const path = await download.path();
    const bytes = readFileSync(path!);
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(0);
    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });
});

test.describe("resize (FR1) — real pointer events, live re-route, min clamp, persistence (FR4)", () => {
  test("dragging a corner handle resizes the card + connected edge live, clamps to the min size, and both size AND position survive a reload", async ({
    page,
  }) => {
    await page.goto(exportHtml("ci-pipeline.mmd", "light", "resize.html"));
    await page.waitForSelector(".vnm-node");

    const node = page.locator(".vnm-node").first();
    const nodeId = (await node.getAttribute("data-id"))!;
    const nb = (await node.boundingBox())!;

    // select via a real click (no movement)
    await realClick(page, nb.x + nb.width / 2, nb.y + nb.height / 2);

    const handles = page.locator(".vnm-resize-handle");
    await expect(handles).toHaveCount(4);
    const brHandle = page.locator('.vnm-resize-handle[data-sx="1"][data-sy="1"]');
    await expect(brHandle).toBeVisible();

    const edge = page.locator("svg.vnm-edges path[marker-end]").first();
    const dBefore = await edge.getAttribute("d");
    const before = await cardBox(page, nodeId);
    const scale = await getScale(page);

    // grow: drag the bottom-right handle out by a known screen delta
    const hb = (await brHandle.boundingBox())!;
    const screenDx = 60;
    const screenDy = 40;
    await realDrag(page, hb.x + hb.width / 2, hb.y + hb.height / 2, screenDx, screenDy);

    const grown = await cardBox(page, nodeId);
    expect(grown.w).toBeCloseTo(before.w + screenDx / scale, 0);
    expect(grown.h).toBeCloseTo(before.h + screenDy / scale, 0);
    // the opposite (top-left) corner is pinned — left/top must not move
    expect(grown.left).toBe(before.left);
    expect(grown.top).toBe(before.top);

    const dAfter = await edge.getAttribute("d");
    expect(dAfter).not.toBe(dBefore); // connected edge re-routed live

    // shrink drastically past the minimum — must clamp, not go negative/zero
    const hb2 = (await brHandle.boundingBox())!;
    await realDrag(page, hb2.x + hb2.width / 2, hb2.y + hb2.height / 2, -5000, -5000);
    const clamped = await cardBox(page, nodeId);
    expect(clamped.w).toBe(24);
    expect(clamped.h).toBe(24);

    // persistence: reload must keep both size AND position (localStorage)
    await page.waitForTimeout(700); // exportLayout is debounced 400ms
    const beforeReload = await cardBox(page, nodeId);
    await page.reload();
    await page.waitForSelector(".vnm-node");
    const afterReload = await cardBox(page, nodeId);
    expect(afterReload).toEqual(beforeReload);
  });

  // No unit test drives the actual pointer-handle grab math (rsx/rsy corner
  // pinning) — the vitest suite simulates a resize via handle.importLayout()
  // directly, bypassing onPointerDown/onPointerMove entirely. This is the only
  // coverage of the sign logic for a corner OTHER than bottom-right.
  test("dragging the top-left handle grows the node with the opposite (bottom-right) corner pinned", async ({
    page,
  }) => {
    await page.goto(exportHtml("ci-pipeline.mmd", "light", "resize-tl.html"));
    await page.waitForSelector(".vnm-node");

    const node = page.locator(".vnm-node").nth(1);
    const nodeId = (await node.getAttribute("data-id"))!;
    const nb = (await node.boundingBox())!;
    await realClick(page, nb.x + nb.width / 2, nb.y + nb.height / 2);

    const tlHandle = page.locator('.vnm-resize-handle[data-sx="-1"][data-sy="-1"]');
    await expect(tlHandle).toBeVisible();
    const before = await cardBox(page, nodeId);
    const scale = await getScale(page);

    // dragging the TOP-LEFT handle up-and-left (negative dx/dy) grows the node
    const ht = (await tlHandle.boundingBox())!;
    const screenDx = -50;
    const screenDy = -30;
    await realDrag(page, ht.x + ht.width / 2, ht.y + ht.height / 2, screenDx, screenDy);

    const grown = await cardBox(page, nodeId);
    expect(grown.w).toBeCloseTo(before.w - screenDx / scale, 0);
    expect(grown.h).toBeCloseTo(before.h - screenDy / scale, 0);
    // the opposite (bottom-right) corner is pinned: right/bottom edges constant
    const beforeLeft = parseFloat(before.left);
    const beforeTop = parseFloat(before.top);
    const grownLeft = parseFloat(grown.left);
    const grownTop = parseFloat(grown.top);
    expect(grownLeft + grown.w).toBeCloseTo(beforeLeft + before.w, 0);
    expect(grownTop + grown.h).toBeCloseTo(beforeTop + before.h, 0);
  });
});

test.describe("resize (FR1) also applies to class + state node-graph renderers", () => {
  test("resizing a class node re-routes its relation edges", async ({ page }) => {
    await page.goto(exportHtml("shop-class.mmd", "light", "resize-class.html"));
    await page.waitForSelector(".vnm-node");

    // "Dog" is central (5 relations touch it).
    const node = page.locator(".vnm-node", { hasText: "Dog" }).first();
    const nodeId = (await node.getAttribute("data-id"))!;
    const nb = (await node.boundingBox())!;
    await realClick(page, nb.x + nb.width / 2, nb.y + nb.height / 2);

    const edges = page.locator("svg.vnm-edges path[marker-end], svg.vnm-edges path[marker-start]");
    const before = await edges.evaluateAll((ps) => ps.map((p) => p.getAttribute("d")));
    const beforeBox = await cardBox(page, nodeId);

    const brHandle = page.locator('.vnm-resize-handle[data-sx="1"][data-sy="1"]');
    await expect(brHandle).toBeVisible();
    const hb = (await brHandle.boundingBox())!;
    await realDrag(page, hb.x + hb.width / 2, hb.y + hb.height / 2, 50, 30);

    const after = await edges.evaluateAll((ps) => ps.map((p) => p.getAttribute("d")));
    const afterBox = await cardBox(page, nodeId);
    expect(afterBox.w).toBeGreaterThan(beforeBox.w);
    expect(afterBox.h).toBeGreaterThan(beforeBox.h);
    expect(after).not.toEqual(before);
  });

  test("resizing a state re-routes its transition edges", async ({ page }) => {
    await page.goto(exportHtml("order-state.mmd", "dark", "resize-state.html"));
    await page.waitForSelector(".vnm-node");

    const node = page.locator(".vnm-node", { hasText: "Running" }).first();
    const nodeId = (await node.getAttribute("data-id"))!;
    const nb = (await node.boundingBox())!;
    await realClick(page, nb.x + nb.width / 2, nb.y + nb.height / 2);

    const edges = page.locator("svg.vnm-edges path[marker-end]");
    const before = await edges.evaluateAll((ps) => ps.map((p) => p.getAttribute("d")));
    const beforeBox = await cardBox(page, nodeId);

    const brHandle = page.locator('.vnm-resize-handle[data-sx="1"][data-sy="1"]');
    await expect(brHandle).toBeVisible();
    const hb = (await brHandle.boundingBox())!;
    await realDrag(page, hb.x + hb.width / 2, hb.y + hb.height / 2, 50, 30);

    const after = await edges.evaluateAll((ps) => ps.map((p) => p.getAttribute("d")));
    const afterBox = await cardBox(page, nodeId);
    expect(afterBox.w).toBeGreaterThan(beforeBox.w);
    expect(afterBox.h).toBeGreaterThan(beforeBox.h);
    expect(after).not.toEqual(before);
  });
});

test.describe("perimeter-distributed connectors (FR2) — hub node", () => {
  let url: string;
  test.beforeAll(() => {
    url = exportHtmlFromDsl(HUB_DSL, "light", "hub.html");
  });

  test("a hub with 8 edges fans its anchors around the perimeter (not clustered at one point), and stays distributed after a resize", async ({
    page,
  }) => {
    await page.goto(url);
    await page.waitForSelector(".vnm-node");

    const before = await hubAnchorPoints(page);
    expect(before.length).toBe(8);
    // no two edges should share (almost) the exact same anchor point
    for (let i = 0; i < before.length; i++) {
      for (let j = i + 1; j < before.length; j++) {
        const d = Math.hypot(before[i]!.x - before[j]!.x, before[i]!.y - before[j]!.y);
        expect(d).toBeGreaterThan(1.5);
      }
    }
    // spread meaningfully along both axes of the perimeter, not pinched to
    // one tiny segment (the old "cluster on one side" failure mode).
    const xs = before.map((p) => p.x);
    const ys = before.map((p) => p.y);
    const hub = await cardBox(page, "hub");
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(hub.w * 0.3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(hub.h * 0.3);

    // resize the hub — anchors must recompute live and stay distributed
    const nb = (await page.locator('.vnm-node[data-id="hub"]').boundingBox())!;
    await realClick(page, nb.x + nb.width / 2, nb.y + nb.height / 2);
    const brHandle = page.locator('.vnm-resize-handle[data-sx="1"][data-sy="1"]');
    const hb = (await brHandle.boundingBox())!;
    await realDrag(page, hb.x + hb.width / 2, hb.y + hb.height / 2, 80, 60);

    const after = await hubAnchorPoints(page);
    expect(after.length).toBe(8);
    for (let i = 0; i < after.length; i++) {
      for (let j = i + 1; j < after.length; j++) {
        const d = Math.hypot(after[i]!.x - after[j]!.x, after[i]!.y - after[j]!.y);
        expect(d).toBeGreaterThan(1.5);
      }
    }
  });
});

test.describe("reset layout (D2 / D5=A) — discard manual moves & resizes", () => {
  test("drag + resize a node, click Reset layout, the computed layout is restored and survives a reload", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto(exportHtml("ci-pipeline.mmd", "light", "reset-layout.html"));
    await page.waitForSelector(".vnm-node");

    // capture the pristine computed layout for the node we're about to mangle
    const node = page.locator(".vnm-node").first();
    const nodeId = (await node.getAttribute("data-id"))!;
    const computed = await cardBox(page, nodeId);
    const edge = page.locator("svg.vnm-edges path[marker-end]").first();
    const dComputed = await edge.getAttribute("d");

    // --- edit: drag the node, then select it and grow it via a corner handle ---
    const nb = (await node.boundingBox())!;
    await realDrag(page, nb.x + nb.width / 2, nb.y + nb.height / 2, 90, 60);
    const mb = (await node.boundingBox())!;
    await realClick(page, mb.x + mb.width / 2, mb.y + mb.height / 2);
    const brHandle = page.locator('.vnm-resize-handle[data-sx="1"][data-sy="1"]');
    await expect(brHandle).toBeVisible();
    const hb = (await brHandle.boundingBox())!;
    await realDrag(page, hb.x + hb.width / 2, hb.y + hb.height / 2, 50, 30);

    const edited = await cardBox(page, nodeId);
    expect(edited.w).toBeGreaterThan(computed.w); // resized
    expect(edited.left).not.toBe(computed.left); // moved
    expect(await edge.getAttribute("d")).not.toBe(dComputed); // edge re-routed live

    // let the debounced persist actually write the edited layout to localStorage
    await page.waitForTimeout(700);

    // --- reset: the toolbar button restores the computed layout ---
    const resetBtn = page.locator('.vnm-toolbar button[title="Reset layout"]');
    const rb = (await resetBtn.boundingBox())!;
    await realClick(page, rb.x + rb.width / 2, rb.y + rb.height / 2);

    const afterReset = await cardBox(page, nodeId);
    expect(afterReset).toEqual(computed); // position AND size back to computed
    expect(await edge.getAttribute("d")).toBe(dComputed); // edge back on the computed route

    // --- reload: persistence was cleared, so the reset sticks ---
    await page.reload();
    await page.waitForSelector(".vnm-node");
    const afterReload = await cardBox(page, nodeId);
    expect(afterReload).toEqual(computed);

    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });

  // The developer's happy-path test (above) already covers restore + reload-
  // sticks. Round 02 gap-fill: (1) Reset must NOT touch pan/zoom — only the
  // dagre-computed arrangement; (2) the persist pipeline must still work for a
  // NEW edit made after a reset (i.e. resetLayout()'s cleared timer/localStorage
  // doesn't leave persistence permanently disabled).
  test("Reset layout does not touch pan/zoom, and a new edit made after reset persists again", async ({
    page,
  }) => {
    await page.goto(exportHtml("ci-pipeline.mmd", "light", "reset-layout-2.html"));
    await page.waitForSelector(".vnm-node");

    // pan + zoom away from the initial fit-to-view transform
    await page.locator(".vnm-viewport").hover({ position: { x: 200, y: 160 } });
    await page.mouse.wheel(0, -300);
    await realDrag(page, 200, 160, 70, 40);
    const transformBeforeEdit = await worldTransform(page);

    // edit: drag + resize a node
    const node = page.locator(".vnm-node").first();
    const nodeId = (await node.getAttribute("data-id"))!;
    const nb = (await node.boundingBox())!;
    await realDrag(page, nb.x + nb.width / 2, nb.y + nb.height / 2, 80, 50);
    const mb = (await node.boundingBox())!;
    await realClick(page, mb.x + mb.width / 2, mb.y + mb.height / 2);
    const brHandle = page.locator('.vnm-resize-handle[data-sx="1"][data-sy="1"]');
    const hb = (await brHandle.boundingBox())!;
    await realDrag(page, hb.x + hb.width / 2, hb.y + hb.height / 2, 40, 25);
    await page.waitForTimeout(700); // let the debounced persist write

    // click Reset layout
    const resetBtn = page.locator('.vnm-toolbar button[title="Reset layout"]');
    const rb = (await resetBtn.boundingBox())!;
    await realClick(page, rb.x + rb.width / 2, rb.y + rb.height / 2);

    // pan/zoom untouched by the reset
    const transformAfterReset = await worldTransform(page);
    expect(transformAfterReset).toBe(transformBeforeEdit);

    // make a NEW edit after the reset, then reload — the new edit (not the
    // reset state) must be what survives, proving persistence still works
    const nb2 = (await node.boundingBox())!;
    await realDrag(page, nb2.x + nb2.width / 2, nb2.y + nb2.height / 2, 55, 35);
    const afterNewEdit = await cardBox(page, nodeId);
    await page.waitForTimeout(700);
    await page.reload();
    await page.waitForSelector(".vnm-node");
    const afterReload = await cardBox(page, nodeId);
    expect(afterReload).toEqual(afterNewEdit);
  });
});

test.describe("reset layout — sequence diagrams (no resize/reset control; must not error)", () => {
  test("a sequence diagram's toolbar has no reset-layout control, and panning/zooming it produces no console errors or network requests", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto(exportHtml("order-sequence.mmd", "dark", "sequence-reset.html"));
    await page.waitForSelector(".vnm-world svg");

    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    // no reset-layout affordance for sequence — the runtime never had positions
    // to reset in the first place (rigid lifeline layout, out of scope for FR1)
    await expect(page.locator('.vnm-toolbar button[title="Reset layout"]')).toHaveCount(0);
    await expect(page.locator(".vnm-toolbar button")).toHaveCount(3); // fit + zoom-in + zoom-out only
    await expect(page.locator(".vnm-resize-handle")).toHaveCount(0);
    // FR6/FR7 (v0.4.0) also have zero surface on sequence — no group-drag
    // containers, no edge-pin handles (seq-runtime.ts has neither code path).
    await expect(page.locator(".vnm-subgraph")).toHaveCount(0);
    await expect(page.locator(".vnm-edge-handle")).toHaveCount(0);

    // interact normally — pan + zoom + fit — nothing should throw
    await page.locator(".vnm-viewport").hover({ position: { x: 200, y: 160 } });
    await page.mouse.wheel(0, -240);
    await realDrag(page, 160, 160, 120, 80);
    const fit = page.locator(".vnm-toolbar button", { hasText: "⤢" });
    const fb = (await fit.boundingBox())!;
    await realClick(page, fb.x + fb.width / 2, fb.y + fb.height / 2);

    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
  });
});

test.describe("zero-network at runtime (NFR)", () => {
  test("dragging, resizing, zooming/panning, and Save SVG / Save PNG make no network requests", async ({
    page,
  }) => {
    await page.goto(exportHtml("ci-pipeline.mmd", "light", "network.html"));
    await page.waitForSelector(".vnm-node");

    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    // drag a node
    const node = page.locator(".vnm-node").first();
    const nb = (await node.boundingBox())!;
    await realDrag(page, nb.x + nb.width / 2, nb.y + nb.height / 2, 90, 60);

    // select + resize
    await realClick(page, nb.x + nb.width / 2 + 90, nb.y + nb.height / 2 + 60);
    const brHandle = page.locator('.vnm-resize-handle[data-sx="1"][data-sy="1"]');
    const hb = (await brHandle.boundingBox())!;
    await realDrag(page, hb.x + hb.width / 2, hb.y + hb.height / 2, 30, 20);

    // wheel zoom + background pan
    await page.locator(".vnm-viewport").hover({ position: { x: 200, y: 160 } });
    await page.mouse.wheel(0, -240);
    await realDrag(page, 250, 250, -60, 30);

    // Save SVG
    const svgBtn = page.locator(".vnm-export-btn", { hasText: "SVG" });
    const svgBox = (await svgBtn.boundingBox())!;
    const [svgDownload] = await Promise.all([
      page.waitForEvent("download"),
      realClick(page, svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2),
    ]);
    expect(await svgDownload.path()).toBeTruthy();

    // Save PNG
    const pngBtn = page.locator(".vnm-export-btn", { hasText: "PNG" });
    const pngBox = (await pngBtn.boundingBox())!;
    const [pngDownload] = await Promise.all([
      page.waitForEvent("download"),
      realClick(page, pngBox.x + pngBox.width / 2, pngBox.y + pngBox.height / 2),
    ]);
    expect(await pngDownload.path()).toBeTruthy();

    await page.waitForTimeout(50);
    expect(requests).toEqual([]);
  });
});

test.describe("combo: drag + resize + export all work together", () => {
  test("a full edit-then-export session produces no console errors and both downloads succeed", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto(exportHtml("microservices.mmd", "dark", "combo.html"));
    await page.waitForSelector(".vnm-node");

    // drag one node
    const first = page.locator(".vnm-node").first();
    const fb = (await first.boundingBox())!;
    await realDrag(page, fb.x + fb.width / 2, fb.y + fb.height / 2, 70, -40);

    // select + resize a different node
    const second = page.locator(".vnm-node").nth(2);
    const sb = (await second.boundingBox())!;
    await realClick(page, sb.x + sb.width / 2, sb.y + sb.height / 2);
    const brHandle = page.locator('.vnm-resize-handle[data-sx="1"][data-sy="1"]');
    const hb = (await brHandle.boundingBox())!;
    await realDrag(page, hb.x + hb.width / 2, hb.y + hb.height / 2, 40, 25);

    // Save SVG then Save PNG of the edited diagram
    const svgBtn = page.locator(".vnm-export-btn", { hasText: "SVG" });
    const svgBox = (await svgBtn.boundingBox())!;
    const [svgDownload] = await Promise.all([
      page.waitForEvent("download"),
      realClick(page, svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2),
    ]);
    const svg = readFileSync((await svgDownload.path())!, "utf8");
    expect(XMLValidator.validate(svg)).toBe(true);

    const pngBtn = page.locator(".vnm-export-btn", { hasText: "PNG" });
    const pngBox = (await pngBtn.boundingBox())!;
    const [pngDownload] = await Promise.all([
      page.waitForEvent("download"),
      realClick(page, pngBox.x + pngBox.width / 2, pngBox.y + pngBox.height / 2),
    ]);
    const bytes = readFileSync((await pngDownload.path())!);
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });
});

test.describe("FR6 (D6=C) — subgraph auto-contain + draggable group, real pointer events", () => {
  test("grabbing the container's title band moves every member together, edges re-route, the box follows, and it persists across reload", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto(exportHtmlFromDsl(WAREHOUSE_DSL, "light", "warehouse-group-drag.html"));
    await page.waitForSelector(".vnm-node");

    const members = ["stock", "pick", "qc"];
    const before: Record<string, { left: number; top: number }> = {};
    for (const id of members) {
      const b = await cardBox(page, id);
      before[id] = { left: parseFloat(b.left), top: parseFloat(b.top) };
    }
    const intakeBefore = await cardBox(page, "intake");
    const shipBefore = await cardBox(page, "ship");
    const boxBefore = await subgraphBoxByTitle(page, "Warehouse");
    const edge = page.locator("svg.vnm-edges path[marker-end]").first();
    const dBefore = await edge.getAttribute("d");

    const scale = await getScale(page);
    const titleEl = page.locator(".vnm-subgraph-title", { hasText: "Warehouse" });
    const tb = (await titleEl.boundingBox())!;
    const screenDx = 70;
    const screenDy = 45;
    await realDrag(page, tb.x + tb.width / 2, tb.y + tb.height / 2, screenDx, screenDy);

    const worldDx = screenDx / scale;
    const worldDy = screenDy / scale;
    for (const id of members) {
      const b = await cardBox(page, id);
      expect(parseFloat(b.left)).toBeCloseTo(before[id]!.left + worldDx, 0);
      expect(parseFloat(b.top)).toBeCloseTo(before[id]!.top + worldDy, 0);
    }
    // non-members must NOT move — this is a group-drag, not a pan
    const intakeAfter = await cardBox(page, "intake");
    const shipAfter = await cardBox(page, "ship");
    expect(intakeAfter).toEqual(intakeBefore);
    expect(shipAfter).toEqual(shipBefore);

    // the box follows rigidly: same size, shifted by the same delta
    const boxAfter = await subgraphBoxByTitle(page, "Warehouse");
    expect(boxAfter.w).toBe(boxBefore.w);
    expect(boxAfter.h).toBe(boxBefore.h);
    expect(boxAfter.x).toBeCloseTo(boxBefore.x + worldDx, 0);
    expect(boxAfter.y).toBeCloseTo(boxBefore.y + worldDy, 0);

    // edges touching a moved member re-routed live
    expect(await edge.getAttribute("d")).not.toBe(dBefore);

    // persistence: reload keeps every member's new position + the re-hugged box
    await page.waitForTimeout(700);
    const reloadExpect: Record<string, { left: string; top: string }> = {};
    for (const id of members) reloadExpect[id] = await cardBox(page, id);
    await page.reload();
    await page.waitForSelector(".vnm-node");
    for (const id of members) {
      const b = await cardBox(page, id);
      expect(b).toEqual(reloadExpect[id]);
    }
    const boxReloaded = await subgraphBoxByTitle(page, "Warehouse");
    expect(boxReloaded).toEqual(boxAfter);

    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });

  test("grabbing the OPEN interior pans the canvas instead of dragging the cluster", async ({ page }) => {
    await page.goto(exportHtmlFromDsl(WAREHOUSE_DSL, "light", "warehouse-interior-pan.html"));
    await page.waitForSelector(".vnm-node");

    // a point in the large open gap between `stock` (top) and `pick`/`qc` (below)
    // — well inside the box, far from any border, and not over any card.
    const stockBox = (await page.locator('.vnm-node[data-id="stock"]').boundingBox())!;
    const pickBox = (await page.locator('.vnm-node[data-id="pick"]').boundingBox())!;
    const interiorX = stockBox.x + stockBox.width / 2;
    const interiorY = stockBox.y + stockBox.height + (pickBox.y - (stockBox.y + stockBox.height)) / 2;

    const stockWorldBefore = await cardBox(page, "stock");
    const transformBefore = await worldTransform(page);
    await realDrag(page, interiorX, interiorY, 90, 60);
    const transformAfter = await worldTransform(page);
    const stockWorldAfter = await cardBox(page, "stock");

    expect(transformAfter).not.toBe(transformBefore); // the viewport panned
    expect(stockWorldAfter).toEqual(stockWorldBefore); // nothing moved
  });

  test("grabbing a member CARD moves just that card, and the box re-hugs to keep containing it — even dragged far outside its original bounds (the UAT screenshot defect)", async ({
    page,
  }) => {
    await page.goto(exportHtmlFromDsl(WAREHOUSE_DSL, "light", "warehouse-member-drag.html"));
    await page.waitForSelector(".vnm-node");

    const stockBefore = await cardBox(page, "stock");
    const qcBefore = await cardBox(page, "qc");
    const boxBefore = await subgraphBoxByTitle(page, "Warehouse");

    // drag "pick" FAR to the right and down — well outside the box's current bounds
    const pickHandle = page.locator('.vnm-node[data-id="pick"]');
    const pb = (await pickHandle.boundingBox())!;
    await realDrag(page, pb.x + pb.width / 2, pb.y + pb.height / 2, 420, 260);

    // only "pick" moved — a card grab is a solo drag, not a group-drag
    expect(await cardBox(page, "stock")).toEqual(stockBefore);
    expect(await cardBox(page, "qc")).toEqual(qcBefore);

    const pickAfter = await cardBox(page, "pick");
    const boxAfter = await subgraphBoxByTitle(page, "Warehouse");

    // the box genuinely grew (re-hugged), not just stayed static by coincidence
    expect(boxAfter.w * boxAfter.h).toBeGreaterThan(boxBefore.w * boxBefore.h * 1.3);
    // and it fully encloses "pick" at its new, far-away position — never stranded
    const pickLeft = parseFloat(pickAfter.left);
    const pickTop = parseFloat(pickAfter.top);
    expect(boxAfter.x).toBeLessThanOrEqual(pickLeft + 0.5);
    expect(boxAfter.y).toBeLessThanOrEqual(pickTop + 0.5);
    expect(boxAfter.x + boxAfter.w).toBeGreaterThanOrEqual(pickLeft + pickAfter.w - 0.5);
    expect(boxAfter.y + boxAfter.h).toBeGreaterThanOrEqual(pickTop + pickAfter.h - 0.5);
  });
});

// TEST-002 (FIXED): a plain click now SELECTS a node AND reveals its edge
// handles synchronously — selectNode()/deselect() call positionEdgeHandles()
// alongside positionHandles()/hideHandles(), so visibility tracks selection
// immediately instead of waiting for an incidental renderEdges() from some
// OTHER action (a drag, resize, reset, or importLayout). The two regression
// tests below assert exactly that (they used to be test.fail() repros for the
// defect this closes — reopened REV-006's residual). The mechanics tests below
// select-then-nudge only to also MOVE the node (the nudge no longer affects
// handle visibility): the nudge still shifts A a few px, which is why the FR7
// pin test captures its pristine route BEFORE calling this helper.
async function selectAndRevealHandles(page: Page, id: string): Promise<void> {
  const card = page.locator(`.vnm-node[data-id="${id}"]`);
  const b1 = (await card.boundingBox())!;
  await realClick(page, b1.x + b1.width / 2, b1.y + b1.height / 2); // select — handles now visible immediately
  const b2 = (await card.boundingBox())!;
  await realDrag(page, b2.x + b2.width / 2, b2.y + b2.height / 2, 12, 9); // nudge to also move the node
}

test.describe("TEST-002 — edge-handle visibility tracks selection (regression, reopened REV-006)", () => {
  test("a plain click selects the node AND reveals its edge handles immediately", async ({ page }) => {
    await page.goto(exportHtmlFromDsl(PIN_DSL, "light", "select-reveals-handles.html"));
    await page.waitForSelector(".vnm-node");

    const cardA = page.locator('.vnm-node[data-id="A"]');
    const ab = (await cardA.boundingBox())!;
    await realClick(page, ab.x + ab.width / 2, ab.y + ab.height / 2);
    await expect(cardA).toHaveCSS("outline", /.*/); // sanity: it IS selected

    // selectNode() now calls positionEdgeHandles() — the handle is visible with
    // no intervening drag/resize/import (was TEST-002).
    await expect(page.locator('.vnm-edge-handle[data-ei="0"][data-end="source"]')).toBeVisible({ timeout: 500 });
  });

  test("deselecting (clicking away) hides an already-shown handle immediately — no stale floating dot", async ({
    page,
  }) => {
    await page.goto(exportHtmlFromDsl(PIN_DSL, "light", "deselect-hides-handles.html"));
    await page.waitForSelector(".vnm-node");
    await selectAndRevealHandles(page, "A");
    const src0 = page.locator('.vnm-edge-handle[data-ei="0"][data-end="source"]');
    await expect(src0).toBeVisible(); // shown immediately on select (the nudge only moves A)

    // click empty canvas — deselects A (a background pan)
    await realClick(page, 40, 40);

    // deselect() now calls positionEdgeHandles() — the handle disappears at once
    // instead of lingering as a floating dot (was TEST-002).
    await expect(src0).toBeHidden({ timeout: 500 });
  });
});

test.describe("FR7 (D7=A) — edge endpoint pin mechanics via real .vnm-edge-handle pointer events", () => {
  test("dragging edge 0's source to another border pins {side,offset}; siblings + the other end stay auto; reload keeps it; Reset clears it", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto(exportHtmlFromDsl(PIN_DSL, "light", "pin-basic.html"));
    await page.waitForSelector(".vnm-node");

    // before selecting anything, no handle is visible
    await expect(page.locator(".vnm-edge-handle:visible")).toHaveCount(0);

    // capture the PRISTINE (un-selected, un-nudged) computed route first — this
    // is what Reset must return to at the end, so it must predate the
    // selectAndRevealHandles() call below, which deliberately nudges A a few px
    // (to reach the pin-drag math with A off its pristine spot) and would
    // otherwise poison the "back to computed" comparison.
    const edge0 = page.locator("svg.vnm-edges path[marker-end]").nth(0);
    const dPristine = await edge0.getAttribute("d");

    // select A (handles appear immediately — TEST-002 fixed) then nudge it a few
    // px purely to MOVE it off its pristine spot, so the pin-target math below
    // is exercised against a position distinct from the one dPristine captured.
    await selectAndRevealHandles(page, "A");

    // A's 3 outgoing edges' SOURCE handles show; their TARGET handles (on the
    // unselected B/C/D) stay hidden — both positionEdgeHandles branches proven.
    const src0 = page.locator('.vnm-edge-handle[data-ei="0"][data-end="source"]');
    const tgt0 = page.locator('.vnm-edge-handle[data-ei="0"][data-end="target"]');
    await expect(src0).toBeVisible();
    await expect(tgt0).toBeHidden();
    await expect(page.locator('.vnm-edge-handle[data-ei="1"][data-end="source"]')).toBeVisible();
    await expect(page.locator('.vnm-edge-handle[data-ei="2"][data-end="source"]')).toBeVisible();

    const dBefore = await edge0.getAttribute("d"); // post-nudge route (only used for the "pin changed it" check)
    const aWorldBefore = await cardBox(page, "A");

    // drag edge 0's source handle to A's RIGHT border
    const hb = (await src0.boundingBox())!;
    const target = await worldToScreen(
      page,
      parseFloat(aWorldBefore.left) + aWorldBefore.w + 2,
      parseFloat(aWorldBefore.top) + aWorldBefore.h / 2,
    );
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();

    // the live path genuinely starts on A's right border now (pin applied)
    const dAfter = await edge0.getAttribute("d");
    expect(dAfter).not.toBe(dBefore);
    const m = /^M ([-\d.]+) ([-\d.]+)/.exec(dAfter ?? "");
    expect(m).not.toBeNull();
    const [startX, startY] = [parseFloat(m![1]!), parseFloat(m![2]!)];
    expect(startX).toBeCloseTo(parseFloat(aWorldBefore.left) + aWorldBefore.w, 0); // right edge
    expect(startY).toBeCloseTo(parseFloat(aWorldBefore.top) + aWorldBefore.h / 2, 0); // vertical centre (offset ~0)

    await page.waitForTimeout(700); // persist debounce
    const persisted = await readPersistedLayout(page);
    const anchors = (persisted as { anchors?: Record<string, unknown> } | null)?.anchors;
    expect(anchors).toBeDefined();
    const pin0 = anchors!["0"] as { source?: { side: string; offset: number }; target?: unknown; from?: string; to?: string };
    expect(pin0.source?.side).toBe("right");
    expect(Math.abs(pin0.source?.offset ?? 999)).toBeLessThan(3);
    expect(pin0.target).toBeUndefined(); // the OTHER end still auto-distributes
    expect(pin0.from).toBe("A");
    expect(pin0.to).toBe("B");
    expect(anchors!["1"]).toBeUndefined(); // sibling A-->C untouched
    expect(anchors!["2"]).toBeUndefined(); // sibling A-->D untouched

    // reload: the pin (and the visual route) survives
    await page.reload();
    await page.waitForSelector(".vnm-node");
    const edge0Reloaded = page.locator("svg.vnm-edges path[marker-end]").nth(0);
    expect(await edge0Reloaded.getAttribute("d")).toBe(dAfter);

    // Reset layout clears every pin AND the nudge-drag — back to the pristine
    // dagre-computed route, not just the pre-pin (post-nudge) one.
    const resetBtn = page.locator('.vnm-toolbar button[title="Reset layout"]');
    const rb = (await resetBtn.boundingBox())!;
    await realClick(page, rb.x + rb.width / 2, rb.y + rb.height / 2);
    expect(await edge0Reloaded.getAttribute("d")).toBe(dPristine);
    const afterReset = await readPersistedLayout(page);
    expect(afterReset).toBeNull(); // resetLayout clears the whole persisted entry

    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });

  test("pinning BOTH ends across two independent drags keys each pin by edge index", async ({ page }) => {
    await page.goto(exportHtmlFromDsl(PIN_DSL, "light", "pin-both-ends.html"));
    await page.waitForSelector(".vnm-node");

    // select A, pin edge 0's source to the LEFT border
    await selectAndRevealHandles(page, "A");
    const src0 = page.locator('.vnm-edge-handle[data-ei="0"][data-end="source"]');
    const hb0 = (await src0.boundingBox())!;
    const aWorld = await cardBox(page, "A");
    const leftTarget = await worldToScreen(
      page,
      parseFloat(aWorld.left) - 2,
      parseFloat(aWorld.top) + aWorld.h / 2,
    );
    await page.mouse.move(hb0.x + hb0.width / 2, hb0.y + hb0.height / 2);
    await page.mouse.down();
    await page.mouse.move(leftTarget.x, leftTarget.y, { steps: 8 });
    await page.mouse.up();

    // now select B, pin edge 0's TARGET to B's top border (an independent drag)
    await selectAndRevealHandles(page, "B");
    const tgt0 = page.locator('.vnm-edge-handle[data-ei="0"][data-end="target"]');
    await expect(tgt0).toBeVisible();
    const hbT = (await tgt0.boundingBox())!;
    const bWorld = await cardBox(page, "B");
    const topTarget = await worldToScreen(page, parseFloat(bWorld.left) + bWorld.w / 2, parseFloat(bWorld.top) - 2);
    await page.mouse.move(hbT.x + hbT.width / 2, hbT.y + hbT.height / 2);
    await page.mouse.down();
    await page.mouse.move(topTarget.x, topTarget.y, { steps: 8 });
    await page.mouse.up();

    await page.waitForTimeout(700);
    const persisted = await readPersistedLayout(page);
    const anchors = (persisted as { anchors?: Record<string, unknown> } | null)?.anchors;
    const pin0 = anchors!["0"] as { source?: { side: string }; target?: { side: string } };
    expect(pin0.source?.side).toBe("left");
    expect(pin0.target?.side).toBe("top");
  });

  test("pin-then-resize: shrinking the pinned side re-clamps the anchor onto the new border — the edge never detaches", async ({
    page,
  }) => {
    await page.goto(exportHtmlFromDsl(PIN_DSL, "light", "pin-then-resize.html"));
    await page.waitForSelector(".vnm-node");

    await selectAndRevealHandles(page, "A");

    // pin edge 0's source to A's RIGHT border at a large positive offset (near
    // the bottom-right corner, NOT centre) so shrinking A's height will strand it
    const src0 = page.locator('.vnm-edge-handle[data-ei="0"][data-end="source"]');
    const hb = (await src0.boundingBox())!;
    const aWorld = await cardBox(page, "A");
    const bigOffset = aWorld.h / 2 - 3; // just inside the border today
    const pinTarget = await worldToScreen(
      page,
      parseFloat(aWorld.left) + aWorld.w + 2,
      parseFloat(aWorld.top) + aWorld.h / 2 + bigOffset,
    );
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(pinTarget.x, pinTarget.y, { steps: 8 });
    await page.mouse.up();

    const edge0 = page.locator("svg.vnm-edges path[marker-end]").nth(0);
    const dPinned = await edge0.getAttribute("d");
    const mPinned = /^M ([-\d.]+) ([-\d.]+)/.exec(dPinned ?? "")!;
    const yPinned = parseFloat(mPinned[2]!);
    // the pin is near the bottom of A's current height
    expect(yPinned).toBeGreaterThan(parseFloat(aWorld.top) + aWorld.h / 2);

    // now SHRINK A's height a lot via the bottom-right resize handle (selected
    // node's handles are already visible; grab the corner one)
    const brHandle = page.locator('.vnm-resize-handle[data-sx="1"][data-sy="1"]');
    const hb2 = (await brHandle.boundingBox())!;
    const scale = await getScale(page);
    // shrink height to well under the old pin offset
    await realDrag(page, hb2.x + hb2.width / 2, hb2.y + hb2.height / 2, 0, -(aWorld.h * 0.8) * scale);

    const aWorldShrunk = await cardBox(page, "A");
    expect(aWorldShrunk.h).toBeLessThan(aWorld.h * 0.6); // genuinely shrank

    const dReclamped = await edge0.getAttribute("d");
    const mReclamped = /^M ([-\d.]+) ([-\d.]+)/.exec(dReclamped ?? "")!;
    const xReclamped = parseFloat(mReclamped[1]!);
    const yReclamped = parseFloat(mReclamped[2]!);
    // still pinned to the RIGHT border (x unchanged: right edge only moves if
    // width changes, which this drag didn't touch)...
    expect(xReclamped).toBeCloseTo(parseFloat(aWorldShrunk.left) + aWorldShrunk.w, 0);
    // ...but Y re-clamped to stay ON the shrunk border — never past it (no detach)
    const shrunkTop = parseFloat(aWorldShrunk.top);
    const shrunkBottom = shrunkTop + aWorldShrunk.h;
    expect(yReclamped).toBeGreaterThanOrEqual(shrunkTop - 0.5);
    expect(yReclamped).toBeLessThanOrEqual(shrunkBottom + 0.5);
  });
});

test.describe("FR6 — nested subgraphs (depth > 1) re-hug, and export a valid file", () => {
  test("dragging a depth>1 member re-hugs BOTH the inner and outer containers", async ({ page }) => {
    await page.goto(exportHtmlFromDsl(NESTED_DSL, "light", "nested-drag.html"));
    await page.waitForSelector(".vnm-node");

    const outerBefore = await subgraphBoxByTitle(page, "Distribution Center");
    const innerBefore = await subgraphBoxByTitle(page, "Warehouse");
    // sanity: the outer container genuinely encloses the inner one
    expect(outerBefore.x).toBeLessThanOrEqual(innerBefore.x);
    expect(outerBefore.y).toBeLessThanOrEqual(innerBefore.y);
    expect(outerBefore.x + outerBefore.w).toBeGreaterThanOrEqual(innerBefore.x + innerBefore.w);
    expect(outerBefore.y + outerBefore.h).toBeGreaterThanOrEqual(innerBefore.y + innerBefore.h);

    // "shelve" is a depth>1 member: inside Warehouse, which is inside Distribution
    const shelve = page.locator('.vnm-node[data-id="shelve"]');
    const sb = (await shelve.boundingBox())!;
    await realDrag(page, sb.x + sb.width / 2, sb.y + sb.height / 2, 260, -180);

    const shelveAfter = await cardBox(page, "shelve");
    const outerAfter = await subgraphBoxByTitle(page, "Distribution Center");
    const innerAfter = await subgraphBoxByTitle(page, "Warehouse");

    // both boxes changed (genuinely re-hugged, not static)
    expect(innerAfter).not.toEqual(innerBefore);
    expect(outerAfter).not.toEqual(outerBefore);

    // both boxes still fully enclose "shelve" at its new position — neither is stranded
    for (const box of [innerAfter, outerAfter]) {
      const shelveLeft = parseFloat(shelveAfter.left);
      const shelveTop = parseFloat(shelveAfter.top);
      expect(box.x).toBeLessThanOrEqual(shelveLeft + 0.5);
      expect(box.y).toBeLessThanOrEqual(shelveTop + 0.5);
      expect(box.x + box.w).toBeGreaterThanOrEqual(shelveLeft + shelveAfter.w - 0.5);
      expect(box.y + box.h).toBeGreaterThanOrEqual(shelveTop + shelveAfter.h - 0.5);
    }
    // outer still encloses inner after the re-hug
    expect(outerAfter.x).toBeLessThanOrEqual(innerAfter.x + 0.5);
    expect(outerAfter.y).toBeLessThanOrEqual(innerAfter.y + 0.5);
    expect(outerAfter.x + outerAfter.w).toBeGreaterThanOrEqual(innerAfter.x + innerAfter.w - 0.5);
    expect(outerAfter.y + outerAfter.h).toBeGreaterThanOrEqual(innerAfter.y + innerAfter.h - 0.5);
  });

  test("Save SVG / Save PNG of a nested-subgraph diagram download valid files showing both hugged boxes", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto(exportHtmlFromDsl(NESTED_DSL, "fancy", "nested-export.html"));
    await page.waitForSelector(".vnm-node");

    // edit first, so the export reflects the re-hugged (not pristine) boxes
    const shelve = page.locator('.vnm-node[data-id="shelve"]');
    const sb = (await shelve.boundingBox())!;
    await realDrag(page, sb.x + sb.width / 2, sb.y + sb.height / 2, 150, -90);

    const svgBtn = page.locator(".vnm-export-btn", { hasText: "SVG" });
    const svgBox = (await svgBtn.boundingBox())!;
    const [svgDownload] = await Promise.all([
      page.waitForEvent("download"),
      realClick(page, svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2),
    ]);
    const svg = readFileSync((await svgDownload.path())!, "utf8");
    expect(XMLValidator.validate(svg)).toBe(true);
    expect(svg).toContain("Distribution Center");
    expect(svg).toContain("Warehouse");
    expect((svg.match(/stroke-dasharray="4 4"/g) ?? []).length).toBeGreaterThanOrEqual(2); // both boxes drawn

    const pngBtn = page.locator(".vnm-export-btn", { hasText: "PNG" });
    const pngBox = (await pngBtn.boundingBox())!;
    const [pngDownload] = await Promise.all([
      page.waitForEvent("download"),
      realClick(page, pngBox.x + pngBox.width / 2, pngBox.y + pngBox.height / 2),
    ]);
    const bytes = readFileSync((await pngDownload.path())!);
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(0);

    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });
});

test.describe("layout.json robustness at the CLI level (REV-007) — stale / reordered / parallel-edge pins", () => {
  test("a stale out-of-range anchor index is dropped gracefully — output identical to no --layout, exit 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "vnm-layout-"));
    const dsl = "flowchart TD\nA-->B\nA-->C\nA-->D\n";
    const baseline = execFileSync("node", [
      join(repoRoot, "dist", "cli", "index.js"),
      "render",
      "-",
      "-f",
      "svg",
      "--theme",
      "light",
    ], { input: dsl }).toString("utf8");
    const withStale = renderWithLayout(dsl, { positions: {}, anchors: { "99": { source: { side: "right", offset: 0 } } } }, dir);
    expect(withStale).toBe(baseline);
  });

  test("an anchor whose from/to no longer exists is dropped gracefully — no crash, no mis-pin", () => {
    const dir = mkdtempSync(join(tmpdir(), "vnm-layout-"));
    const dsl = "flowchart TD\nA-->B\nA-->C\nA-->D\n";
    const baseline = execFileSync("node", [
      join(repoRoot, "dist", "cli", "index.js"),
      "render",
      "-",
      "-f",
      "svg",
      "--theme",
      "light",
    ], { input: dsl }).toString("utf8");
    const withGhost = renderWithLayout(
      dsl,
      { positions: {}, anchors: { "5": { source: { side: "left", offset: 0 }, from: "X", to: "Y" } } },
      dir,
    );
    expect(withGhost).toBe(baseline);
  });

  test("a stale index carrying the CORRECT from/to re-maps to the actual (reordered) edge, not the wrong one", () => {
    const dir = mkdtempSync(join(tmpdir(), "vnm-layout-"));
    const dsl = "flowchart TD\nA-->B\nA-->C\nA-->D\n"; // edges: 0=A->B, 1=A->C, 2=A->D
    // keyed "0" (which is really A->B) but carries identity for A->D (edge 2) —
    // must land on A->D, never silently apply to A->B.
    const svg = renderWithLayout(
      dsl,
      { positions: {}, anchors: { "0": { source: { side: "right", offset: 0 }, from: "A", to: "D" } } },
      dir,
    );
    expect(XMLValidator.validate(svg)).toBe(true);
    const rectMatch = /<rect[^>]*x="([-\d.]+)"[^>]*y="([-\d.]+)"[^>]*width="56"[^>]*height="42"/.exec(svg);
    expect(rectMatch).not.toBeNull(); // A is the only 56x42 rect in this fixture
    const aX = parseFloat(rectMatch![1]!);
    const aY = parseFloat(rectMatch![2]!);
    const paths = Array.from(svg.matchAll(/<path d="M ([\d.]+) ([\d.]+)/g)).map((m) => ({
      x: parseFloat(m[1]!),
      y: parseFloat(m[2]!),
    }));
    // exactly one of the 3 edges now starts at A's right border / vertical centre...
    const aRight = aX + 56;
    const aCentreY = aY + 21;
    const onRight = paths.filter((p) => Math.abs(p.x - aRight) < 0.5 && Math.abs(p.y - aCentreY) < 0.5);
    expect(onRight.length).toBe(1);
    // ...and the other two remain on their original (bottom) auto-distribute side
    const onBottom = paths.filter((p) => Math.abs(p.y - (aY + 42)) < 0.5);
    expect(onBottom.length).toBe(2);
  });

  test("parallel edges (two A-->B): a pin keyed to the matching in-range index+identity lands on THAT edge, not its twin", () => {
    const dir = mkdtempSync(join(tmpdir(), "vnm-layout-"));
    const dsl = "flowchart LR\nA-->B\nA-->B\n";
    const svg = renderWithLayout(
      dsl,
      {
        positions: {},
        anchors: {
          "0": { source: { side: "left", offset: -10 }, from: "A", to: "B" },
          "1": { source: { side: "top", offset: 5 }, from: "A", to: "B" },
        },
      },
      dir,
    );
    expect(XMLValidator.validate(svg)).toBe(true);
    const paths = Array.from(svg.matchAll(/<path d="M ([\d.]+) ([\d.]+)/g)).map((m) => ({
      x: parseFloat(m[1]!),
      y: parseFloat(m[2]!),
    }));
    expect(paths.length).toBe(2);
    // distinct sides, no collision — one on the left (centre-10), one on the top (centre-10)
    const rectMatch = /<rect[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*width="56"[^>]*height="42"/.exec(svg);
    const aX = parseFloat(rectMatch![1]!);
    const aY = parseFloat(rectMatch![2]!);
    const centreY = aY + 21;
    const centreX = aX + 28;
    expect(paths.some((p) => Math.abs(p.x - aX) < 0.5 && Math.abs(p.y - (centreY - 10)) < 0.5)).toBe(true);
    expect(paths.some((p) => Math.abs(p.y - aY) < 0.5 && Math.abs(p.x - (centreX + 5)) < 0.5)).toBe(true);
  });

  test("parallel edges: two OUT-OF-RANGE identity-only pins re-map deterministically without colliding on one edge", () => {
    const dir = mkdtempSync(join(tmpdir(), "vnm-layout-"));
    const dsl = "flowchart LR\nA-->B\nA-->B\n";
    const svg = renderWithLayout(
      dsl,
      {
        positions: {},
        anchors: {
          "10": { source: { side: "left", offset: -15 }, from: "A", to: "B" },
          "11": { source: { side: "left", offset: 15 }, from: "A", to: "B" },
        },
      },
      dir,
    );
    expect(XMLValidator.validate(svg)).toBe(true);
    const paths = Array.from(svg.matchAll(/<path d="M ([\d.]+) ([\d.]+)/g)).map((m) => ({
      x: parseFloat(m[1]!),
      y: parseFloat(m[2]!),
    }));
    expect(paths.length).toBe(2);
    // both landed on the left side, at DISTINCT y offsets — no collision, both applied
    const ys = paths.map((p) => p.y).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeCloseTo(30, 0); // offset -15 vs +15 -> 30px apart
  });
});
