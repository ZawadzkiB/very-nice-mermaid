import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "../src/parser/index.js";
import { layout, applyPositions, labelPlateSize } from "../src/layout/index.js";
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

// v0.7.3 bug 1 - mermaid 11.16.0 flowDb.getData hands dagre `minlen: edge.length`, where
// destructEndLink counts the link without its closing character (`---` = `-->` = 1) and
// addSingleLink caps the length at 10.
describe("link length spans ranks like mermaid (v0.7.3)", () => {
  const gap = (op: string) => {
    const pos = layout(parse(`flowchart TD\n A ${op} B`));
    const a = pos.nodes.find((n) => n.id === "A")!;
    const b = pos.nodes.find((n) => n.id === "B")!;
    return b.y - a.y;
  };
  it("`---`, `===` and `-.-` span the same ranks as `-->`, `==>` and `-.->`", () => {
    expect(gap("---")).toBe(gap("-->"));
    expect(gap("===")).toBe(gap("==>"));
    expect(gap("-.-")).toBe(gap("-.->"));
    expect(gap("-- text ---")).toBe(gap("-- text -->"));
  });
  it("each extra line character adds one rank", () => {
    const one = gap("-->");
    const two = gap("--->");
    const three = gap("---->");
    expect(two).toBeGreaterThan(one);
    expect(three - two).toBe(two - one);
    expect(gap("----")).toBe(two);
    expect(gap("-..->")).toBe(two);
  });
  it("caps the span at 10 ranks", () => {
    expect(gap("-".repeat(11) + ">")).toBeGreaterThan(gap("-".repeat(10) + ">"));
    expect(gap("-".repeat(20) + ">")).toBe(gap("-".repeat(11) + ">"));
  });
});

// v0.7.3 bug 5 - edge labels get layout room. mermaid 11.16.0 sizes each edge label before
// dagre runs (rendering-util insertEdgeLabel sets edge.width / edge.height from the label
// bbox, then recursiveRender calls layout(graph)) with labelpos "c" (flowDb.getData), so a
// label's rank-axis extent widens the gap between the ranks it sits between.
describe("edge labels get room between ranks (v0.7.3)", () => {
  const theme = themes.light!;
  const plateOf = (e: { label?: string; labelPos?: { x: number; y: number } }) => {
    const s = labelPlateSize(e.label, theme)!;
    return { x: e.labelPos!.x, y: e.labelPos!.y, width: s.w, height: s.h };
  };
  const ends = (pos: ReturnType<typeof layout>, from: string, to: string) => ({
    a: pos.nodes.find((n) => n.id === from)!,
    b: pos.nodes.find((n) => n.id === to)!,
    e: pos.edges.find((ed) => ed.from === from && ed.to === to)!,
  });
  const noPlateOnANode = (pos: ReturnType<typeof layout>) => {
    for (const e of pos.edges.filter((ed) => ed.label)) {
      const plate = plateOf(e) as unknown as PositionedNode;
      for (const n of pos.nodes) expect(overlaps(plate, n), `${e.from}->${e.to} label on ${n.id}`).toBe(false);
    }
  };

  it("a tall TB label widens its rank gap to fit, between the two nodes", () => {
    const pos = layout(
      parse('flowchart TB\n A[Client] -->|"line one<br>line two<br>line three<br>line four"| B[Server]'),
      { theme },
    );
    const { a, b, e } = ends(pos, "A", "B");
    const gap = b.y - b.height / 2 - (a.y + a.height / 2);
    expect(gap).toBeGreaterThanOrEqual(plateOf(e).height + theme.tokens.spacing.ranksep / 2);
    noPlateOnANode(pos);
  });

  it("a long LR label widens its rank gap to fit", () => {
    const pos = layout(parse("flowchart LR\n A[Client] -->|a rather long edge label here| B[Server]"), { theme });
    const { a, b, e } = ends(pos, "A", "B");
    const gap = b.x - b.width / 2 - (a.x + a.width / 2);
    expect(gap).toBeGreaterThanOrEqual(plateOf(e).width + theme.tokens.spacing.ranksep / 2);
    noPlateOnANode(pos);
  });

  /** Does the plate's centre sit on one of the edge's segments? */
  const onOwnLine = (e: { points: Array<{ x: number; y: number }> }, p: { x: number; y: number }) =>
    e.points.some((a, i) => {
      const b = e.points[i + 1];
      if (!b) return false;
      const inX = p.x >= Math.min(a.x, b.x) - 0.5 && p.x <= Math.max(a.x, b.x) + 0.5;
      const inY = p.y >= Math.min(a.y, b.y) - 0.5 && p.y <= Math.max(a.y, b.y) + 0.5;
      return inX && inY && (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5);
    });

  it("multi-line labels on a diamond's two elbow branches overlap no node and stay on their edge", () => {
    const pos = layout(
      parse(
        'flowchart TB\n A[Start] --> B{Choice}\n B -->|"yes, go on<br>with it"| C[Done]\n B -->|"no, stop<br>right here<br>now"| D[Store]',
      ),
      { theme },
    );
    noPlateOnANode(pos);
    // the 3-line label cannot be lifted above its jog without touching the diamond, so it
    // stays centred on its own line, in the room dagre reserved for it (labelpos "c")
    const bd = ends(pos, "B", "D").e;
    expect(onOwnLine(bd, plateOf(bd))).toBe(true);
  });

  it("a long LR label on an elbow stays on its edge, inside the rank gap", () => {
    const pos = layout(
      parse('flowchart LR\n A[Start] -->|"a fairly long label on an LR edge"| B[End]\n A --> C[Other]'),
      { theme },
    );
    const { a, b, e } = ends(pos, "A", "B");
    const plate = plateOf(e);
    expect(plate.x - plate.width / 2).toBeGreaterThan(a.x + a.width / 2);
    expect(plate.x + plate.width / 2).toBeLessThan(b.x - b.width / 2);
    expect(onOwnLine(e, plate)).toBe(true);
    noPlateOnANode(pos);
  });

  it("leaves unlabelled edges exactly as before", () => {
    const pos = layout(parse("flowchart TB\n A --> B --> C\n A --> C"), { theme });
    const { a, b } = ends(pos, "A", "B");
    expect(b.y - a.y).toBe(a.height / 2 + theme.tokens.spacing.ranksep + b.height / 2);
  });
});

