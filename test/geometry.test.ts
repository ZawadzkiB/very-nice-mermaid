import { describe, expect, it } from "vitest";
import {
  sidePoint,
  pickSides,
  routeElbow,
  routeCurved,
  toPath,
  labelPoint,
  routeEdge,
  contentBounds,
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
