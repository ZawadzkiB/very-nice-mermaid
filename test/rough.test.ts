/**
 * The deterministic rough (sketch) generator — src/rough. Determinism + parity
 * are the whole point (D4/FR5): same key → byte-identical geometry, so snapshots
 * and the dom-runtime parity guard hold. No RNG, no time.
 */

import { describe, it, expect } from "vitest";
import {
  roughShape,
  roughEllipse,
  roughPolyline,
  openArrowhead,
  ellipsePoints,
  roughSeed,
  type Pt,
} from "../src/rough/index.js";

const SQUARE: Pt[] = [
  [0, 0],
  [100, 0],
  [100, 60],
  [0, 60],
];

describe("rough generator — determinism (D4/FR5)", () => {
  it("same key → byte-identical shape (no RNG / no time)", () => {
    expect(roughShape(SQUARE, "A")).toEqual(roughShape(SQUARE, "A"));
    expect(roughPolyline([[0, 0], [50, 50]], "e")).toEqual(roughPolyline([[0, 0], [50, 50]], "e"));
    expect(openArrowhead([100, 0], [0, 0], 8, "k")).toBe(openArrowhead([100, 0], [0, 0], 8, "k"));
  });

  it("different keys → different wobble (jitter is seeded from the key)", () => {
    expect(roughShape(SQUARE, "A")).not.toEqual(roughShape(SQUARE, "B"));
    expect(roughPolyline([[0, 0], [50, 50]], "a")).not.toEqual(roughPolyline([[0, 0], [50, 50]], "b"));
  });

  it("roughSeed is a stable 32-bit hash", () => {
    expect(roughSeed("A")).toBe(roughSeed("A"));
    expect(roughSeed("A")).not.toBe(roughSeed("B"));
    const s = roughSeed("node-1");
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("rough generator — shape output", () => {
  it("closed shape = one soft fill + N wobbly outline strokes, all closed quadratics", () => {
    const rs = roughShape(SQUARE, "A");
    expect(rs.outline).toHaveLength(2); // SKETCH.outlineStrokes
    for (const d of [rs.fill, ...rs.outline]) {
      expect(d.startsWith("M ")).toBe(true);
      expect(d.endsWith(" Z")).toBe(true); // closed
      expect(d).toContain(" Q "); // bowed segments
    }
  });

  it("open polyline strokes are NOT closed (edges have no Z)", () => {
    for (const d of roughPolyline([[0, 0], [100, 0]], "e")) {
      expect(d.startsWith("M ")).toBe(true);
      expect(d.endsWith(" Z")).toBe(false);
    }
  });

  it("coordinates are rounded to 2 decimals (compact, parity-stable output)", () => {
    const rs = roughShape(SQUARE, "A");
    for (const num of rs.fill.match(/-?\d+\.\d+/g) ?? []) {
      const decimals = num.split(".")[1]!;
      expect(decimals.length).toBeLessThanOrEqual(2);
    }
  });
});

describe("rough generator — ellipse + arrowhead geometry", () => {
  it("ellipsePoints samples the configured steps ON the ellipse", () => {
    const pts = ellipsePoints(0, 0, 10, 5);
    expect(pts).toHaveLength(22); // SKETCH.ellipseSteps
    expect(pts[0]![0]).toBeCloseTo(10); // angle 0 → (rx, 0)
    expect(pts[0]![1]).toBeCloseTo(0);
    for (const [x, y] of pts) expect((x / 10) ** 2 + (y / 5) ** 2).toBeCloseTo(1, 6);
  });

  it("roughEllipse reuses roughShape over the sampled ellipse points", () => {
    expect(roughEllipse(0, 0, 10, 5, "C")).toEqual(roughShape(ellipsePoints(0, 0, 10, 5), "C"));
  });

  it("openArrowhead is an open V behind the tip, along the incoming direction", () => {
    // edge pointing right: tip (100,0), coming from (0,0) → barbs point back (x<100)
    const d = openArrowhead([100, 0], [0, 0], 8, "e@end");
    expect(d).toMatch(/^M -?[\d.]+ -?[\d.]+ L 100 0 L -?[\d.]+ -?[\d.]+$/);
    const nums = (d.match(/-?[\d.]+/g) ?? []).map(Number);
    expect(nums[2]).toBe(100); // tip x is the middle L
    expect(nums[3]).toBe(0); // tip y
    expect(nums[0]).toBeLessThan(100); // barb 1 sits behind the tip
    expect(nums[4]).toBeLessThan(100); // barb 2 sits behind the tip
    // the two barbs straddle the shaft (one above, one below the axis)
    expect(Math.sign(nums[1]!) !== Math.sign(nums[5]!) || nums[1] === 0 || nums[5] === 0).toBe(true);
  });
});
