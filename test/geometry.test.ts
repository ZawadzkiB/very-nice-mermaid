import { describe, expect, it } from "vitest";
import {
  sidePoint,
  pickSides,
  raySide,
  routeElbow,
  routeCurved,
  toPath,
  labelPoint,
  routeEdge,
  contentBounds,
  computePerimeterPorts,
  type NodeBox,
} from "../src/geometry/index.js";

const A: NodeBox = { x: 100, y: 100, width: 80, height: 40 };
const below: NodeBox = { x: 100, y: 300, width: 80, height: 40 };
const right: NodeBox = { x: 400, y: 100, width: 80, height: 40 };

describe("sidePoint", () => {
  it("returns perpendicular anchors", () => {
    expect(sidePoint(A, "bottom")).toEqual({ x: 100, y: 120 });
    expect(sidePoint(A, "right")).toEqual({ x: 140, y: 100 });
    expect(sidePoint(A, "top")).toEqual({ x: 100, y: 80 });
    expect(sidePoint(A, "left")).toEqual({ x: 60, y: 100 });
  });
});

describe("pickSides is aspect-aware", () => {
  it("exits the bottom for a node below in TB", () => {
    expect(pickSides(A, below, "TB")).toEqual({ exit: "bottom", entry: "top" });
  });
  it("exits the right for a node to the right in LR", () => {
    expect(pickSides(A, right, "LR")).toEqual({ exit: "right", entry: "left" });
  });
  it("flips to vertical sides in LR when the target is mostly below", () => {
    expect(pickSides(A, below, "LR")).toEqual({ exit: "bottom", entry: "top" });
  });
});

describe("routeElbow", () => {
  it("leaves and enters perpendicular, orthogonal segments only", () => {
    const pts = routeElbow(A, below, "TB");
    expect(pts[0]).toEqual({ x: 100, y: 120 }); // bottom of A
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 280 }); // top of below
    // every segment is axis-aligned
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  });

  it("produces a Z elbow when offset on the cross axis", () => {
    const offset: NodeBox = { x: 260, y: 300, width: 80, height: 40 };
    const pts = routeElbow(A, offset, "TB");
    expect(pts.length).toBeGreaterThanOrEqual(4);
  });
});

describe("routeCurved", () => {
  it("returns four bezier knots and a C path", () => {
    const pts = routeCurved(A, below, "TB");
    expect(pts).toHaveLength(4);
    expect(toPath(pts, "curved").startsWith("M ")).toBe(true);
    expect(toPath(pts, "curved")).toContain(" C ");
  });
});

describe("toPath + labelPoint", () => {
  it("elbow path uses L segments", () => {
    const pts = routeElbow(A, below, "TB");
    expect(toPath(pts, "elbow")).toContain(" L ");
  });
  it("labelPoint sits on the route", () => {
    const pts = routeElbow(A, below, "TB");
    const lp = labelPoint(pts, "elbow");
    expect(lp.x).toBe(100);
    expect(lp.y).toBe(200);
  });
});

describe("routeEdge", () => {
  it("bundles points, path, and label position", () => {
    const r = routeEdge(A, right, "LR", "elbow");
    expect(r.points.length).toBeGreaterThanOrEqual(2);
    expect(r.path.startsWith("M ")).toBe(true);
    expect(r.labelPos).toBeDefined();
  });
});

describe("sidePoint spreads with an offset (TEST-002/003)", () => {
  it("slides the anchor along the border, clamped to stay on it", () => {
    expect(sidePoint(A, "bottom", 10)).toEqual({ x: 110, y: 120 });
    expect(sidePoint(A, "bottom", -10)).toEqual({ x: 90, y: 120 });
    // clamped: A is 80 wide → half 40, margin 6 → max |offset| = 34
    expect(sidePoint(A, "bottom", 1000)).toEqual({ x: 134, y: 120 });
    // left/right slide on y
    expect(sidePoint(A, "right", 8)).toEqual({ x: 140, y: 108 });
  });
});

describe("raySide picks the perimeter side by direction (aspect-aware, FR2)", () => {
  const square: NodeBox = { x: 0, y: 0, width: 80, height: 80 };
  it("returns the border the ray from the center exits", () => {
    expect(raySide(square, 0, 10)).toBe("bottom");
    expect(raySide(square, 0, -10)).toBe("top");
    expect(raySide(square, 10, 0)).toBe("right");
    expect(raySide(square, -10, 0)).toBe("left");
  });
  it("is aspect-aware: a wide node sends a near-diagonal ray out its long side", () => {
    const wide: NodeBox = { x: 0, y: 0, width: 400, height: 40 };
    // a 45° direction on a square is a corner tie → top/bottom; on a wide node it
    // clearly exits the top/bottom, not the short side.
    expect(raySide(wide, 100, -100)).toBe("top");
    const tall: NodeBox = { x: 0, y: 0, width: 40, height: 400 };
    expect(raySide(tall, 100, -100)).toBe("right");
  });
});

