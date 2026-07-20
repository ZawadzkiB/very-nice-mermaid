import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderAscii, renderMarkdown } from "../src/render/ascii.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

const SAMPLE = ["flowchart TD", "  A[Start] --> B[Middle]", "  B --> C[End]"].join("\n");

describe("renderAscii", () => {
  it("draws boxes and connectors deterministically", () => {
    // Pin the layout theme: this asserts the ASCII layout ALGORITHM, which is a property of
    // the renderer, not of the default visual theme. (The default is arch-light, whose
    // monospace metrics size nodes differently; that its default is arch-light is covered by
    // the CLI theming tests. Text output carries no colours/fonts, so a fixed theme keeps
    // this box-drawing snapshot stable across default-theme changes.)
    const art = renderAscii(SAMPLE, { theme: "light" });
    expect(art).toMatchSnapshot();
  });

  it("contains box-drawing glyphs and a node label", () => {
    const art = renderAscii(SAMPLE);
    expect(art).toContain("┌");
    expect(art).toContain("┘");
    expect(art).toContain("Start");
  });

  it("is stable across runs", () => {
    expect(renderAscii(SAMPLE)).toBe(renderAscii(SAMPLE));
  });

  it("returns empty string for an empty diagram", () => {
    expect(renderAscii("flowchart TD")).toBe("");
  });

  // TEST-005: an edge's own elbow turn used to be merged into a `┼` crossing
  // glyph, reading as an ambiguous junction - most visibly a `┼` jammed against
  // the 'Lint passes?' box border in the ci-pipeline fixture. Elbows must now
  // draw clean corner glyphs, with `┼` reserved for two edges that genuinely
  // cross. ci-pipeline has many elbows but no true crossing UNDER THE LIGHT
  // METRICS this guard was written for, so it must render free of `┼` while
  // keeping its corner turns and arrowheads. (Pinned to light: the default
  // arch-light theme's taller monospace spacing routes one connector into a
  // genuine crossing here - correct, but a different premise than this test's.)
  it("draws edge elbows as corners, not crossings (TEST-005)", () => {
    const art = renderAscii(readFileSync(join(fixturesDir, "ci-pipeline.mmd"), "utf8"), { theme: "light" });
    expect(art).not.toContain("┼"); // no false crossing where a single edge turns
    expect(art).not.toContain("┼│"); // and none jammed against a node border
    expect(/[┌┐└┘]/.test(art)).toBe(true); // elbow turns render as corner glyphs
    expect(/[▼▲▶◀]/.test(art)).toBe(true); // flow direction stays legible
  });

  it("still marks a genuine two-edge crossing with ┼", () => {
    const crossing = ["flowchart LR", "  A --> C", "  A --> D", "  B --> C", "  B --> D"].join("\n");
    expect(renderAscii(crossing)).toContain("┼");
  });
});

describe("renderMarkdown", () => {
  it("wraps ASCII in a fenced code block", () => {
    const md = renderMarkdown(SAMPLE);
    expect(md.startsWith("```\n")).toBe(true);
    expect(md.trimEnd().endsWith("```")).toBe(true);
    expect(md).toContain("Start");
  });
});
