import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { layoutSequence } from "../src/native/sequence/layout.js";
import { renderSequenceSvg } from "../src/native/sequence/svg.js";
import { renderSvg } from "../src/render/svg.js";
import type { SequenceModel } from "../src/model/sequence.js";
import { themes } from "../src/theme/index.js";

const MODEL: SequenceModel = {
  kind: "sequence",
  participants: [
    { id: "User", label: "User", order: 0 },
    { id: "API", label: "API", order: 1 },
    { id: "DB", label: "DB", order: 2 },
  ],
  messages: [
    { from: "User", to: "API", label: "POST /orders", kind: "solid", arrowEnd: true, self: false, order: 0 },
    { from: "API", to: "DB", label: "INSERT order", kind: "solid", arrowEnd: true, self: false, order: 1 },
    { from: "DB", to: "API", label: "order id", kind: "dashed", arrowEnd: true, self: false, order: 2 },
    { from: "API", to: "API", label: "validate", kind: "solid", arrowEnd: true, self: true, order: 3 },
    { from: "API", to: "User", label: "201 Created", kind: "dashed", arrowEnd: true, self: false, order: 4 },
  ],
};

describe("renderSequenceSvg", () => {
  for (const name of ["light", "dark", "fancy"] as const) {
    it(`produces a stable, well-formed SVG for the ${name} theme`, () => {
      const layout = layoutSequence(MODEL, { theme: themes[name]! });
      const svg = renderSequenceSvg(layout, themes[name]!);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("</svg>");
      expect(svg).toMatchSnapshot();
    });
  }

  it("is valid XML", () => {
    const layout = layoutSequence(MODEL, { theme: themes.light! });
    const svg = renderSequenceSvg(layout, themes.light!);
    const parser = new XMLParser({ ignoreAttributes: false });
    expect(() => parser.parse(svg)).not.toThrow();
    expect(parser.parse(svg).svg).toBeDefined();
  });

  it("draws participant labels, the arrow marker, dashed messages and a self-loop", () => {
    const layout = layoutSequence(MODEL, { theme: themes.light! });
    const svg = renderSequenceSvg(layout, themes.light!);
    expect(svg).toContain(">User<");
    expect(svg).toContain(">DB<");
    expect(svg).toContain('<marker id="vnm-arrow"');
    expect(svg).toContain('marker-end="url(#vnm-arrow)"');
    expect(svg).toContain('stroke-dasharray="6 4"'); // dashed message
    expect(svg).toContain('stroke-dasharray="4 4"'); // lifelines
    expect(svg).toMatch(/<path d="M [\d.]+ [\d.]+ L/); // self-loop path
  });

  it("escapes XML-special characters in a participant / message label", () => {
    const hostile: SequenceModel = {
      kind: "sequence",
      participants: [
        { id: "A", label: "a & b < c", order: 0 },
        { id: "B", label: "B", order: 1 },
      ],
      messages: [
        { from: "A", to: "B", label: "x < y & z", kind: "solid", arrowEnd: true, self: false, order: 0 },
      ],
    };
    const svg = renderSequenceSvg(layoutSequence(hostile, { theme: themes.light! }), themes.light!);
    expect(svg).toContain("a &amp; b &lt; c");
    expect(svg).toContain("x &lt; y &amp; z");
    const parser = new XMLParser({ ignoreAttributes: false });
    expect(() => parser.parse(svg)).not.toThrow();
  });

  it("is reachable through the top-level renderSvg for a positioned layout", () => {
    const layout = layoutSequence(MODEL, { theme: themes.dark! });
    const viaTop = renderSvg(layout, { theme: "dark" });
    const direct = renderSequenceSvg(layout, themes.dark!);
    expect(viaTop).toBe(direct);
  });
});
