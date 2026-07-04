import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "../src/parser/index.js";
import { layout } from "../src/layout/index.js";
import { serializeModel, type PositionedNode } from "../src/model/index.js";
import { themes } from "../src/theme/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");

function overlaps(a: PositionedNode, b: PositionedNode): boolean {
  return (
    Math.abs(a.x - b.x) * 2 < a.width + b.width &&
    Math.abs(a.y - b.y) * 2 < a.height + b.height
  );
}

/** Does segment p→q cut through node `n`'s (slightly shrunk) box interior? */
function segmentCrossesNode(
  p: { x: number; y: number },
  q: { x: number; y: number },
  node: PositionedNode,
): boolean {
  // Liang–Barsky clip, box shrunk 1px so a border-anchored endpoint doesn't count.
  const x1 = node.x - node.width / 2 + 1;
  const y1 = node.y - node.height / 2 + 1;
  const x2 = node.x + node.width / 2 - 1;
  const y2 = node.y + node.height / 2 - 1;
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const clip = (pn: number, qn: number): boolean => {
    if (pn === 0) return qn >= 0;
    const t = qn / pn;
    if (pn < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (clip(-dx, p.x - x1) && clip(dx, x2 - p.x) && clip(-dy, p.y - y1) && clip(dy, y2 - p.y)) {
    return t1 > t0 + 1e-6;
  }
  return false;
}

/** Count edge segments that pass through a node that isn't the edge's endpoint. */
function edgeThroughNodeCount(pos: ReturnType<typeof layout>): number {
  let hits = 0;
  for (const e of pos.edges) {
    for (let i = 0; i < e.points.length - 1; i++) {
      for (const node of pos.nodes) {
        if (node.id === e.from || node.id === e.to) continue;
        if (segmentCrossesNode(e.points[i]!, e.points[i + 1]!, node)) hits++;
      }
    }
  }
  return hits;
}

describe("layout determinism", () => {
  it("produces byte-identical output across runs", () => {
    const model = parse(readFileSync(join(fixturesDir, "microservices.mmd"), "utf8"));
    const a = JSON.stringify(serializeModel(layout(model)));
    const b = JSON.stringify(serializeModel(layout(parse(readFileSync(join(fixturesDir, "microservices.mmd"), "utf8")))));
    expect(a).toBe(b);
  });
});

describe("layout respects direction", () => {
  it("advances along +x for LR", () => {
    const pos = layout(parse("flowchart LR\n A-->B-->C"));
    const byId = Object.fromEntries(pos.nodes.map((n) => [n.id, n]));
    expect(byId.A!.x).toBeLessThan(byId.B!.x);
    expect(byId.B!.x).toBeLessThan(byId.C!.x);
  });

  it("advances along +y for TB", () => {
    const pos = layout(parse("flowchart TB\n A-->B-->C"));
    const byId = Object.fromEntries(pos.nodes.map((n) => [n.id, n]));
    expect(byId.A!.y).toBeLessThan(byId.B!.y);
    expect(byId.B!.y).toBeLessThan(byId.C!.y);
  });
});

describe("layout produces non-overlapping nodes", () => {
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith(".mmd"));
  for (const file of files) {
    it(`no node overlaps in ${file}`, () => {
      const pos = layout(parse(readFileSync(join(fixturesDir, file), "utf8")));
      for (let i = 0; i < pos.nodes.length; i++) {
        for (let j = i + 1; j < pos.nodes.length; j++) {
          expect(overlaps(pos.nodes[i]!, pos.nodes[j]!)).toBe(false);
        }
      }
    });
  }
});

describe("multi-rank edges route around intervening nodes (TEST-001)", () => {
  it("skip-level A->C avoids B (A->B->C, A->C)", () => {
    const pos = layout(parse("flowchart TD\n A-->B-->C\n A-->C"));
    const ac = pos.edges.find((e) => e.from === "A" && e.to === "C")!;
    const b = pos.nodes.find((n) => n.id === "B")!;
    // routed as a real poly-line detour, not a straight 2-point line…
    expect(ac.points.length).toBeGreaterThan(2);
    // …and no segment of it crosses B's box.
    for (let i = 0; i < ac.points.length - 1; i++) {
      expect(segmentCrossesNode(ac.points[i]!, ac.points[i + 1]!, b)).toBe(false);
    }
  });

  it("back-edge in a cycle avoids the node it loops over (A->B->C->A)", () => {
    const pos = layout(parse("flowchart TD\n A-->B-->C\n C-->A"));
    const ca = pos.edges.find((e) => e.from === "C" && e.to === "A")!;
    const b = pos.nodes.find((n) => n.id === "B")!;
    for (let i = 0; i < ca.points.length - 1; i++) {
      expect(segmentCrossesNode(ca.points[i]!, ca.points[i + 1]!, b)).toBe(false);
    }
  });

  it("the state-machine fixture's retry back-edge no longer crosses the 'Response OK?' diamond", () => {
    const pos = layout(parse(readFileSync(join(fixturesDir, "state-machine.mmd"), "utf8")));
    const retry = pos.edges.find((e) => e.from === "errored" && e.to === "loading")!;
    const diamond = pos.nodes.find((n) => n.id === "success")!;
    expect(retry.points.length).toBeGreaterThan(2);
    for (let i = 0; i < retry.points.length - 1; i++) {
      expect(segmentCrossesNode(retry.points[i]!, retry.points[i + 1]!, diamond)).toBe(false);
    }
  });

  it("leaves no edge cutting through a non-endpoint node in any shipped fixture", () => {
    for (const file of readdirSync(fixturesDir).filter((f) => f.endsWith(".mmd"))) {
      const model = parse(readFileSync(join(fixturesDir, file), "utf8"));
      expect(edgeThroughNodeCount(layout(model))).toBe(0);
    }
  });
});

describe("anti-parallel edges are spread onto distinct paths (TEST-003)", () => {
  it("a bidirectional pair A<->B renders two different paths + label positions", () => {
    const pos = layout(parse("flowchart TD\n A-->B\n B-->A"));
    const ab = pos.edges.find((e) => e.from === "A" && e.to === "B")!;
    const ba = pos.edges.find((e) => e.from === "B" && e.to === "A")!;
    // the two transitions no longer render on the identical path
    expect(ab.path).not.toBe(ba.path);
    // both carry a non-zero port offset (spread into separate channels)
    expect(ab.ports).toBeDefined();
    expect(ba.ports).toBeDefined();
    // their start x's differ by a legible margin
    expect(Math.abs(ab.points[0]!.x - ba.points[ba.points.length - 1]!.x)).toBeGreaterThan(8);
  });

  it("the state-machine fixture's Idle<->Running (start/stop) pair does not overlap", () => {
    const pos = layout(parse(readFileSync(join(fixturesDir, "state-machine.mmd"), "utf8")));
    // any two edges between the same node pair in opposite directions must differ
    for (const e of pos.edges) {
      const rev = pos.edges.find((o) => o.from === e.to && o.to === e.from);
      if (rev) expect(e.path).not.toBe(rev.path);
    }
  });
});

describe("layout output shape", () => {
  it("routes every edge and computes bounds", () => {
    const pos = layout(parse(readFileSync(join(fixturesDir, "nested-subgraphs.mmd"), "utf8")));
    expect(pos.edges.every((e) => e.points.length >= 2 && e.path.startsWith("M "))).toBe(true);
    expect(pos.subgraphs.length).toBeGreaterThan(0);
    expect(pos.bounds.width).toBeGreaterThan(0);
    expect(pos.bounds.height).toBeGreaterThan(0);
  });

  it("uses the theme edge style for routing", () => {
    const pos = layout(parse("flowchart TB\n A-->B"), { theme: themes.fancy });
    expect(pos.edges[0]!.path).toContain(" C "); // curved
  });
});
