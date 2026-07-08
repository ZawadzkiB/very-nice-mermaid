/**
 * Lay out a {@link StateModel} with **our own dagre** (FR2 / spike-01.md: we
 * discard mermaid's degenerate headless state geometry). We build a flowchart
 * {@link DiagramModel} — each state a node (normal states rounded cards, `[*]`
 * start/end as `circle` nodes), each transition a directed edge — reuse the
 * shared `layout()`, then **shrink the start/end pseudo-states to small circles**
 * and re-route their edges (so the interactive runtime + the static SVG both
 * anchor transitions to the small marker, gap-free). Pure + deterministic.
 */

import type {
  DiagramModel,
  DiagramNode,
  DiagramEdge,
  RoutedEdge,
  PositionedNode,
} from "../../model/index.js";
import type { StateModel, StateLayout } from "../../model/state.js";
import { themes, type Theme } from "../../theme/index.js";
import { layout, labelPlateSize } from "../../layout/index.js";
import { routeEdge, computePerimeterPorts, contentBounds, type NodeBox } from "../../geometry/index.js";

export interface StateLayoutOptions {
  theme?: Theme;
}

/** Diameter of the start/end pseudo-state circles. */
const PSEUDO = 22;
const BOUNDS_PADDING = 20;

/** Lay out a {@link StateModel} into a positioned {@link StateLayout}. */
export function layoutState(model: StateModel, opts: StateLayoutOptions = {}): StateLayout {
  const theme = opts.theme ?? themes.light!;
  const pseudo = new Set(model.states.filter((s) => s.kind !== "normal").map((s) => s.id));

  const nodes: DiagramNode[] = model.states.map((s) => ({
    id: s.id,
    label: s.kind === "normal" ? s.label : "",
    shape: s.kind === "normal" ? "rounded" : "circle",
    classes: [],
  }));

  const edges: DiagramEdge[] = model.transitions.map((tr) => {
    const edge: DiagramEdge = {
      from: tr.from,
      to: tr.to,
      kind: "solid",
      arrows: { start: false, end: true },
      length: 2,
    };
    if (tr.label) edge.label = tr.label;
    return edge;
  });

  const diagram: DiagramModel = {
    direction: "TB",
    nodes,
    edges,
    subgraphs: [],
    classDefs: new Map(),
    warnings: [],
  };

  const positioned = layout(diagram, { theme });
  if (pseudo.size === 0) {
    return { kind: "state-layout", model: positioned, states: model.states };
  }

  // Shrink the start/end pseudo-states to small circles and re-route every edge
  // against the updated boxes (keeping dagre's detour waypoints) so transitions
  // still meet the small marker cleanly.
  const boxes = new Map<string, NodeBox>();
  const shrunk: PositionedNode[] = positioned.nodes.map((nd) => {
    const box: NodeBox = pseudo.has(nd.id)
      ? { x: nd.x, y: nd.y, width: PSEUDO, height: PSEUDO, shape: nd.shape }
      : { x: nd.x, y: nd.y, width: nd.width, height: nd.height, shape: nd.shape };
    boxes.set(nd.id, box);
    return { ...nd, width: box.width, height: box.height };
  });

  // Recompute the perimeter port channels against the shrunk pseudo-state boxes
  // (matching the live runtime / applyPositions) so transitions re-distribute
  // around the small markers cleanly.
  const labelSizes = positioned.edges.map((e) => labelPlateSize(e.label, theme));
  const ports = computePerimeterPorts(positioned.edges, boxes, labelSizes);
  const routed: RoutedEdge[] = positioned.edges.map((e, i) => {
    const from = boxes.get(e.from);
    const to = boxes.get(e.to);
    if (!from || !to) return e;
    const port = ports[i]!;
    const r = routeEdge(from, to, positioned.direction, theme.edgeStyle, e.waypoints ?? [], port);
    const out: RoutedEdge = { ...e, points: r.points, path: r.path };
    if (e.waypoints) out.waypoints = e.waypoints;
    if (port.source.offset !== 0 || port.target.offset !== 0 || port.labelShift) out.ports = port;
    else delete out.ports;
    if (e.label) out.labelPos = r.labelPos;
    return out;
  });

  const bounds = contentBounds(
    shrunk.map((nd) => ({ x: nd.x, y: nd.y, width: nd.width, height: nd.height })),
    routed.flatMap((e) => e.points),
    BOUNDS_PADDING,
  );

  return {
    kind: "state-layout",
    model: { ...positioned, nodes: shrunk, edges: routed, bounds },
    states: model.states,
  };
}
