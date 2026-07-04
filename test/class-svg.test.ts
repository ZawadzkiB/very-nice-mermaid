import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { layoutClass } from "../src/native/class/layout.js";
import { renderClassSvg } from "../src/native/class/svg.js";
import { renderSvg } from "../src/render/svg.js";
import type { ClassModel } from "../src/model/class.js";
import { themes } from "../src/theme/index.js";

const MODEL: ClassModel = {
  kind: "class",
  classes: [
    {
      id: "Animal",
      name: "Animal",
      stereotype: "abstract",
      members: [
        { visibility: "+", text: "String name" },
        { visibility: "#", text: "int age" },
      ],
      methods: [{ visibility: "+", text: "makeSound() : void" }],
    },
    { id: "Dog", name: "Dog", members: [{ visibility: "+", text: "String breed" }], methods: [] },
    { id: "Collar", name: "Collar", members: [], methods: [] },
    { id: "Owner", name: "Owner", members: [], methods: [] },
    { id: "Vet", name: "Vet", members: [], methods: [] },
    { id: "Pet", name: "Pet", members: [], methods: [] },
  ],
  relations: [
    { from: "Animal", to: "Dog", type: "inheritance", head: "from", label: "extends" },
    { from: "Dog", to: "Collar", type: "composition", head: "from", label: "has" },
    { from: "Owner", to: "Dog", type: "aggregation", head: "from", label: "owns" },
    { from: "Dog", to: "Vet", type: "association", head: "to", label: "visits" },
    { from: "Dog", to: "Pet", type: "realization", head: "to" },
  ],
  warnings: [],
};

describe("renderClassSvg", () => {
  for (const name of ["light", "dark", "fancy"] as const) {
    it(`produces a stable, well-formed SVG for the ${name} theme`, () => {
      const layout = layoutClass(MODEL, { theme: themes[name]! });
      const svg = renderClassSvg(layout, themes[name]!);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("</svg>");
      expect(svg).toMatchSnapshot();
    });
  }

  it("is valid XML", () => {
    const svg = renderClassSvg(layoutClass(MODEL, { theme: themes.light! }), themes.light!);
    const parser = new XMLParser({ ignoreAttributes: false });
    expect(() => parser.parse(svg)).not.toThrow();
    expect(parser.parse(svg).svg).toBeDefined();
  });

  it("is deterministic (same model + theme ⇒ identical layout + SVG)", () => {
    const a = renderClassSvg(layoutClass(MODEL, { theme: themes.light! }), themes.light!);
    const b = renderClassSvg(layoutClass(MODEL, { theme: themes.light! }), themes.light!);
    expect(a).toBe(b);
  });

  it("draws compartments (stereotype, members, methods) with dividers", () => {
    const svg = renderClassSvg(layoutClass(MODEL, { theme: themes.light! }), themes.light!);
    expect(svg).toContain("«abstract»");
    expect(svg).toContain("+String name");
    expect(svg).toContain("+makeSound() : void");
    // dividers between compartments are <line> elements
    expect((svg.match(/<line /g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("defines + references the correct arrowhead marker per relation type", () => {
    const svg = renderClassSvg(layoutClass(MODEL, { theme: themes.light! }), themes.light!);
    // all four marker shapes are defined
    for (const id of ["vnm-cls-tri", "vnm-cls-diamond-solid", "vnm-cls-diamond-hollow", "vnm-cls-open"]) {
      expect(svg).toContain(`id="${id}"`);
      expect(svg).toContain(`url(#${id})`);
    }
    // inheritance (head=from) uses the triangle on marker-start
    expect(svg).toContain('marker-start="url(#vnm-cls-tri)"');
    // composition (head=from) uses the filled diamond on marker-start
    expect(svg).toContain('marker-start="url(#vnm-cls-diamond-solid)"');
    // aggregation (head=from) uses the hollow diamond
    expect(svg).toContain('marker-start="url(#vnm-cls-diamond-hollow)"');
    // association (head=to) uses the open arrow on marker-end
    expect(svg).toContain('marker-end="url(#vnm-cls-open)"');
    // realization is dashed
    expect(svg).toContain('stroke-dasharray="6 4"');
  });

  it("escapes XML-special characters in class + member text", () => {
    const hostile: ClassModel = {
      kind: "class",
      classes: [
        { id: "A", name: "a & b < c", members: [{ visibility: "+", text: "x < y & z" }], methods: [] },
        { id: "B", name: "B", members: [], methods: [] },
      ],
      relations: [{ from: "A", to: "B", type: "association", head: "to" }],
      warnings: [],
    };
    const svg = renderClassSvg(layoutClass(hostile, { theme: themes.light! }), themes.light!);
    expect(svg).toContain("a &amp; b &lt; c");
    expect(svg).toContain("x &lt; y &amp; z");
    const parser = new XMLParser({ ignoreAttributes: false });
    expect(() => parser.parse(svg)).not.toThrow();
  });

  it("is reachable through the top-level renderSvg for a class layout", () => {
    const layout = layoutClass(MODEL, { theme: themes.dark! });
    expect(renderSvg(layout, { theme: "dark" })).toBe(renderClassSvg(layout, themes.dark!));
  });

  it(
    "keeps the composition diamond on its own edge, not a shared sibling trunk (TEST-002)",
    () => {
      // Dog has three outgoing relations (composition/association/realization);
      // before port-spreading they left Dog from one shared point, so the
      // composition diamond appeared to belong to all three. Now each starts on
      // its own channel, so the diamond's edge start is unique.
      const svg = renderClassSvg(layoutClass(MODEL, { theme: themes.light! }), themes.light!);

      // Edge paths (not marker-def paths) carry `stroke-linejoin`.
      const edges = [...svg.matchAll(/<path d="M ([\d.]+) ([\d.]+)[^"]*"([^>]*)\/>/g)]
        .filter((m) => m[3]!.includes("stroke-linejoin"))
        .map((m) => ({ start: `${m[1]},${m[2]}`, attrs: m[3]! }));

      const composition = edges.filter((e) => e.attrs.includes("vnm-cls-diamond-solid"));
      expect(composition).toHaveLength(1); // exactly one filled diamond
      // no sibling edge shares the composition edge's start point (its own trunk)
      const sharingStart = edges.filter((e) => e.start === composition[0]!.start);
      expect(sharingStart).toHaveLength(1);
    },
  );
});
