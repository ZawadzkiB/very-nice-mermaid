import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { customElementPageForFixture } from "./helpers.js";

/**
 * End-to-end browser coverage of the interactive renderer beyond the exported
 * HTML basics: the toolbar zoom buttons, the public renderer handle
 * (`element.diagram` → export/import layout, getPositions), theme-driven edge
 * geometry, subgraph rendering, and a console-error-free interaction session.
 *
 * Driven through the self-registering <very-nice-mermaid> element (its `diagram`
 * getter exposes the live RuntimeHandle). Requires `npx playwright install chromium`.
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

test.describe("interactive renderer — toolbar & viewport", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(customElementPageForFixture("ci-pipeline.mmd", "light", "el-interactions.html"));
    await page.waitForSelector("very-nice-mermaid .vnm-node");
  });

  test("zoom-in and zoom-out toolbar buttons change the scale (real clicks)", async ({ page }) => {
    const scaleOf = async () => {
      const t = await worldTransform(page);
      const m = /scale\(([-\d.]+)\)/.exec(t);
      return m ? parseFloat(m[1]!) : NaN;
    };
    const clickBtn = async (label: string) => {
      const btn = page.locator(".vnm-toolbar button", { hasText: label });
      const box = (await btn.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(30);
    };

    const base = await scaleOf();
    await clickBtn("+");
    const zoomedIn = await scaleOf();
    expect(zoomedIn).toBeGreaterThan(base);

    await clickBtn("−");
    const zoomedOut = await scaleOf();
    expect(zoomedOut).toBeLessThan(zoomedIn);
  });

  test("a full interaction session produces no console errors", async ({ page }) => {
    const errors = trackErrors(page);

    // drag a node
    const node = page.locator(".vnm-node").first();
    const nb = (await node.boundingBox())!;
    await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await page.mouse.down();
    await page.mouse.move(nb.x + 120, nb.y + 80, { steps: 6 });
    await page.mouse.up();

    // wheel zoom
    await page.locator(".vnm-viewport").hover({ position: { x: 200, y: 160 } });
    await page.mouse.wheel(0, -240);
    await page.mouse.wheel(0, 180);

    // toolbar fit
    const fit = page.locator(".vnm-toolbar button", { hasText: "⤢" });
    const fb = (await fit.boundingBox())!;
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await page.mouse.down();
    await page.mouse.up();

    await page.waitForTimeout(50);
    expect(errors).toEqual([]);
  });
});

test.describe("interactive renderer — public handle API", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(customElementPageForFixture("ci-pipeline.mmd", "light", "el-handle.html"));
    await page.waitForSelector("very-nice-mermaid .vnm-node");
  });

  test("exportLayout returns a position for every node", async ({ page }) => {
    const { nodeCount, posCount, hasXY } = await page.evaluate(() => {
      const el = document.getElementById("d") as any;
      const layout = el.diagram.exportLayout();
      const ids = Object.keys(layout.positions);
      const hasXY = ids.every(
        (id) =>
          typeof layout.positions[id].x === "number" && typeof layout.positions[id].y === "number",
      );
      return {
        nodeCount: el.querySelectorAll(".vnm-node").length,
        posCount: ids.length,
        hasXY,
      };
    });
    expect(posCount).toBe(nodeCount);
    expect(hasXY).toBe(true);
  });

  test("importLayout relocates a node and getPositions reflects it", async ({ page }) => {
    const moved = await page.evaluate(() => {
      const el = document.getElementById("d") as any;
      const before = el.diagram.exportLayout();
      const firstId = Object.keys(before.positions)[0] as string;
      const target = { x: 999, y: 777 };
      el.diagram.importLayout({
        version: 1,
        positions: { ...before.positions, [firstId]: target },
      });
      const after = el.diagram.getPositions();
      return { firstId, after: after[firstId] as { x: number; y: number }, target };
    });
    expect(Math.round(moved.after.x)).toBe(moved.target.x);
    expect(Math.round(moved.after.y)).toBe(moved.target.y);
  });

  test("export → import round-trips the layout exactly", async ({ page }) => {
    const equal = await page.evaluate(() => {
      const el = document.getElementById("d") as any;
      const snapshot = el.diagram.exportLayout();
      el.diagram.importLayout(snapshot);
      const again = el.diagram.getPositions();
      return Object.keys(snapshot.positions).every((id) => {
        const a = snapshot.positions[id];
        const b = again[id];
        return Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
      });
    });
    expect(equal).toBe(true);
  });
});

test.describe("interactive renderer — themes & structure", () => {
  test("the fancy theme routes curved edges; light routes orthogonal elbows", async ({ page }) => {
    await page.goto(customElementPageForFixture("state-machine.mmd", "fancy", "el-fancy.html"));
    await page.waitForSelector("very-nice-mermaid .vnm-node");
    const fancyDs = await page
      .locator("svg.vnm-edges path[marker-end]")
      .evaluateAll((paths) => paths.map((p) => p.getAttribute("d") ?? ""));
    // curved routing emits cubic/quadratic bezier commands
    expect(fancyDs.some((d) => /[CQ]/.test(d))).toBe(true);

    await page.goto(customElementPageForFixture("state-machine.mmd", "light", "el-elbow.html"));
    await page.waitForSelector("very-nice-mermaid .vnm-node");
    const elbowDs = await page
      .locator("svg.vnm-edges path[marker-end]")
      .evaluateAll((paths) => paths.map((p) => p.getAttribute("d") ?? ""));
    // orthogonal elbows are line segments, never beziers
    expect(elbowDs.every((d) => !/[CQ]/.test(d))).toBe(true);
    expect(elbowDs.some((d) => /L/.test(d))).toBe(true);
  });

  test("subgraph containers render for a nested-subgraph diagram", async ({ page }) => {
    await page.goto(customElementPageForFixture("nested-subgraphs.mmd", "light", "el-subgraph.html"));
    await page.waitForSelector("very-nice-mermaid .vnm-node");
    // subgraph boxes are dashed rects in the edge layer
    const boxes = await page.locator('svg.vnm-edges rect[stroke-dasharray="4 4"]').count();
    expect(boxes).toBeGreaterThanOrEqual(2); // "pipeline" + nested "transform"
  });

  test("node cards carry their label text", async ({ page }) => {
    await page.goto(customElementPageForFixture("ci-pipeline.mmd", "light", "el-labels.html"));
    await page.waitForSelector("very-nice-mermaid .vnm-node");
    const texts = await page.locator(".vnm-node").allInnerTexts();
    expect(texts.join(" ")).toContain("Run tests");
    expect(texts.every((t) => t.trim().length > 0)).toBe(true);
  });
});

test.describe("interactive renderer — custom element drag", () => {
  test("dragging a node in the custom element re-routes its edges", async ({ page }) => {
    await page.goto(customElementPageForFixture("auth-flow.mmd", "dark", "el-drag.html"));
    await page.waitForSelector("very-nice-mermaid .vnm-node");
    const edge = page.locator("svg.vnm-edges path[marker-end]").first();
    const before = await edge.getAttribute("d");

    const node = page.locator(".vnm-node").first();
    const box = (await node.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 140, box.y + 110, { steps: 8 });
    await page.mouse.up();

    const after = await edge.getAttribute("d");
    expect(after).not.toBe(before);
  });
});
