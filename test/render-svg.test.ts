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
});
