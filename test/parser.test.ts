import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse, ParseError, matchLink } from "../src/parser/index.js";
import type { Shape } from "../src/model/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");

describe("parser: header + direction", () => {
  it("reads flowchart direction", () => {
    expect(parse("flowchart LR\n A-->B").direction).toBe("LR");
    expect(parse("graph TD\n A-->B").direction).toBe("TB");
    expect(parse("flowchart TD\n A-->B").direction).toBe("TB"); // TD normalizes to TB
    expect(parse("graph BT\n A-->B").direction).toBe("BT");
    expect(parse("flowchart RL\n A-->B").direction).toBe("RL");
  });

  it("defaults to TB and warns when the header is missing", () => {
    const m = parse("A-->B");
    expect(m.direction).toBe("TB");
    expect(m.warnings.some((w) => w.code === "missing-header")).toBe(true);
    expect(m.edges).toHaveLength(1);
  });
});

describe("parser: node shapes", () => {
  const cases: Array<[string, Shape, string]> = [
    ["A[Rect]", "rect", "Rect"],
    ["A(Round)", "rounded", "Round"],
    ["A([Stadium])", "stadium", "Stadium"],
    ["A[[Sub]]", "subroutine", "Sub"],
    ["A((Circle))", "circle", "Circle"],
    ["A{Diamond}", "diamond", "Diamond"],
    ["A{{Hex}}", "hexagon", "Hex"],
    ["A[/Par/]", "parallelogram", "Par"],
    ["A[\\Alt\\]", "parallelogram-alt", "Alt"],
    ["A[(Cyl)]", "cylinder", "Cyl"],
  ];
  for (const [src, shape, label] of cases) {
    it(`parses ${shape}`, () => {
      const node = parse(`flowchart TD\n ${src}`).nodes[0]!;
      expect(node.shape).toBe(shape);
      expect(node.label).toBe(label);
    });
  }

  it("keeps quoted labels with special chars and <br/>", () => {
    const node = parse('flowchart TD\n A["Line 1<br/>Line 2 (x)"]').nodes[0]!;
    expect(node.label).toBe("Line 1\nLine 2 (x)");
  });
});

describe("parser: edges", () => {
  it("classifies line styles and arrows", () => {
    const m = parse(
      "flowchart LR\n A-->B\n B---C\n C-.->D\n D==>E\n E<-->F",
    );
    const byPair = (from: string, to: string) =>
      m.edges.find((e) => e.from === from && e.to === to)!;
    expect(byPair("A", "B").kind).toBe("solid");
    expect(byPair("A", "B").arrows).toEqual({ start: false, end: true });
    expect(byPair("B", "C").kind).toBe("open");
    expect(byPair("C", "D").kind).toBe("dotted");
    expect(byPair("D", "E").kind).toBe("thick");
    expect(byPair("E", "F").arrows).toEqual({ start: true, end: true });
  });

  it("reads edge labels via pipe and middle syntax", () => {
    const m = parse("flowchart LR\n A-->|yes|B\n C-- no -->D\n E== hot ==>F\n G-. lazy .->H");
    expect(m.edges[0]!.label).toBe("yes");
    expect(m.edges[1]!.label).toBe("no");
    expect(m.edges[2]!.label).toBe("hot");
    expect(m.edges[2]!.kind).toBe("thick");
    expect(m.edges[3]!.label).toBe("lazy");
    expect(m.edges[3]!.kind).toBe("dotted");
  });

  it("expands `&` fan-in / fan-out chaining", () => {
    const m = parse("flowchart TD\n A & B --> C & D");
    const pairs = m.edges.map((e) => `${e.from}->${e.to}`).sort();
    expect(pairs).toEqual(["A->C", "A->D", "B->C", "B->D"]);
  });

  it("chains a-->b-->c into two edges", () => {
    const m = parse("flowchart TD\n a-->b-->c");
    expect(m.edges.map((e) => `${e.from}${e.to}`)).toEqual(["ab", "bc"]);
  });
});

