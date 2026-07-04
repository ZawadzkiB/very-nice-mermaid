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
import { contentBounds, routeEdge, computePortOffsets, type NodeBox } from "../geometry/index.js";
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
    };
    nodeBoxes.set(node.id, box);
    return { ...node, x: box.x, y: box.y, width: box.width, height: box.height };
  });

  const positionedSubgraphs: PositionedSubgraph[] = [];
  const subgraphBoxes: NodeBox[] = [];
  for (const sg of model.subgraphs) {
    const sd = g.node(sg.id) as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    if (!sd || !Number.isFinite(sd.x) || !Number.isFinite(sd.width)) continue;
    const box: NodeBox = { x: round(sd.x), y: round(sd.y), width: sd.width, height: sd.height };
    subgraphBoxes.push(box);
    positionedSubgraphs.push({ ...sg, x: box.x, y: box.y, width: box.width, height: box.height });
  }

  // Spread edges that share a node border onto distinct channels so anti-parallel
  // pairs don't fully occlude and a fan's start markers each sit on their own edge;
  // the label plate sizes let it also stagger colliding labels (TEST-006).
  const labelSizes = model.edges.map((e) => labelPlateSize(e.label, theme));
  const ports = computePortOffsets(model.edges, nodeBoxes, model.direction, labelSizes);

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
    if (port.source !== 0 || port.target !== 0 || port.labelShift) out.ports = port;
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
 * Apply an externally-supplied set of node positions (a portable
 * `layout.json` sidecar) over an already-positioned model: move the matching
 * nodes, re-route every edge, and recompute bounds. Subgraph boxes are kept.
 */
export function applyPositions(
  model: PositionedModel,
  positions: Record<string, { x: number; y: number }>,
  opts: { theme?: Theme } = {},
): PositionedModel {
  const theme = opts.theme ?? themes.light!;
  const nodeBoxes = new Map<string, NodeBox>();
  const nodes: PositionedNode[] = model.nodes.map((node) => {
    const p = positions[node.id];
    const x = p ? p.x : node.x;
    const y = p ? p.y : node.y;
    nodeBoxes.set(node.id, { x, y, width: node.width, height: node.height });
    return { ...node, x, y };
  });

  const edges: RoutedEdge[] = model.edges.map((edge) => {
    const from = nodeBoxes.get(edge.from);
    const to = nodeBoxes.get(edge.to);
    if (!from || !to) return edge;
    // Keep the original detour waypoints so a sidecar/repositioned layout still
    // routes multi-rank edges around intervening ranks (matching the live DOM
    // runtime, which keeps them while dragging), and the same port channels so a
    // spread anti-parallel pair / fan stays legible after repositioning.
    const routed = routeEdge(from, to, model.direction, theme.edgeStyle, edge.waypoints ?? [], edge.ports);
    const out: RoutedEdge = { ...edge, points: routed.points, path: routed.path };
    if (edge.waypoints) out.waypoints = edge.waypoints;
    if (edge.ports) out.ports = edge.ports;
    if (edge.label) out.labelPos = routed.labelPos;
    return out;
  });

  const subgraphBoxes: NodeBox[] = model.subgraphs.map((sg) => ({
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
  return { ...model, nodes, edges, bounds };
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
function labelPlateSize(label: string | undefined, theme: Theme): { w: number; h: number } | undefined {
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
