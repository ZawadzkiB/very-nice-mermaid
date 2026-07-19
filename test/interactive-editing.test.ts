/**
 * Interactive-editing feature coverage (v0.3.0): node **size overrides** thread
 * through the model + the portable `layout.json` sidecar and the static SVG
 * honors both the sizes and the perimeter anchor distribution (FR1/FR2/FR4). The
 * live DOM runtime's twin behaviour (resize handles, live re-route, `toSvgString`
 * parity) is guarded in `dom-runtime-parity.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { XMLValidator } from "fast-xml-parser";
import { parse } from "../src/parser/index.js";
import { layout, applyPositions } from "../src/layout/index.js";
import { renderSvgFromModel } from "../src/render/svg.js";
import {
  computePerimeterPorts,
  contentBounds,
  subgraphBox,
  type NodeBox,
} from "../src/geometry/index.js";
import { themes } from "../src/theme/index.js";
import type { PositionedModel } from "../src/model/index.js";

const theme = themes.light!;

describe("size overrides thread through the model + layout.json (FR1/FR4)", () => {
  it("applyPositions applies a size override and re-routes edges to the new border", () => {
    const base = layout(parse("flowchart TD\nA-->B"), { theme });
    const a = base.nodes.find((n) => n.id === "A")!;
    const sized = applyPositions(base, {}, { theme, sizes: { A: { width: a.width + 80, height: a.height + 40 } } });
    const a2 = sized.nodes.find((n) => n.id === "A")!;
    expect(a2.width).toBe(a.width + 80);
    expect(a2.height).toBe(a.height + 40);
    // A grew symmetrically about its center, so its bottom border moved DOWN and
    // the A->B edge now starts lower than before (re-routed to the new border).
    expect(sized.edges[0]!.points[0]!.y).toBeGreaterThan(base.edges[0]!.points[0]!.y);
  });

  it("a portable layout.json { positions, sizes } round-trips to the same model", () => {
    const base = layout(parse("flowchart TD\nA-->B-->C"), { theme });
    const b = base.nodes.find((n) => n.id === "B")!;
    const positions = { B: { x: b.x + 25, y: b.y } };
    const sizes = { B: { width: b.width + 50, height: b.height + 24 } };
    // serialize the sidecar to JSON and back — the exact shape the CLI's --layout
    // reads and the runtime's exportLayout writes (with { w, h }).
    const sidecar = JSON.parse(JSON.stringify({ positions, sizes }));
    const a = applyPositions(base, sidecar.positions, { theme, sizes: sidecar.sizes });
    const b2 = a.nodes.find((n) => n.id === "B")!;
    expect(b2.width).toBe(b.width + 50);
    expect(b2.height).toBe(b.height + 24);
    expect(b2.x).toBe(b.x + 25);
    // deterministic: applying the same sidecar again yields byte-identical geometry
    const again = applyPositions(base, sidecar.positions, { theme, sizes: sidecar.sizes });
    expect(JSON.stringify(a.edges)).toBe(JSON.stringify(again.edges));
  });

  it("the resized model's static SVG draws the enlarged node box and stays valid XML", () => {
    const base = layout(parse("flowchart TD\nA-->B"), { theme });
    const sized = applyPositions(base, {}, { theme, sizes: { A: { width: 180, height: 90 } } });
    const svg = renderSvgFromModel(sized, theme);
    expect(svg).toContain('width="180" height="90"'); // A's rect honours the override
    expect(XMLValidator.validate(svg)).toBe(true);
  });
});

describe("static SVG honors the perimeter anchor distribution (FR2)", () => {
  // A hub with neighbours in every direction — its edges must leave via several
  // different borders (not cluster on the layout's primary axis).
  function hub(): PositionedModel {
    const spec: Array<[string, number, number]> = [
      ["H", 240, 240],
      ["Nn", 240, 60],
      ["Ss", 240, 430],
      ["Ee", 430, 240],
      ["Ww", 40, 240],
    ];
    const boxes = new Map<string, NodeBox>(spec.map(([id, x, y]) => [id, { x, y, width: 70, height: 44 }]));
    return {
      direction: "TB",
      nodes: spec.map(([id, x, y]) => ({ id, label: id, shape: "rect", classes: [], x, y, width: 70, height: 44 })),
      edges: ["Nn", "Ss", "Ee", "Ww"].map((to) => ({
        from: "H",
        to,
        kind: "solid",
        arrows: { start: false, end: true },
        length: 2,
        points: [],
        path: "",
      })),
      subgraphs: [],
      classDefs: new Map(),
      bounds: contentBounds([...boxes.values()], [], 20),
    };
  }

  it("routes a hub's four edges out four distinct borders", () => {
    const model = hub();
    const boxes = new Map<string, NodeBox>(
      model.nodes.map((n) => [n.id, { x: n.x, y: n.y, width: n.width, height: n.height }]),
    );
    const ports = computePerimeterPorts(model.edges, boxes);
    const sides = ports.map((p) => p.source.side);
    // N/S/E/W → top / bottom / right / left: four different borders on the hub
    expect(new Set(sides).size).toBe(4);
    // route it (bake edge paths) and render — valid SVG, each edge from a distinct point
    const routed = applyPositions(model, {}, { theme });
    const svg = renderSvgFromModel(routed, theme);
    expect(XMLValidator.validate(svg)).toBe(true);
    // Exclude the layer-6 arrowhead caps (class="vnm-arrow-cap") — they add a stub
    // path near each TARGET, which is not one of the hub's four outgoing starts.
    const trunk = svg.replace(/<path class="vnm-arrow-cap"[^>]*\/>/g, "");
    const starts = trunk.match(/<path d="M [\d.-]+ [\d.-]+/g) ?? [];
    expect(new Set(starts).size).toBe(4);
  });
});

// ---- FR6 (D6=C) subgraph auto-contain: the container box is recomputed from
// its members' live boxes (+ padding + title band) in shared geometry, so the
// static SVG hugs / re-hugs exactly as the live runtime does.
const SG_DSL = ["flowchart TD", "subgraph G[Box]", "  A --> B", "end", "B --> C"].join("\n");

describe("subgraph auto-contain recompute (FR6 / D6=C)", () => {
  const nodeBox = (m: PositionedModel, id: string): NodeBox => {
    const n = m.nodes.find((x) => x.id === id)!;
    return { x: n.x, y: n.y, width: n.width, height: n.height };
  };

  it("layout() hugs a container to its members via the shared subgraphBox", () => {
    const base = layout(parse(SG_DSL), { theme });
    const g = base.subgraphs.find((s) => s.id === "G")!;
    const expected = subgraphBox([nodeBox(base, "A"), nodeBox(base, "B")], true)!;
    expect({ x: g.x, y: g.y, width: g.width, height: g.height }).toEqual(expected);
    // the box actually encloses both members (with margin), and NOT the outsider C
    expect(g.x - g.width / 2).toBeLessThan(Math.min(base.nodes.find((n) => n.id === "A")!.x, base.nodes.find((n) => n.id === "B")!.x));
    const c = base.nodes.find((n) => n.id === "C")!;
    expect(c.y + c.height / 2).toBeGreaterThan(g.y + g.height / 2); // C sits below the box
  });

  it("applyPositions re-hugs the container after a child is dragged, deterministically", () => {
    const base = layout(parse(SG_DSL), { theme });
    const a = base.nodes.find((n) => n.id === "A")!;
    const moved = { A: { x: a.x - 120, y: a.y - 60 } };
    const out = applyPositions(base, moved, { theme });
    const g = out.subgraphs.find((s) => s.id === "G")!;
    const expected = subgraphBox([{ x: a.x - 120, y: a.y - 60, width: a.width, height: a.height }, nodeBox(base, "B")], true)!;
    expect({ x: g.x, y: g.y, width: g.width, height: g.height }).toEqual(expected);
    // the box grew to follow the child dragged up-and-left (never stranded)
    const g0 = base.subgraphs.find((s) => s.id === "G")!;
    expect(g.width).toBeGreaterThan(g0.width);
    // deterministic: applying the identical drag again yields byte-identical subgraphs
    const again = applyPositions(base, moved, { theme });
    expect(JSON.stringify(out.subgraphs)).toBe(JSON.stringify(again.subgraphs));
  });
});

// ---- FR7 (D7=A) manual per-anchor override: a pinned {side,offset} is used
// verbatim for that end only; the other end keeps auto-distribute; the static
// SVG honors the pin (parity with the live runtime is guarded in dom-runtime-parity).
describe("manual per-anchor override in the static path (FR7 / D7=A)", () => {
  const FAN_DSL = "flowchart TD\nA-->B\nA-->C\nA-->D"; // A is a 3-way fan source

  it("pins one edge end to the chosen border while the others auto-distribute", () => {
    const base = layout(parse(FAN_DSL), { theme });
    const a = base.nodes.find((n) => n.id === "A")!;
    // edge 0 is A-->B; pin its SOURCE to A's right border, offset 0
    const anchors = { "0": { source: { side: "right" as const, offset: 0 } } };
    const out = applyPositions(base, {}, { theme, anchors });

    // A-->B now leaves A's right border exactly at the side center
    const p0 = out.edges[0]!.points[0]!;
    expect(p0.x).toBeCloseTo(a.x + a.width / 2, 6);
    expect(p0.y).toBeCloseTo(a.y, 6);
    // without the pin it left a DIFFERENT border (the fan spreads across the bottom)
    const auto = applyPositions(base, {}, { theme });
    expect(auto.edges[0]!.points[0]!.x).not.toBeCloseTo(a.x + a.width / 2, 1);
    // the OTHER two edges keep auto-distributing — still on A's bottom border
    // (the pinned edge simply left their spread pool, so they re-spread as a pair)
    const bottomY = a.y + a.height / 2;
    expect(out.edges[1]!.points[0]!.y).toBeCloseTo(bottomY, 6);
    expect(out.edges[2]!.points[0]!.y).toBeCloseTo(bottomY, 6);
    // all three still start at three distinct anchors (nothing collapsed)
    const starts = out.edges.map((e) => `${e.points[0]!.x},${e.points[0]!.y}`);
    expect(new Set(starts).size).toBe(3);

    // the static SVG carries a path starting at the pinned right-border anchor
    const svg = renderSvgFromModel(out, theme);
    expect(XMLValidator.validate(svg)).toBe(true);
    expect(svg).toContain(`<path d="M ${a.x + a.width / 2} ${a.y}`);
  });

  it("is deterministic and clamps the offset to the border extent", () => {
    const base = layout(parse(FAN_DSL), { theme });
    const a = base.nodes.find((n) => n.id === "A")!;
    // a wildly out-of-range offset clamps to (halfHeight - 6) on the right border
    const anchors = { "0": { source: { side: "right" as const, offset: 9999 } } };
    const out = applyPositions(base, {}, { theme, anchors });
    const again = applyPositions(base, {}, { theme, anchors });
    expect(JSON.stringify(out.edges)).toBe(JSON.stringify(again.edges));
    const p0 = out.edges[0]!.points[0]!;
    expect(p0.y).toBeCloseTo(a.y + (a.height / 2 - 6), 6); // clamped, not off the corner
  });

  // ---- REV-007: applyPositions validates the index-keyed pins from a portable
  // layout.json against the CURRENT edges, so a sidecar that outlived its diagram
  // never mis-anchors a different edge.
  it("drops an out-of-range anchor index instead of mis-applying it (REV-007)", () => {
    const base = layout(parse(FAN_DSL), { theme }); // 3 edges → valid indices 0..2
    const auto = applyPositions(base, {}, { theme });
    // index 7 doesn't exist → ignored; the model is identical to no-anchors
    const out = applyPositions(base, {}, { theme, anchors: { "7": { source: { side: "left", offset: 5 } } } });
    expect(JSON.stringify(out.edges)).toBe(JSON.stringify(auto.edges));
  });

  it("re-maps an id-tagged pin to its edge when the imported index no longer matches (REV-007)", () => {
    const base = layout(parse(FAN_DSL), { theme });
    const a = base.nodes.find((n) => n.id === "A")!;
    // a pin stored at index 0 but tagged from A to D (A-->D is now index 2): the
    // endpoint identity re-maps it to the CURRENT A-->D edge, not index 0 (A-->B).
    const out = applyPositions(base, {}, {
      theme,
      anchors: { "0": { source: { side: "right" as const, offset: 0 }, from: "A", to: "D" } },
    });
    // edge 2 (A-->D) leaves A's right border; edge 0 (A-->B) is untouched (auto)
    expect(out.edges[2]!.points[0]!.x).toBeCloseTo(a.x + a.width / 2, 6);
    expect(out.edges[2]!.points[0]!.y).toBeCloseTo(a.y, 6);
    expect(out.edges[0]!.points[0]!.x).not.toBeCloseTo(a.x + a.width / 2, 1);
  });
});
