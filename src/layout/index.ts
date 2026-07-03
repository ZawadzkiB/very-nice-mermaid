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
} from "../model/index.js";
import { themes, type Theme } from "../theme/index.js";
import { contentBounds, routeEdge, type NodeBox } from "../geometry/index.js";
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

  const edges: RoutedEdge[] = [];
  for (const edge of model.edges) {
    const from = nodeBoxes.get(edge.from);
    const to = nodeBoxes.get(edge.to);
    if (!from || !to) continue;
    const routed = routeEdge(from, to, model.direction, theme.edgeStyle);
    const out: RoutedEdge = { ...edge, points: routed.points, path: routed.path };
    if (edge.label) out.labelPos = routed.labelPos;
    edges.push(out);
  }

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

function toBox(node: PositionedNode): NodeBox {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
