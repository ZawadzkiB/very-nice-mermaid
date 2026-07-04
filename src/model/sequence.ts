/**
 * Sequence-diagram model — a **sibling** of the flowchart {@link DiagramModel}
 * (in `./index.ts`), not a mutation of it. A sequence is a bespoke ordered
 * layout (participants across the top, lifelines down, messages as ordered
 * horizontal arrows), so it does not share the node/edge/dagre model.
 *
 * Two stages, mirroring the flowchart pipeline:
 *   - {@link SequenceModel} — logical, read from mermaid's SVG (participants +
 *     ordered messages). No geometry.
 *   - {@link SequenceLayout} — positioned by our own deterministic layout
 *     (`src/native/sequence/layout.ts`) using theme spacing tokens. Every
 *     renderer (SVG / ASCII / interactive DOM) consumes this.
 *
 * All plain data (JSON round-trips for the standalone HTML export).
 */

import type { Rect } from "./index.js";

/** Message line style: `->>`/`->` → solid, `-->>`/`-->` → dashed. */
export type SequenceArrowKind = "solid" | "dashed";

/** A participant / actor column (id, display label, left-to-right order). */
export interface SequenceParticipant {
  /** Stable id mermaid uses for `data-from`/`data-to` (an `as` alias's left side). */
  id: string;
  /** Display label (the `as` alias's right side, or the id). */
  label: string;
  /** 0-based left-to-right order. */
  order: number;
}

/** One ordered message between two participants (or a self-message). */
export interface SequenceMessage {
  from: string;
  to: string;
  label: string;
  kind: SequenceArrowKind;
  /** Arrowhead at the target end (mermaid `marker-end`). */
  arrowEnd: boolean;
  /** True when `from === to` (drawn as a right-side loop). */
  self: boolean;
  /** 0-based message order (top-to-bottom). */
  order: number;
}

/** The logical sequence diagram read from mermaid's SVG (no geometry). */
export interface SequenceModel {
  kind: "sequence";
  participants: SequenceParticipant[];
  messages: SequenceMessage[];
}

/** A participant with layout geometry (center-based `x`; box extents). */
export interface PositionedParticipant extends SequenceParticipant {
  /** Center x of the participant's box + lifeline. */
  x: number;
  width: number;
  height: number;
}

/** A message with layout geometry. */
export interface PositionedMessage extends SequenceMessage {
  /** The message line's y (for a self-message, the top of the loop). */
  y: number;
  fromX: number;
  toX: number;
  labelX: number;
  labelY: number;
  /** Vertical extent of a self-message loop (only when `self`). */
  loopHeight?: number;
  /** Horizontal extent of a self-message loop (only when `self`). */
  loopWidth?: number;
}

/** The fully positioned sequence diagram every renderer consumes. */
export interface SequenceLayout {
  kind: "sequence-layout";
  participants: PositionedParticipant[];
  messages: PositionedMessage[];
  /** Center y of the top participant boxes. */
  boxTop: number;
  /** Center y of the bottom participant boxes. */
  boxBottom: number;
  /** Lifelines run from `lifelineTop` (below the top boxes) to `lifelineBottom`. */
  lifelineTop: number;
  lifelineBottom: number;
  bounds: Rect;
}

/** Type guard: is this a positioned sequence layout? */
export function isSequenceLayout(value: unknown): value is SequenceLayout {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as SequenceLayout).kind === "sequence-layout"
  );
}