// v0.7.3 bug 7 - a short Z-jog where an edge leaves or enters a box: the port spreader put the
// anchor a few px off where the edge actually heads (dagre's column for a long edge, or the other
// end's anchor for a short one), and the elbow router joined the two with a tiny step.
describe("no short jog where an edge leaves or enters a box (v0.7.3)", () => {
  /** Interior segments shorter than `max` whose neighbours run the same way: a Z-step, not a turn. */
  const shortJogs = (pos: ReturnType<typeof layout>, max = 15) =>
    pos.edges.flatMap((e) =>
      e.points.slice(1, -2).flatMap((b, s) => {
        const [a, c, d] = [e.points[s]!, e.points[s + 2]!, e.points[s + 3]!];
        const len = Math.hypot(c.x - b.x, c.y - b.y);
        const same = Math.sign(b.x - a.x) === Math.sign(d.x - c.x) && Math.sign(b.y - a.y) === Math.sign(d.y - c.y);
        return len > 0 && len < max && same ? [`${e.from}->${e.to} ${len.toFixed(2)}px`] : [];
      }),
    );
  // Astrolabe's contracts.md fence: Engine has two edges leaving its bottom, and ComponentManifest three.
  const CONTRACTS = [
    "flowchart TD",
    '  manifest["ComponentManifest<br/>(data, one per type)"]',
    '  definition["ComponentDefinition<br/>(engine side)"]',
    '  elementApi["PlayerElementApi<br/>(player side)"]',
    '  descriptor["EditorDescriptor<br/>(authoring side)"]',
    '  engine["Engine"]',
    '  player["#lt;astl-player#gt;"]',
    '  adapter["EditorAdapter<br/>(your WYSIWYG)"]',
    '  key["AnswerKey"]',
    '  checker["Checker<br/>(local or HTTP: grading protocol)"]',
    "  manifest --- definition",
    "  manifest --- elementApi",
    "  manifest --- descriptor",
    "  definition --- engine",
    "  engine --- key",
    "  elementApi ---- player",
    "  engine -->|view| player",
    "  descriptor --- adapter",
    "  adapter --> player",
    "  player --- checker",
    "  checker -->|grade| key",
  ].join("\n");

  it("Engine -> AnswerKey leaves Engine straight down its own column", () => {
    const pos = layout(parse(CONTRACTS));
    expect(shortJogs(pos)).toEqual([]);
    const e = pos.edges.find((ed) => ed.from === "engine" && ed.to === "key")!;
    expect(e.points[1]!.x).toBe(e.points[0]!.x);
    expect(e.points[1]!.y - e.points[0]!.y).toBeGreaterThan(100);
  });

  it("a short edge whose ends are a few px apart is drawn straight", () => {
    const pos = layout(parse(CONTRACTS));
    const e = pos.edges.find((ed) => ed.from === "manifest" && ed.to === "elementApi")!;
    expect(e.points).toHaveLength(2);
    expect(e.points[0]!.x).toBe(e.points[1]!.x);
    const lr = layout(parse(readFileSync(join(here, "..", "docs", "pipeline.mmd"), "utf8")));
    expect(shortJogs(lr)).toEqual([]);
    const scan = lr.edges.find((ed) => ed.from === "test" && ed.to === "scan")!;
    expect(scan.points).toHaveLength(2);
    expect(scan.points[0]!.y).toBe(scan.points[1]!.y);
  });

  it("no edge of the fence runs through a box that is not its own end", () => {
    expect(edgeThroughNodeCount(layout(parse(CONTRACTS)))).toBe(0);
  });

  it("keeps a real elbow (an offset of a third of a port step or more)", () => {
    const pos = layout(parse("flowchart TD\n A[Wide source node] --> B[B]\n A --> C[C]"));
    for (const e of pos.edges) expect(e.points.length).toBeGreaterThan(2);
  });
});

