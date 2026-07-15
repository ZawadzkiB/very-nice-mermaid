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
  resolveLabelCollisions,
  resolveLabelEdgeCollisions,
  resolveLabelLineOffsets,
  LABEL_LINE_GAP,
  segmentsCross,
  applyEdgeBridges,
  separateLanes,
  separateAntiParallelJogs,
  separateConvergentJogs,
  subgraphBox,
  SUBGRAPH_TITLE_BAND,
  type NodeBox,
  type PlateRect,
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

describe("routeElbow enters the target perpendicular to the entered side (FR2)", () => {
  it("a left-exit / top-entry route closes with a vertical segment into the top (no sideways stub)", () => {
    // Idle→Loading shape: source up-and-right, target down-and-left, so the ports land
    // on perpendicular sides (exit left, entry top). Without the fix the naive elbow's
    // last segment runs flat along the top border → arrowhead points sideways.
    const from: NodeBox = { x: 240, y: 60, width: 80, height: 40 };
    const to: NodeBox = { x: 100, y: 200, width: 80, height: 40 };
    const ports = {
      source: { side: "left" as const, offset: 0 },
      target: { side: "top" as const, offset: 0 },
    };
    const pts = routeElbow(from, to, "TB", [], ports);
    const end = pts[pts.length - 1]!;
    const penult = pts[pts.length - 2]!;
    expect(end).toEqual({ x: 100, y: 180 }); // lands on the target's top border
    expect(penult.x).toBe(end.x); // closing segment is vertical → perpendicular to the top
    expect(penult.y).toBeLessThan(end.y); // and comes down INTO the node
  });

  it("leaves an already-perpendicular route byte-identical (opposite sides)", () => {
    const pts = routeElbow(A, below, "TB");
    expect(pts[0]).toEqual({ x: 100, y: 120 });
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 280 });
    const penult = pts[pts.length - 2]!;
    expect(penult.x).toBe(100); // still a clean vertical entry into the top
  });

  it("handles a BOTTOM entry too — closes vertical, approaching from below (sign check, REV-002)", () => {
    // Target ABOVE the source, entering its BOTTOM border: the closing segment must
    // be vertical AND come UP from below (exterior), so the arrowhead points up into
    // the node — the mirror of the top-entry case, proving the sign handling.
    const from: NodeBox = { x: 100, y: 300, width: 80, height: 40 };
    const to: NodeBox = { x: 240, y: 60, width: 80, height: 40 };
    const ports = {
      source: { side: "left" as const, offset: 0 },
      target: { side: "bottom" as const, offset: 0 },
    };
    const pts = routeElbow(from, to, "TB", [], ports);
    const end = pts[pts.length - 1]!;
    const penult = pts[pts.length - 2]!;
    expect(end).toEqual({ x: 240, y: 80 }); // the target's bottom border
    expect(penult.x).toBe(end.x); // vertical closing segment (⟂ to the bottom)
    expect(penult.y).toBeGreaterThan(end.y); // approaches from BELOW (exterior)
  });
});

