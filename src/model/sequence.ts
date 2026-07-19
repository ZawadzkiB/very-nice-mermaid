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

/** Archify-style semantic kind of a message (drives its color): request/response/exception/cache/async. */
export type MessageSemantic = "request" | "response" | "exception" | "cache" | "async";

/** An activation span: a participant is "active" from message `startOrder` to `endOrder`. */
export interface SequenceActivation {
  participant: string;
  startOrder: number;
  endOrder: number;
  /** Nesting depth (0 = outermost) for side-by-side stacked bars. */
  depth: number;
}

/** A positioned activation bar (a colored rect on a lifeline). */
export interface PositionedActivation {
  participant: string;
  x: number;
  width: number;
  startY: number;
  endY: number;
}

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
  /** Activation spans (from `activate`/`deactivate` or `->>+` / `-->>-`); absent when none. */
  activations?: SequenceActivation[];
}

/** A participant with layout geometry (center-based `x`; box extents). */
export interface PositionedParticipant extends SequenceParticipant {
  /** Center x of the participant's box + lifeline. */
  x: number;
  width: number;
  height: number;
  /** Archify-style TYPE sub-label rendered under the name (empty/absent when unrecognized). */
  type?: string;
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
  /** Archify semantic kind (color) resolved by the layout. */
  semantic?: MessageSemantic;
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
  /** Positioned activation bars (empty when the diagram has no activations). */
  activations: PositionedActivation[];
  /** Distinct message semantics present, in display order — drives the legend (empty → no legend). */
  legend: MessageSemantic[];
  /** Y of the legend row baseline (only meaningful when `legend` is non-empty). */
  legendY: number;
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
