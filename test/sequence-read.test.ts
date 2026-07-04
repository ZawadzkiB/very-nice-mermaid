import { describe, expect, it } from "vitest";
import { readSequenceModel } from "../src/native/sequence/read.js";

// Spinning up jsdom + mermaid is heavy on first import.
const T = 30_000;

describe("readSequenceModel (SVG → model, FR2/D3)", () => {
  it(
    "recovers participants, ids/labels, ordered messages, line style and self-messages",
    async () => {
      const model = await readSequenceModel(
        [
          "sequenceDiagram",
          "  participant U as User",
          "  participant S as Server",
          "  U->>S: request",
          "  S-->>U: response",
          "  U->>U: retry",
        ].join("\n"),
      );

      expect(model.kind).toBe("sequence");
      // participants: id from the `as` alias's left side, label from the right
      expect(model.participants).toEqual([
        { id: "U", label: "User", order: 0 },
        { id: "S", label: "Server", order: 1 },
      ]);

      // messages: order preserved, from/to by id, solid vs dashed line style,
      // and the self-message flagged.
      expect(model.messages).toEqual([
        { from: "U", to: "S", label: "request", kind: "solid", arrowEnd: true, self: false, order: 0 },
        { from: "S", to: "U", label: "response", kind: "dashed", arrowEnd: true, self: false, order: 1 },
        { from: "U", to: "U", label: "retry", kind: "solid", arrowEnd: true, self: true, order: 2 },
      ]);
    },
    T,
  );

  it(
    "keeps left-to-right participant order and pairs each label with its message",
    async () => {
      const model = await readSequenceModel(
        [
          "sequenceDiagram",
          "  participant Alice",
          "  participant Bob",
          "  participant Carol",
          "  Alice->>Bob: Hello Bob",
          "  Alice->>Carol: Are you there?",
          "  Carol-->>Alice: Yes",
        ].join("\n"),
      );
      expect(model.participants.map((p) => p.id)).toEqual(["Alice", "Bob", "Carol"]);
      expect(model.messages.map((m) => m.label)).toEqual([
        "Hello Bob",
        "Are you there?",
        "Yes",
      ]);
    },
    T,
  );
});
