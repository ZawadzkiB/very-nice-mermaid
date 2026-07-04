import { describe, expect, it } from "vitest";
import { XMLValidator } from "fast-xml-parser";
import { renderFallbackSvg } from "../src/mermaid/fallback.js";
import { toMermaidTheme } from "../src/mermaid/theme-map.js";
import { resolveTheme } from "../src/theme/index.js";

// Spinning up jsdom + mermaid is heavy on first import.
const T = 30_000;

describe("fallback SVG render under jsdom (FR3/FR6)", () => {
  it(
    "renders a pie chart to well-formed SVG with no degradation (sane geometry)",
    async () => {
      const { svg, diagnostics, degraded } = await renderFallbackSvg(
        'pie title Pets\n "Dogs" : 386\n "Cats" : 85',
        { detected: "pie" },
      );
      expect(svg).toContain("<svg");
      expect(XMLValidator.validate(svg)).toBe(true);
      expect(svg).toContain('aria-roledescription="pie"');
      expect(degraded).toBe(false);
      // no degradation diagnostics for a self-sizing type
      expect(diagnostics.some((d) => d.severity !== "info")).toBe(false);
    },
    T,
  );

  it(
    "renders a sequence diagram (native-target type) to well-formed SVG, geometry usable",
    async () => {
      const { svg, degraded } = await renderFallbackSvg(
        "sequenceDiagram\n participant Alice\n participant Bob\n Alice->>Bob: Hello\n Bob-->>Alice: Hi",
        { detected: "sequence" },
      );
      expect(svg).toContain("<svg");
      expect(XMLValidator.validate(svg)).toBe(true);
      // sequence uses SVG text + a bespoke (non-dagre) layout → sane under jsdom
      expect(degraded).toBe(false);
      expect(svg).toContain("Alice");
      expect(svg).toContain("Bob");
    },
    T,
  );

  it(
    "reports degraded geometry for a dagre/getBBox type (class) under jsdom (FR5)",
    async () => {
      const { svg, diagnostics, degraded } = await renderFallbackSvg(
        "classDiagram\n Animal <|-- Dog",
        { detected: "class" },
      );
      expect(svg).toContain("<svg");
      expect(degraded).toBe(true);
      const deg = diagnostics.find((d) => d.code === "render-degraded");
      expect(deg).toBeDefined();
      expect(deg!.severity).toBe("warn");
      expect(deg!.capability).toBe("geometry");
    },
    T,
  );

  it(
    "applies our theme tokens as mermaid themeVariables (FR7)",
    async () => {
      const theme = resolveTheme({ colors: { background: "#0b1021", edge: "#ff00aa" } });
      const { svg } = await renderFallbackSvg('pie title P\n "A" : 1\n "B" : 2', {
        detected: "pie",
        theme,
      });
      // the mapped line color / background should appear in mermaid's inline styles
      const lower = svg.toLowerCase();
      expect(lower.includes("ff00aa") || lower.includes("0b1021")).toBe(true);
    },
    T,
  );

  it("maps core tokens onto mermaid themeVariables", () => {
    const theme = resolveTheme("dark");
    const m = toMermaidTheme(theme);
    expect(m.theme).toBe("base");
    expect(m.themeVariables.background).toBe(theme.tokens.colors.background);
    expect(m.themeVariables.lineColor).toBe(theme.tokens.colors.edge);
    expect(m.themeVariables.primaryColor).toBe(theme.tokens.colors.surface);
    expect(m.fontFamily).toBe(theme.tokens.font.family);
  });
});
