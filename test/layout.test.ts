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
