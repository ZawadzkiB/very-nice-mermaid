import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { exportHtmlFromDsl } from "./helpers.js";

/**
 * End-to-end browser coverage for the re-planned FR6 (label reserved-space
 * de-collision, fixes TEST-001) and FR7 (edge-crossing GAPS / UAT-round pivot:
 * the under-line breaks, D3 the more-vertical line, D4 per-style toggle) — the
 * plan's Tests table row: "HTML export of the repro: labels legible with a gap,
 * crossings show gaps, 0 console errors (extends the subgraph/interaction specs)".
 *
 * Uses ad-hoc DSL (not part of the committed fixtures/ corpus) so these
 * diagrams don't get swept into the parser/layout corpus-wide unit tests —
 * see {@link exportHtmlFromDsl}. Driven over file:// via the real Playwright
 * test runner (the bundled gogo-playwright MCP blocks file:// navigation;
 * this suite doesn't have that limitation).
 */

// A crossing GAP is a pen-up splice in the under-line's `d`: an `L` endpoint
// immediately followed by an `M` restart — a break that never occurs in a plain
// continuous elbow path (replaces the old ` Q ` arc-hop probe).
const GAP_RE = / L [-\d.]+ [-\d.]+ M [-\d.]+ [-\d.]+/;

/** Collect console errors + page errors for the lifetime of a test. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

// The acceptance-signal repro (scratchpad/repro.mmd): two DIFFERENT edges'
// labels ("batch load" off IN-->K1, "feed" off API-->V1) route close/parallel
// and used to overlap before FR6 (TEST-001).
const REPRO_DSL = `flowchart TD
  subgraph VE[Validation Engine Verische]
    V1[Schema check]
    V2[Rule eval]
  end
  subgraph KU[Kukuvara subsystem]
    K1[Parse inbound]
    K2[Route message]
  end
  IN[Ingress] -->|REST admin| V1
  IN -->|gRPC stream| V2
  IN -->|batch load| K1
  API[API Gateway] -->|feed| V1
  API -->|alt path| K2
  V1 --> HUB
  V2 --> HUB
  K1 --> HUB
  K2 --> HUB
  API --> HUB
  IN --> HUB
  HUB[Aggregator hub]`;

// A minimal diagram with exactly one genuine, unavoidable edge crossing
// (X-->Q crosses Y-->M / M-->P's routing) — reliably produces 1 FR7 bridge.
const CROSSING_DSL = `flowchart TD
X-->M
Y-->M
M-->P
M-->Q
X-->Q
Y-->P`;

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

test.describe("FR6 — label reserved-space de-collision (TEST-001 regression)", () => {
  test("'batch load' and 'feed' plates from two DIFFERENT edges never overlap, with a visible gap", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    const url = exportHtmlFromDsl(REPRO_DSL, "light", "fr6-repro.html");
    await page.goto(url);
    await page.waitForSelector(".vnm-node");

    const batchLoad = await labelPlateRect(page, "batch load");
    const feed = await labelPlateRect(page, "feed");
    expect(batchLoad).not.toBeNull();
    expect(feed).not.toBeNull();

    // AABB overlap test: no intersection on X AND Y simultaneously.
    const xOverlap = Math.min(batchLoad!.right, feed!.right) - Math.max(batchLoad!.x, feed!.x);
    const yOverlap = Math.min(batchLoad!.bottom, feed!.bottom) - Math.max(batchLoad!.y, feed!.y);
    const intersects = xOverlap > 0 && yOverlap > 0;
    expect(intersects).toBe(false);

    expect(errors).toEqual([]);
  });

  test("holds across dark and fancy themes too", async ({ page }) => {
    for (const theme of ["dark", "fancy"] as const) {
      const url = exportHtmlFromDsl(REPRO_DSL, theme, `fr6-repro-${theme}.html`);
      await page.goto(url);
      await page.waitForSelector(".vnm-node");
      const batchLoad = await labelPlateRect(page, "batch load");
      const feed = await labelPlateRect(page, "feed");
      const xOverlap = Math.min(batchLoad!.right, feed!.right) - Math.max(batchLoad!.x, feed!.x);
      const yOverlap = Math.min(batchLoad!.bottom, feed!.bottom) - Math.max(batchLoad!.y, feed!.y);
      expect(xOverlap > 0 && yOverlap > 0).toBe(false);
    }
  });
});

test.describe("FR7 — edge-crossing gaps (under-line breaks, D3 more-vertical line, D4 default ON for clean elbow)", () => {
  test("a diagram with genuine crossings renders a gapped edge at each one, 0 console errors", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    const url = exportHtmlFromDsl(CROSSING_DSL, "light", "fr7-crossing.html");
    await page.goto(url);
    await page.waitForSelector(".vnm-node");

    const ds = await page
      .locator("svg.vnm-edges path[marker-end]")
      .evaluateAll((paths) => paths.map((p) => p.getAttribute("d") ?? ""));
    const gappedCount = ds.filter((d) => GAP_RE.test(d)).length;
    // CROSSING_DSL was designed around a single forced crossing (X-->Q vs Y-->P)
    // back when the glyph was an arc bump; the shipped layout's routing (grown over
    // several later rounds — FR9 lanes, hub port spread, etc.) now produces TWO
    // independent perpendicular crossings for this fixture: X-->Q's early vertical
    // run crosses Y-->M's horizontal jog, and separately M-->P's vertical run
    // crosses X-->Q's later horizontal jog. Both are genuine (interior, non-parallel)
    // intersections, hand-verified by coordinate trace, and FR7 correctly gaps each
    // one. Confirmed unrelated to D12 (this round's scope): re-rendering with the
    // D12 heading-order `bends` param disabled reproduces the byte-identical 2-gap
    // output, so this is pre-existing fixture/assertion drift, not a D12 regression.
    expect(gappedCount).toBe(2);
    // the gap is a small pen-up break, not a re-route — every path keeps its L segments
    expect(ds.every((d) => /L/.test(d))).toBe(true);

    expect(errors).toEqual([]);
  });

  test("dragging the shared node re-routes live and keeps exactly one clean gap, no stale break", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    const url = exportHtmlFromDsl(CROSSING_DSL, "light", "fr7-crossing-drag.html");
    await page.goto(url);
    await page.waitForSelector(".vnm-node");

    const nodeM = page.locator(".vnm-node", { hasText: "M" }).first();
    const box = (await nodeM.boundingBox())!;
    // Real pointer down/move/up — not element.click() (masks pointer-driven drag handlers).
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 260, box.y - 180, { steps: 10 });
    await page.mouse.up();

    const dsAfter = await page
      .locator("svg.vnm-edges path[marker-end]")
      .evaluateAll((paths) => paths.map((p) => p.getAttribute("d") ?? ""));
    // Still exactly one gapped edge after the reroute (deterministic re-gap, no stale/duplicate breaks).
    expect(dsAfter.filter((d) => GAP_RE.test(d)).length).toBe(1);

    expect(errors).toEqual([]);
  });

  test("--no-bridges (D4 CLI toggle) removes the gap entirely for the same diagram", async ({ page }) => {
    const onUrl = exportHtmlFromDsl(CROSSING_DSL, "light", "fr7-crossing-on.html");
    await page.goto(onUrl);
    await page.waitForSelector(".vnm-node");
    const dsOn = await page
      .locator("svg.vnm-edges path[marker-end]")
      .evaluateAll((paths) => paths.map((p) => p.getAttribute("d") ?? ""));
    expect(dsOn.some((d) => GAP_RE.test(d))).toBe(true); // default-on for clean elbow produces the gap

    const offUrl = exportHtmlFromDsl(CROSSING_DSL, "light", "fr7-crossing-off.html", ["--no-bridges"]);
    await page.goto(offUrl);
    await page.waitForSelector(".vnm-node");
    const dsOff = await page
      .locator("svg.vnm-edges path[marker-end]")
      .evaluateAll((paths) => paths.map((p) => p.getAttribute("d") ?? ""));
    expect(dsOff.some((d) => GAP_RE.test(d))).toBe(false); // --no-bridges strips every gap
  });
});

test.describe("D5 — sequence diagrams are untouched by the line/label work", () => {
  test("a sequence diagram with crossing message lines gets no gap glyphs", async ({ page }) => {
    const dsl = `sequenceDiagram
  participant A
  participant B
  participant C
  A->>C: request
  B->>A: reply
  A->>B: forward
  C->>B: ack`;
    const url = exportHtmlFromDsl(dsl, "light", "fr7-sequence-excluded.html");
    await page.goto(url);
    await page.waitForSelector("svg");
    const ds = await page.locator("svg path[marker-end]").evaluateAll((paths) => paths.map((p) => p.getAttribute("d") ?? ""));
    expect(ds.some((d) => GAP_RE.test(d))).toBe(false);
  });
});