describe("resolveLabelEdgeCollisions lifts a label off a bisecting parallel run (FR3)", () => {
  it("slides a label along its own vertical run past a foreign parallel run's nearer end", () => {
    const plates: Array<PlateRect | undefined> = [
      { x: 100, y: 100, w: 40, h: 20 }, // label centred on its own vertical run at x=100
      undefined, // the foreign edge carries no label
    ];
    const polylines = [
      [{ x: 100, y: 0 }, { x: 100, y: 200 }], // own run: vertical at x=100 through the plate
      [{ x: 110, y: 90 }, { x: 110, y: 300 }], // foreign PARALLEL run bisecting the plate
    ];
    const shifts = resolveLabelEdgeCollisions(plates, polylines);
    expect(shifts[0]!.x).toBe(0); // moved only ALONG its own edge, never flung sideways
    expect(shifts[0]!.y).toBeLessThan(0); // up, toward the foreign run's nearer (upper) end
    // clears it: the plate now sits fully above the foreign run's start (y=90)
    expect(100 + shifts[0]!.y + 10).toBeLessThanOrEqual(90);
  });

  it("leaves a label with no foreign parallel run untouched (byte-identical)", () => {
    const plates: Array<PlateRect | undefined> = [{ x: 100, y: 100, w: 40, h: 20 }];
    const polylines = [[{ x: 100, y: 0 }, { x: 100, y: 200 }]];
    const shifts = resolveLabelEdgeCollisions(plates, polylines);
    expect(shifts[0]).toEqual({ x: 0, y: 0 });
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

  it("orders a fan's ports by the edge's HEADING (first bend) so a detour edge doesn't cross a sibling", () => {
    // S fans to L(left)/M(centre)/R(right), but the CENTRE edge is one dagre
    // steered out past R (a detour bend at x=400). Ordering by destination centre
    // would leave it from the middle port and cross R; ordering by its heading
    // gives it the rightmost port so it peels away clean.
    const fan = new Map<string, NodeBox>([
      ["S", { x: 200, y: 100, width: 120, height: 40 }],
      ["L", { x: 80, y: 300, width: 60, height: 40 }],
      ["M", { x: 200, y: 300, width: 60, height: 40 }],
      ["R", { x: 320, y: 300, width: 60, height: 40 }],
    ]);
    const edges = [{ from: "S", to: "L" }, { from: "S", to: "M" }, { from: "S", to: "R" }];
    // No bends → destination-centre order (unchanged legacy behaviour): L<M<R.
    const plain = computePerimeterPorts(edges, fan).map((o) => o.source.offset);
    expect(plain[0]).toBeLessThan(plain[1]!);
    expect(plain[1]).toBeLessThan(plain[2]!);
    // With a detour bend on the centre edge, it heads furthest right → rightmost
    // port; R drops to the middle; L stays leftmost. No source-side crossing.
    const bends = [undefined, [{ x: 400, y: 250 }], undefined];
    const headed = computePerimeterPorts(edges, fan, undefined, undefined, bends).map(
      (o) => o.source.offset,
    );
    expect(headed[0]).toBeLessThan(headed[2]!); // L left of R
    expect(headed[2]).toBeLessThan(headed[1]!); // R (middle) left of the detoured M (rightmost)
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

describe("fan-in spread keeps N incident arrowheads distinguishable (FR4)", () => {
  it("spreads a 5-edge fan on one side onto distinct channels with a wide min gap", () => {
    // A wide hub with five targets far below it: every edge exits the bottom, so
    // all five sources share one border and must spread onto their own channels.
    const boxes = new Map<string, NodeBox>([
      ["H", { x: 300, y: 100, width: 200, height: 44 }],
      ["a", { x: 260, y: 400, width: 60, height: 40 }],
      ["b", { x: 280, y: 400, width: 60, height: 40 }],
      ["c", { x: 300, y: 400, width: 60, height: 40 }],
      ["d", { x: 320, y: 400, width: 60, height: 40 }],
      ["e", { x: 340, y: 400, width: 60, height: 40 }],
    ]);
    const edges = ["a", "b", "c", "d", "e"].map((to) => ({ from: "H", to }));
    const ports = computePerimeterPorts(edges, boxes);
    expect(ports.every((p) => p.source.side === "bottom")).toBe(true);
    const offs = ports.map((p) => p.source.offset).sort((x, y) => x - y);
    expect(new Set(offs).size).toBe(5); // five distinct source anchors
    // adjacent anchors are spaced by the preferred PORT_STEP (now 30) or the
    // border-filling cap, so the arrowheads no longer merge into one illegible
    // bunch (a wide hub fills nearly the whole side; see FR4/UAT-1).
    let minGap = Infinity;
    for (let i = 1; i < offs.length; i++) minGap = Math.min(minGap, offs[i]! - offs[i - 1]!);
    expect(minGap).toBeGreaterThanOrEqual(24);
  });
});

describe("titled subgraph reserves a taller title band (FR2)", () => {
  it("a titled container's top edge sits SUBGRAPH_TITLE_BAND higher than an untitled one", () => {
    const members: NodeBox[] = [{ x: 100, y: 100, width: 80, height: 40 }];
    const titled = subgraphBox(members, true)!;
    const untitled = subgraphBox(members, false)!;
    const titledTop = titled.y - titled.height / 2;
    const untitledTop = untitled.y - untitled.height / 2;
    // the extra top space equals the title band, giving the opaque plate room to
    // clear the top member node.
    expect(untitledTop - titledTop).toBeCloseTo(SUBGRAPH_TITLE_BAND, 6);
    expect(SUBGRAPH_TITLE_BAND).toBe(22); // bumped from 18 (FR2)
  });
});

describe("resolveLabelCollisions de-collides overlapping edge-label plates (FR6)", () => {
  const rect = (x: number, y: number, w: number, h: number): PlateRect => ({ x, y, w, h });
  const apply = (plates: PlateRect[], shifts: ReturnType<typeof resolveLabelCollisions>): PlateRect[] =>
    plates.map((p, i) => ({ x: p.x + shifts[i]!.x, y: p.y + shifts[i]!.y, w: p.w, h: p.h }));
  // strict overlap (a hair of tolerance so a clean touch doesn't count)
  const overlaps = (a: PlateRect, b: PlateRect): boolean =>
    (a.w + b.w) / 2 - Math.abs(a.x - b.x) > 1e-6 && (a.h + b.h) / 2 - Math.abs(a.y - b.y) > 1e-6;

  it("separates two overlapping plates so they no longer intersect (the TEST-001 shape)", () => {
    // "batch load" (~90 wide) and "feed" (~40 wide) landing on top of each other
    const plates = [rect(400, 140, 90, 22), rect(410, 145, 40, 22)];
    expect(overlaps(plates[0]!, plates[1]!)).toBe(true);
    const out = apply(plates, resolveLabelCollisions(plates));
    expect(overlaps(out[0]!, out[1]!)).toBe(false);
  });

  it("leaves already-clear plates untouched (zero shift)", () => {
    const plates = [rect(0, 0, 40, 20), rect(200, 0, 40, 20)];
    const shifts = resolveLabelCollisions(plates);
    expect(shifts[0]).toEqual({ x: 0, y: 0 });
    expect(shifts[1]).toEqual({ x: 0, y: 0 });
  });

  it("clears a cluster of three overlapping plates and is deterministic", () => {
    const plates = [rect(100, 100, 90, 22), rect(110, 105, 80, 22), rect(120, 110, 60, 22)];
    const s1 = resolveLabelCollisions(plates);
    const s2 = resolveLabelCollisions(plates);
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2)); // deterministic (no RNG/clock)
    const out = apply(plates, s1);
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) expect(overlaps(out[i]!, out[j]!)).toBe(false);
  });

  it("skips undefined (unlabelled) entries and returns aligned zero shifts", () => {
    const shifts = resolveLabelCollisions([rect(0, 0, 40, 20), undefined, rect(5, 5, 40, 20)]);
    expect(shifts).toHaveLength(3);
    expect(shifts[1]).toEqual({ x: 0, y: 0 }); // the hole stays zero
  });
});

describe("resolveLabelLineOffsets lifts a label off its home line (option d, v0.6.4)", () => {
  const rect = (x: number, y: number, w: number, h: number): PlateRect => ({ x, y, w, h });

  it("shifts a label on a VERTICAL home segment RIGHT by plateHalfWidth + gap (line stays continuous)", () => {
    // A vertical run through the plate centre → move RIGHT by half the WIDTH (+gap) so the
    // wide plate fully clears the line (the naive half-height would still mask it).
    const plate = rect(100, 100, 120, 20);
    const vertical = [{ x: 100, y: 0 }, { x: 100, y: 200 }];
    const [sh] = resolveLabelLineOffsets([plate], [vertical], [false]);
    expect(sh).toEqual({ x: 120 / 2 + LABEL_LINE_GAP, y: 0 });
  });

  it("shifts a label on a HORIZONTAL home segment UP by plateHalfHeight + gap", () => {
    const plate = rect(100, 100, 120, 20);
    const horizontal = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
    const [sh] = resolveLabelLineOffsets([plate], [horizontal], [false]);
    expect(sh).toEqual({ x: 0, y: -(20 / 2 + LABEL_LINE_GAP) });
  });

  it("REV-001: the cubic flag (not point-count) picks the axis for a 4-point route", () => {
    // Same 4-point polyline: its interior mid segment [pt1,pt2] is VERTICAL, but the
    // mid-curve tangent (p0+c1)->(c2+p3) is HORIZONTAL. A curved edge WITH waypoints
    // (cubics=false, routes as an elbow) must use the MID segment → RIGHT; only a genuine
    // cubic (cubics=true) uses the tangent → UP. Guards the elbow-4 mis-axis regression.
    const plate = rect(0, 0, 40, 20);
    const poly = [{ x: 0, y: 50 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 200, y: 50 }];
    const [elbow] = resolveLabelLineOffsets([plate], [poly], [false]); // curved+waypoints → mid seg (vertical)
    const [cubic] = resolveLabelLineOffsets([plate], [poly], [true]); //  genuine cubic → tangent (horizontal)
    expect(elbow).toEqual({ x: 40 / 2 + LABEL_LINE_GAP, y: 0 }); // RIGHT
    expect(cubic).toEqual({ x: 0, y: -(20 / 2 + LABEL_LINE_GAP) }); // UP
    expect(elbow).not.toEqual(cubic); // the flag genuinely changes the axis
  });

  it("returns a zero shift for an unlabelled (undefined) plate, aligned by index", () => {
    const shifts = resolveLabelLineOffsets(
      [undefined, rect(0, 0, 40, 20)],
      [[], [{ x: 0, y: 0 }, { x: 0, y: 100 }]],
      [false, false],
    );
    expect(shifts[0]).toEqual({ x: 0, y: 0 });
    expect(shifts[1]).toEqual({ x: 40 / 2 + LABEL_LINE_GAP, y: 0 });
  });
});

describe("edge-crossing gaps (FR7 — the under-line breaks, UAT-round pivot)", () => {
  it("segmentsCross returns the interior crossing point, else null", () => {
    // a horizontal segment crossing a vertical one at their interiors
    expect(segmentsCross({ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 50, y: 0 }, { x: 50, y: 100 })).toEqual({ x: 50, y: 50 });
    // a shared endpoint (a fan meeting at a node anchor) is NOT a crossing
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }, { x: 10, y: -10 })).toBeNull();
    // parallel / collinear segments never cross
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBeNull();
    // segments that would meet only if extended past their spans
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 50, y: -5 }, { x: 50, y: 5 })).toBeNull();
  });

  const hEdge = { points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] };
  const vEdge = { points: [{ x: 50, y: 0 }, { x: 50, y: 100 }] };
  // A gap is a pen-up splice: an `L` stops ~GAP_RADIUS before the crossing, an `M`
  // restarts past it — a pattern that never occurs in a plain continuous elbow.
  const gapCount = (d: string): number => (d.match(/ L [-\d.]+ [-\d.]+ M [-\d.]+ [-\d.]+/g) ?? []).length;

  it("cuts a single gap into the MORE-VERTICAL (under) edge; the horizontal over-line stays continuous (D3-pivot)", () => {
    const out = applyEdgeBridges([hEdge, vEdge], true);
    expect(out[0]).toBeNull(); // the more-horizontal OVER line is untouched (continuous)
    expect(out[1]).not.toBeNull(); // the vertical UNDER line is broken
    expect(gapCount(out[1]!)).toBe(1); // exactly one gap
    expect(out[1]).toContain("L 50 46 M 50 54"); // ±GAP_RADIUS(4) about the crossing at (50,50)
  });

  it("does nothing when disabled, or when edges are parallel / don't cross", () => {
    expect(applyEdgeBridges([hEdge, vEdge], false)).toEqual([null, null]);
    const parallel = [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, { points: [{ x: 0, y: 20 }, { x: 100, y: 20 }] }];
    expect(applyEdgeBridges(parallel, true)).toEqual([null, null]);
  });

  it("is deterministic (same input → identical output)", () => {
    expect(JSON.stringify(applyEdgeBridges([hEdge, vEdge], true))).toBe(
      JSON.stringify(applyEdgeBridges([hEdge, vEdge], true)),
    );
  });

  it("skips a crossing within a gap radius of the under-line's end (no malformed break)", () => {
    // the vertical (under) edge starts at y=48, 2px above the crossing (< radius 4) → no gap
    const nearEndV = { points: [{ x: 50, y: 48 }, { x: 50, y: 148 }] };
    expect(applyEdgeBridges([hEdge, nearEndV], true)[1]).toBeNull();
  });

  it("collapses two crossings closer than 2·radius on the under-line to a single gap (REV-005)", () => {
    // two horizontals cross the vertical 3px apart (< 2·radius=8) → one gap, no backward-L
    const h1 = { points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] };
    const h2 = { points: [{ x: 0, y: 53 }, { x: 100, y: 53 }] };
    const out = applyEdgeBridges([vEdge, h1, h2], true);
    expect(gapCount(out[0]!)).toBe(1); // the vertical under-line gets a single collapsed gap
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
  });
});

