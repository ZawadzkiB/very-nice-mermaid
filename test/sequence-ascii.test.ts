import { describe, expect, it } from "vitest";
import { layoutSequence } from "../src/native/sequence/layout.js";
import { renderSequenceAscii, renderSequenceMarkdown } from "../src/native/sequence/ascii.js";
import { renderAscii, renderMarkdown } from "../src/render/ascii.js";
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
    { from: "API", to: "API", label: "validate stock", kind: "solid", arrowEnd: true, self: true, order: 3 },
    { from: "API", to: "User", label: "201 Created", kind: "dashed", arrowEnd: true, self: false, order: 4 },
  ],
};

const layout = () => layoutSequence(MODEL, { theme: themes.light! });

describe("renderSequenceAscii", () => {
  it("draws a stable sequence diagram", () => {
    expect(renderSequenceAscii(layout())).toMatchSnapshot();
  });

  it("contains participant boxes, lifelines, message arrows, and a self marker", () => {
    const art = renderSequenceAscii(layout());
    expect(art).toContain("┌"); // participant box corner
    expect(art).toContain("│"); // lifeline
    expect(art).toContain("▶"); // forward message arrow
    expect(art).toContain("◀"); // reply arrow
    expect(art).toContain("╌"); // dashed (reply) message
    expect(art).toContain("↺"); // self-message marker
    expect(art).toContain("User");
    expect(art).toContain("validate stock");
  });

  it("is stable across runs", () => {
    expect(renderSequenceAscii(layout())).toBe(renderSequenceAscii(layout()));
  });

  it("returns empty string for a participant-less layout", () => {
    const empty = layoutSequence({ kind: "sequence", participants: [], messages: [] }, { theme: themes.light! });
    expect(renderSequenceAscii(empty)).toBe("");
  });
});

describe("renderSequenceMarkdown", () => {
  it("wraps the sequence ASCII in a fenced code block", () => {
    const md = renderSequenceMarkdown(layout());
    expect(md.startsWith("```\n")).toBe(true);
    expect(md.trimEnd().endsWith("```")).toBe(true);
    expect(md).toContain("User");
  });

  it("is reachable through the top-level renderAscii / renderMarkdown for a layout", () => {
    expect(renderAscii(layout())).toBe(renderSequenceAscii(layout()));
    expect(renderMarkdown(layout())).toBe(renderSequenceMarkdown(layout()));
  });
});
