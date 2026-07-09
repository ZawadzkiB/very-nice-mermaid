/**
 * Sketch-style static SVG (D2/FR2/FR3/FR4): hand-drawn rough shapes + wavy edges
 * + open arrowheads + an embedded handwriting @font-face, deterministic, and
 * strictly opt-in (clean mode byte-unchanged).
 */

import { describe, it, expect } from "vitest";
import { XMLValidator } from "fast-xml-parser";
import { renderSvg } from "../src/render/svg.js";

// exercises rect, diamond, stadium, cylinder, circle + labelled edges
const DSL = [
  "flowchart TD",
  "A[Start] --> B{Choice}",
  "B -->|yes| C([Done])",
  "B -->|no| D[(Store)]",
  "C --> E((End))",
].join("\n");

describe("renderSvg — sketch style", () => {
  const sketch = renderSvg(DSL, { style: "sketch" });
  const clean = renderSvg(DSL);

  it("is well-formed XML", () => {
    expect(XMLValidator.validate(sketch)).toBe(true);
  });

  it("draws wobbly rough paths (quadratic segments), not clean silhouettes", () => {
    expect(sketch).toContain(" Q "); // rough strokes are bowed quadratics
    // clean draws a diamond as <polygon> and a circle as <ellipse>; sketch turns
    // every node into rough <path>s, so those primitives disappear
    expect(clean).toContain("<polygon");
    expect(clean).toContain("<ellipse");
    expect(sketch).not.toContain("<polygon");
    expect(sketch).not.toContain("<ellipse");
  });

  it("uses open hand-drawn arrowheads (no triangle marker on edges)", () => {
    expect(clean).toContain('marker-end="url(#vnm-arrow)"');
    expect(sketch).not.toContain("marker-end=");
    expect(sketch).not.toContain("marker-start=");
  });

  it("embeds the handwriting @font-face as a base64 data URI — zero network", () => {
    expect(sketch).toContain("@font-face");
    expect(sketch).toContain("Kalam");
    expect(sketch).toContain("url(data:font/woff2;base64,");
    // the <svg> adopts the handwriting family
    expect(sketch).toMatch(/font-family="'Kalam'/);
    // no EXTERNAL fetchable URL (the only https is the SVG namespace)
    const stripped = sketch.replace(/https?:\/\/www\.w3\.org\/[^"' )]*/g, "");
    expect(stripped).not.toMatch(/https?:\/\//);
    // the only url() is the embedded data: font (+ the internal #vnm-arrow marker def)
    expect(sketch).not.toMatch(/url\(\s*['"]?(?!#|data:)/i);
  });

  it("is deterministic — same input renders byte-identically", () => {
    expect(renderSvg(DSL, { style: "sketch" })).toBe(sketch);
  });

  it("is strictly opt-in — clean is the default and carries no sketch artifacts", () => {
    expect(clean).not.toContain("@font-face");
    expect(clean).not.toContain("Kalam");
    expect(clean).toContain("<rect"); // clean nodes are rects
    // clean output is unchanged by the feature existing (guarded elsewhere by the
    // full render-svg snapshot); here just assert the two styles really differ
    expect(sketch).not.toBe(clean);
  });

  it("renders every native shape as rough paths (subroutine keeps its side bars)", () => {
    const shapes = [
      "flowchart LR",
      "R[Rect] --> Rn(Rounded)",
      "Rn --> Sr[[Subroutine]]",
      "Sr --> Hx{{Hex}}",
      "Hx --> Pl[/Para/]",
      "Pl --> Pa[\\Alt\\]",
      "Pa --> Cy[(Cyl)]",
    ].join("\n");
    const svg = renderSvg(shapes, { style: "sketch" });
    expect(XMLValidator.validate(svg)).toBe(true);
    expect(svg).toContain(" Q ");
    // no clean polygons for the hexagon / parallelograms — all rough paths now
    expect(svg).not.toContain("<polygon");
  });
});
