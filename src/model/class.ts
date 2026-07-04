/**
 * Class-diagram model — a **sibling** of the flowchart {@link DiagramModel} and
 * the {@link SequenceModel}, not a mutation of either. A class diagram is a
 * node-graph (compartmented class cards + typed relation edges), so unlike the
 * sequence it maps directly onto our dagre layout + node/edge renderers.
 *
 * Two stages, mirroring the rest of the pipeline:
 *   - {@link ClassModel} — logical, read from mermaid's SVG (classes with
 *     members/methods + typed relations). No geometry (mermaid's headless class
 *     geometry is degenerate — spike-01.md — so we discard it).
 *   - {@link ClassLayout} — positioned by **our own dagre** (`layoutClass`): a
 *     flowchart {@link PositionedModel} whose node ids are the class ids and
 *     whose edges are in `relations` order, plus the structured `classes` /
 *     `relations` the SVG renderer needs for compartments + relation markers.
 *
 * All plain data (JSON round-trips for the standalone HTML export).
 */

import type { Diagnostic, PositionedModel } from "./index.js";

/** UML member/method visibility marker (`+` public, `-` private, `#` protected, `~` package). */
export type ClassVisibility = "+" | "-" | "#" | "~" | "";

/** One member (attribute) or method row of a class card. */
export interface ClassMember {
  visibility: ClassVisibility;
  /** The row text **without** the leading visibility marker (e.g. `String name`). */
  text: string;
}

/**
 * The six UML relation types we recover from mermaid's relation markers +
 * line pattern (see `src/native/class/read.ts`):
 *   - `inheritance` — hollow triangle, solid line (`<|--`)
 *   - `realization` — hollow triangle, dashed line (`..|>`)
 *   - `composition` — filled diamond (`*--`)
 *   - `aggregation` — hollow diamond (`o--`)
 *   - `association` — open arrow, solid line (`-->`)
 *   - `dependency`  — open arrow, dashed line (`..>`)
 */
export type ClassRelationType =
  | "inheritance"
  | "composition"
  | "aggregation"
  | "association"
  | "dependency"
  | "realization";

/** A class node: id (== name), display name, optional stereotype, members, methods. */
export interface ClassEntity {
  /** Stable id (the class name); used as the layout node id. */
  id: string;
  name: string;
  /** Stereotype/annotation text without guillemets (e.g. `abstract`, `interface`). */
  stereotype?: string;
  members: ClassMember[];
  methods: ClassMember[];
}

/** A typed relation between two classes. */
export interface ClassRelation {
  from: string;
  to: string;
  type: ClassRelationType;
  label?: string;
  /** Which endpoint carries the decorative marker (triangle/diamond/arrow). */
  head: "from" | "to";
}

/** The logical class diagram read from mermaid's SVG (no geometry). */
export interface ClassModel {
  kind: "class";
  classes: ClassEntity[];
  relations: ClassRelation[];
  /** Diagnostics for anything unrecoverable (e.g. a relation whose ends we couldn't map). */
  warnings: Diagnostic[];
}

/**
 * A fully positioned class diagram. `model` is a flowchart {@link PositionedModel}
 * (our dagre output) so the interactive DOM runtime + HTML export can consume it
 * unchanged; `classes` / `relations` carry the structured data the static SVG
 * renderer needs (compartments + relation markers). `model.edges` are in the
 * same order as `relations`.
 */
export interface ClassLayout {
  kind: "class-layout";
  model: PositionedModel;
  classes: ClassEntity[];
  relations: ClassRelation[];
}

/** Type guard: is this a positioned class layout? */
export function isClassLayout(value: unknown): value is ClassLayout {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ClassLayout).kind === "class-layout"
  );
}
