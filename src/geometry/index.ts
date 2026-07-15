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
/**
 * Preferred gap between adjacent spread anchors on a shared border (FR4). Wide
 * enough that a fan-in of several edges keeps its arrowheads individually
 * distinguishable instead of merging into one bunch. It is a *ceiling* for small
 * fans; a large fan on a wide node instead uses the border-filling cap below so a
 * busy hub spreads across (almost) the whole side. Mirrored in the runtime twin.
 */
const PORT_STEP = 30;
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
 *
 * When `bends` is supplied (one interior-bend list per edge, `undefined`/`[]` for
 * a straight edge), a shared border's ports are ordered by where each edge
 * actually *heads* — its first interior bend at the source end, its last at the
 * target end — instead of the far node's centre. An edge dagre steered around an
 * obstacle leaves toward its detour, not its destination centre, so centre-order
 * would cross it over a sibling that leaves straight; heading-order keeps them
 * un-knotted. A straight edge (no bends) falls back to the far centre, so any
 * diagram without detours keeps its previous ordering byte-for-byte.
 */
export function computePerimeterPorts(
  edges: ReadonlyArray<{ from: string; to: string }>,
  boxes: Map<string, NodeBox>,
  labelSizes?: ReadonlyArray<{ w: number; h: number } | undefined>,
  overrides?: ReadonlyArray<EdgeAnchorOverride | undefined>,
  bends?: ReadonlyArray<ReadonlyArray<{ x: number; y: number }> | undefined>,
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
    // Order ports by the edge's actual heading (first bend at the source, last at
    // the target) so a detoured edge takes the port on its detour's side; straight
    // edges fall back to the far node's centre (unchanged output).
    const wp = bends?.[i];
    const srcHead = wp && wp.length ? wp[0]! : to;
    const tgtHead = wp && wp.length ? wp[wp.length - 1]! : from;
    // A manually pinned end (FR7) is used verbatim and does NOT join the spread
    // groups, so it stays put while its unpinned siblings auto-distribute.
    const ov = overrides?.[i];
    if (ov?.source) {
      result[i]!.source = { side: ov.source.side, offset: ov.source.offset };
    } else {
      result[i]!.source = { side: exit, offset: 0 };
      add(e.from, exit, { edgeIndex: i, role: "source", along: axisX(exit) ? srcHead.x : srcHead.y });
    }
    if (ov?.target) {
      result[i]!.target = { side: ov.target.side, offset: ov.target.offset };
    } else {
      result[i]!.target = { side: entry, offset: 0 };
      add(e.to, entry, { edgeIndex: i, role: "target", along: axisX(entry) ? tgtHead.x : tgtHead.y });
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
    // Spread the k anchors evenly, capped by the preferred {@link PORT_STEP}
    // (keeps small fans tight) OR — for a large fan on a wide border — the
    // *border-filling* step that lands the two extreme anchors exactly on
    // {@link anchorBound} (borderLen/2 − PORT_MARGIN), i.e. as wide as the side
    // allows without pushing an anchor past the corner. This lets a busy hub's
    // fan-in use (almost) the whole node width instead of bunching at PORT_STEP.
    const step = Math.min(PORT_STEP, (borderLen - 2 * PORT_MARGIN) / (k - 1));
    recs.forEach((r, slot) => {
      result[r.edgeIndex]![r.role].offset = (slot - (k - 1) / 2) * step;
    });
  }

  // v0.6.5 (defect #2) — de-skewer a lone-in / lone-out collinear pass-through. A
  // node with exactly ONE edge on its top and ONE on its bottom (each the sole
  // attachment on its side → both offset 0 → collinear at the side centre) reads as a
  // single straight line impaling the node. Only when the two edges actually head in
  // OPPOSITE directions (their headings land on opposite sides of the node centre — an
  // unrelated in/out that merely coincidentally aligns, NOT a genuine straight A→B→C
  // pass whose headings sit ON the centre) nudge one side's port by PORT_STEP/2 toward
  // its own heading, so the in/out lines step around the node. Symmetric for a
  // lone-left + lone-right pair. Narrow + gated: a straight pass-through (headings on
  // the centre) and any spread side stay byte-identical. Mirrored in the runtime twin.
  const deskewer = (nodeId: string, sideA: Side, sideB: Side): void => {
    const ra = groups.get(nodeId + "|" + sideA);
    const rb = groups.get(nodeId + "|" + sideB);
    if (!ra || !rb || ra.length !== 1 || rb.length !== 1) return;
    const box = boxes.get(nodeId)!;
    const axisIsX = sideA === "top" || sideA === "bottom";
    const c = axisIsX ? box.x : box.y;
    // Direction each edge actually heads: its FAR node's centre (dagre may lay both
    // waypoint runs straight through the node's column, so the immediate bend is a
    // false "aligned" — the far node is the real heading).
    const farOff = (rec: Rec): number | undefined => {
      const e = edges[rec.edgeIndex]!;
      const fb = boxes.get(rec.role === "target" ? e.from : e.to);
      return fb ? (axisIsX ? fb.x : fb.y) - c : undefined;
    };
    const dA = farOff(ra[0]!);
    const dB = farOff(rb[0]!);
    if (dA === undefined || dB === undefined) return;
    const tol = PORT_STEP / 2;
    if (Math.sign(dA) === Math.sign(dB) || Math.abs(dA) < tol || Math.abs(dB) < tol) return;
    if ((axisIsX ? box.width : box.height) / 2 - PORT_MARGIN < tol) return; // no room → leave
    const rec = ra[0]!;
    result[rec.edgeIndex]![rec.role].offset = Math.sign(dA) * tol;
  };
  for (const nodeId of new Set(groupNode.values())) {
    deskewer(nodeId, "top", "bottom");
    deskewer(nodeId, "left", "right");
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

/** A label plate rect, centre-based: `{x,y}` centre + `{w,h}` size. */
export interface PlateRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Gap between a lifted label plate's near edge and the line it was lifted off (option d). */
export const LABEL_LINE_GAP = 3;

/**
 * The two endpoints of the segment {@link labelPoint} centres a label on — a
 * direction probe (near-horizontal vs near-vertical) for {@link resolveLabelLineOffsets}.
 * Kept in lockstep with {@link labelPoint}'s segment choice, which dispatches on the
 * *effective per-edge* style (see {@link routeEdge}): only a **genuine cubic** (`cubic`,
 * i.e. a curved edge with NO waypoints — labelPoint used its `"curved"` branch) uses the
 * mid-curve tangent (`(c2+p3) − (p0+c1)`, expressed as two summed points). A curved edge
 * WITH waypoints routes as an elbow and is centred via `labelPoint("elbow")`, so — like a
 * 2-point line or any other polyline — its home segment is the interior midpoint segment
 * (REV-001). Returns `null` when the route has no drawable segment.
 */
function homeSegment(points: ReadonlyArray<Point>, cubic: boolean): [Point, Point] | null {
  if (points.length < 2) return null;
  if (cubic && points.length === 4) {
    const [p0, c1, c2, p3] = points as [Point, Point, Point, Point];
    return [
      { x: p0.x + c1.x, y: p0.y + c1.y },
      { x: c2.x + p3.x, y: c2.y + p3.y },
    ];
  }
  if (points.length === 2) return [points[0]!, points[1]!];
  const mid = Math.floor(points.length / 2);
  return [points[mid - 1]!, points[mid]!];
}

/**
 * **Option (d) — lift each label OFF its home line so the edge line reads continuous.**
 * For each labelled edge, find the segment its label sits on ({@link homeSegment}, the
 * same segment {@link labelPoint} centres on) and return a perpendicular shift `{x,y}`
 * to add to `labelPos` that clears the plate off the line: a (near-)horizontal home
 * segment lifts the plate UP by `plateHalfHeight + {@link LABEL_LINE_GAP}` (its height
 * faces the line); a (near-)vertical one shifts it RIGHT by `plateHalfWidth +
 * LABEL_LINE_GAP` (its width faces the line). `undefined` plate (unlabelled edge) →
 * zero shift. Run FIRST in
 * {@link finishEdges}, before the de-collision chain, so FR6 / label-vs-edge /
 * label-vs-node then de-collide the *offset* (actually-drawn) plates. Pure geometry,
 * deterministic (no RNG/clock), so the static SVG and the inlined runtime twin
 * (`resolveLabelLineOffsets` in src/render/dom/runtime.ts) produce byte-identical
 * shifts. Returns a shift `{x,y}` per input index; the caller folds it into `labelPos`.
 * Keep the two in lockstep.
 */
export function resolveLabelLineOffsets(
  plates: ReadonlyArray<PlateRect | undefined>,
  polylines: ReadonlyArray<ReadonlyArray<Point>>,
  cubics: ReadonlyArray<boolean>,
): Point[] {
  return plates.map((p, i) => {
    if (!p) return { x: 0, y: 0 };
    const seg = homeSegment(polylines[i] ?? [], cubics[i] ?? false);
    if (!seg) return { x: 0, y: 0 };
    const horizontal = Math.abs(seg[1]!.x - seg[0]!.x) >= Math.abs(seg[1]!.y - seg[0]!.y);
    // Clear the plate off the line by the plate dimension FACING it: height for a
    // horizontal segment (lift up), width for a vertical one (shift right).
    const dist = (horizontal ? p.h : p.w) / 2 + LABEL_LINE_GAP;
    return horizontal ? { x: 0, y: -dist } : { x: dist, y: 0 };
  });
}

/**
 * **FR6 — all-pairs edge-label plate de-collision.** Given every labelled edge's
 * final plate rect (centre from its routed `labelPos`, size from `labelPlateSize`;
 * `undefined` for an unlabelled edge), nudge any two overlapping plates apart along
 * their axis of least penetration until they clear by {@link PORT_LABEL_PAD}, and
 * return the resulting shift `{x,y}` per input index (zero where a plate didn't move
 * or is absent). The caller adds each shift to that edge's `labelPos`.
 *
 * This **generalizes** {@link computeLabelShifts}, which only de-collides labels of
 * the *same* node pair (the TEST-006 anti-parallel stagger); TEST-001 is two
 * *different* pairs whose plates land within a plate-width of each other, which the
 * pair-scoped stagger can't see. Runs in the shared geometry so flowchart + state +
 * class all benefit, and is **deterministic** — fixed edge-index pair order, fixed
 * zero-distance tiebreak, no RNG/clock, bounded passes — so the static SVG and the
 * inlined runtime twin (`resolveLabelCollisions` in src/render/dom/runtime.ts)
 * produce byte-identical shifts. Keep the two in lockstep.
 */
export function resolveLabelCollisions(plates: ReadonlyArray<PlateRect | undefined>): Point[] {
  const shifts: Point[] = plates.map(() => ({ x: 0, y: 0 }));
  const idxs: number[] = [];
  plates.forEach((p, i) => {
    if (p) idxs.push(i);
  });
  if (idxs.length < 2) return shifts;
  const cx = plates.map((p) => (p ? p.x : 0));
  const cy = plates.map((p) => (p ? p.y : 0));
  const MAX_PASSES = 8;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = false;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const i = idxs[a]!;
        const j = idxs[b]!;
        const pi = plates[i]!;
        const pj = plates[j]!;
        const dx = cx[j]! - cx[i]!;
        const dy = cy[j]! - cy[i]!;
        const ox = (pi.w + pj.w) / 2 + PORT_LABEL_PAD - Math.abs(dx);
        const oy = (pi.h + pj.h) / 2 + PORT_LABEL_PAD - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue; // clear on ≥1 axis → not overlapping
        moved = true;
        // Push apart along the axis of *least* penetration (the smaller move),
        // splitting it between the two plates. A zero-distance tie resolves to a
        // fixed direction so the result is deterministic across both renderers.
        if (ox <= oy) {
          const push = ox / 2;
          const dir = dx === 0 ? 1 : Math.sign(dx);
          cx[i] = cx[i]! - push * dir;
          cx[j] = cx[j]! + push * dir;
        } else {
          const push = oy / 2;
          const dir = dy === 0 ? 1 : Math.sign(dy);
          cy[i] = cy[i]! - push * dir;
          cy[j] = cy[j]! + push * dir;
        }
      }
    }
    if (!moved) break;
  }
  for (const i of idxs) {
    shifts[i] = { x: n(cx[i]! - plates[i]!.x), y: n(cy[i]! - plates[i]!.y) };
  }
  return shifts;
}