describe("separateLanes gives merged parallel runs distinct lanes (FR9)", () => {
  // an elbow: anchor → down → across to `vx` → the merged vertical → across to `ex` → down.
  // Only the (vx, 20..180) segment is interior (both ends bends); the anchors stay put.
  type LEdge = { points: { x: number; y: number }[] };
  const mk = (x0: number, vx: number, ex: number): LEdge => ({
    points: [
      { x: x0, y: 0 },
      { x: x0, y: 20 },
      { x: vx, y: 20 },
      { x: vx, y: 180 },
      { x: ex, y: 180 },
      { x: ex, y: 200 },
    ],
  });
  const orthogonal = (e: LEdge): boolean =>
    e.points.every((p, i) => i === 0 || Math.abs(e.points[i - 1]!.x - p.x) < 1e-6 || Math.abs(e.points[i - 1]!.y - p.y) < 1e-6);

  it("spreads 3 near-parallel interior verticals to ≥ LANE_GAP apart, keeping paths orthogonal + anchored", () => {
    const edges = [mk(10, 200, 300), mk(30, 220, 320), mk(50, 240, 340)]; // verticals 20px apart, overlap 160
    const firstLast = edges.map((e) => [e.points[0], e.points[e.points.length - 1]]);
    separateLanes(edges, "elbow");
    const lanes = edges.map((e) => e.points[3]!.x).sort((a, b) => a - b);
    for (let i = 1; i < lanes.length; i++) expect(lanes[i]! - lanes[i - 1]!).toBeGreaterThanOrEqual(26 - 1e-6);
    edges.forEach((e, i) => {
      expect(e.points[0]).toEqual(firstLast[i]![0]); // source anchor unmoved
      expect(e.points[e.points.length - 1]).toEqual(firstLast[i]![1]); // target anchor unmoved
      expect(e.points[2]!.x).toBe(e.points[3]!.x); // the vertical stayed vertical (both ends re-x'd together)
      expect(orthogonal(e)).toBe(true); // still a clean orthogonal staircase
    });
  });

  it("is deterministic + idempotent (a spread bundle no longer re-qualifies)", () => {
    const once = [mk(10, 200, 300), mk(30, 220, 320), mk(50, 240, 340)];
    separateLanes(once, "elbow");
    const twice = [mk(10, 200, 300), mk(30, 220, 320), mk(50, 240, 340)];
    separateLanes(twice, "elbow");
    separateLanes(twice, "elbow");
    expect(JSON.stringify(twice.map((e) => e.points))).toBe(JSON.stringify(once.map((e) => e.points)));
  });

  it("leaves a lone run untouched, and no-ops for curved (elbow-only)", () => {
    const solo = [mk(10, 200, 300)];
    const soloBefore = JSON.stringify(solo);
    separateLanes(solo, "elbow");
    expect(JSON.stringify(solo)).toBe(soloBefore); // < LANE_MIN_BUNDLE → untouched
    const curved = [mk(10, 200, 300), mk(30, 220, 320), mk(50, 240, 340)];
    const curvedBefore = JSON.stringify(curved);
    separateLanes(curved, "curved");
    expect(JSON.stringify(curved)).toBe(curvedBefore); // curved is deferred
  });
});

