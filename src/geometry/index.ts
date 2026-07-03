/**
 * Edge geometry: border anchoring + orthogonal **elbow** routing and a
 * **curved** (bezier) variant, plus content-bounds. Pure functions — no DOM, no
 * state — so the same routing powers the static SVG and the live DOM renderer.
 *
 * Node boxes are **center-based** (`x`/`y` = center), matching PositionedNode.
 */

import type { Direction, Point, Rect } from "../model/index.js";
import type { EdgeStyle } from "../theme/index.js";

/** A center-based rectangle. */
export interface NodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Side = "top" | "bottom" | "left" | "right";

/** Round to 2 decimals for deterministic, compact SVG output. */
export function n(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Midpoint of one side of a box (the perpendicular anchor point). */
export function sidePoint(box: NodeBox, side: Side): Point {
  const hw = box.width / 2;
  const hh = box.height / 2;
  switch (side) {
    case "top":
      return { x: box.x, y: box.y - hh };
    case "bottom":
      return { x: box.x, y: box.y + hh };
    case "left":
      return { x: box.x - hw, y: box.y };
    case "right":
      return { x: box.x + hw, y: box.y };
  }
}

const isHorizontalLayout = (d: Direction): boolean => d === "LR" || d === "RL";

/**
 * Pick which borders the edge leaves and enters, biased by layout direction but
 * flipping to the perpendicular axis when the cross-delta clearly dominates
 * (aspect-aware): an LR edge to a node mostly *below* exits the bottom, not the
 * right.
 */
export function pickSides(
  from: NodeBox,
  to: NodeBox,
  direction: Direction,
): { exit: Side; entry: Side } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let axis: "x" | "y";
  if (isHorizontalLayout(direction)) {
    axis = Math.abs(dx) >= Math.abs(dy) * 0.5 ? "x" : "y";
  } else {
    axis = Math.abs(dy) >= Math.abs(dx) * 0.5 ? "y" : "x";
  }
  if (axis === "x") {
    return dx >= 0
      ? { exit: "right", entry: "left" }
      : { exit: "left", entry: "right" };
  }
  return dy >= 0
    ? { exit: "bottom", entry: "top" }
    : { exit: "top", entry: "bottom" };
}

/** Drop consecutive duplicate and exactly-collinear waypoints. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && n(last.x) === n(p.x) && n(last.y) === n(p.y)) continue;
    out.push(p);
  }
  // remove collinear middles
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1]!;
    const b = out[i]!;
    const c = out[i + 1]!;
    const collinear =
      (n(a.x) === n(b.x) && n(b.x) === n(c.x)) ||
      (n(a.y) === n(b.y) && n(b.y) === n(c.y));
    if (collinear) out.splice(i, 1);
  }
  return out;
}

/** Orthogonal elbow waypoints leaving/entering perpendicular to the borders. */
export function routeElbow(
  from: NodeBox,
  to: NodeBox,
  direction: Direction,
): Point[] {
  if (from === to || (from.x === to.x && from.y === to.y)) {
    return selfLoop(from);
  }
  const { exit, entry } = pickSides(from, to, direction);
  const start = sidePoint(from, exit);
  const end = sidePoint(to, entry);
  const horizontal = exit === "left" || exit === "right";
  let points: Point[];
  if (horizontal) {
    const midX = (start.x + end.x) / 2;
    points = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  } else {
    const midY = (start.y + end.y) / 2;
    points = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
  }
  return simplify(points);
}

/** Bezier control knots (`[start, c1, c2, end]`) for the curved edge style. */
export function routeCurved(
  from: NodeBox,
  to: NodeBox,
  direction: Direction,
): Point[] {
  if (from === to || (from.x === to.x && from.y === to.y)) {
    return selfLoop(from);
  }
  const { exit, entry } = pickSides(from, to, direction);
  const start = sidePoint(from, exit);
  const end = sidePoint(to, entry);
  const horizontal = exit === "left" || exit === "right";
  const k = horizontal
    ? Math.max(24, Math.abs(end.x - start.x) * 0.5)
    : Math.max(24, Math.abs(end.y - start.y) * 0.5);
  const c1 = offsetAlong(start, exit, k);
  const c2 = offsetAlong(end, entry, k);
  return [start, c1, c2, end];
}

function offsetAlong(p: Point, side: Side, k: number): Point {
  switch (side) {
    case "top":
      return { x: p.x, y: p.y - k };
    case "bottom":
      return { x: p.x, y: p.y + k };
    case "left":
      return { x: p.x - k, y: p.y };
    case "right":
      return { x: p.x + k, y: p.y };
  }
}

/** A small self-loop on the right side of a node. */
function selfLoop(box: NodeBox): Point[] {
  const r = sidePoint(box, "right");
  const t = sidePoint(box, "top");
  const off = Math.max(24, box.height * 0.6);
  return [
    r,
    { x: r.x + off, y: r.y },
    { x: r.x + off, y: t.y - off },
    { x: t.x, y: t.y - off },
    t,
  ];
}

/** Build the SVG path `d` for a routed edge (elbow polyline or bezier). */
export function toPath(points: Point[], style: EdgeStyle): string {
  if (points.length === 0) return "";
  const first = points[0]!;
  if (style === "curved" && points.length === 4) {
    const [, c1, c2, end] = points as [Point, Point, Point, Point];
    return `M ${n(first.x)} ${n(first.y)} C ${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(
      c2.y,
    )} ${n(end.x)} ${n(end.y)}`;
  }
  let d = `M ${n(first.x)} ${n(first.y)}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    d += ` L ${n(p.x)} ${n(p.y)}`;
  }
  return d;
}

/** Where an edge's label plate should sit (a stable midpoint of the route). */
export function labelPoint(points: Point[], style: EdgeStyle): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (style === "curved" && points.length === 4) {
    const [p0, c1, c2, p3] = points as [Point, Point, Point, Point];
    return {
      x: n(0.125 * p0.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p3.x),
      y: n(0.125 * p0.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p3.y),
    };
  }
  // midpoint of the longest interior segment (or the whole segment for a line)
  if (points.length === 2) {
    return {
      x: n((points[0]!.x + points[1]!.x) / 2),
      y: n((points[0]!.y + points[1]!.y) / 2),
    };
  }
  const mid = Math.floor(points.length / 2);
  const a = points[mid - 1]!;
  const b = points[mid]!;
  return { x: n((a.x + b.x) / 2), y: n((a.y + b.y) / 2) };
}

/** Route an edge end-to-end: waypoints, SVG path, and label position. */
export function routeEdge(
  from: NodeBox,
  to: NodeBox,
  direction: Direction,
  style: EdgeStyle,
): { points: Point[]; path: string; labelPos: Point } {
  const points = style === "curved" ? routeCurved(from, to, direction) : routeElbow(from, to, direction);
  return { points, path: toPath(points, style), labelPos: labelPoint(points, style) };
}

/** Bounding rect over every box (and optional extra points), plus padding. */
export function contentBounds(
  boxes: NodeBox[],
  extraPoints: Point[] = [],
  padding = 0,
): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x - b.width / 2);
    minY = Math.min(minY, b.y - b.height / 2);
    maxX = Math.max(maxX, b.x + b.width / 2);
    maxY = Math.max(maxY, b.y + b.height / 2);
  }
  for (const p of extraPoints) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: n(minX - padding),
    y: n(minY - padding),
    width: n(maxX - minX + padding * 2),
    height: n(maxY - minY + padding * 2),
  };
}