/** Bounded relaxation passes for the label-vs-node de-collision (UAT-1). */
const LABEL_NODE_PASSES = 4;
/**
 * Clearance between an edge-label plate and a node box (UAT-round: a touch more than
 * {@link PORT_LABEL_PAD} so a label nudged near a node — e.g. "gRPC stream" beside
 * Ingress — keeps a readable gap). Mirrored in the runtime twin.
 */
const LABEL_NODE_PAD = 10;
/** Bounded relaxation passes for the label-vs-edge de-collision (UAT-round). */
const LABEL_EDGE_PASSES = 4;

/**
 * **Label-vs-node plate de-collision (UAT round 1, issue 1).** {@link
 * resolveLabelCollisions} only de-collides labels against *other labels*; a label
 * plate can still land on a NODE box (the "gRPC stream" plate overlapping the
 * Ingress box). Given every labelled edge's final plate rect and the diagram's
 * node boxes, nudge any plate that overlaps a node off it by the **smallest** push
 * — along the plate↔node axis of least penetration, away from the node centre (so
 * a plate sitting below/along its edge is pushed *down*, off the node) — and
 * return the resulting shift `{x,y}` per input index (zero where a plate didn't
 * move or is absent). The caller adds each shift to that edge's `labelPos`.
 *
 * Nodes are treated as fixed obstacles (never moved). Deterministic: fixed
 * edge-index × node-index order, fixed zero-distance tiebreak (+y / +x), bounded
 * passes, no RNG/clock — so the static SVG and the inlined runtime twin
 * (`resolveLabelNodeCollisions` in src/render/dom/runtime.ts) produce byte-identical
 * shifts. Pass the node boxes in a stable order (model-node order). Keep the two in
 * lockstep.
 */