describe("computePerimeterPorts distributes anchors around the perimeter (FR2 / TEST-002/003)", () => {
  const boxes = new Map<string, NodeBox>([
    ["A", { x: 100, y: 100, width: 80, height: 40 }],
    ["B", { x: 100, y: 300, width: 80, height: 40 }],
  ]);

  it("gives an anti-parallel pair opposite offsets so they don't fully occlude", () => {
    const ports = computePerimeterPorts([{ from: "A", to: "B" }, { from: "B", to: "A" }], boxes);
    // both ends attach by direction: down out of A (bottom), up into B (top)
    expect(ports[0]!.source.side).toBe("bottom");
    expect(ports[0]!.target.side).toBe("top");
    // each edge keeps the same offset sign at both ends → a straight, distinct channel
    expect(Math.sign(ports[0]!.source.offset)).toBe(Math.sign(ports[0]!.target.offset));
    expect(Math.sign(ports[1]!.source.offset)).toBe(Math.sign(ports[1]!.target.offset));
    // and the two edges land on opposite channels
    expect(Math.sign(ports[0]!.source.offset)).not.toBe(Math.sign(ports[1]!.source.offset));
    expect(ports[0]!.source.offset).not.toBe(0);
  });

  it("leaves a single edge unspread (attaches at the direction-chosen side center)", () => {
    const ports = computePerimeterPorts([{ from: "A", to: "B" }], boxes);
    expect(ports[0]).toEqual({ source: { side: "bottom", offset: 0 }, target: { side: "top", offset: 0 } });
  });

  it("fans several edges leaving one node onto N distinct, spaced source anchors", () => {
    const fan = new Map<string, NodeBox>([
      ["S", { x: 200, y: 100, width: 120, height: 40 }],
      ["L", { x: 80, y: 300, width: 60, height: 40 }],
      ["M", { x: 200, y: 300, width: 60, height: 40 }],
      ["R", { x: 320, y: 300, width: 60, height: 40 }],
    ]);
    const ports = computePerimeterPorts(
      [{ from: "S", to: "L" }, { from: "S", to: "M" }, { from: "S", to: "R" }],
      fan,
    );
    const sources = ports.map((o) => o.source.offset);
    expect(new Set(sources).size).toBe(3); // three distinct source channels
    // ordered by the target's x: left target gets the leftmost anchor
    expect(sources[0]).toBeLessThan(sources[1]!);
    expect(sources[1]).toBeLessThan(sources[2]!);
  });

  it("is deterministic: same inputs → identical anchors", () => {
    const call = () =>
      computePerimeterPorts([{ from: "A", to: "B" }, { from: "B", to: "A" }], boxes);
    expect(JSON.stringify(call())).toBe(JSON.stringify(call()));
  });
});

