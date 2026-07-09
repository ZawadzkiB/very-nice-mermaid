/**
 * Sketch style across the NATIVE tiers (sequence / class / state) via the async
 * router (D6=B / FR6): each renders hand-drawn (rough marks + embedded font),
 * deterministically, and is strictly opt-in (clean is unchanged). Exercises the
 * `renderSvgAsync` route + the per-tier renderers' `style` threading in one shot.
 */

import { describe, it, expect } from "vitest";
import { XMLValidator } from "fast-xml-parser";
import { renderSvgAsync } from "../src/render/route.js";

const CASES: Array<{ tier: string; dsl: string }> = [
  { tier: "sequence", dsl: "sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi\n" },
  { tier: "class", dsl: "classDiagram\n  Animal <|-- Dog\n  Animal : +int age\n  Animal : +run()\n" },
  { tier: "state", dsl: "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: go\n  Running --> [*]\n" },
];

describe("native tiers — sketch style (FR6 / D6=B)", () => {
  for (const { tier, dsl } of CASES) {
    it(`${tier}: renders hand-drawn (rough + embedded font), valid, deterministic, opt-in`, async () => {
      const sketch = await renderSvgAsync(dsl, { style: "sketch" });
      const clean = await renderSvgAsync(dsl, {}); // default clean

      expect(XMLValidator.validate(sketch)).toBe(true);
      expect(sketch).toContain(" Q "); // rough bowed strokes
      expect(sketch).toContain("@font-face"); // bundled handwriting font
      expect(sketch).toContain("Kalam");

      // strictly opt-in: clean carries no sketch artifacts, and the two differ
      expect(clean).not.toContain("@font-face");
      expect(sketch).not.toBe(clean);

      // deterministic: same input → byte-identical
      const again = await renderSvgAsync(dsl, { style: "sketch" });
      expect(again).toBe(sketch);

      // zero external requests (only the embedded data: font + internal #frag refs)
      const stripped = sketch.replace(/https?:\/\/www\.w3\.org\/[^"' )]*/g, "");
      expect(stripped).not.toMatch(/https?:\/\//);
      expect(sketch).not.toMatch(/url\(\s*['"]?(?!#|data:)/i);
    });
  }

  it("class keeps its UML relation markers in sketch mode (semantics preserved)", async () => {
    const sketch = await renderSvgAsync("classDiagram\n  Animal <|-- Dog\n", { style: "sketch" });
    // the inheritance head (hollow triangle marker) is still referenced on the
    // (now hand-drawn) relation line — head=from uses the mirrored -start variant
    expect(sketch).toMatch(/marker-(start|end)="url\(#vnm-cls-tri(-start)?\)"/);
  });
});