export function resolveLabelNodeCollisions(
  plates: ReadonlyArray<PlateRect | undefined>,
  nodeBoxes: ReadonlyArray<NodeBox>,
): Point[] {
  const shifts: Point[] = plates.map(() => ({ x: 0, y: 0 }));
  if (nodeBoxes.length === 0) return shifts;
  const cx = plates.map((p) => (p ? p.x : 0));
  const cy = plates.map((p) => (p ? p.y : 0));
  for (let pass = 0; pass < LABEL_NODE_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < plates.length; i++) {
      const p = plates[i];
      if (!p) continue;
      for (const nb of nodeBoxes) {
        const dx = cx[i]! - nb.x;
        const dy = cy[i]! - nb.y;
        const ox = (p.w + nb.width) / 2 + LABEL_NODE_PAD - Math.abs(dx);
        const oy = (p.h + nb.height) / 2 + LABEL_NODE_PAD - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue; // clear on ≥1 axis → not overlapping
        moved = true;
        // Smallest push: move the plate along the axis of least penetration, away
        // from the node centre (a plate below the node → pushed further down /
        // "along the edge"). A centred tie resolves to +y (down) then +x (right).
        if (oy <= ox) {
          cy[i] = cy[i]! + oy * (dy < 0 ? -1 : 1);
        } else {
          cx[i] = cx[i]! + ox * (dx < 0 ? -1 : 1);
        }
      }
    }
    if (!moved) break;
  }
  for (let i = 0; i < plates.length; i++) {
    if (plates[i]) shifts[i] = { x: n(cx[i]! - plates[i]!.x), y: n(cy[i]! - plates[i]!.y) };
  }
  return shifts;
}

/**
 * Orientation of the axis-aligned run of a polyline **closest** to `(cx, cy)`:
 * `"x"` when that run is horizontal (so a label riding it slides in x, "along its
 * own edge"), `"y"` when vertical, or `null` when the polyline has no axis-aligned
 * run (e.g. a curved edge). Deterministic — the first run wins a distance tie.
 */
function nearestRunAxis(points: ReadonlyArray<Point>, cx: number, cy: number): "x" | "y" | null {
  let best = Infinity;
  let axis: "x" | "y" | null = null;
  for (let s = 0; s + 1 < points.length; s++) {
    const a = points[s]!;
    const b = points[s + 1]!;
    const horiz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 0.5;
    const vert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 0.5;
    if (!horiz && !vert) continue;
    let dx: number;
    let dy: number;
    if (horiz) {
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      dx = cx < lo ? cx - lo : cx > hi ? cx - hi : 0;
      dy = cy - a.y;
    } else {
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      dx = cx - a.x;
      dy = cy < lo ? cy - lo : cy > hi ? cy - hi : 0;
    }
    const dd = dx * dx + dy * dy;
    if (dd < best) {
      best = dd;
      axis = horiz ? "x" : "y";
    }
  }
  return axis;
}

/**
 * **Label-vs-edge plate de-collision (UAT-round, "gRPC stream" fix).** After the
 * label-label (FR6) pass a label plate can still land ON another edge's line — the
 * "gRPC stream" plate straddling the Ingress-out fan. For each labelled edge, find
 * foreign edge segments that run **across** the label's own edge (perpendicular to
 * the label's nearest own run) and pass through its plate, and slide the plate
 * **along its own edge** (the axis of that nearest run) to the nearer side that
 * clears them all by {@link PORT_LABEL_PAD}. A foreign run **parallel** to (and
 * bisecting) the label's own run is also escaped by the same along-axis slide — past
 * the nearer end of that run's bounded extent — so a label sandwiched between two
 * near-parallel lines (the "give up" bisection) lifts off cleanly while staying on
 * its own edge. The label's own segments are excluded.
 *
 * `polylines[i]` is edge i's routed polyline; `plates[i]` its plate (or `undefined`
 * for an unlabelled edge). Deterministic — fixed edge×edge×segment order, fixed
 * smaller-side / +axis tiebreak, bounded passes, no RNG/clock — so the static SVG and
 * the runtime twin (`resolveLabelEdgeCollisions` in src/render/dom/runtime.ts) produce
 * byte-identical shifts. Returns a shift `{x,y}` per input index; the caller folds it
 * into `labelPos`. Keep the two in lockstep.
 */