describe("two edges on one node side never merge into one line (v0.7.3)", () => {
  /** Axis-aligned segments of DIFFERENT edges on one track that overlap or touch: they read as one line. */
  const merges = (pos: ReturnType<typeof layout>) => {
    const runs = pos.edges.map((e) =>
      e.points.slice(0, -1).flatMap((a, i) => {
        const b = e.points[i + 1]!;
        if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 0.5) return [{ v: true, at: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) }];
        if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 0.5) return [{ v: false, at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) }];
        return [];
      }),
    );
    const out: string[] = [];
    runs.forEach((ra, i) =>
      runs.slice(i + 1).forEach((rb, k) => {
        for (const a of ra)
          for (const b of rb)
            if (a.v === b.v && Math.abs(a.at - b.at) < 1 && Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) >= -1)
              out.push(`${pos.edges[i]!.from}->${pos.edges[i]!.to} & ${pos.edges[i + 1 + k]!.from}->${pos.edges[i + 1 + k]!.to}`);
      }),
    );
    return out;
  };

  // The README hero: gw -> catalog's jog used to end on gw -> cart's port and run on as one bar.
  const hero = readFileSync(join(fixturesDir, "arch-microservices.mmd"), "utf8");
  for (const name of ["light", "dark", "fancy", "arch", "arch-light"]) {
    it(`arch-microservices.mmd (${name})`, () => {
      const pos = layout(parse(hero), { theme: themes[name]! });
      expect(merges(pos)).toEqual([]);
      const jogY = (to: string) => pos.edges.find((e) => e.from === "gw" && e.to === to)!.points[1]!.y;
      expect(jogY("catalog")).toBeGreaterThan(jogY("cart")); // the inner jog (cart) turns first: no crossing
    });
  }

  it("examples/src/architecture.mmd (fancy): API -> Auth and API -> PostgreSQL no longer share their first jog", () => {
    const src = readFileSync(join(here, "..", "examples", "src", "architecture.mmd"), "utf8");
    expect(merges(layout(parse(src), { theme: themes.fancy! }))).toEqual([]);
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

describe("anti-parallel edge LABELS don't clip each other (TEST-006)", () => {
  const theme = themes.light!;

  // Plate rect the SVG sink / DOM runtime draw for an edge label — the FR3
  // tightened formula (kept in lockstep with layout.labelPlateSize / edgeLabel).
  function plateRect(label: string, cx: number, cy: number) {
    const f = theme.tokens.font;
    const lines = label.split("\n");
    const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
    const w = maxChars * f.size * 0.6 + 6;
    const h = lines.length * f.lineHeight + 2;
    return { l: cx - w / 2, r: cx + w / 2, t: cy - h / 2, b: cy + h / 2 };
  }
  const intersects = (a: ReturnType<typeof plateRect>, b: ReturnType<typeof plateRect>): boolean =>
    a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

  for (const dir of ["TD", "LR"] as const) {
    it(`a ${dir} bidirectional labelled pair's two plates do not intersect`, () => {
      const pos = layout(parse(`flowchart ${dir}\n A -->|go| B\n B -->|back| A`), { theme });
      const go = pos.edges.find((e) => e.from === "A" && e.to === "B")!;
      const back = pos.edges.find((e) => e.from === "B" && e.to === "A")!;
      const ga = plateRect("go", go.labelPos!.x, go.labelPos!.y);
      const bk = plateRect("back", back.labelPos!.x, back.labelPos!.y);
      // the channel offset separates the LINES; the label stagger must separate
      // the wider PLATES too, or one label's text is clipped (the original bug).
      expect(intersects(ga, bk)).toBe(false);
      // and the staggering actually fired (a labelShift rode along on the ports)
      expect(go.ports?.labelShift ?? back.ports?.labelShift).toBeDefined();
    });
  }
});

describe("FR9: lane separation stays orthogonal + cuts no node (a re-laning diagram)", () => {
  const theme = themes.light!;
  // the repro shape genuinely re-lanes its merged mid-channel (IN→K1 / IN→HUB / API→V1)
  const dsl = [
    "flowchart TD",
    "subgraph VE[Validation Engine Verische]",
    "  V1[Schema check]",
    "  V2[Rule eval]",
    "end",
    "subgraph KU[Kukuvara subsystem]",
    "  K1[Parse inbound]",
    "  K2[Route message]",
    "end",
    "IN[Ingress] -->|REST admin| V1",
    "IN -->|gRPC stream| V2",
    "IN -->|batch load| K1",
    "API[API Gateway] -->|feed| V1",
    "API -->|alt path| K2",
    "V1 --> HUB",
    "V2 --> HUB",
    "K1 --> HUB",
    "K2 --> HUB",
    "API --> HUB",
    "IN --> HUB",
    "HUB[Aggregator hub]",
  ].join("\n");

  it("no edge cuts a non-endpoint node, and every routed edge stays an orthogonal staircase", () => {
    const pos = layout(parse(dsl), { theme });
    expect(edgeThroughNodeCount(pos)).toBe(0);
    for (const e of pos.edges) {
      for (let i = 1; i < e.points.length; i++) {
        const a = e.points[i - 1]!;
        const b = e.points[i]!;
        expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6).toBe(true); // axis-aligned
      }
    }
  });

  // worst (smallest) gap between any two near-parallel, y-overlapping long vertical runs
  const worstMidGap = (pos: ReturnType<typeof layout>): number => {
    const runs: { x: number; y0: number; y1: number }[] = [];
    for (const e of pos.edges)
      for (let i = 0; i + 1 < e.points.length; i++) {
        const a = e.points[i]!;
        const b = e.points[i + 1]!;
        if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 80)
          runs.push({ x: a.x, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) });
      }
    let worst = Infinity;
    for (let i = 0; i < runs.length; i++)
      for (let j = i + 1; j < runs.length; j++) {
        const a = runs[i]!;
        const b = runs[j]!;
        const dx = Math.abs(a.x - b.x);
        if (dx > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) >= 60) worst = Math.min(worst, dx);
      }
    return worst;
  };

  it("separates the merged mid-channel to >= LANE_GAP (26px)", () => {
    expect(worstMidGap(layout(parse(dsl), { theme }))).toBeGreaterThanOrEqual(26 - 1e-6);
  });

  it("stays separated after a node drag — applyPositions re-lanes to a stable fixpoint (TEST-004)", () => {
    const base = layout(parse(dsl), { theme });
    const inNode = base.nodes.find((nn) => nn.id === "IN")!;
    // several ordinary repositions of Ingress; the merged runs must NOT collapse back
    for (const [dx, dy] of [[40, 0], [0, 30], [-30, 20], [60, -10]] as const) {
      const moved = applyPositions(base, { IN: { x: inNode.x + dx, y: inNode.y + dy } }, { theme });
      expect(worstMidGap(moved)).toBeGreaterThanOrEqual(26 - 1e-6);
    }
  });

  it("orders the API Gateway fan by heading so its outgoing edges don't knot (UAT — de-crossing)", () => {
    // API fans to V1(left, feed), K2(straight down, alt path) and HUB — which dagre
    // steers out to the right. Ordering ports by destination centre put HUB on the
    // middle port and crossed it over the K2 edge (the knot the user boxed). Ordering
    // by each edge's actual heading must leave the fan crossing-free: sort the three
    // source anchors left→right and the x each edge first heads toward is monotonic.
    const pos = layout(parse(dsl), { theme });
    const fan = pos.edges
      .filter((e) => e.from === "API")
      .map((e) => {
        const s = e.points[0]!;
        const head = e.points.find((p) => Math.abs(p.x - s.x) > 0.5) ?? s;
        return { to: e.to, sx: s.x, hx: head.x };
      })
      .sort((a, b) => a.sx - b.sx);
    expect(fan.length).toBe(3);
    // no inversion between source order and heading order ⇒ no source-side crossing
    for (let i = 1; i < fan.length; i++) {
      expect(fan[i]!.hx).toBeGreaterThanOrEqual(fan[i - 1]!.hx - 0.5);
    }
  });
});

