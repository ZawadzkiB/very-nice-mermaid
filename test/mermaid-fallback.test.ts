import { describe, expect, it } from "vitest";
import { XMLValidator } from "fast-xml-parser";
import { renderFallbackSvg } from "../src/mermaid/fallback.js";
import { toMermaidTheme } from "../src/mermaid/theme-map.js";
import { resolveTheme } from "../src/theme/index.js";
import { Diagnostics } from "../src/diagnostics/index.js";

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
    "hard-fails a degenerate dagre/getBBox render headless — fallback-render-unavailable, no broken SVG (TEST-004/D9-A)",
    async () => {
      // ER's headless dagre/getBBox bounds explode to a degenerate sliver viewBox.
      // Per D9-A we fail honestly (a clear FR5 error) instead of returning the
      // blank/invalid SVG for it to be written to a file or baked into HTML.
      const diagnostics = new Diagnostics();
      await expect(
        renderFallbackSvg("erDiagram\n CUSTOMER ||--o{ ORDER : places", {
          detected: "er",
          diagnostics,
        }),
      ).rejects.toThrow(/cannot be rendered headlessly/i);
      const d = diagnostics.all().find((x) => x.code === "fallback-render-unavailable");
      expect(d).toBeDefined();
      expect(d!.severity).toBe("error");
      expect(d!.tier).toBe("fallback");
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

// The theme/config surface is untrusted (resolveTheme deep-merges raw --theme
// JSON; toMermaidTheme is a public export). A hostile token must never reach
// mermaid's themeVariables → the fallback SVG <style> → the inlined HTML page.
describe("theme-value sanitization at the mermaid themeVariables sink (REV-001)", () => {
  // A font.family that closes mermaid's scoped rule, injects a top-level
  // `body { display:none }` rule, and fires a remote url() fetch.
  const FONT_PAYLOAD = 'sans; } body { display:none } .z { x:url(http://evil/y)';

  it("replaces an injection payload in font.family and reports it (no raw interpolation)", () => {
    const theme = resolveTheme({ font: { family: FONT_PAYLOAD } });
    const diags = new Diagnostics();
    const m = toMermaidTheme(theme, diags);

    const serialized = JSON.stringify(m);
    expect(serialized).not.toContain("display:none");
    expect(serialized).not.toContain("evil");
    expect(serialized).not.toContain("url(");
    // no fragment of the payload's injected rule survives
    expect(serialized).not.toContain("body");
    expect(serialized).not.toContain(".z");
    expect(m.fontFamily).toBe("sans-serif");
    expect(m.themeVariables.fontFamily).toBe("sans-serif");

    const d = diags.all().find((x) => x.code === "unsafe-theme-value");
    expect(d).toBeDefined();
    expect(d!.severity).toBe("warn");
    expect(d!.reason).toBe("font.family");
  });

  it("drops color tokens that are not safe CSS colors (breakout + url()), with diagnostics", () => {
    const theme = resolveTheme({
      colors: {
        background: "red; } * { display:none",
        edge: "url(http://evil/z)",
      },
    });
    const diags = new Diagnostics();
    const m = toMermaidTheme(theme, diags);

    expect(m.themeVariables.background).toBeUndefined();
    expect(m.themeVariables.lineColor).toBeUndefined();
    const serialized = JSON.stringify(m);
    expect(serialized).not.toContain("evil");
    expect(serialized).not.toContain("display:none");

    const dropped = diags.all().filter((x) => x.code === "unsafe-theme-value");
    expect(dropped.length).toBe(2);
    expect(dropped.every((x) => x.severity === "warn")).toBe(true);
  });

  it("coerces a non-numeric font.size to a dropped/reported value", () => {
    const theme = resolveTheme({ font: { size: "13px; } body{display:none}" as unknown as number } });
    const diags = new Diagnostics();
    const m = toMermaidTheme(theme, diags);
    // parseFloat("13px; ...") === 13 → re-emitted as a clean numeric px, never raw
    expect(m.themeVariables.fontSize).toBe("13px");
    expect(JSON.stringify(m)).not.toContain("display:none");
  });

  it(
    "renders a fallback SVG containing neither the injected CSS rule nor the url() fetch (end-to-end)",
    async () => {
      const theme = resolveTheme({ font: { family: FONT_PAYLOAD } });
      const diagnostics = new Diagnostics();
      const { svg } = await renderFallbackSvg('pie title P\n "A" : 1\n "B" : 2', {
        detected: "pie",
        theme,
        diagnostics,
      });
      // The CLI inlines this SVG verbatim into the exported HTML <body>, so the
      // SVG <style> must carry neither the injected top-level rule nor the fetch.
      expect(svg).not.toContain("display:none");
      expect(svg).not.toContain("evil");
      expect(svg).not.toContain("url(http");
      // the breakout is reported through the FR5 channel, never silent
      expect(diagnostics.all().some((d) => d.code === "unsafe-theme-value")).toBe(true);
    },
    T,
  );
});