export function resolveLabelEdgeCollisions(
  plates: ReadonlyArray<PlateRect | undefined>,
  polylines: ReadonlyArray<ReadonlyArray<Point>>,
): Point[] {
  const shifts: Point[] = plates.map(() => ({ x: 0, y: 0 }));
  const cx = plates.map((p) => (p ? p.x : 0));
  const cy = plates.map((p) => (p ? p.y : 0));
  for (let pass = 0; pass < LABEL_EDGE_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < plates.length; i++) {
      const p = plates[i];
      if (!p) continue;
      const axis = nearestRunAxis(polylines[i] ?? [], cx[i]!, cy[i]!);
      if (!axis) continue;
      const hw = p.w / 2;
      const hh = p.h / 2;
      // Perpendicular foreign runs passing through the plate → the two exit targets
      // (clear on the label's own-run axis by PORT_LABEL_PAD, to either side).
      let hasHit = false;
      let hiTarget = -Infinity; // nearest clear centre to the right/down
      let loTarget = Infinity; // nearest clear centre to the left/up
      for (let j = 0; j < polylines.length; j++) {
        if (j === i) continue;
        const pts = polylines[j] ?? [];
        for (let s = 0; s + 1 < pts.length; s++) {
          const a = pts[s]!;
          const b = pts[s + 1]!;
          if (axis === "x") {
            if (Math.abs(a.x - b.x) < 0.5) {
              // Perpendicular (vertical) foreign run crossing the plate → slide in x
              // past the crossing line (the original gRPC-stream fix; unchanged).
              const gx = a.x;
              if (gx <= cx[i]! - hw || gx >= cx[i]! + hw) continue; // not through plate (x)
              if (cy[i]! + hh <= Math.min(a.y, b.y) || cy[i]! - hh >= Math.max(a.y, b.y)) continue;
              hasHit = true;
              hiTarget = Math.max(hiTarget, gx + hw + PORT_LABEL_PAD);
              loTarget = Math.min(loTarget, gx - hw - PORT_LABEL_PAD);
            } else if (Math.abs(a.y - b.y) < 0.5) {
              // FR3 — a foreign run PARALLEL to (and bisecting) the label's own run: an
              // along-axis slide past the nearer end of its bounded x-extent lifts the
              // label off the line while keeping it on its own edge ("give up" fix).
              const gy = a.y;
              if (gy <= cy[i]! - hh || gy >= cy[i]! + hh) continue; // its lane misses the plate (y)
              const lo = Math.min(a.x, b.x);
              const hi = Math.max(a.x, b.x);
              if (cx[i]! + hw <= lo || cx[i]! - hw >= hi) continue; // no x-overlap → not on it
              hasHit = true;
              hiTarget = Math.max(hiTarget, hi + hw + PORT_LABEL_PAD);
              loTarget = Math.min(loTarget, lo - hw - PORT_LABEL_PAD);
            }
          } else {
            if (Math.abs(a.y - b.y) < 0.5) {
              // Perpendicular (horizontal) foreign run crossing the plate → slide in y
              // past the crossing line (the original gRPC-stream fix; unchanged).
              const gy = a.y;
              if (gy <= cy[i]! - hh || gy >= cy[i]! + hh) continue; // not through plate (y)
              if (cx[i]! + hw <= Math.min(a.x, b.x) || cx[i]! - hw >= Math.max(a.x, b.x)) continue;
              hasHit = true;
              hiTarget = Math.max(hiTarget, gy + hh + PORT_LABEL_PAD);
              loTarget = Math.min(loTarget, gy - hh - PORT_LABEL_PAD);
            } else if (Math.abs(a.x - b.x) < 0.5) {
              // FR3 — a foreign run PARALLEL to (and bisecting) the label's own vertical
              // run: slide along y past the nearer end of its bounded y-extent.
              const gx = a.x;
              if (gx <= cx[i]! - hw || gx >= cx[i]! + hw) continue; // its lane misses the plate (x)
              const lo = Math.min(a.y, b.y);
              const hi = Math.max(a.y, b.y);
              if (cy[i]! + hh <= lo || cy[i]! - hh >= hi) continue; // no y-overlap → not on it
              hasHit = true;
              hiTarget = Math.max(hiTarget, hi + hh + PORT_LABEL_PAD);
              loTarget = Math.min(loTarget, lo - hh - PORT_LABEL_PAD);
            }
          }
        }
      }
      if (!hasHit) continue;
      const cur = axis === "x" ? cx[i]! : cy[i]!;
      // Smallest move: exit to whichever side is nearer; a tie prefers +axis.
      const target = hiTarget - cur <= cur - loTarget ? hiTarget : loTarget;
      if (axis === "x") cx[i] = target;
      else cy[i] = target;
      moved = true;
    }
    if (!moved) break;
  }
  for (let i = 0; i < plates.length; i++) {
    if (plates[i]) shifts[i] = { x: n(cx[i]! - plates[i]!.x), y: n(cy[i]! - plates[i]!.y) };
  }
  return shifts;
}

/**
 * Half-gap of a crossing GAP (world units). At a proper crossing the UNDER line
 * (the more-vertical run) is broken by a small pen-up gap of ±`GAP_RADIUS` along its
 * run (~8px total) so it reads as passing beneath the continuous OVER line — a real
 * visible break on the background, no fill (FR7; UAT-round pivot from an arc hop).
 */
const GAP_RADIUS = 4;

/**
 * Proper intersection of two segments `a1→a2` and `b1→b2`, or `null`. "Proper"
 * excludes shared endpoints and near-endpoint touches (a small epsilon in on both
 * parameters) so a fan of edges meeting at a node anchor is **not** treated as a
 * crossing, and parallel/collinear segments return `null`. Used by
 * {@link applyEdgeBridges} (FR7).
 */
export function segmentsCross(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const denom = rx * sy - ry * sx;
  if (denom === 0) return null; // parallel or collinear
  const qpx = b1.x - a1.x;
  const qpy = b1.y - a1.y;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  const EPS = 1e-6;
  if (t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS) {
    return { x: a1.x + t * rx, y: a1.y + t * ry };
  }
  return null;
}

/**
 * **FR7 — edge-crossing GAPS (line-jumps; UAT-round pivot from arc hops).** Given
 * every edge's routed polyline (elbow style only), find each proper crossing between
 * two edges' segments and, for exactly **one** edge per crossing, rewrite its `d` to
 * leave a small **gap** (pen-up break) where it passes UNDER the other line so each
 * stays traceable. Which edge is broken (D3-pivot): the **more-vertical** crossing
 * segment — it reads as ducking under the more-horizontal OVER line, which stays
 * continuous; a tie (same orientation) breaks the **lower edge index** — fully
 * deterministic (fixed pair + segment order, no RNG/clock), so the static SVG and the
 * runtime twin produce byte-identical paths. Returns a gapped `d` string per edge that
 * got a break, or `null` (leave the original path) otherwise. Gated by `enabled` (D4
 * per-style toggle) — the caller passes `false` for curved/sketch, which this pass
 * never touches. Mirrored in `src/render/dom/runtime.ts` — keep in lockstep.
 */