describe("separateAntiParallelJogs de-cramps a collinear anti-parallel elbow pair (v0.6.2)", () => {
  type APEdge = {
    from: string;
    to: string;
    points: { x: number; y: number }[];
    path?: string;
    labelPos?: { x: number; y: number };
  };
  // The state Loading↔Error case, verified byte-for-byte in state-clean-light.svg:
  // both jog at the identical mid-y = 306 (one merged crossbar). `fail` goes DOWN
  // (target B, bottom y=336), `retry` goes UP (target A, top y=276).
  const mkPair = (): APEdge[] => [
    { from: "A", to: "B", points: [{ x: 114, y: 276 }, { x: 114, y: 306 }, { x: 147, y: 306 }, { x: 147, y: 336 }] },
    { from: "B", to: "A", points: [{ x: 177, y: 336 }, { x: 177, y: 306 }, { x: 144, y: 306 }, { x: 144, y: 276 }] },
  ];
  const orthogonal = (e: APEdge): boolean =>
    e.points.every(
      (p, i) => i === 0 || Math.abs(e.points[i - 1]!.x - p.x) < 1e-6 || Math.abs(e.points[i - 1]!.y - p.y) < 1e-6,
    );
  const jogY = (e: APEdge): number => e.points[1]!.y; // the interior horizontal crossbar's y

  it("staggers the two collinear jogs ≥ JOG_GAP apart, each biased toward its own target, anchors + orthogonality intact", () => {
    const edges = mkPair();
    const anchors = edges.map((e) => [{ ...e.points[0]! }, { ...e.points[e.points.length - 1]! }]);
    separateAntiParallelJogs(edges, "elbow");
    const [fail, retry] = edges as [APEdge, APEdge];
    // no longer collinear; the two crossbars sit ≥ JOG_GAP (26) apart on the perpendicular (y) axis
    expect(Math.abs(jogY(fail) - jogY(retry))).toBeGreaterThanOrEqual(26 - 1e-6);
    // direction-correct (FR2): the DOWN edge (target y=336) jogs LOWER than the UP edge (target y=276)
    expect(jogY(fail)).toBeGreaterThan(jogY(retry));
    edges.forEach((e, i) => {
      expect(e.points[0]).toEqual(anchors[i]![0]); // source border anchor unmoved
      expect(e.points[e.points.length - 1]).toEqual(anchors[i]![1]); // target border anchor unmoved
      expect(e.points[1]!.y).toBe(e.points[2]!.y); // the crossbar stayed horizontal (both ends re-y'd together)
      expect(orthogonal(e)).toBe(true); // still a clean orthogonal staircase
      expect(e.path).toContain(" L "); // rebuilt path
    });
    // exact worked example: mean 306 ± 13 → retry 293, fail 319
    expect(jogY(retry)).toBe(293);
    expect(jogY(fail)).toBe(319);
  });

  it("is deterministic + idempotent (a spread pair is JOG_GAP apart → no longer collinear → never re-fires)", () => {
    const once = mkPair();
    separateAntiParallelJogs(once, "elbow");
    const twice = mkPair();
    separateAntiParallelJogs(twice, "elbow");
    separateAntiParallelJogs(twice, "elbow");
    expect(JSON.stringify(twice.map((e) => e.points))).toBe(JSON.stringify(once.map((e) => e.points)));
  });

  it("leaves clean edges byte-identical: non-reversed pair, already-apart pair, single edge, curved (FR3)", () => {
    // a non-reversed fan (A→B, A→C — different node pairs, no reverse) — untouched
    const fan: APEdge[] = [
      { from: "A", to: "B", points: [{ x: 114, y: 276 }, { x: 114, y: 306 }, { x: 147, y: 306 }, { x: 147, y: 336 }] },
      { from: "A", to: "C", points: [{ x: 84, y: 276 }, { x: 84, y: 306 }, { x: 46, y: 306 }, { x: 46, y: 336 }] },
    ];
    const fanBefore = JSON.stringify(fan);
    separateAntiParallelJogs(fan, "elbow");
    expect(JSON.stringify(fan)).toBe(fanBefore);

    // an anti-parallel pair whose jogs already differ (306 vs 340) — reads fine → skip
    const apart: APEdge[] = [
      { from: "A", to: "B", points: [{ x: 114, y: 276 }, { x: 114, y: 306 }, { x: 147, y: 306 }, { x: 147, y: 336 }] },
      { from: "B", to: "A", points: [{ x: 177, y: 336 }, { x: 177, y: 340 }, { x: 144, y: 340 }, { x: 144, y: 276 }] },
    ];
    const apartBefore = JSON.stringify(apart);
    separateAntiParallelJogs(apart, "elbow");
    expect(JSON.stringify(apart)).toBe(apartBefore);

    // a single edge — no pair → untouched
    const solo = [mkPair()[0]!];
    const soloBefore = JSON.stringify(solo);
    separateAntiParallelJogs(solo, "elbow");
    expect(JSON.stringify(solo)).toBe(soloBefore);

    // curved — the elbow-only pass no-ops
    const curved = mkPair();
    const curvedBefore = JSON.stringify(curved);
    separateAntiParallelJogs(curved, "curved");
    expect(JSON.stringify(curved)).toBe(curvedBefore);
  });
});

