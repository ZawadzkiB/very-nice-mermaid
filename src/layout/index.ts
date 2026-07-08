/**
 * Layout adapter over **@dagrejs/dagre** (pure JS, runs in Node + browser).
 * Produces a fully {@link PositionedModel}: nodes get center-based geometry,
 * subgraphs get cluster boxes, edges are routed via {@link routeEdge} using the
 * theme's edge style. Deterministic — same model + options ⇒ identical output.
 */

import * as dagreNs from "@dagrejs/dagre";
import type {
  DiagramModel,
  PositionedModel,
  PositionedNode,
  PositionedSubgraph,
  RoutedEdge,
  Direction,
  Point,
} from "../model/index.js";
import { themes, type Theme } from "../theme/index.js";
import {
  contentBounds,
  routeEdge,
  computePerimeterPorts,
  computeSubgraphBoxes,
  type NodeBox,
  type EdgeAnchorOverride,
} from "../geometry/index.js";
import { measureNode } from "./measure.js";

// Interop: dagre ships CJS; under ESM the namespace may nest the real exports
// on `.default`. Normalize once.
const dagre = ((dagreNs as unknown as { default?: typeof dagreNs }).default ??
  dagreNs) as typeof dagreNs;

export interface LayoutOptions {
  theme?: Theme;
  /** Override the theme's inter-node spacing. */
  nodesep?: number;
  /** Override the theme's inter-rank spacing. */
  ranksep?: number;
}

const BOUNDS_PADDING = 20;

function rankdir(direction: Direction): string {
  return direction; // dagre accepts TB/BT/LR/RL directly (TD already normalized)
}