export function applyEdgeBridges(
  edges: ReadonlyArray<{ points: Point[] }>,
  enabled: boolean,
): (string | null)[] {
  const out: (string | null)[] = edges.map(() => null);
  if (!enabled) return out;
  // Round to 2dp so both renderers detect crossings on identical coordinates.
  const polys = edges.map((e) => e.points.map((p) => ({ x: n(p.x), y: n(p.y) })));
  const gaps: Array<Array<{ seg: number; at: Point; dist: number }>> = edges.map(() => []);
  for (let i = 0; i < polys.length; i++) {
    const pi = polys[i]!;
    if (pi.length < 2) continue;
    for (let j = i + 1; j < polys.length; j++) {
      const pj = polys[j]!;
      if (pj.length < 2) continue;
      for (let si = 0; si + 1 < pi.length; si++) {
        const a1 = pi[si]!;
        const a2 = pi[si + 1]!;
        for (let sj = 0; sj + 1 < pj.length; sj++) {
          const b1 = pj[sj]!;
          const b2 = pj[sj + 1]!;
          const x = segmentsCross(a1, a2, b1, b2);
          if (!x) continue;
          const horizI = Math.abs(a2.x - a1.x) >= Math.abs(a2.y - a1.y);
          const horizJ = Math.abs(b2.x - b1.x) >= Math.abs(b2.y - b1.y);
          // the more-VERTICAL segment is broken (it passes under the over line);
          // same-orientation tie → edge i (i<j). i is broken when it is the more
          // vertical of the two.
          const iGaps = horizI === horizJ ? true : !horizI;
          const ge = iGaps ? i : j;
          const gs = iGaps ? si : sj;
          const s1 = iGaps ? a1 : b1;
          const s2 = iGaps ? a2 : b2;
          // Skip if the crossing sits within a gap radius of the broken segment's
          // ends (a gap there would overshoot a corner and malform the path).
          const dEntry = Math.hypot(x.x - s1.x, x.y - s1.y);
          const dExit = Math.hypot(x.x - s2.x, x.y - s2.y);
          if (dEntry < GAP_RADIUS || dExit < GAP_RADIUS) continue;
          gaps[ge]!.push({ seg: gs, at: x, dist: dEntry });
        }
      }
    }
  }
  for (let e = 0; e < edges.length; e++) {
    if (gaps[e]!.length > 0) out[e] = gappedPath(polys[e]!, gaps[e]!);
  }
  return out;
}

/**
 * Rebuild an elbow polyline's `d`, splicing a small **gap** (pen-up) into each
 * segment that carries a crossing (sorted along the segment): draw up to `GAP_RADIUS`
 * before the crossing, emit an `M` (moveto = pen-up) to `GAP_RADIUS` past it, then
 * continue — a real visible break so the under-line reads as passing beneath the
 * crossing over-line. Background-independent (no fill / no arc). Mirrored in the
 * runtime.
 */
function gappedPath(points: Point[], gaps: Array<{ seg: number; at: Point; dist: number }>): string {
  const bySeg = new Map<number, Array<{ at: Point; dist: number }>>();
  for (const g of gaps) (bySeg.get(g.seg) ?? bySeg.set(g.seg, []).get(g.seg)!).push({ at: g.at, dist: g.dist });
  for (const arr of bySeg.values()) arr.sort((p, q) => p.dist - q.dist);
  let d = `M ${n(points[0]!.x)} ${n(points[0]!.y)}`;
  for (let s = 0; s + 1 < points.length; s++) {
    const p = points[s]!;
    const q = points[s + 1]!;
    const segGaps = bySeg.get(s);
    if (!segGaps || segGaps.length === 0) {
      d += ` L ${n(q.x)} ${n(q.y)}`;
      continue;
    }
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const ux = (q.x - p.x) / len;
    const uy = (q.y - p.y) / len;
    let lastGapDist = -Infinity;
    for (const g of segGaps) {
      // Skip a gap that would overlap the previous one on this segment (its restart
      // would precede the last gap's end → a backward `L`); keep the earlier one.
      if (g.dist - lastGapDist < 2 * GAP_RADIUS) continue;
      lastGapDist = g.dist;
      const ex = g.at.x - ux * GAP_RADIUS;
      const ey = g.at.y - uy * GAP_RADIUS;
      const xx = g.at.x + ux * GAP_RADIUS;
      const xy = g.at.y + uy * GAP_RADIUS;
      d += ` L ${n(ex)} ${n(ey)} M ${n(xx)} ${n(xy)}`;
    }
    d += ` L ${n(q.x)} ${n(q.y)}`;
  }
  return d;
}

/** Minimum gap between adjacent parallel edge lanes (FR9). */
const LANE_GAP = 26;
/** Two near-parallel runs must overlap this much on the shared axis to count as "merged". */
const LANE_MIN_OVERLAP = 40;
/** Bounded relaxation passes for the all-pairs lane push (deterministic fixpoint, FR9). */
const LANE_PASSES = 8;

interface LaneSeg {
  edge: number;
  i: number; // segment = points[i] .. points[i+1]
  along: number; // perpendicular coord (x for a vertical run, y for a horizontal run)
  lo: number;
  hi: number; // interval on the parallel axis
}

/**
 * **FR9 — edge-lane separation (D10=B keeps the layout compact; this is the targeted
 * offset).** Pull apart bundles of near-parallel, near-collinear edge runs that share a
 * channel so each line stays individually traceable — locally, without sprawling the
 * whole diagram. Operates on the routed **orthogonal polylines** (`edge.points`, elbow
 * only): find **interior** axis-aligned segments (both ends are bends, so no anchor
 * detaches) that are near-collinear (within {@link LANE_GAP} on the perpendicular axis)
 * and overlap on the parallel axis for ≥ {@link LANE_MIN_OVERLAP}, group ≥
 * {@link LANE_MIN_BUNDLE} into a bundle, and spread the bundle to lanes ≥ `LANE_GAP`
 * apart centred on the bundle's mean — moving each run's two segment endpoints together
 * so its adjacent neighbours just stretch (the elbow stays orthogonal + connected).
 * Bounded, deterministic (fixed along→edge order, no RNG/clock; a spread bundle is ≥
 * `LANE_GAP` apart so it no longer re-qualifies → stable fixpoint). Runs FIRST inside
 * `finishEdges` and is mirrored byte-for-byte in the runtime twin. Mutates
 * `edge.points`/`path`/`labelPos` in place; leaves untouched edges byte-identical.
 */