describe("separateConvergentJogs de-tangles a ≥3-edge convergence bundle at a node side (v0.6.5)", () => {
  type CEdge = {
    from: string;
    to: string;
    points: { x: number; y: number }[];
    path?: string;
    labelPos?: { x: number; y: number };
  };
  // Three edges from DIFFERENT sources all enter node R's top border (y=200) — each
  // with a border-adjacent horizontal jog at the identical y=170 (one merged crossbar
  // the anti-parallel pass, which groups by node pair, cannot touch). Ports at distinct
  // x; sources at distinct heights so ordering is unambiguous.
  const mkBundle = (): CEdge[] => [
    { from: "S1", to: "R", points: [{ x: 40, y: 40 }, { x: 40, y: 170 }, { x: 150, y: 170 }, { x: 150, y: 200 }] },
    { from: "S2", to: "R", points: [{ x: 300, y: 80 }, { x: 300, y: 170 }, { x: 180, y: 170 }, { x: 180, y: 200 }] },
    { from: "S3", to: "R", points: [{ x: 60, y: 120 }, { x: 60, y: 170 }, { x: 210, y: 170 }, { x: 210, y: 200 }] },
  ];
  const orthogonal = (e: CEdge): boolean =>
    e.points.every((p, i) => i === 0 || Math.abs(e.points[i - 1]!.x - p.x) < 1e-6 || Math.abs(e.points[i - 1]!.y - p.y) < 1e-6);
  const jogY = (e: CEdge): number => e.points[1]!.y; // the border-adjacent horizontal crossbar

  it("spreads the 3 collinear border jogs onto distinct lanes ≥ JOG_GAP apart, opening AWAY from the border", () => {
    const edges = mkBundle();
    const anchors = edges.map((e) => [{ ...e.points[0]! }, { ...e.points[e.points.length - 1]! }]);
    separateConvergentJogs(edges, "elbow");
    const ys = edges.map(jogY).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(26 - 1e-6);
    // every jog stays on the approach side of the border (y ≤ mean 170 < border 200) — no lane crosses the border
    for (const y of ys) expect(y).toBeLessThanOrEqual(170 + 1e-6);
    // the border-nearest lane keeps the bundle's original clearance (mean = 170)
    expect(Math.max(...ys)).toBe(170);
    edges.forEach((e, i) => {
      expect(e.points[0]).toEqual(anchors[i]![0]); // source anchor unmoved
      expect(e.points[e.points.length - 1]).toEqual(anchors[i]![1]); // target port unmoved
      expect(e.points[1]!.y).toBe(e.points[2]!.y); // crossbar stayed horizontal
      expect(orthogonal(e)).toBe(true);
    });
    // exact fan: sorted by far-end (source y 40/80/120) → lanes 118/144/170, biased so
    // the highest source (S1, y=40) turns FARTHEST from the border and the lowest (S3,
    // y=120) keeps the bundle's original border-nearest lane (170).
    const byId = Object.fromEntries(edges.map((e) => [e.from, jogY(e)]));
    expect(byId.S1).toBe(118);
    expect(byId.S2).toBe(144);
    expect(byId.S3).toBe(170);
    // the two moved edges rebuilt their path; S3 (already on the anchor lane) is byte-identical
    expect(edges.find((e) => e.from === "S1")!.path).toContain(" L ");
    expect(edges.find((e) => e.from === "S2")!.path).toContain(" L ");
    expect(edges.find((e) => e.from === "S3")!.path).toBeUndefined();
  });

  it("is deterministic + idempotent (a spread bundle is JOG_GAP apart → no longer collinear → never re-fires)", () => {
    const once = mkBundle();
    separateConvergentJogs(once, "elbow");
    const twice = mkBundle();
    separateConvergentJogs(twice, "elbow");
    separateConvergentJogs(twice, "elbow");
    expect(JSON.stringify(twice.map((e) => e.points))).toBe(JSON.stringify(once.map((e) => e.points)));
  });

  it("no-ops on a 2-edge bundle (left to the anti-parallel pass), an already-spread bundle, and any curved edge", () => {
    const two = mkBundle().slice(0, 2); // < CONVERGE_MIN (3) → untouched
    const twoBefore = JSON.stringify(two);
    separateConvergentJogs(two, "elbow");
    expect(JSON.stringify(two)).toBe(twoBefore);

    const spread = mkBundle();
    separateConvergentJogs(spread, "elbow"); // fan out once
    const spreadOnce = JSON.stringify(spread);
    separateConvergentJogs(spread, "elbow"); // already distinct → no change
    expect(JSON.stringify(spread)).toBe(spreadOnce);

    const curved = mkBundle();
    const curvedBefore = JSON.stringify(curved);
    separateConvergentJogs(curved, "curved");
    expect(JSON.stringify(curved)).toBe(curvedBefore);
  });

  it("does not touch the v0.6.2 anti-parallel case (2-edge node pair) — disjoint keys", () => {
    // an A→B / B→A anti-parallel pair (a single node pair, 2 edges) stays out of the
    // convergence pass (CONVERGE_MIN=3), so the two passes never double-move it.
    const pair: CEdge[] = [
      { from: "A", to: "B", points: [{ x: 114, y: 276 }, { x: 114, y: 306 }, { x: 147, y: 306 }, { x: 147, y: 336 }] },
      { from: "B", to: "A", points: [{ x: 177, y: 336 }, { x: 177, y: 306 }, { x: 144, y: 306 }, { x: 144, y: 276 }] },
    ];
    const before = JSON.stringify(pair);
    separateConvergentJogs(pair, "elbow");
    expect(JSON.stringify(pair)).toBe(before);
  });
});

