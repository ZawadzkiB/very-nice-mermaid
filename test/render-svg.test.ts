import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { renderSvg } from "../src/render/svg.js";
import { themes } from "../src/theme/index.js";

const SAMPLE = [
  "flowchart TD",
  "  A[Start]:::hot --> B{Choice}",
  "  B -->|yes| C([Done])",
  "  B -->|no| D[(Store)]",
  "  classDef hot fill:#f00,stroke:#900,color:#fff",
].join("\n");

describe("renderSvg", () => {
  for (const name of ["light", "dark", "fancy"] as const) {
    it(`produces a stable, well-formed SVG for the ${name} theme`, () => {
      const svg = renderSvg(SAMPLE, { theme: name });
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("</svg>");
      // snapshot locks the visual output per theme
      expect(svg).toMatchSnapshot();
    });
  }

  it("is valid XML", () => {
    const svg = renderSvg(SAMPLE, { theme: "light" });
    const parser = new XMLParser({ ignoreAttributes: false });
    expect(() => parser.parse(svg)).not.toThrow();
    const parsed = parser.parse(svg);
    expect(parsed.svg).toBeDefined();
  });

  it("emits an arrowhead marker and edge-label plate", () => {
    const svg = renderSvg(SAMPLE, { theme: "light" });
    expect(svg).toContain("marker-end=\"url(#vnm-arrow)\"");
    expect(svg).toContain("<marker id=\"vnm-arrow\"");
    // edge label 'yes' present as text
    expect(svg).toContain(">yes<");
  });

  it("applies classDef colors to nodes", () => {
    const svg = renderSvg(SAMPLE, { theme: "light" });
    expect(svg).toContain('fill="#f00"');
    expect(svg).toContain('stroke="#900"');
  });

  it("respects a transparent background", () => {
    const svg = renderSvg("flowchart TD\n A-->B", { theme: "light", background: "transparent" });
    expect(svg).not.toContain(`fill="${themes.light!.tokens.colors.background}"`);
  });

  it("renders curved edges for the fancy theme", () => {
    const svg = renderSvg("flowchart TD\n A-->B", { theme: "fancy" });
    expect(svg).toContain(" C "); // bezier path segment
  });

  it("escapes XML-special characters in labels", () => {
    const svg = renderSvg('flowchart TD\n A["a & b < c"] --> B', { theme: "light" });
    expect(svg).toContain("a &amp; b &lt; c");
  });

  it("neutralizes an attribute-breakout attempt in a user style value (REV-001)", () => {
    // The classic exploit: close the fill attribute and inject an event handler.
    const svg = renderSvg(
      'flowchart TD\nA[Click me]-->B\nstyle A fill:#fff" onmouseover="alert(document.domain)',
      { theme: "light" },
    );
    // No injected handler / script survives into the emitted SVG.
    expect(svg).not.toContain("onmouseover");
    expect(svg).not.toContain("alert(document.domain)");
    // The hostile fill is dropped at the source, so the node keeps the theme fill.
    expect(svg).toContain('fill="#ffffff"');
    // …and the output is still well-formed XML (no dangling attribute quote).
    const parser = new XMLParser({ ignoreAttributes: false });
    expect(() => parser.parse(svg)).not.toThrow();
  });

  it("drops the same breakout supplied via classDef (REV-001)", () => {
    const svg = renderSvg(
      [
        "flowchart TD",
        "A:::x-->B",
        'classDef x fill:#fff" onmouseover="alert(1)',
      ].join("\n"),
      { theme: "light" },
    );
    expect(svg).not.toContain("onmouseover");
    expect(svg).not.toContain("alert(1)");
  });
});