describe("FR6: no two edge-label plates overlap after layout", () => {
  const theme = themes.light!;
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
    (a.w + b.w) / 2 - Math.abs(a.x - b.x) > 1e-6 && (a.h + b.h) / 2 - Math.abs(a.y - b.y) > 1e-6;
  const platesOf = (pos: ReturnType<typeof layout>) =>
    pos.edges
      .filter((e) => e.label && e.labelPos)
      .map((e) => {
        const s = labelPlateSize(e.label, theme)!;
        return { x: e.labelPos!.x, y: e.labelPos!.y, w: s.w, h: s.h };
      });
  const assertNoOverlap = (pos: ReturnType<typeof layout>): void => {
    const plates = platesOf(pos);
    for (let i = 0; i < plates.length; i++)
      for (let j = i + 1; j < plates.length; j++) expect(overlaps(plates[i]!, plates[j]!)).toBe(false);
  };

  it("de-collides the close 'batch load' / 'feed' pair (the TEST-001 repro shape)", () => {
    const dsl = [
      "flowchart TD",
      "subgraph VE[Validation Engine Verische]",
      "  V1[Schema check]",
      "  V2[Rule eval]",
      "end",
      "subgraph KU[Kukuvara subsystem]",
      "  K1[Parse inbound]",
      "  K2[Route message]",
      "end",
      "IN[Ingress] -->|REST admin| V1",
      "IN -->|gRPC stream| V2",
      "IN -->|batch load| K1",
      "API[API Gateway] -->|feed| V1",
      "API -->|alt path| K2",
    ].join("\n");
    assertNoOverlap(layout(parse(dsl), { theme }));
  });

  for (const file of readdirSync(fixturesDir).filter((f) => f.endsWith(".mmd"))) {
    it(`no label-plate overlap in ${file}`, () => {
      assertNoOverlap(layout(parse(readFileSync(join(fixturesDir, file), "utf8")), { theme }));
    });
  }
});

