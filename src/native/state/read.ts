/**
 * SVG → model reader for native state diagrams (FR2 / D3) — the same pattern as
 * the class reader, a bit simpler (no member/method compartments).
 *
 * We render the state DSL once with mermaid (`htmlLabels:false`, via the shared
 * lazy {@link loadMermaid} path), read a clean {@link StateModel} from the SVG,
 * and **discard mermaid's geometry** (its headless state layout is degenerate —
 * spike-01.md), re-laying it out with our own dagre in `layoutState`.
 *
 * State transitions do **not** encode their endpoints in the edge id (they are
 * just `edge0`, `edge1`, …), so `from`/`to` are recovered by matching each
 * transition path's first/last point to the nearest **state node center** (the
 * node's `translate(x, y)`). Transition labels pair to edges by centroid.
 *
 * Browser-safe: no static mermaid/jsdom import — mermaid is loaded through
 * {@link loadMermaid} (dynamic), and the SVG is parsed with `DOMParser`.
 */

import type {
  StateModel,
  StateNode,
  StateNodeKind,
  StateTransition,
} from "../../model/state.js";
import { loadMermaid } from "../../mermaid/router.js";
import {
  hasClass,
  pathPoints,
  parseTranslate,
  readEdgeLabelMap,
  type Pt,
} from "../read-util.js";

/** A stable id keeps mermaid's internal ids deterministic across runs. */
const READ_ID = "vnm-state-read";

/** Render the state DSL to an SVG string via mermaid (headless-safe config). */
async function renderMermaidSvg(dsl: string): Promise<string> {
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    deterministicIds: true,
    htmlLabels: false,
    state: { htmlLabels: false },
  });
  const { svg } = await mermaid.render(READ_ID, dsl);
  return svg;
}

/**
 * Recover the state name from a node id (`<render>-state-<Name>-<index>`). The
 * greedy `^.*` anchors to the LAST `-state-`, so the render id (which itself
 * contains `-state-`) can't be mis-captured.
 */
function stateNameFromId(id: string): string | null {
  const m = /^.*-state-(.+)-\d+$/.exec(id);
  return m ? m[1]! : null;
}

/** Classify a state node as normal / start / end from its id + shape + label. */
function classifyState(g: Element, name: string, label: string): StateNodeKind {
  if (g.querySelector("circle.state-start") || /(^|_)start$/.test(name)) return "start";
  if (/(^|_)end$/.test(name) || (label === "" && hasClass(g, "default"))) return "end";
  return "normal";
}

interface ReadNode extends StateNode {
  center: Pt;
}

/** Read every state node (id, label, kind, center for endpoint matching). */
function readNodes(doc: Document): ReadNode[] {
  const nodes: ReadNode[] = [];
  for (const g of Array.from(doc.querySelectorAll("g.node"))) {
    const id = g.getAttribute("id") ?? "";
    const name = stateNameFromId(id);
    if (!name) continue;
    const label = (g.querySelector("text")?.textContent ?? "").trim();
    const kind = classifyState(g, name, label);
    const center = parseTranslate(g.getAttribute("transform")) ?? { x: 0, y: 0 };
    nodes.push({ id: name, label: kind === "normal" ? label : "", kind, center });
  }
  return nodes;
}

/** The id of the node whose center is nearest to a point. */
function nearest(pt: Pt, nodes: ReadNode[]): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const nd of nodes) {
    const d = (nd.center.x - pt.x) ** 2 + (nd.center.y - pt.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = nd.id;
    }
  }
  return best;
}

/** Read directed transitions (`from`, `to`, optional `label`). */
function readTransitions(doc: Document, nodes: ReadNode[]): StateTransition[] {
  const paths = Array.from(doc.querySelectorAll("g.edgePaths path"));
  const labels = readEdgeLabelMap(doc);
  const transitions: StateTransition[] = [];
  for (const p of paths) {
    const pts = pathPoints(p.getAttribute("d") ?? "");
    if (pts.length < 2) continue;
    // Endpoints match to the nearest state center; the label links by data-id.
    const from = nearest(pts[0]!, nodes);
    const to = nearest(pts[pts.length - 1]!, nodes);
    if (!from || !to) continue;
    const tr: StateTransition = { from, to };
    const label = labels.get(p.getAttribute("data-id") ?? p.getAttribute("id") ?? "");
    if (label) tr.label = label;
    transitions.push(tr);
  }
  return transitions;
}

/**
 * Read a {@link StateModel} from a state DSL string by rendering it with mermaid
 * and parsing the SVG. Deterministic: states + directed transitions are
 * recovered from structure (not from mermaid's pixel geometry, which we discard
 * and re-layout with our own dagre).
 */
export async function readStateModel(dsl: string): Promise<StateModel> {
  const svg = await renderMermaidSvg(dsl);
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const nodes = readNodes(doc);
  const transitions = readTransitions(doc, nodes);
  const states: StateNode[] = nodes.map((nd) => ({ id: nd.id, label: nd.label, kind: nd.kind }));
  return { kind: "state", states, transitions, warnings: [] };
}