/** Lay out a parsed model into positioned, routed geometry. */
export function layout(model: DiagramModel, opts: LayoutOptions = {}): PositionedModel {
  const theme = opts.theme ?? themes.light!;
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({
    rankdir: rankdir(model.direction),
    nodesep: opts.nodesep ?? theme.tokens.spacing.nodesep,
    ranksep: opts.ranksep ?? theme.tokens.spacing.ranksep,
    marginx: 8,
    marginy: 8,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of model.nodes) {
    const s = measureNode(node, theme);
    sizes.set(node.id, s);
    g.setNode(node.id, { width: s.width, height: s.height });
  }

  // Cluster nodes for subgraphs, then parent membership.
  for (const sg of model.subgraphs) {
    if (!g.hasNode(sg.id)) g.setNode(sg.id, { label: sg.title });
  }
  for (const sg of model.subgraphs) {
    for (const child of sg.children) {
      if (g.hasNode(child)) g.setParent(child, sg.id);
    }
  }

  model.edges.forEach((edge, i) => {
    if (!g.hasNode(edge.from) || !g.hasNode(edge.to)) return;
    const minlen = Math.min(4, Math.max(1, Math.round(edge.length / 2)));
    g.setEdge(edge.from, edge.to, { minlen, weight: 1 }, `e${i}`);
  });

  dagre.layout(g);

  const nodeBoxes = new Map<string, NodeBox>();
  const positionedNodes: PositionedNode[] = model.nodes.map((node) => {
    const nd = g.node(node.id) as { x: number; y: number; width: number; height: number };
    const box: NodeBox = {
      x: round(nd.x),
      y: round(nd.y),
      width: nd.width,
      height: nd.height,
      shape: node.shape,
    };
    nodeBoxes.set(node.id, box);
    return { ...node, x: box.x, y: box.y, width: box.width, height: box.height };
  });

  const positionedSubgraphs: PositionedSubgraph[] = [];
  for (const sg of model.subgraphs) {
    const sd = g.node(sg.id) as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    if (!sd || !Number.isFinite(sd.x) || !Number.isFinite(sd.width)) continue;
    positionedSubgraphs.push({
      ...sg,
      x: round(sd.x),
      y: round(sd.y),
      width: sd.width,
      height: sd.height,
    });
  }
  // Auto-contain (FR6): tighten each container to hug its member nodes' boxes
  // (shared geometry, so the static SVG matches the live runtime's live recompute).
  const sgBoxes = computeSubgraphBoxes(positionedSubgraphs, nodeBoxes);
  for (const sg of positionedSubgraphs) {
    const b = sgBoxes.get(sg.id)!;
    sg.x = b.x;
    sg.y = b.y;
    sg.width = b.width;
    sg.height = b.height;
  }
  const subgraphBoxes: NodeBox[] = positionedSubgraphs.map((sg) => ({
    x: sg.x,
    y: sg.y,
    width: sg.width,
    height: sg.height,
  }));

  // Distribute each edge's anchors around the node perimeter by direction and
  // spread edges that still share a border onto distinct channels, so a hub fans
  // out (FR2), anti-parallel pairs don't fully occlude, and a fan's start markers
  // each sit on their own edge; the label plate sizes let it also stagger
  // colliding labels (TEST-006).
  const labelSizes = model.edges.map((e) => labelPlateSize(e.label, theme));
  const ports = computePerimeterPorts(model.edges, nodeBoxes, labelSizes);

  const edges: RoutedEdge[] = [];
  model.edges.forEach((edge, i) => {
    const from = nodeBoxes.get(edge.from);
    const to = nodeBoxes.get(edge.to);
    if (!from || !to) return;
    // Multi-rank / back edges: reuse dagre's own routing bends (it already
    // steers them around intervening ranks) instead of a naive straight elbow
    // that would cut through the nodes in between. Adjacent edges (dagre emits
    // ≤3 points: two border-attach ends + a single rank-gap bend) keep the
    // border-anchored elbow, so their routing is unchanged.
    const waypoints = edgeWaypoints(g, edge.from, edge.to, `e${i}`);
    const port = ports[i]!;
    const routed = routeEdge(from, to, model.direction, theme.edgeStyle, waypoints, port);
    const out: RoutedEdge = { ...edge, points: routed.points, path: routed.path };
    if (waypoints.length > 0) out.waypoints = waypoints;
    if (port.source.offset !== 0 || port.target.offset !== 0 || port.labelShift) out.ports = port;
    if (edge.label) out.labelPos = routed.labelPos;
    edges.push(out);
  });

  const allEdgePoints = edges.flatMap((e) => e.points);
  const bounds = contentBounds(
    [...subgraphBoxes, ...positionedNodes.map(toBox)],
    allEdgePoints,
    BOUNDS_PADDING,
  );

  return {
    direction: model.direction,
    nodes: positionedNodes,
    edges,
    subgraphs: positionedSubgraphs,
    classDefs: model.classDefs,
    bounds,
  };
}

/**
 * Validate the index-keyed anchor pins (FR7 / REV-007) from a portable
 * `layout.json` against the model's *current* edges, returning an override array
 * aligned index-for-index with `edges` (mirrors the runtime's `importLayout`).
 *
 * A pin is placed at edge index `i` when: its key is in range and (it carries no
 * endpoint identity, or its `from`/`to` still match `edges[i]`). Otherwise, if it
 * carries identity, it is re-mapped to the first still-unclaimed edge with that
 * `from`/`to` (so a reordered edge keeps its pin). A pin that is out of range with
 * no identity, or whose endpoints no longer exist, is dropped — never silently
 * applied to a different edge, and never re-persisted as a dangling entry.
 */
function resolveAnchorOverrides(
  edges: PositionedModel["edges"],
  anchors: Record<string, EdgeAnchorOverride>,
): Array<EdgeAnchorOverride | undefined> {
  const out: Array<EdgeAnchorOverride | undefined> = edges.map(() => undefined);
  const claimed = new Set<number>();
  for (const key of Object.keys(anchors)) {
    const entry = anchors[key];
    if (!entry || (!entry.source && !entry.target)) continue;
    const idx = Number(key);
    const inRange = Number.isInteger(idx) && idx >= 0 && idx < edges.length;
    const hasId = entry.from !== undefined && entry.to !== undefined;
    let ti = -1;
    if (inRange && (!hasId || (edges[idx]!.from === entry.from && edges[idx]!.to === entry.to))) {
      ti = idx;
    } else if (hasId) {
      ti = edges.findIndex((e, i) => !claimed.has(i) && e.from === entry.from && e.to === entry.to);
    }
    if (ti < 0 || claimed.has(ti)) continue; // out of range / edge gone / duplicate → drop
    claimed.add(ti);
    out[ti] = { source: entry.source, target: entry.target };
  }
  return out;
}

/**
 * Apply an externally-supplied set of node positions (and optional **size
 * overrides** — FR1/FR4) from a portable `layout.json` sidecar over an
 * already-positioned model: move / resize the matching nodes, re-route every
 * edge, and recompute bounds. Subgraph boxes are kept. Edge anchors are
 * **recomputed** from the moved/resized boxes (matching the live DOM runtime),
 * so a repositioned or resized layout re-distributes its connectors cleanly.
 */
export function applyPositions(
  model: PositionedModel,
  positions: Record<string, { x: number; y: number }>,
  opts: {
    theme?: Theme;
    sizes?: Record<string, { width: number; height: number }>;
    /** Per-anchor overrides (FR7), keyed by edge index; pins one/both ends. */
    anchors?: Record<string, EdgeAnchorOverride>;
  } = {},
): PositionedModel {
  const theme = opts.theme ?? themes.light!;
  const sizeOverrides = opts.sizes;
  const nodeBoxes = new Map<string, NodeBox>();
  const nodes: PositionedNode[] = model.nodes.map((node) => {
    const p = positions[node.id];
    const sz = sizeOverrides?.[node.id];
    const x = p ? p.x : node.x;
    const y = p ? p.y : node.y;
    const width = sz ? sz.width : node.width;
    const height = sz ? sz.height : node.height;
    nodeBoxes.set(node.id, { x, y, width, height, shape: node.shape });
    return { ...node, x, y, width, height };
  });

  // Keep the original detour waypoints so a sidecar/repositioned layout still
  // routes multi-rank edges around intervening ranks (matching the live DOM
  // runtime, which keeps them while dragging), but recompute the perimeter port
  // channels from the moved/resized boxes so a spread anti-parallel pair / fan /
  // hub stays legible after repositioning. Manually pinned anchors (FR7) override
  // the auto-distribute for that end only.
  const labelSizes = model.edges.map((e) => labelPlateSize(e.label, theme));
  // Resolve the index-keyed anchor pins (FR7) against the *current* edges before
  // handing them to the geometry: a portable layout.json can outlive the diagram
  // it was captured from, so drop any pin whose index is out of range and — when
  // the pin carries endpoint identity (REV-007) — re-map it to the edge that still
  // has that `from`/`to` (so a reordered edge keeps its pin) or drop it if that
  // edge is gone. Pins without identity (pre-REV-007 sidecars) are bounds-checked
  // only. Prevents a stale pin from silently mis-anchoring a *different* edge.
  const anchorOverrides = opts.anchors
    ? resolveAnchorOverrides(model.edges, opts.anchors)
    : undefined;
  const ports = computePerimeterPorts(model.edges, nodeBoxes, labelSizes, anchorOverrides);

  const edges: RoutedEdge[] = model.edges.map((edge, i) => {
    const from = nodeBoxes.get(edge.from);
    const to = nodeBoxes.get(edge.to);
    if (!from || !to) return edge;
    const port = ports[i]!;
    const routed = routeEdge(from, to, model.direction, theme.edgeStyle, edge.waypoints ?? [], port);
    const out: RoutedEdge = { ...edge, points: routed.points, path: routed.path };
    if (edge.waypoints) out.waypoints = edge.waypoints;
    if (port.source.offset !== 0 || port.target.offset !== 0 || port.labelShift) out.ports = port;
    else delete out.ports;
    if (edge.label) out.labelPos = routed.labelPos;
    return out;
  });

  // Auto-contain (FR6): re-hug every subgraph to its (possibly moved/resized)
  // members via the shared recompute, matching the live runtime for parity.
  const sgBoxes = computeSubgraphBoxes(model.subgraphs, nodeBoxes);
  const subgraphs: PositionedSubgraph[] = model.subgraphs.map((sg) => {
    const b = sgBoxes.get(sg.id)!;
    return { ...sg, x: b.x, y: b.y, width: b.width, height: b.height };
  });
  const subgraphBoxes: NodeBox[] = subgraphs.map((sg) => ({
    x: sg.x,
    y: sg.y,
    width: sg.width,
    height: sg.height,
  }));
  const bounds = contentBounds(
    [...subgraphBoxes, ...nodes.map(toBox)],
    edges.flatMap((e) => e.points),
    BOUNDS_PADDING,
  );
  return { ...model, nodes, edges, subgraphs, bounds };
}

/**
 * Extract dagre's interior routing bends for an edge. Returns `[]` for adjacent
 * edges (≤3 points: two border-attach ends plus a single rank-gap midpoint),
 * and the stripped interior points (dagre's border-attach ends removed, rounded)
 * for genuine multi-rank / back edges that dagre steered around other nodes.
 */
function edgeWaypoints(
  g: InstanceType<typeof dagre.graphlib.Graph>,
  from: string,
  to: string,
  name: string,
): Point[] {
  if (!g.hasEdge(from, to, name)) return [];
  const raw = (g.edge(from, to, name) as { points?: Array<{ x: number; y: number }> }).points;
  if (!raw || raw.length <= 3) return [];
  return raw.slice(1, -1).map((p) => ({ x: round(p.x), y: round(p.y) }));
}

/**
 * Estimate an edge label's background-plate size — the SAME formula the SVG sink
 * (`edgeLabel`) and the DOM runtime use, so the port spreader can stagger plates
 * that would otherwise overlap. Returns `undefined` for an unlabelled edge.
 */
export function labelPlateSize(label: string | undefined, theme: Theme): { w: number; h: number } | undefined {
  if (!label) return undefined;
  const f = theme.tokens.font;
  const lines = label.split("\n");
  const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
  return { w: maxChars * f.size * 0.62 + 10, h: lines.length * f.lineHeight + 4 };
}

function toBox(node: PositionedNode): NodeBox {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