describe("sidePoint projects spread anchors onto the real shape outline (v0.4.1 bugfix)", () => {
  // How far off the outline a point is: 0 = exactly on it. For the tapered
  // shapes the outline is |dx|/hw + |dy|/hh = 1 (diamond) or (dx/hw)^2 +
  // (dy/hh)^2 = 1 (circle/ellipse). The bug left the anchor on the bounding box
  // (value > 1) beside the shape; the fix must put it back on the outline (== 1).
  const diamondResidual = (b: NodeBox, p: { x: number; y: number }): number =>
    Math.abs(p.x - b.x) / (b.width / 2) + Math.abs(p.y - b.y) / (b.height / 2);
  const ellipseResidual = (b: NodeBox, p: { x: number; y: number }): number =>
    ((p.x - b.x) / (b.width / 2)) ** 2 + ((p.y - b.y) / (b.height / 2)) ** 2;

  it("rides the DIAMOND edge for a non-zero offset on every side (not the bbox corner)", () => {
    const dia: NodeBox = { x: 100, y: 100, width: 120, height: 80, shape: "diamond" };
    for (const side of ["top", "bottom", "left", "right"] as const) {
      const p = sidePoint(dia, side, 18);
      const q = sidePoint(dia, side, -18);
      expect(diamondResidual(dia, p)).toBeCloseTo(1, 6); // ON the outline
      expect(diamondResidual(dia, q)).toBeCloseTo(1, 6);
    }
    // the pre-fix anchor (box border + tangential offset) was strictly OUTSIDE
    const preFix = { x: dia.x + 18, y: dia.y - dia.height / 2 }; // old top anchor
    expect(diamondResidual(dia, preFix)).toBeGreaterThan(1);
  });

  it("rides the CIRCLE/ellipse outline for a non-zero offset on every side", () => {
    const cir: NodeBox = { x: 60, y: 60, width: 90, height: 90, shape: "circle" };
    for (const side of ["top", "bottom", "left", "right"] as const) {
      expect(ellipseResidual(cir, sidePoint(cir, side, 20))).toBeCloseTo(1, 6);
      expect(ellipseResidual(cir, sidePoint(cir, side, -20))).toBeCloseTo(1, 6);
    }
    const ell: NodeBox = { x: 0, y: 0, width: 140, height: 60, shape: "circle" };
    expect(ellipseResidual(ell, sidePoint(ell, "top", 30))).toBeCloseTo(1, 6);
  });

  it("keeps a STADIUM anchor on the flat part of the side (clamped, never on the cap)", () => {
    const sta: NodeBox = { x: 100, y: 100, width: 160, height: 40, shape: "stadium" };
    // half-width 80, cap radius = half-height 20 → flat top spans |dx| <= 60.
    const big = sidePoint(sta, "top", 1000);
    expect(big.y).toBe(80); // still on the flat top edge (y = cy - hh)
    expect(Math.abs(big.x - sta.x)).toBeLessThanOrEqual(80 - 20 + 1e-9); // within flat region
    const small = sidePoint(sta, "bottom", 15);
    expect(small).toEqual({ x: 115, y: 120 }); // flat bottom, unchanged spread
  });

  it("EXACT repro: anti-parallel A<->B with B a diamond — both B endpoints on B's outline", () => {
    const boxes = new Map<string, NodeBox>([
      ["A", { x: 100, y: 100, width: 80, height: 40, shape: "rect" }],
      ["B", { x: 100, y: 300, width: 120, height: 80, shape: "diamond" }],
    ]);
    const edges = [
      { from: "A", to: "B" },
      { from: "B", to: "A" },
    ];
    const ports = computePerimeterPorts(edges, boxes);
    const B = boxes.get("B")!;
    const A = boxes.get("A")!;
    // both edges spread onto their own channel (offset != 0 at the B end)
    expect(ports[0]!.target.offset).not.toBe(0);
    expect(ports[1]!.source.offset).not.toBe(0);
    // A->B ends at B (target); B->A starts at B (source). Both must sit ON the
    // diamond outline, NOT floating beside it at the bounding-box top.
    const ab = routeEdge(A, B, "TB", "elbow", [], ports[0]);
    const ba = routeEdge(B, A, "TB", "elbow", [], ports[1]);
    const abEnd = ab.points[ab.points.length - 1]!;
    const baStart = ba.points[0]!;
    expect(diamondResidual(B, abEnd)).toBeCloseTo(1, 6);
    expect(diamondResidual(B, baStart)).toBeCloseTo(1, 6);
    // neither endpoint is left at the bounding-box top (the pre-fix defect)
    expect(abEnd.y).toBeGreaterThan(B.y - B.height / 2);
    expect(baStart.y).toBeGreaterThan(B.y - B.height / 2);
  });

  it("leaves a rect anchor exactly on the box border (unchanged, offset preserved)", () => {
    const box: NodeBox = { x: 100, y: 100, width: 80, height: 40, shape: "rect" };
    expect(sidePoint(box, "bottom", 10)).toEqual({ x: 110, y: 120 });
    // a shapeless box (no `shape`) behaves exactly like a rect (backward-compat)
    const bare: NodeBox = { x: 100, y: 100, width: 80, height: 40 };
    expect(sidePoint(bare, "bottom", 10)).toEqual({ x: 110, y: 120 });
  });
});

describe("contentBounds", () => {
  it("wraps every box with padding", () => {
    const b = contentBounds([A, below], [], 10);
    expect(b.x).toBe(50); // 100 - 40 - 10
    expect(b.y).toBe(70); // 100 - 20 - 10
    expect(b.width).toBe(100); // 80 + 2*10
    expect(b.height).toBe(260); // (320-80) + 2*10
  });
  it("returns a zero rect for no boxes", () => {
    expect(contentBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
