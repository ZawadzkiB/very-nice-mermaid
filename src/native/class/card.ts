/**
 * The line layout of a class card, shared by `layoutClass` (which joins `all`
 * into the {@link DiagramNode.label} that our dagre `measureNode` sizes the box
 * from) and `renderClassSvg` (which draws the same lines into name / members /
 * methods compartments). Keeping this in one place guarantees the box the layout
 * measures and the compartments the renderer draws stay consistent.
 */

import type { ClassEntity } from "../../model/class.js";

export interface ClassCardLines {
  /** Header rows: an optional `«stereotype»` line then the class name. */
  header: string[];
  /** Member (attribute) rows, each prefixed by its visibility marker. */
  members: string[];
  /** Method rows, each prefixed by its visibility marker. */
  methods: string[];
  /** Every row top-to-bottom (what the box is measured from). */
  all: string[];
}

/** Compute the compartment line layout for a class entity. */
export function classCardLines(entity: ClassEntity): ClassCardLines {
  const header: string[] = [];
  if (entity.stereotype) header.push(`«${entity.stereotype}»`);
  header.push(entity.name);
  const members = entity.members.map((m) => `${m.visibility}${m.text}`);
  const methods = entity.methods.map((m) => `${m.visibility}${m.text}`);
  return { header, members, methods, all: [...header, ...members, ...methods] };
}