describe("edge-label plates clear node boxes (UAT round 1, issue 1)", () => {
  const theme = themes.light!;
  const reproDsl = [
    "flowchart TD",
    "subgraph VE[Validation Engine Verische]",
    "  V1[Schema check]",
    "  V2[Rule eval]",
    "end",
    "subgraph KU[Kukuvara subsystem]",
    "  K1[Parse inbound]",
    "  K2[Route message]",
    "end",
    "IN[Ingress] -->|REST admin| V1",
    "IN -->|gRPC stream| V2",
    "IN -->|batch load| K1",
    "API[API Gateway] -->|feed| V1",
    "API -->|alt path| K2",
    "V1 --> HUB",
    "V2 --> HUB",
    "K1 --> HUB",
    "K2 --> HUB",
    "API --> HUB",
    "IN --> HUB",
    "HUB[Aggregator hub]",
  ].join("\n");

  // strict box overlap (a hair of tolerance so a clean touch — e.g. the padded
  // clearance — doesn't count as an overlap)
  const boxOverlap = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ): boolean =>
    (a.w + b.w) / 2 - Math.abs(a.x - b.x) > 1e-6 && (a.h + b.h) / 2 - Math.abs(a.y - b.y) > 1e-6;

  it("no edge-label plate overlaps any node box in the repro shape", () => {
    const pos = layout(parse(reproDsl), { theme });
    const nodeBoxes = pos.nodes.map((nd) => ({ x: nd.x, y: nd.y, w: nd.width, h: nd.height }));
    for (const e of pos.edges) {
      if (!e.label || !e.labelPos) continue;
      const s = labelPlateSize(e.label, theme)!;
      const plate = { x: e.labelPos.x, y: e.labelPos.y, w: s.w, h: s.h };
      for (const nb of nodeBoxes) expect(boxOverlap(plate, nb)).toBe(false);
    }
  });

  it("the 'gRPC stream' plate no longer overlaps the Ingress node box", () => {
    const pos = layout(parse(reproDsl), { theme });
    const grpc = pos.edges.find((e) => e.label === "gRPC stream")!;
    const ingress = pos.nodes.find((n) => n.id === "IN")!;
    const s = labelPlateSize(grpc.label!, theme)!;
    const plate = { x: grpc.labelPos!.x, y: grpc.labelPos!.y, w: s.w, h: s.h };
    const box = { x: ingress.x, y: ingress.y, w: ingress.width, h: ingress.height };
    expect(boxOverlap(plate, box)).toBe(false);
  });

  // does an axis-aligned segment a→b intersect the label plate rect?
  const segHitsPlate = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    pl: { x: number; y: number; w: number; h: number },
  ): boolean => {
    const px0 = pl.x - pl.w / 2;
    const px1 = pl.x + pl.w / 2;
    const py0 = pl.y - pl.h / 2;
    const py1 = pl.y + pl.h / 2;
    if (Math.abs(a.x - b.x) < 0.5) {
      // vertical
      return a.x > px0 && a.x < px1 && Math.max(a.y, b.y) > py0 && Math.min(a.y, b.y) < py1;
    }
    if (Math.abs(a.y - b.y) < 0.5) {
      // horizontal
      return a.y > py0 && a.y < py1 && Math.max(a.x, b.x) > px0 && Math.min(a.x, b.x) < px1;
    }
    return false;
  };

  it("the 'gRPC stream' plate overlaps 0 foreign edge segments (UAT-round label-vs-edge)", () => {
    const pos = layout(parse(reproDsl), { theme });
    const gi = pos.edges.findIndex((e) => e.label === "gRPC stream");
    const grpc = pos.edges[gi]!;
    const s = labelPlateSize(grpc.label!, theme)!;
    const plate = { x: grpc.labelPos!.x, y: grpc.labelPos!.y, w: s.w, h: s.h };
    let overlaps = 0;
    pos.edges.forEach((e, j) => {
      if (j === gi) return; // the label's own edge is excluded
      for (let k = 0; k + 1 < e.points.length; k++) {
        if (segHitsPlate(e.points[k]!, e.points[k + 1]!, plate)) overlaps++;
      }
    });
    expect(overlaps).toBe(0);
  });
});

