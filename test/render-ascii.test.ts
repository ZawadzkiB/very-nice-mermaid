import { describe, expect, it } from "vitest";
import { renderAscii, renderMarkdown } from "../src/render/ascii.js";

const SAMPLE = ["flowchart TD", "  A[Start] --> B[Middle]", "  B --> C[End]"].join("\n");

describe("renderAscii", () => {
  it("draws boxes and connectors deterministically", () => {
    const art = renderAscii(SAMPLE);
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
});

describe("renderMarkdown", () => {
  it("wraps ASCII in a fenced code block", () => {
    const md = renderMarkdown(SAMPLE);
    expect(md.startsWith("```\n")).toBe(true);
    expect(md.trimEnd().endsWith("```")).toBe(true);
    expect(md).toContain("Start");
  });
});
