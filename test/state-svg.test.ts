import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { layoutState } from "../src/native/state/layout.js";
import { renderStateSvg } from "../src/native/state/svg.js";
import { renderSvg } from "../src/render/svg.js";
import type { StateModel } from "../src/model/state.js";
import { themes } from "../src/theme/index.js";

const MODEL: StateModel = {
  kind: "state",
  states: [
    { id: "start", label: "", kind: "start" },
    { id: "Idle", label: "Idle", kind: "normal" },
    { id: "Running", label: "Running", kind: "normal" },
    { id: "end", label: "", kind: "end" },
  ],
  transitions: [
    { from: "start", to: "Idle" },
    { from: "Idle", to: "Running", label: "start" },
    { from: "Running", to: "Idle", label: "stop" },
    { from: "Running", to: "end" },
  ],
  warnings: [],
};

describe("renderStateSvg", () => {
  for (const name of ["light", "dark", "fancy"] as const) {
    it(`produces a stable, well-formed SVG for the ${name} theme`, () => {
      const layout = layoutState(MODEL, { theme: themes[name]! });
      const svg = renderStateSvg(layout, themes[name]!);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("</svg>");
      expect(svg).toMatchSnapshot();
    });
  }

  it("is valid XML", () => {
    const svg = renderStateSvg(layoutState(MODEL, { theme: themes.light! }), themes.light!);
    const parser = new XMLParser({ ignoreAttributes: false });
    expect(() => parser.parse(svg)).not.toThrow();
    expect(parser.parse(svg).svg).toBeDefined();
  });

  it("is deterministic (same model + theme ⇒ identical layout + SVG)", () => {
    const a = renderStateSvg(layoutState(MODEL, { theme: themes.light! }), themes.light!);
    const b = renderStateSvg(layoutState(MODEL, { theme: themes.light! }), themes.light!);
    expect(a).toBe(b);
  });

  it("draws start/end as circles, states as cards, transitions as labeled arrows", () => {
    const svg = renderStateSvg(layoutState(MODEL, { theme: themes.light! }), themes.light!);
    // start = one filled disc, end = ring (2 circles) → 3 circles total
    expect((svg.match(/<circle /g) ?? []).length).toBe(3);
    expect(svg).toContain(">Idle<");
    expect(svg).toContain(">Running<");
    expect(svg).toContain('<marker id="vnm-arrow"');
    expect(svg).toContain('marker-end="url(#vnm-arrow)"');
    expect(svg).toContain(">start<");
    expect(svg).toContain(">stop<");
  });

  it("shrinks the pseudo-states to small circles (≤ the normal card height)", () => {
    const layout = layoutState(MODEL, { theme: themes.light! });
    const start = layout.model.nodes.find((n) => n.id === "start")!;
    const idle = layout.model.nodes.find((n) => n.id === "Idle")!;
    expect(start.width).toBeLessThan(idle.height);
    expect(start.width).toBe(start.height); // a circle
  });

  it("is reachable through the top-level renderSvg for a state layout", () => {
    const layout = layoutState(MODEL, { theme: themes.dark! });
    expect(renderSvg(layout, { theme: "dark" })).toBe(renderStateSvg(layout, themes.dark!));
  });
});
