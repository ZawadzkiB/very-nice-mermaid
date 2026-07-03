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

/**
 * How close (in user units) an interior waypoint must be to an endpoint anchor's
 * axis before we snap it onto that axis. Kills the sub-pixel jogs dagre leaves
 * when its border-intersection point lands a fraction off the node center, while
 * staying far below a real detour lane (≥ one nodesep away).
 */
const WAYPOINT_SNAP = 2;

/** Snap interior waypoints onto an endpoint anchor's axis when within tolerance. */
function snapWaypoints(interior: Point[], start: Point, end: Point): Point[] {
  const xs = [start.x, end.x];
  const ys = [start.y, end.y];
  return interior.map((p) => {
    let { x, y } = p;
    for (const ax of xs) {
      if (Math.abs(x - ax) <= WAYPOINT_SNAP) {
        x = ax;
        break;
      }
    }
    for (const ay of ys) {
      if (Math.abs(y - ay) <= WAYPOINT_SNAP) {
        y = ay;
        break;
      }
    }
    return { x, y };
  });
}

/**
 * Turn a guide polyline (border anchor → dagre's interior bend points → border
 * anchor) into a clean orthogonal staircase: leave the source and enter the
 * target perpendicular to their borders, and insert an L-corner wherever two
 * consecutive guide points are diagonal to each other.
 */
function elbowThrough(
  start: Point,
  end: Point,
  interior: Point[],
  sides: { exitVertical: boolean; entryVertical: boolean; primaryVertical: boolean },
): Point[] {
  const guide = [start, ...snapWaypoints(interior, start, end), end];
  const out: Point[] = [guide[0]!];
  for (let i = 1; i < guide.length; i++) {
    const prev = out[out.length - 1]!;
    const cur = guide[i]!;
    if (n(prev.x) !== n(cur.x) && n(prev.y) !== n(cur.y)) {
      // First segment leaves the source perpendicular; last segment enters the
      // target perpendicular; interior corners follow the layout's primary axis.
      let verticalFirst: boolean;
      if (i === 1) verticalFirst = sides.exitVertical;
      else if (i === guide.length - 1) verticalFirst = !sides.entryVertical;
      else verticalFirst = sides.primaryVertical;
      out.push(verticalFirst ? { x: prev.x, y: cur.y } : { x: cur.x, y: prev.y });
    }
    out.push(cur);
  }
  return simplify(out);
}

/**
 * Orthogonal elbow waypoints leaving/entering perpendicular to the borders.
 * When `waypoints` (dagre's interior multi-rank bend points) are supplied, the
 * route is threaded through them so it skirts intervening node boxes; otherwise
 * it falls back to the naive single-bend elbow between the two borders.
 */
export function routeElbow(
  from: NodeBox,
  to: NodeBox,
  direction: Direction,
  waypoints: Point[] = [],
): Point[] {
  if (from === to || (from.x === to.x && from.y === to.y)) {
    return selfLoop(from);
  }
  const { exit, entry } = pickSides(from, to, direction);
  const start = sidePoint(from, exit);
  const end = sidePoint(to, entry);
  const horizontal = exit === "left" || exit === "right";
  if (waypoints.length > 0) {
    return elbowThrough(start, end, waypoints, {
      exitVertical: !horizontal,
      entryVertical: entry === "top" || entry === "bottom",
      primaryVertical: !isHorizontalLayout(direction),
    });
  }
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

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** A point `r` units from `from` toward `toward`. */
function along(from: Point, toward: Point, r: number): Point {
  const d = dist(from, toward) || 1;
  return {
    x: from.x + ((toward.x - from.x) * r) / d,
    y: from.y + ((toward.y - from.y) * r) / d,
  };
}

/**
 * Render an orthogonal polyline as a smooth path by rounding each corner with a
 * short quadratic arc — the curved edge style's take on a routed (multi-rank)
 * edge, so it flows around intervening nodes instead of cutting a straight line.
 */
export function roundedPath(points: Point[], radius = 12): string {
  if (points.length <= 2) return toPath(points, "elbow");
  let d = `M ${n(points[0]!.x)} ${n(points[0]!.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const r = Math.min(radius, dist(prev, cur) / 2, dist(cur, next) / 2);
    const a = along(cur, prev, r);
    const b = along(cur, next, r);
    d += ` L ${n(a.x)} ${n(a.y)} Q ${n(cur.x)} ${n(cur.y)} ${n(b.x)} ${n(b.y)}`;
  }
  const last = points[points.length - 1]!;
  d += ` L ${n(last.x)} ${n(last.y)}`;
  return d;
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

/**
 * Route an edge end-to-end: waypoints, SVG path, and label position. Optional
 * `waypoints` are dagre's interior multi-rank bend points; when present the
 * route is threaded through them (a rounded path for the curved style, an
 * orthogonal staircase for elbow) so it skirts intervening node boxes.
 */
export function routeEdge(
  from: NodeBox,
  to: NodeBox,
  direction: Direction,
  style: EdgeStyle,
  waypoints: Point[] = [],
): { points: Point[]; path: string; labelPos: Point } {
  const selfish = from === to || (from.x === to.x && from.y === to.y);
  if (style === "curved" && waypoints.length > 0 && !selfish) {
    const points = routeElbow(from, to, direction, waypoints);
    return { points, path: roundedPath(points), labelPos: labelPoint(points, "elbow") };
  }
  if (style === "curved") {
    const points = routeCurved(from, to, direction);
    return { points, path: toPath(points, "curved"), labelPos: labelPoint(points, "curved") };
  }
  const points = routeElbow(from, to, direction, waypoints);
  return { points, path: toPath(points, "elbow"), labelPos: labelPoint(points, "elbow") };
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