describe("parser: classes, classDef, style", () => {
  it("applies classDef + class + :::", () => {
    const m = parse(
      [
        "flowchart TD",
        "A:::hot --> B",
        "class B cold",
        "classDef hot fill:#f00,stroke:#900",
        "classDef cold fill:#00f",
      ].join("\n"),
    );
    expect(m.nodes.find((n) => n.id === "A")!.classes).toContain("hot");
    expect(m.nodes.find((n) => n.id === "B")!.classes).toContain("cold");
    expect(m.classDefs.get("hot")).toMatchObject({ fill: "#f00", stroke: "#900" });
  });

  it("parses inline style with stroke-width normalization", () => {
    const m = parse("flowchart TD\n A-->B\n style A fill:#eee,stroke-width:2px");
    expect(m.nodes[0]!.style).toMatchObject({ fill: "#eee", strokeWidth: "2px" });
  });

  it("drops unsafe style/classDef values at the source and warns (REV-001/002)", () => {
    const m = parse(
      [
        "flowchart TD",
        "A-->B",
        "style A fill:url(http://evil/x.png),stroke:#333",
        'classDef bad fill:#fff" onmouseover="x',
        "A:::bad",
      ].join("\n"),
    );
    const a = m.nodes.find((n) => n.id === "A")!;
    // the hostile fill is gone; the safe stroke on the same statement survives
    expect(a.style?.fill).toBeUndefined();
    expect(a.style?.stroke).toBe("#333");
    // the hostile classDef fill is dropped entirely (empty style bag)
    expect(m.classDefs.get("bad")?.fill).toBeUndefined();
    // both drops surface as structured warnings
    expect(m.warnings.filter((w) => w.code === "unsafe-style-value")).toHaveLength(2);
  });

  it("keeps benign color forms (hex, rgb, named) and stroke-dasharray", () => {
    // Note: `,` separates style properties, so the space-separated rgb() form is
    // the one that survives the splitter — commas inside rgb(a, b, c) do not.
    const m = parse(
      [
        "flowchart TD",
        "A-->B",
        "style A fill:#abc,stroke:rgb(10 20 30),color:red,stroke-dasharray:6 3",
      ].join("\n"),
    );
    expect(m.nodes[0]!.style).toMatchObject({
      fill: "#abc",
      stroke: "rgb(10 20 30)",
      color: "red",
      strokeDasharray: "6 3",
    });
    expect(m.warnings.filter((w) => w.code === "unsafe-style-value")).toHaveLength(0);
  });
});

describe("parser: subgraphs", () => {
  it("nests subgraphs and assigns membership", () => {
    const m = parse(
      [
        "flowchart LR",
        "subgraph outer [Outer]",
        "  A-->B",
        "  subgraph inner [Inner]",
        "    C-->D",
        "  end",
        "end",
        "B-->C",
      ].join("\n"),
    );
    const outer = m.subgraphs.find((s) => s.id === "outer")!;
    const inner = m.subgraphs.find((s) => s.id === "inner")!;
    expect(outer.title).toBe("Outer");
    expect(outer.children).toContain("A");
    expect(outer.children).toContain("B");
    expect(outer.children).toContain("inner");
    expect(inner.children).toEqual(["C", "D"]);
  });

  it("warns on an unterminated subgraph at its opening line/col (REV-005)", () => {
    const m = parse("flowchart TD\n subgraph s\n A-->B");
    const d = m.warnings.find((w) => w.code === "unterminated-subgraph")!;
    expect(d).toBeDefined();
    // the `subgraph` keyword sits on line 2, column 2 — not the hardcoded 1:1
    expect(d.line).toBe(2);
    expect(d.col).toBe(2);
  });
});

describe("parser: comments + directives", () => {
  it("strips %% comments and ignores init directives", () => {
    const m = parse(
      ["%%{init: {'theme':'dark'}}%%", "flowchart TD %% inline", "A-->B %% trailing"].join("\n"),
    );
    expect(m.edges).toHaveLength(1);
    expect(m.warnings.some((w) => w.code === "ignored-directive")).toBe(true);
  });
});

describe("parser: diagnostics carry line/col", () => {
  it("reports an unterminated shape with position", () => {
    const m = parse("flowchart TD\n A[oops");
    const d = m.warnings.find((w) => w.code === "unterminated-shape")!;
    expect(d.line).toBe(2);
    expect(d.col).toBeGreaterThanOrEqual(2);
  });

  it("strict mode throws a ParseError listing diagnostics", () => {
    expect(() => parse("flowchart TD\n A[oops", { strict: true })).toThrow(ParseError);
    try {
      parse("A-->B", { strict: true });
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).diagnostics[0]).toMatchObject({ line: 1, col: 1 });
    }
  });
});

describe("matchLink unit", () => {
  it("consumes exactly the operator", () => {
    expect(matchLink("-->B")!.consumed).toBe(3);
    expect(matchLink("---C")!.kind).toBe("open");
    expect(matchLink("-.->x")!.kind).toBe("dotted");
    expect(matchLink("nope")).toBeNull();
  });
});

describe("corpus fixtures parse cleanly (lenient)", () => {
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith(".mmd"));
  it("has a real corpus", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });
  for (const file of files) {
    it(`parses ${file} with nodes and no error-severity diagnostics`, () => {
      const src = readFileSync(join(fixturesDir, file), "utf8");
      const m = parse(src);
      expect(m.nodes.length).toBeGreaterThan(0);
      expect(m.warnings.filter((w) => w.severity === "error")).toHaveLength(0);
    });
  }
});
