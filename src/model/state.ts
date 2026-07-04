/**
 * State-diagram model — a **sibling** of the flowchart {@link DiagramModel} (and
 * the class/sequence models), not a mutation of them. A state machine is a
 * node-graph (states + labeled transitions), so like the class diagram it maps
 * directly onto our dagre layout + node/edge renderers. Simpler than class: no
 * member/method compartments.
 *
 * Two stages:
 *   - {@link StateModel} — logical, read from mermaid's SVG (states incl. the
 *     `[*]` start / end pseudo-states, and directed labeled transitions). No
 *     geometry (mermaid's headless state geometry is degenerate — spike-01.md).
 *   - {@link StateLayout} — positioned by **our own dagre** (`layoutState`): a
 *     flowchart {@link PositionedModel} the DOM runtime + HTML export consume
 *     unchanged, plus the structured `states` the SVG renderer needs to draw
 *     start/end pseudo-states as small circles.
 *
 * All plain data (JSON round-trips for the standalone HTML export).
 */

import type { Diagnostic, PositionedModel } from "./index.js";

/** A state node kind: a normal named state, or a `[*]` start / end pseudo-state. */
export type StateNodeKind = "normal" | "start" | "end";

/** A state node (normal state or start/end pseudo-state). */
export interface StateNode {
  /** Stable id (mermaid's internal state id, e.g. `Idle`, `root_start`). */
  id: string;
  /** Display label (empty for start/end pseudo-states). */
  label: string;
  kind: StateNodeKind;
}

/** A directed, optionally labeled transition between two states. */
export interface StateTransition {
  from: string;
  to: string;
  label?: string;
}

/** The logical state diagram read from mermaid's SVG (no geometry). */
export interface StateModel {
  kind: "state";
  states: StateNode[];
  transitions: StateTransition[];
  /** Diagnostics for anything unrecoverable (e.g. a transition whose ends we couldn't map). */
  warnings: Diagnostic[];
}

/**
 * A fully positioned state diagram. `model` is a flowchart {@link PositionedModel}
 * (our dagre output, pseudo-state boxes shrunk to small circles) that the DOM
 * runtime + HTML export consume unchanged; `states` carries the kind of each
 * node so the static SVG renderer can draw start/end pseudo-states specially.
 */
export interface StateLayout {
  kind: "state-layout";
  model: PositionedModel;
  states: StateNode[];
}

/** Type guard: is this a positioned state layout? */
export function isStateLayout(value: unknown): value is StateLayout {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as StateLayout).kind === "state-layout"
  );
}
