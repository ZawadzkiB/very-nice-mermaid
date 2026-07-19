import { describe, expect, it } from "vitest";
import { layoutSequence } from "../src/native/sequence/layout.js";
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
    { from: "API", to: "DB", label: "INSERT", kind: "solid", arrowEnd: true, self: false, order: 1 },
    { from: "DB", to: "API", label: "id", kind: "dashed", arrowEnd: true, self: false, order: 2 },
    { from: "API", to: "API", label: "validate", kind: "solid", arrowEnd: true, self: true, order: 3 },
    { from: "API", to: "User", label: "201", kind: "dashed", arrowEnd: true, self: false, order: 4 },
  ],
};

describe("layoutSequence", () => {
  it("is deterministic (same model + theme ⇒ identical layout)", () => {
    const a = layoutSequence(MODEL, { theme: themes.light! });
    const b = layoutSequence(MODEL, { theme: themes.light! });
    expect(a).toEqual(b);
  });

  it("positions participants left-to-right by order with strictly increasing x", () => {
    const l = layoutSequence(MODEL, { theme: themes.light! });
    expect(l.participants.map((p) => p.id)).toEqual(["User", "API", "DB"]);
    for (let i = 1; i < l.participants.length; i++) {
      expect(l.participants[i]!.x).toBeGreaterThan(l.participants[i - 1]!.x);
    }
  });

  it("orders messages top-to-bottom with strictly increasing y", () => {
    const l = layoutSequence(MODEL, { theme: themes.light! });
    expect(l.messages.map((m) => m.order)).toEqual([0, 1, 2, 3, 4]);
    for (let i = 1; i < l.messages.length; i++) {
      expect(l.messages[i]!.y).toBeGreaterThan(l.messages[i - 1]!.y);
    }
  });

  it("positions activation bars from the activating to the deactivating message (archify)", () => {
    const withAct: SequenceModel = {
      ...MODEL,
      // API is active from message 0 (POST) through message 4 (201); DB active for 1→2.
      activations: [
        { participant: "API", startOrder: 0, endOrder: 4, depth: 0 },
        { participant: "DB", startOrder: 1, endOrder: 2, depth: 0 },
      ],
    };
    const l = layoutSequence(withAct, { theme: themes.light! });
    expect(l.activations).toHaveLength(2);
    const api = l.activations.find((a) => a.participant === "API")!;
    const db = l.activations.find((a) => a.participant === "DB")!;
    // Each bar spans from its start message's y to its end message's y (positive height),
    // centered on the participant's lifeline x.
    const apiP = l.participants.find((p) => p.id === "API")!;
    expect(api.x).toBeCloseTo(apiP.x, 5);
    expect(api.endY).toBeGreaterThan(api.startY);
    expect(db.startY).toBeGreaterThan(api.startY); // DB activates later
    expect(db.endY).toBeLessThan(api.endY); // and deactivates earlier (nested inside API's span)
    // No activations → empty (backward-compatible).
    expect(layoutSequence(MODEL, { theme: themes.light! }).activations).toEqual([]);
  });

  it("marks the self-message with a loop and keeps its endpoints on one column", () => {
    const l = layoutSequence(MODEL, { theme: themes.light! });
    const self = l.messages.find((m) => m.self)!;
    expect(self.fromX).toBe(self.toX);
    expect(self.loopHeight).toBeGreaterThan(0);
    expect(self.loopWidth).toBeGreaterThan(0);
  });

  it("keeps lifelines between the box rows and yields positive bounds", () => {
    const l = layoutSequence(MODEL, { theme: themes.light! });
    expect(l.lifelineTop).toBeGreaterThan(l.boxTop);
    expect(l.lifelineBottom).toBeGreaterThan(l.lifelineTop);
    expect(l.boxBottom).toBeGreaterThan(l.lifelineBottom);
    expect(l.bounds.width).toBeGreaterThan(0);
    expect(l.bounds.height).toBeGreaterThan(0);
  });

  it("widens a column gap to fit a wide adjacent message label", () => {
    const wide: SequenceModel = {
      kind: "sequence",
      participants: [
        { id: "A", label: "A", order: 0 },
        { id: "B", label: "B", order: 1 },
      ],
      messages: [
        { from: "A", to: "B", label: "x", kind: "solid", arrowEnd: true, self: false, order: 0 },
      ],
    };
    const wideLong: SequenceModel = {
      ...wide,
      messages: [
        {
          from: "A",
          to: "B",
          label: "a very long message label indeed",
          kind: "solid",
          arrowEnd: true,
          self: false,
          order: 0,
        },
      ],
    };
    const narrowGap = layoutSequence(wide, { theme: themes.light! });
    const wideGap = layoutSequence(wideLong, { theme: themes.light! });
    const dNarrow = narrowGap.participants[1]!.x - narrowGap.participants[0]!.x;
    const dWide = wideGap.participants[1]!.x - wideGap.participants[0]!.x;
    expect(dWide).toBeGreaterThan(dNarrow);
  });
});