describe("computePerimeterPorts de-skewers a lone-in / lone-out collinear pass-through (v0.6.5)", () => {
  // Node M with exactly one edge entering its top (from a node LEFT of centre) and one
  // leaving its bottom (to a node RIGHT of centre): the two head in opposite directions
  // but both land on offset 0 → a straight line appears to impale M.
  const M: NodeBox = { x: 400, y: 400, width: 120, height: 40 };
  const boxes = (): Map<string, NodeBox> =>
    new Map<string, NodeBox>([
      ["M", M],
      ["A", { x: 350, y: 250, width: 80, height: 40 }], // above + left of M
      ["B", { x: 450, y: 550, width: 80, height: 40 }], // below + right of M
    ]);

  it("nudges one port by PORT_STEP/2 toward its far node when the in/out head OPPOSITE ways", () => {
    const edges = [
      { from: "A", to: "M" },
      { from: "M", to: "B" },
    ];
    const ports = computePerimeterPorts(edges, boxes());
    expect(ports[0]!.target.side).toBe("top"); // A→M enters M top
    expect(ports[1]!.source.side).toBe("bottom"); // M→B leaves M bottom
    // top port (A→M) nudged left (toward A, x=350 < M.x=400) by 15; bottom stays centred
    expect(ports[0]!.target.offset).toBe(-15);
    expect(ports[1]!.source.offset).toBe(0);
  });

  it("leaves a genuine straight A→B→C pass-through (far nodes on the centre) byte-identical", () => {
    const b = boxes();
    b.set("A", { x: 400, y: 250, width: 80, height: 40 }); // directly above M
    b.set("B", { x: 400, y: 550, width: 80, height: 40 }); // directly below M
    const ports = computePerimeterPorts([{ from: "A", to: "M" }, { from: "M", to: "B" }], b);
    expect(ports[0]!.target.offset).toBe(0); // aligned → not a skewer → untouched
    expect(ports[1]!.source.offset).toBe(0);
  });

  it("leaves a lone-top-only node (no opposing bottom edge) untouched", () => {
    const ports = computePerimeterPorts([{ from: "A", to: "M" }], boxes());
    expect(ports[0]!.target.offset).toBe(0);
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
