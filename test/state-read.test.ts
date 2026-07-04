import { describe, expect, it } from "vitest";
import { readStateModel } from "../src/native/state/read.js";

// Spinning up jsdom + mermaid is heavy on first import.
const T = 30_000;

describe("readStateModel (SVG → model, FR2/D3)", () => {
  it(
    "recovers states (start/end pseudo-states), directed transitions and labels",
    async () => {
      const model = await readStateModel(
        [
          "stateDiagram-v2",
          "  [*] --> Idle",
          "  Idle --> Running : start",
          "  Running --> Idle : stop",
          "  Running --> [*]",
        ].join("\n"),
      );

      expect(model.kind).toBe("state");

      // a start pseudo-state, two normal states, an end pseudo-state.
      const kinds = new Map(model.states.map((s) => [s.id, s.kind]));
      expect([...kinds.values()].filter((k) => k === "start")).toHaveLength(1);
      expect([...kinds.values()].filter((k) => k === "end")).toHaveLength(1);
      expect(model.states.find((s) => s.id === "Idle")).toMatchObject({ kind: "normal", label: "Idle" });
      expect(model.states.find((s) => s.id === "Running")).toMatchObject({ kind: "normal", label: "Running" });

      const startId = model.states.find((s) => s.kind === "start")!.id;
      const endId = model.states.find((s) => s.kind === "end")!.id;

      // transitions: endpoints (via geometry) + labels (via data-id link).
      const has = (from: string, to: string, label?: string) =>
        model.transitions.some(
          (t) => t.from === from && t.to === to && (label === undefined ? t.label === undefined : t.label === label),
        );
      expect(has(startId, "Idle")).toBe(true);
      expect(has("Idle", "Running", "start")).toBe(true);
      expect(has("Running", "Idle", "stop")).toBe(true);
      expect(has("Running", endId)).toBe(true);
    },
    T,
  );

  it(
    "labels stay attached to the right transition even when some transitions are unlabeled",
    async () => {
      const model = await readStateModel(
        [
          "stateDiagram-v2",
          "  [*] --> A",
          "  A --> B : go",
          "  B --> C",
          "  C --> A : back",
          "  C --> [*]",
        ].join("\n"),
      );
      const labelOf = (from: string, to: string) =>
        model.transitions.find((t) => t.from === from && t.to === to)?.label;
      expect(labelOf("A", "B")).toBe("go");
      expect(labelOf("C", "A")).toBe("back");
      expect(labelOf("B", "C")).toBeUndefined();
    },
    T,
  );

  it(
    "classifies pseudo-states structurally — a real state named end / *_start / *_end stays normal with its label (REV-005)",
    async () => {
      const model = await readStateModel(
        [
          "stateDiagram-v2",
          "  [*] --> process_start",
          "  process_start --> end",
          "  end --> session_end",
          "  session_end --> [*]",
        ].join("\n"),
      );

      // Only the two `[*]` pseudo-states are start/end; the name-lookalikes are normal.
      expect(model.states.filter((s) => s.kind === "start")).toHaveLength(1);
      expect(model.states.filter((s) => s.kind === "end")).toHaveLength(1);
      for (const name of ["process_start", "end", "session_end"]) {
        expect(model.states.find((s) => s.id === name)).toMatchObject({
          kind: "normal",
          label: name,
        });
      }
    },
    T,
  );
});
