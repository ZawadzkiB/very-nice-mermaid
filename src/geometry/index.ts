/**
 * Edge geometry: border anchoring + orthogonal **elbow** routing and a
 * **curved** (bezier) variant, plus content-bounds. Pure functions — no DOM, no
 * state — so the same routing powers the static SVG and the live DOM renderer.
 *
 * Node boxes are **center-based** (`x`/`y` = center), matching PositionedNode.
 */

import type { Direction, Point, Rect, Shape } from "../model/index.js";
import type { EdgeStyle } from "../theme/index.js";

/**
 * A center-based rectangle. `shape` (optional) is the node's drawn outline kind:
 * when present it lets {@link sidePoint} land a channel-spread anchor on the real
 * (tapered / rounded) outline instead of the bounding box, so an arrowhead never
 * floats beside a diamond / circle / hexagon / … . Absent (or `rect`) → the box
 * border *is* the outline and anchoring is unchanged (backward-compatible).
 */
export interface NodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: Shape;
}

export type Side = "top" | "bottom" | "left" | "right";

/**
 * A resolved **perimeter anchor** for one edge endpoint: which border `side` the
 * edge attaches to (chosen by the direction to the other node — see
 * {@link raySide}) and the `offset` that slides it along that side (in
 * {@link sidePoint}'s convention) to spread edges that share a side onto their
 * own channels.
 */
export interface EdgeAnchor {
  side: Side;
  offset: number;
}

/**
 * A **manual per-anchor override** (FR7 / D7=A) pinning one or both of an edge's
 * endpoints to an explicit `{ side, offset }` on the node border. A pinned end is
 * used verbatim and **excluded** from the auto-distribute spread; the other end
 * (left `undefined`) keeps auto-distributing. Persisted in the layout sidecar,
 * cleared by reset-layout, and honored by both the static SVG and the runtime.
 */
export interface EdgeAnchorOverride {
  source?: EdgeAnchor;
  target?: EdgeAnchor;
  /**
   * Endpoint identity (REV-007) — the pinned edge's `from`/`to` node ids, stored
   * alongside the index-keyed pin so an imported `layout.json` can confirm the
   * index still refers to the *same* edge (and re-map it if the diagram's edges
   * were reordered). Optional and **backward-compatible**: sidecars written before
   * REV-007 omit them and are validated by bounds only. Ignored by the geometry —
   * only the import validators (`applyPositions`, the runtime's `importLayout`)
   * read them.
   */
  from?: string;
  to?: string;
}

/** Per-edge perimeter anchoring: a {@link EdgeAnchor} at each endpoint. */
export interface EdgePorts {
  source: EdgeAnchor;
  target: EdgeAnchor;
  /**
   * Absolute world-space shift applied to the edge's label plate. Several edges
   * between the **same node pair** (an anti-parallel or parallel bundle) place
   * their labels at ~the same midpoint, so their opaque background plates overlap
   * and clip each other's text — the channel offset separates the *lines* but not
   * the wider *labels* (TEST-006). This staggers each label along the pair's
   * dominant axis by enough to clear the neighbouring plate. Left undefined for
   * ordinary single-label edges (and fans, whose targets layout already spreads).
   */
  labelShift?: Point;
}

/** Keep a spread anchor at least this many units inside a border corner. */
const PORT_MARGIN = 6;
/** Preferred gap between adjacent spread anchors on a shared border. */
const PORT_STEP = 20;
/** Cap the total spread to this fraction of the border length. */
const PORT_SPREAD_FRAC = 0.7;
/** Extra clearance between two staggered label plates (world units). */
const PORT_LABEL_PAD = 6;

