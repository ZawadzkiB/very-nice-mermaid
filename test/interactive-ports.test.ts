/**
 * Exported-HTML / mount() port-offset coverage (TEST-003).
 *
 * The round-5 anti-parallel/fan fix landed in the STATIC SVG (src/geometry +
 * src/layout) but never reached `src/render/dom/runtime.ts` — the serialized
 * router that `mount()`, `mountAsync()`, the `<very-nice-mermaid>` element AND
 * the CLI's `-f html` export all use. The static-SVG snapshots stayed green
 * while the interactive/exported view still fully occluded anti-parallel edges
 * and collapsed fans. This suite closes that gap: it EXECUTES the real exported
 * HTML in jsdom (the `.toString()`-serialized runtime + embedded payload — the
 * exact bytes the CLI writes) and asserts the live edge paths, so a future
 * runtime-only regression fails here instead of shipping.
 */

import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { renderHtml } from "../src/export/html.js";
import { layoutState } from "../src/native/state/layout.js";
import { layoutClass } from "../src/native/class/layout.js";
import { routeEdge, computePortOffsets, type NodeBox } from "../src/geometry/index.js";
import { themes, type Theme } from "../src/theme/index.js";
import type { PositionedModel } from "../src/model/index.js";
import type { StateModel } from "../src/model/state.js";
import type { ClassModel } from "../src/model/class.js";

/** Run an exported-HTML document in jsdom and read the live edge `d` paths, in model order. */
function mountedEdgePaths(html: string): string[] {
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
  const svg = dom.window.document.querySelector("svg.vnm-edges");
  if (!svg) throw new Error("no edge layer rendered");
  // Edge <path>s are direct children of the svg (in model.edges order); the
  // arrowhead marker <path> is nested inside <defs>, so filtering direct
  // children to paths yields exactly the edges.
  const kids = Array.from(svg.children) as Element[];
  return kids
    .filter((c) => c.tagName.toLowerCase() === "path")
    .map((p) => p.getAttribute("d") ?? "");
}

/** Shared-geometry expected paths for a positioned model, in world coords + ports. */
function expectedPaths(model: PositionedModel, theme: Theme): string[] {
  const off = model.bounds;
  const boxes = new Map<string, NodeBox>();
  for (const nd of model.nodes) {
    boxes.set(nd.id, { x: nd.x - off.x, y: nd.y - off.y, width: nd.width, height: nd.height });
  }
  const ports = computePortOffsets(model.edges, boxes, model.direction);
  return model.edges.map((e, i) => {
    const wps = (e.waypoints ?? []).map((p) => ({ x: p.x - off.x, y: p.y - off.y }));
    return routeEdge(boxes.get(e.from)!, boxes.get(e.to)!, model.direction, theme.edgeStyle, wps, ports[i]).path;
  });
}

/** Normalize a path to its unordered point set — mirror-duplicates compare equal. */
function pointSet(d: string): string {
  return (d.match(/-?[\d.]+ -?[\d.]+/g) ?? []).slice().sort().join("|");
}

const STATE: StateModel = {
  kind: "state",
  states: [
    { id: "start", label: "", kind: "start" },
    { id: "Idle", label: "Idle", kind: "normal" },
    { id: "Running", label: "Running", kind: "normal" },
    { id: "Paused", label: "Paused", kind: "normal" },
  ],
  transitions: [
    { from: "start", to: "Idle" },
    { from: "Idle", to: "Running", label: "start" },
    { from: "Running", to: "Idle", label: "stop" },
    { from: "Running", to: "Paused", label: "pause" },
    { from: "Paused", to: "Running", label: "resume" },
  ],
  warnings: [],
};

const CLASS: ClassModel = {
  kind: "class",
  classes: [
    { id: "Dog", name: "Dog", members: [], methods: [] },
    { id: "Collar", name: "Collar", members: [], methods: [] },
    { id: "Vet", name: "Vet", members: [], methods: [] },
    { id: "Vaccine", name: "Vaccine", members: [], methods: [] },
  ],
  relations: [
    { from: "Dog", to: "Collar", type: "composition", head: "from", label: "has" },
    { from: "Dog", to: "Vet", type: "association", head: "to", label: "visits" },
    { from: "Dog", to: "Vaccine", type: "dependency", head: "to", label: "uses" },
  ],
  warnings: [],
};

describe("exported HTML / mount() applies port offsets (TEST-003)", () => {
  it("(a) anti-parallel state transitions render on DISTINCT paths (not mirror-duplicates)", () => {
    const layout = layoutState(STATE, { theme: themes.light! });
    const html = renderHtml(layout, { theme: "light", persist: false, minimap: false });
    const paths = mountedEdgePaths(html);

    // the exported runtime reproduces the shared geometry point-for-point
    expect(paths).toEqual(expectedPaths(layout.model, themes.light!));

    const edges = layout.model.edges;
    const at = (from: string, to: string): string =>
      paths[edges.findIndex((e) => e.from === from && e.to === to)]!;

    // Idle<->Running: the two opposite transitions are on separate channels, so
    // their point SETS differ (the bug drew them as one mirror-duplicated line).
    expect(pointSet(at("Idle", "Running"))).not.toBe(pointSet(at("Running", "Idle")));
    // Running<->Paused likewise
    expect(pointSet(at("Running", "Paused"))).not.toBe(pointSet(at("Paused", "Running")));
  });

  it("(b) a class fan (has/visits/uses) leaves the node at THREE distinct start points", () => {
    const layout = layoutClass(CLASS, { theme: themes.light! });
    const html = renderHtml(layout, { theme: "light", persist: false, minimap: false });
    const paths = mountedEdgePaths(html);

    expect(paths).toEqual(expectedPaths(layout.model, themes.light!));

    // the three Dog-> edges each start at their own anchor (no shared trunk)
    const edges = layout.model.edges;
    const fanStarts = edges
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.from === "Dog")
      .map(({ i }) => {
        const d = paths[i]!;
        const cut = d.indexOf(" L ");
        return d.slice(0, cut >= 0 ? cut : d.length);
      });
    expect(fanStarts.length).toBe(3);
    expect(new Set(fanStarts).size).toBe(3);
  });
});