export function separateLanes(
  edges: Array<{ points: Point[]; path?: string; labelPos?: Point }>,
  style: EdgeStyle,
): void {
  if (style !== "elbow") return;
  const moved = new Set<number>();
  for (let pass = 0; pass < LANE_PASSES; pass++) {
    let changed = false;
    for (const vertical of [true, false]) {
      const segs: LaneSeg[] = [];
      edges.forEach((e, ei) => {
        const p = e.points;
        for (let i = 1; i + 2 < p.length; i++) {
          const a = p[i]!;
          const b = p[i + 1]!;
          const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
          const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
          if (vertical ? !isVert : !isHorz) continue;
          const along = vertical ? a.x : a.y;
          const lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
          const hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
          segs.push({ edge: ei, i, along, lo, hi });
        }
      });
      segs.sort((s, t) => s.along - t.along || s.edge - t.edge || s.i - t.i);
      // All-pairs push (mirrors resolveLabelCollisions, 1-D on `along`): any two runs
      // of DIFFERENT edges that overlap on the parallel axis and sit within LANE_GAP
      // are pushed apart until they clear. Order-independent + converges (a cleared
      // pair no longer pushes), so it's robust to any drag geometry — unlike a greedy
      // bundle, which under-formed for some post-drag orders (TEST-004). An edge's own
      // runs never push each other (they don't overlap on the parallel axis anyway).
      for (let a = 0; a < segs.length; a++) {
        for (let b = a + 1; b < segs.length; b++) {
          const sa = segs[a]!;
          const sb = segs[b]!;
          if (sa.edge === sb.edge) continue;
          if (Math.min(sa.hi, sb.hi) - Math.max(sa.lo, sb.lo) < LANE_MIN_OVERLAP) continue;
          const d = LANE_GAP - Math.abs(sb.along - sa.along);
          if (d <= 1e-6) continue; // already ≥ LANE_GAP apart
          const dir = sb.along >= sa.along ? 1 : -1;
          const push = d / 2;
          moveLane(edges[sa.edge]!, vertical, sa, n(sa.along - push * dir));
          moveLane(edges[sb.edge]!, vertical, sb, n(sb.along + push * dir));
          moved.add(sa.edge);
          moved.add(sb.edge);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  for (const ei of moved) edges[ei]!.path = toPath(edges[ei]!.points, "elbow");
}

/** Slide one edge run to a new lane coord (its shared endpoints move together, so the
 *  adjacent perpendicular segments just stretch — the elbow stays orthogonal + anchored),
 *  carrying its label and updating the seg's live `along`. */
function moveLane(
  e: { points: Point[]; labelPos?: Point },
  vertical: boolean,
  seg: LaneSeg,
  target: number,
): void {
  const p = e.points;
  if (vertical) {
    shiftLabelOnSeg(e, true, seg, target);
    p[seg.i] = { x: target, y: p[seg.i]!.y };
    p[seg.i + 1] = { x: target, y: p[seg.i + 1]!.y };
  } else {
    shiftLabelOnSeg(e, false, seg, target);
    p[seg.i] = { x: p[seg.i]!.x, y: target };
    p[seg.i + 1] = { x: p[seg.i + 1]!.x, y: target };
  }
  seg.along = target;
}

/** If an edge's label sits on the segment being re-laned, slide it into the new lane. */
function shiftLabelOnSeg(e: { labelPos?: Point }, vertical: boolean, seg: LaneSeg, target: number): void {
  const lp = e.labelPos;
  if (!lp) return;
  if (vertical) {
    if (Math.abs(lp.x - seg.along) < LANE_GAP && lp.y >= seg.lo - 1 && lp.y <= seg.hi + 1) {
      e.labelPos = { x: n(lp.x + (target - seg.along)), y: lp.y };
    }
  } else if (Math.abs(lp.y - seg.along) < LANE_GAP && lp.x >= seg.lo - 1 && lp.x <= seg.hi + 1) {
    e.labelPos = { x: lp.x, y: n(lp.y + (target - seg.along)) };
  }
}

/** Minimum gap between the two staggered jogs of a collinear anti-parallel elbow
 *  bundle (FR1). Matches {@link LANE_GAP} so a de-crammed pair reads with the same
 *  channel spacing as any other separated lane. */
const JOG_GAP = 26;

/**
 * Minimum collinear border-adjacent jogs converging on ONE node side before the
 * v0.6.5 convergence de-tangle ({@link separateConvergentJogs}) fires. A 2-edge
 * same-side bundle is either an anti-parallel node **pair** (owned by
 * {@link separateAntiParallelJogs}) or reads acceptably; a genuine knot — the
 * `Rules · Sets · Runs` case — is **≥3**. Keeping the gate at 3 also means the pass
 * no-ops on every current fixture (none has a ≥3 collinear border bundle), so clean
 * diagrams stay byte-identical.
 */
const CONVERGE_MIN = 3;

/**
 * **FR1–FR3 — de-cramp a collinear anti-parallel elbow bundle.** {@link separateLanes}
 * de-merges near-parallel runs, but its {@link LANE_MIN_OVERLAP} gate deliberately skips
 * an anti-parallel `A→B`/`B→A` pair between stacked nodes: both edges take the naive
 * elbow's identical `midY`, so their interior jogs are collinear (one merged crossbar)
 * yet overlap on the parallel axis by only a few px — below the lane gate — leaving the
 * two arrowheads crammed together. This post-pass targets exactly that case and nothing
 * else: group the routed edges by their **unordered node pair** (the same idiom as
 * {@link computeLabelShifts}); a group with ≥2 edges whose interior jog segments are
 * **collinear** (share the same perpendicular `along`) is de-crammed by spreading the
 * jogs onto distinct lanes {@link JOG_GAP} apart, centred on the bundle mean, ordered by
 * each edge's **target-side** perpendicular coordinate so every jog moves toward its OWN
 * target (the down-going edge jogs lower, the up-going higher; FR2). Reuses
 * {@link moveLane}/{@link LaneSeg}/{@link toPath}. Elbow only, gated, deterministic, and
 * idempotent (a spread pair is `JOG_GAP` apart → no longer collinear → never re-fires).
 * Runs after `separateLanes` inside `finishEdges` and is mirrored byte-for-byte in the
 * runtime twin. Any edge that already routes cleanly — a non-reversed pair
 * (`Loading→Ready`), a pair whose jogs already differ, a fan, a single edge, or any
 * curved edge — stays byte-identical. Mutates `edge.points`/`path`/`labelPos` in place.
 */
export function separateAntiParallelJogs(
  edges: Array<{ from: string; to: string; points: Point[]; path?: string; labelPos?: Point }>,
  style: EdgeStyle,
): void {
  if (style !== "elbow") return;
  // Group edge indices by their unordered node pair; "|" can never occur in a node id
  // ([A-Za-z0-9_]+), so distinct pairs never collide. Keep this idiom in lockstep with
  // computeLabelShifts and the runtime twin.
  const pairs = new Map<string, number[]>();
  edges.forEach((e, i) => {
    const key = e.from < e.to ? e.from + "|" + e.to : e.to + "|" + e.from;
    (pairs.get(key) ?? pairs.set(key, []).get(key)!).push(i);
  });
  const moved = new Set<number>();
  for (const idxs of pairs.values()) {
    if (idxs.length < 2) continue; // only a multi-edge bundle can be anti-parallel
    idxs.sort((a, b) => a - b);
    // Each edge's interior jog is its middle axis-aligned run (both ends are bends, so
    // no anchor detaches — the same i>=1 && i+2<len rule as separateLanes; i=1 in a
    // 4-point naive elbow). Require a uniform jog orientation across the bundle.
    type Jog = { edge: number; seg: LaneSeg; vertical: boolean; target: number };
    const jogs: Jog[] = [];
    let orient: boolean | undefined; // true = vertical run (const x), false = horizontal
    for (const ei of idxs) {
      const p = edges[ei]!.points;
      let jog: Jog | undefined;
      for (let i = 1; i + 2 < p.length; i++) {
        const a = p[i]!;
        const b = p[i + 1]!;
        const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
        const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
        if (!isVert && !isHorz) continue;
        const along = isVert ? a.x : a.y;
        const lo = isVert ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
        const hi = isVert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
        const end = p[p.length - 1]!; // target-side perpendicular coord = the endpoint's lane coord
        const target = isVert ? end.x : end.y;
        jog = { edge: ei, seg: { edge: ei, i, along, lo, hi }, vertical: isVert, target };
        break; // first interior run wins (a naive elbow has exactly one)
      }
      if (!jog) break;
      if (orient === undefined) orient = jog.vertical;
      else if (orient !== jog.vertical) { jogs.length = 0; break; }
      jogs.push(jog);
    }
    if (jogs.length < 2) continue;
    // Collinear? every jog must share the same `along` (they merge into one bar). If any
    // already differ, the bundle reads fine → skip → byte-identical.
    const a0 = jogs[0]!.seg.along;
    if (!jogs.every((j) => Math.abs(j.seg.along - a0) < 1)) continue;
    // Order by target-side perpendicular coord, then place on lanes JOG_GAP apart centred
    // on the bundle mean → each jog moves toward its own target (FR2). Stable tie-break by
    // edge index keeps it deterministic across the twins.
    jogs.sort((x, y) => x.target - y.target || x.edge - y.edge);
    const mean = jogs.reduce((s, j) => s + j.seg.along, 0) / jogs.length;
    const k = jogs.length;
    jogs.forEach((j, s) => {
      const lane = n(mean + (s - (k - 1) / 2) * JOG_GAP);
      if (Math.abs(lane - j.seg.along) < 1e-6) return; // already there → byte-identical
      moveLane(edges[j.edge]!, j.vertical, j.seg, lane);
      moved.add(j.edge);
    });
  }
  for (const ei of moved) edges[ei]!.path = toPath(edges[ei]!.points, "elbow");
}

/**
 * **v0.6.5 — de-tangle a convergence bundle at one node side (defect #1).** The
 * natural generalization of {@link separateAntiParallelJogs} from a node *pair* to
 * a node *side*: when **≥{@link CONVERGE_MIN}** edges attach to the SAME node border
 * — across both roles, a target *entering* that side and a source *leaving* it both
 * count — and their **border-adjacent jog** (the interior axis-aligned run nearest
 * that border) is **collinear** (shared perpendicular coord), the jogs merge into a
 * single crossbar knot that {@link separateLanes} (its {@link LANE_MIN_OVERLAP} gate
 * skips them) and {@link separateAntiParallelJogs} (groups by node *pair*, and reads
 * each edge's FIRST interior run — which for a long edge sits near its FAR node, not
 * this border) both miss. This spreads those jogs onto distinct lanes {@link JOG_GAP}
 * apart, ordered by each edge's far-end perpendicular coord so each jog biases toward
 * its own far end. Because the jogs are border-adjacent (a rank-gap outside the node),
 * a symmetric centre would push the border-nearest lane across the border — so the fan
 * is centred on the bundle mean and then translated to anchor its border-nearest lane
 * ON the mean, opening AWAY from the node (never crossing the border).
 *
 * Composes with the anti-parallel pass, which runs first on the node-*pair* key: on
 * every current fixture the two are disjoint (convergent has zero firings corpus-wide;
 * where it fires — architecture.mmd — the anti-parallel pass does not touch the bundle).
 * The keys are not mutually exclusive in principle (a source endpoint's border jog is
 * its `i=1` run, which the anti-parallel pass could also move), but a double-move is
 * benign: {@link moveLane} writes an ABSOLUTE lane, so the convergent pass (running
 * second) simply wins, the path is rebuilt from the final points, and the outcome is
 * deterministic and byte-identical across both twins (both run anti-parallel → convergent
 * in the same order). Reuses {@link moveLane}/{@link LaneSeg}/{@link toPath}. Elbow only,
 * gated, deterministic, idempotent (a spread bundle is `JOG_GAP` apart → no longer
 * collinear → never re-fires). Mirrored byte-for-byte in the runtime twin. Mutates
 * `edge.points`/`path`/`labelPos` in place; leaves untouched edges byte-identical.
 */
export function separateConvergentJogs(
  edges: Array<{ from: string; to: string; points: Point[]; path?: string; labelPos?: Point }>,
  style: EdgeStyle,
): void {
  if (style !== "elbow") return;
  interface Rec {
    edge: number;
    seg: LaneSeg;
    vertical: boolean;
    toward: number; // sign of the perpendicular approach/departure, jog → border
    far: number; // far-end perpendicular coord (ordering key)
  }
  // The border-adjacent jog for one endpoint: a target's LAST interior run (just
  // before its perpendicular approach into the border) / a source's FIRST interior
  // run (just after its perpendicular departure). The same `i>=1 && i+2<len` interior
  // rule as separateLanes / separateAntiParallelJogs, indexed from the border end.
  const jogOf = (p: Point[], role: "source" | "target"): Omit<Rec, "edge"> | null => {
    const len = p.length;
    if (len < 4) return null;
    const i = role === "target" ? len - 3 : 1;
    if (i < 1 || i + 2 > len) return null;
    const a = p[i]!;
    const b = p[i + 1]!;
    const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
    const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
    if (!isVert && !isHorz) return null;
    const along = isVert ? a.x : a.y;
    const lo = isVert ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
    const hi = isVert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
    const appFrom = role === "target" ? p[i + 1]! : p[1]!;
    const appTo = role === "target" ? p[len - 1]! : p[0]!;
    const toward = isVert ? Math.sign(appTo.x - appFrom.x) : Math.sign(appTo.y - appFrom.y);
    const end = role === "target" ? p[0]! : p[len - 1]!;
    const far = isVert ? end.x : end.y;
    return { seg: { edge: 0, i, along, lo, hi }, vertical: isVert, toward, far };
  };
  // Group each endpoint's border-adjacent jog by (node, orientation, toward-border,
  // collinear `along`). "|" can never occur in a node id ([A-Za-z0-9_]+) so distinct
  // nodes never collide; the orientation + toward pair uniquely recovers the side
  // (top/bottom = horizontal jog, left/right = vertical), and the shared `along`
  // makes every member of a bucket collinear by construction.
  const buckets = new Map<string, Rec[]>();
  edges.forEach((e, idx) => {
    for (const [role, node] of [
      ["source", e.from],
      ["target", e.to],
    ] as const) {
      const j = jogOf(e.points, role);
      if (!j) continue;
      const key = node + "|" + (j.vertical ? "V" : "H") + "|" + j.toward + "|" + n(j.seg.along);
      const rec: Rec = { edge: idx, seg: { ...j.seg, edge: idx }, vertical: j.vertical, toward: j.toward, far: j.far };
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(rec);
    }
  });
  const moved = new Set<number>();
  for (const recs of buckets.values()) {
    if (recs.length < CONVERGE_MIN) continue;
    // Order by far-end perpendicular coord (edge-index tie-break) so each jog moves
    // toward its own far end; deterministic across the twins.
    recs.sort((x, y) => x.far - y.far || x.edge - y.edge);
    const mean = recs.reduce((s, r) => s + r.seg.along, 0) / recs.length;
    const k = recs.length;
    const toward = recs[0]!.toward;
    recs.forEach((r, s) => {
      // Centre on the mean (matching separateAntiParallelJogs) then translate the fan
      // by −toward·(k−1)/2·JOG_GAP so the border-facing extreme lands on the mean: the
      // border-nearest jog keeps the bundle's original clearance and the rest fan out
      // away from the node, so no lane ever crosses the border.
      const lane = n(mean + (s - (k - 1) / 2 - (toward * (k - 1)) / 2) * JOG_GAP);
      if (Math.abs(lane - r.seg.along) < 1e-6) return;
      moveLane(edges[r.edge]!, r.vertical, r.seg, lane);
      moved.add(r.edge);
    });
  }
  for (const ei of moved) edges[ei]!.path = toPath(edges[ei]!.points, "elbow");
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
  perpendicularizeEntry(out, sides.entryVertical);
  return simplify(out);
}

/**
 * **FR2 — perpendicular final approach.** The closing segment of a routed elbow must
 * enter its target **perpendicular** to the entered border, so the arrowhead points
 * INTO the node rather than a sideways stub sitting on the border (the "idle→Loading
 * doubling-back arrow": a left-exit / top-entry route whose last segment ran flat along
 * Loading's top). When a corner left the final approach *parallel* to the border, swap
 * that last elbow corner — both endpoints stay put, only the corner flips to the other
 * side of their bounding box — so the closing segment becomes perpendicular. A route that
 * already enters perpendicular is untouched (byte-identical). Mirrored in the runtime twin.
 *
 * **Invariant (relied on, not asserted):** the pre-corner point `a` sits on the *exterior*
 * side of the entered border (above a top entry, below a bottom entry, outside a left/right
 * entry). The swap only fires when the closing segment is *parallel* to that border, which
 * for a genuine perimeter-port entry only arises from an exterior approach — the port
 * spreader routes a top-entry from above, etc. — so the flipped segment always approaches
 * from outside and the arrowhead points into the node. The `swappable` guard additionally
 * rejects the degenerate `a`-on-the-border case (would collapse the corner onto `end`).
 */
function perpendicularizeEntry(out: Point[], entryVertical: boolean): void {
  if (out.length < 3) return;
  const end = out[out.length - 1]!;
  const a = out[out.length - 3]!;
  const b = out[out.length - 2]!;
  const finalPerp = entryVertical ? n(b.x) === n(end.x) : n(b.y) === n(end.y);
  const swappable = entryVertical ? n(a.y) !== n(end.y) : n(a.x) !== n(end.x);
  if (!finalPerp && swappable) {
    out[out.length - 2] = entryVertical ? { x: end.x, y: a.y } : { x: a.x, y: end.y };
  }
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
  const entryVertical = entry === "top" || entry === "bottom";
  if (waypoints.length > 0) {
    return elbowThrough(start, end, waypoints, {
      exitVertical: !horizontal,
      entryVertical,
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
  // FR2 — a perpendicular exit/entry pair (e.g. left-exit → top-entry) leaves the naive
  // elbow's closing segment flat along the entered border; force it perpendicular.
  perpendicularizeEntry(points, entryVertical);
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
/**
 * Extra top space a titled subgraph reserves for its title band (FR6). Sized so
 * the title's opaque plate (see `renderSubgraphTitle` in src/render/svg.ts) clears
 * the top member node. Mirrored in the runtime twin (`SG_TITLE`).
 */
export const SUBGRAPH_TITLE_BAND = 22;

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