/** Round to 2 decimals for deterministic, compact SVG output. */
export function n(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Clamp an anchor offset to `±bound` (never past a corner / off a cap). */
function clampOffset(offset: number, bound: number): number {
  const max = Math.max(0, bound);
  return Math.max(-max, Math.min(max, offset));
}

/**
 * Furthest a tangential anchor may slide from a side's center and still be
 * projectable onto the drawn outline (keeping {@link PORT_MARGIN} off any corner
 * or rounded cap). For the **rounded family** (rounded / stadium / subroutine)
 * and the flat sides of the hexagon / parallelogram / cylinder this trims the
 * span to the *flat* part of the side; the tapered / curved sides keep the full
 * span and are projected inward by {@link outlinePoint}. Mirrors the runtime
 * twin's `anchorBound` — keep them in lockstep (dom-runtime-parity guards it).
 */
function anchorBound(shape: Shape, side: Side, hw: number, hh: number): number {
  const horiz = side === "top" || side === "bottom";
  const half = horiz ? hw : hh;
  const cap = half - PORT_MARGIN;
  switch (shape) {
    case "rounded":
      return Math.min(cap, half - 14);
    case "stadium": // rx = hh on both axes (fully-rounded ends)
      return Math.min(cap, half - hh);
    case "hexagon": // flat top/bottom; sloped ends are projected
      return horiz ? Math.min(cap, half - Math.min(hw * 0.44, hh)) : cap;
    case "parallelogram":
    case "parallelogram-alt": // flat top/bottom; slanted ends are projected
      return horiz ? Math.min(cap, half - Math.min(hw * 0.44, 2 * hh)) : cap;
    case "cylinder": // curved caps (projected) top/bottom; flat body left/right
      return horiz ? cap : Math.min(cap, half - Math.min(10, hh * 0.36));
    default: // rect / subroutine (rx 4 ≤ margin) / circle / diamond
      return cap;
  }
}

/**
 * Project a border anchor at (already-clamped) tangential offset `t` onto the
 * node's **actual outline** for its {@link Shape}, insetting along the inward
 * normal. Mirrors the shapes drawn by `nodeShape` (src/render/svg.ts) and the
 * runtime twin's `anchor` — the returned point lies on (or just inside) the
 * drawn shape, never beside it. `rect` and the flat sides return the plain box
 * border. Keep in lockstep with the runtime.
 */
function outlinePoint(
  shape: Shape,
  side: Side,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  t: number,
): Point {
  switch (side) {
    case "top":
    case "bottom": {
      const sgn = side === "top" ? -1 : 1;
      let y = cy + sgn * hh;
      if (shape === "diamond") y = cy + sgn * hh * (1 - Math.abs(t) / hw);
      else if (shape === "circle") y = cy + sgn * hh * Math.sqrt(1 - (t / hw) * (t / hw));
      else if (shape === "cylinder") {
        const ry = Math.min(10, hh * 0.36);
        y = cy + sgn * (hh - ry + ry * Math.sqrt(1 - (t / hw) * (t / hw)));
      }
      return { x: cx + t, y };
    }
    case "left":
    case "right": {
      const sgn = side === "left" ? -1 : 1;
      let x = cx + sgn * hw;
      if (shape === "diamond") x = cx + sgn * hw * (1 - Math.abs(t) / hh);
      else if (shape === "circle") x = cx + sgn * hw * Math.sqrt(1 - (t / hh) * (t / hh));
      else if (shape === "hexagon") {
        const k = Math.min(hw * 0.44, hh);
        x = cx + sgn * (hw - (k * Math.abs(t)) / hh);
      } else if (shape === "parallelogram") {
        const k = Math.min(hw * 0.44, 2 * hh);
        x = side === "left" ? cx - hw + (k * (hh - t)) / (2 * hh) : cx + hw - (k * (t + hh)) / (2 * hh);
      } else if (shape === "parallelogram-alt") {
        const k = Math.min(hw * 0.44, 2 * hh);
        x = side === "left" ? cx - hw + (k * (t + hh)) / (2 * hh) : cx + hw - (k * (hh - t)) / (2 * hh);
      }
      return { x, y: cy + t };
    }
  }
}

/**
 * Anchor point on one side of a box. `offset` slides it along that border
 * (perpendicular to the side's normal); it is clamped to stay on the side and,
 * for a non-rectangular {@link NodeBox.shape}, **projected onto the shape's real
 * outline** so a channel-spread endpoint never lands off a tapered / rounded
 * shape (the arrowhead-floats-in-empty-space bug). Used to spread several edges
 * that share the same node side onto distinct channels.
 */
export function sidePoint(box: NodeBox, side: Side, offset = 0): Point {
  const hw = box.width / 2;
  const hh = box.height / 2;
  const shape: Shape = box.shape ?? "rect";
  const t = clampOffset(offset, anchorBound(shape, side, hw, hh));
  return outlinePoint(shape, side, box.x, box.y, hw, hh, t);
}

/**
 * Which border side a ray from a node's center in direction `(dx, dy)` exits.
 * **Aspect-aware**: a wide-and-short node sends near-diagonal rays out its long
 * top/bottom edges, a tall one out its sides — so anchors distribute around the
 * *whole perimeter* in proportion to it. Deterministic; a corner tie resolves to
 * the top/bottom side.
 */
export function raySide(box: NodeBox, dx: number, dy: number): Side {
  const sx = dx !== 0 ? box.width / 2 / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? box.height / 2 / Math.abs(dy) : Infinity;
  if (sx < sy) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

/**
 * **Perimeter anchor distribution (FR2 / D1=A).** Each edge attaches to a point
 * on a node's *whole perimeter* chosen by the direction to its other endpoint
 * ({@link raySide}, aspect-aware) so a hub's connections fan out across all four
 * borders instead of clustering on the layout's primary axis. Edges that still
 * share a border side are then spread onto distinct, parallel channels. Two
 * effects, one mechanism:
 *   - **anti-parallel** edges between the same pair (e.g. `Running --> Paused`
 *     and `Paused --> Running`) stop rendering exactly on top of each other, and
 *   - a **fan** of edges leaving one node stops sharing a single start point, so
 *     a relation's start marker (composition diamond, inheritance triangle) sits
 *     unambiguously on its own edge instead of the shared trunk.
 *
 * Deterministic: endpoints on a border are ordered by the *other* end's position
 * along that border (then edge index), so an edge keeps the same side at both of
 * its ends and the channels don't cross. A border with a single edge keeps a zero
 * offset (attaches at the side center). Returns one {@link EdgePorts} per input
 * edge; self-loops / degenerate edges get a harmless default (routing ignores it).
 *
 * When `labelSizes` is supplied (one plate `{ w, h }` per *labelled* edge, else
 * `undefined`), edges that share the same node pair also get a `labelShift` that
 * staggers their label plates along the pair's dominant axis so they don't stack
 * and clip (TEST-006). Fans (edges to different targets) never group here, so
 * their labels — already spread by the layout — are untouched.
 */
export function computePerimeterPorts(
  edges: ReadonlyArray<{ from: string; to: string }>,
  boxes: Map<string, NodeBox>,
  labelSizes?: ReadonlyArray<{ w: number; h: number } | undefined>,
  overrides?: ReadonlyArray<EdgeAnchorOverride | undefined>,
): EdgePorts[] {
  const result: EdgePorts[] = edges.map(() => ({
    source: { side: "bottom" as Side, offset: 0 },
    target: { side: "top" as Side, offset: 0 },
  }));
  interface Rec {
    edgeIndex: number;
    role: "source" | "target";
    along: number;
  }
  const groups = new Map<string, Rec[]>();
  const groupNode = new Map<string, string>();

  const add = (nodeId: string, side: Side, rec: Rec): void => {
    const key = nodeId + "|" + side;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(rec);
    groupNode.set(key, nodeId);
  };

  const axisX = (s: Side): boolean => s === "top" || s === "bottom";
  edges.forEach((e, i) => {
    const from = boxes.get(e.from);
    const to = boxes.get(e.to);
    if (!from || !to) return;
    if (from === to || (from.x === to.x && from.y === to.y)) return; // self-loop
    const exit = raySide(from, to.x - from.x, to.y - from.y);
    const entry = raySide(to, from.x - to.x, from.y - to.y);
    // A manually pinned end (FR7) is used verbatim and does NOT join the spread
    // groups, so it stays put while its unpinned siblings auto-distribute.
    const ov = overrides?.[i];
    if (ov?.source) {
      result[i]!.source = { side: ov.source.side, offset: ov.source.offset };
    } else {
      result[i]!.source = { side: exit, offset: 0 };
      add(e.from, exit, { edgeIndex: i, role: "source", along: axisX(exit) ? to.x : to.y });
    }
    if (ov?.target) {
      result[i]!.target = { side: ov.target.side, offset: ov.target.offset };
    } else {
      result[i]!.target = { side: entry, offset: 0 };
      add(e.to, entry, { edgeIndex: i, role: "target", along: axisX(entry) ? from.x : from.y });
    }
  });

  for (const [key, recs] of groups) {
    if (recs.length < 2) continue;
    const side = key.slice(key.lastIndexOf("|") + 1) as Side;
    const box = boxes.get(groupNode.get(key)!)!;
    const borderLen = side === "top" || side === "bottom" ? box.width : box.height;
    recs.sort(
      (a, b) => a.along - b.along || a.edgeIndex - b.edgeIndex || a.role.localeCompare(b.role),
    );
    const k = recs.length;
    const step = Math.min(PORT_STEP, (borderLen * PORT_SPREAD_FRAC) / (k - 1));
    recs.forEach((r, slot) => {
      result[r.edgeIndex]![r.role].offset = (slot - (k - 1) / 2) * step;
    });
  }

  if (labelSizes) computeLabelShifts(edges, boxes, labelSizes, result);
  return result;
}

/**
 * Stagger the labels of edges that share the same node pair so their plates stop
 * overlapping. Groups by the *unordered* pair (so both a `A→B`/`B→A` anti-parallel
 * pair and duplicate `A→B` edges qualify, but a fan of edges to different targets
 * does not), then packs each group's plates end-to-end along the pair's dominant
 * axis and centres them on the shared midpoint. Mirrors the runtime twin in
 * `src/render/dom/runtime.ts` — keep the two in lockstep.
 */
function computeLabelShifts(
  edges: ReadonlyArray<{ from: string; to: string }>,
  boxes: Map<string, NodeBox>,
  labelSizes: ReadonlyArray<{ w: number; h: number } | undefined>,
  result: EdgePorts[],
): void {
  const pairs = new Map<string, number[]>();
  edges.forEach((e, i) => {
    if (!labelSizes[i]) return; // only labelled edges can collide
    const a = boxes.get(e.from);
    const b = boxes.get(e.to);
    if (!a || !b || (a.x === b.x && a.y === b.y)) return;
    // Unordered-pair key; "|" can never occur in a node id ([A-Za-z0-9_]+), so
    // distinct pairs never collide. Keep this delimiter in lockstep with the
    // runtime twin (src/render/dom/runtime.ts).
    const key = e.from < e.to ? e.from + "|" + e.to : e.to + "|" + e.from;
    (pairs.get(key) ?? pairs.set(key, []).get(key)!).push(i);
  });
  for (const idxs of pairs.values()) {
    if (idxs.length < 2) continue;
    idxs.sort((x, y) => x - y);
    const first = edges[idxs[0]!]!;
    const a = boxes.get(first.from)!;
    const b = boxes.get(first.to)!;
    const runX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const extent = (i: number): number => (runX ? labelSizes[i]!.w : labelSizes[i]!.h);
    // Pack plate centres so consecutive plates just clear (half+half+pad apart).
    const pos: number[] = [0];
    for (let s = 1; s < idxs.length; s++) {
      pos.push(pos[s - 1]! + (extent(idxs[s - 1]!) + extent(idxs[s]!)) / 2 + PORT_LABEL_PAD);
    }
    const center = (pos[0]! + pos[pos.length - 1]!) / 2;
    idxs.forEach((i, s) => {
      const d = pos[s]! - center;
      result[i]!.labelShift = runX ? { x: d, y: 0 } : { x: 0, y: d };
    });
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
 * Resolve an edge's two border anchors. When `ports` (perimeter anchors from
 * {@link computePerimeterPorts}) are supplied, both endpoints attach to the
 * chosen side at the spread offset; otherwise fall back to {@link pickSides}
 * with a zero offset (the naive, unspread route used by direct callers/tests).
 */
function resolveEnds(
  from: NodeBox,
  to: NodeBox,
  direction: Direction,
  ports?: EdgePorts,
): { exit: Side; entry: Side; start: Point; end: Point } {
  if (ports) {
    const exit = ports.source.side;
    const entry = ports.target.side;
    return {
      exit,
      entry,
      start: sidePoint(from, exit, ports.source.offset),
      end: sidePoint(to, entry, ports.target.offset),
    };
  }
  const { exit, entry } = pickSides(from, to, direction);
  return { exit, entry, start: sidePoint(from, exit), end: sidePoint(to, entry) };
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
  ports?: EdgePorts,
): Point[] {
  if (from === to || (from.x === to.x && from.y === to.y)) {
    return selfLoop(from);
  }
  const { exit, entry, start, end } = resolveEnds(from, to, direction, ports);
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
  ports?: EdgePorts,
): Point[] {
  if (from === to || (from.x === to.x && from.y === to.y)) {
    return selfLoop(from);
  }
  const { exit, entry, start, end } = resolveEnds(from, to, direction, ports);
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
  ports?: EdgePorts,
): { points: Point[]; path: string; labelPos: Point } {
  const selfish = from === to || (from.x === to.x && from.y === to.y);
  const shift = ports?.labelShift;
  const lp = (p: Point): Point => (shift ? { x: p.x + shift.x, y: p.y + shift.y } : p);
  if (style === "curved" && waypoints.length > 0 && !selfish) {
    const points = routeElbow(from, to, direction, waypoints, ports);
    return { points, path: roundedPath(points), labelPos: lp(labelPoint(points, "elbow")) };
  }
  if (style === "curved") {
    const points = routeCurved(from, to, direction, ports);
    return { points, path: toPath(points, "curved"), labelPos: lp(labelPoint(points, "curved")) };
  }
  const points = routeElbow(from, to, direction, waypoints, ports);
  return { points, path: toPath(points, "elbow"), labelPos: lp(labelPoint(points, "elbow")) };
}

/** Gap between a subgraph container's border and its member nodes (FR6). */
export const SUBGRAPH_PADDING = 14;
/** Extra top space a titled subgraph reserves for its title band (FR6). */
export const SUBGRAPH_TITLE_BAND = 18;

/**
 * **Auto-contain box (FR6 / D6=C).** Recompute a subgraph container's box so it
 * hugs its member nodes' live boxes — the tight bounding rect of the members plus
 * {@link SUBGRAPH_PADDING} on every side and an extra {@link SUBGRAPH_TITLE_BAND}
 * on top when the container is titled. Center-based, deterministic. Returns
 * `null` when there are no members (the caller keeps the previous box). Shared by
 * the static SVG (`layout` / `applyPositions`) and the inlined DOM runtime so a
 * container follows / re-hugs its children identically (parity-guarded).
 */
export function subgraphBox(memberBoxes: NodeBox[], hasTitle: boolean): NodeBox | null {
  if (memberBoxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of memberBoxes) {
    minX = Math.min(minX, b.x - b.width / 2);
    minY = Math.min(minY, b.y - b.height / 2);
    maxX = Math.max(maxX, b.x + b.width / 2);
    maxY = Math.max(maxY, b.y + b.height / 2);
  }
  const top = SUBGRAPH_PADDING + (hasTitle ? SUBGRAPH_TITLE_BAND : 0);
  const x0 = minX - SUBGRAPH_PADDING;
  const y0 = minY - top;
  const x1 = maxX + SUBGRAPH_PADDING;
  const y1 = maxY + SUBGRAPH_PADDING;
  return { x: n((x0 + x1) / 2), y: n((y0 + y1) / 2), width: n(x1 - x0), height: n(y1 - y0) };
}

/** A subgraph's shape needed to recompute its box: id, membership, title flag. */
export interface SubgraphShape {
  id: string;
  title?: string;
  children: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resolve the full set of member **node** ids for a subgraph, expanding any
 * child that is itself a subgraph id recursively (a nested container contributes
 * all its descendant nodes). Cycle-guarded via `seen`.
 */
function resolveMemberNodes(
  id: string,
  childrenById: Map<string, string[]>,
  isNode: (id: string) => boolean,
  seen: Set<string>,
): string[] {
  const out: string[] = [];
  for (const child of childrenById.get(id) ?? []) {
    if (isNode(child)) out.push(child);
    else if (childrenById.has(child) && !seen.has(child)) {
      seen.add(child);
      out.push(...resolveMemberNodes(child, childrenById, isNode, seen));
    }
  }
  return out;
}

/**
 * Recompute every subgraph's container box from the current node boxes so each
 * hugs its members (auto-contain, FR6 / D6=C). Membership is resolved recursively
 * so nested containers nest correctly. Deterministic. A subgraph with no
 * resolvable members keeps its prior box. Returns a map id → recomputed box.
 */
export function computeSubgraphBoxes(
  subgraphs: ReadonlyArray<SubgraphShape>,
  nodeBoxes: Map<string, NodeBox>,
): Map<string, NodeBox> {
  const childrenById = new Map<string, string[]>(subgraphs.map((sg) => [sg.id, sg.children]));
  const isNode = (id: string): boolean => nodeBoxes.has(id);
  const result = new Map<string, NodeBox>();
  for (const sg of subgraphs) {
    const memberIds = resolveMemberNodes(sg.id, childrenById, isNode, new Set([sg.id]));
    const memberBoxes = memberIds.map((id) => nodeBoxes.get(id)!);
    const box = subgraphBox(memberBoxes, !!sg.title);
    result.set(sg.id, box ?? { x: sg.x, y: sg.y, width: sg.width, height: sg.height });
  }
  return result;
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