describe("edge-label plate is tightened, non-clipping (FR3)", () => {
  const theme = themes.light!;
  const f = theme.tokens.font;

  it("labelPlateSize uses the exact tightened formula (0.6·size + 6 / lines·lh + 2)", () => {
    expect(labelPlateSize("REST admin", theme)).toEqual({ w: 10 * f.size * 0.6 + 6, h: 1 * f.lineHeight + 2 });
    // a two-line label bumps the height by one lineHeight
    expect(labelPlateSize("a\nbc", theme)).toEqual({ w: 2 * f.size * 0.6 + 6, h: 2 * f.lineHeight + 2 });
    // an unlabelled edge has no plate
    expect(labelPlateSize(undefined, theme)).toBeUndefined();
  });

  it("is tighter than the previous plate on both axes, yet still clears the text basis", () => {
    const now = labelPlateSize("Gateway", theme)!;
    const before = { w: 7 * f.size * 0.62 + 10, h: 1 * f.lineHeight + 4 };
    expect(now.w).toBeLessThan(before.w);
    expect(now.h).toBeLessThan(before.h);
    // the width basis uses `size` while the text draws at `size - 1`, so the plate
    // still exceeds a generous per-char estimate of the drawn text (no clipping).
    expect(now.w).toBeGreaterThan(7 * (f.size - 1) * 0.6);
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
