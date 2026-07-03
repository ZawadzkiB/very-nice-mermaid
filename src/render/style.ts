/**
 * Resolve a node's effective colors from (lowest→highest precedence): theme
 * default → theme role (a class name matching a role) → `classDef` → inline
 * `style`. Shared by the SVG renderer; the DOM runtime mirrors this logic.
 */

import type { DiagramNode, StyleDef } from "../model/index.js";
import type { Theme } from "../theme/index.js";

export interface ResolvedNodeStyle {
  fill: string;
  stroke: string;
  text: string;
  strokeWidth?: string;
  strokeDasharray?: string;
}

export function resolveNodeStyle(
  node: DiagramNode,
  classDefs: Map<string, StyleDef>,
  theme: Theme,
): ResolvedNodeStyle {
  const c = theme.tokens.colors;
  let fill = c.surface;
  let stroke = c.surfaceStroke;
  let text = c.text;
  let strokeWidth: string | undefined;
  let strokeDasharray: string | undefined;

  for (const cls of node.classes) {
    const role = c.roles[cls];
    if (role) {
      fill = role.fill;
      stroke = role.stroke;
      text = role.text;
    }
    const def = classDefs.get(cls);
    if (def) {
      if (def.fill) fill = def.fill;
      if (def.stroke) stroke = def.stroke;
      if (def.color) text = def.color;
      if (def.strokeWidth) strokeWidth = def.strokeWidth;
      if (def.strokeDasharray) strokeDasharray = def.strokeDasharray;
    }
  }

  const s = node.style;
  if (s) {
    if (s.fill) fill = s.fill;
    if (s.stroke) stroke = s.stroke;
    if (s.color) text = s.color;
    if (s.strokeWidth) strokeWidth = s.strokeWidth;
    if (s.strokeDasharray) strokeDasharray = s.strokeDasharray;
  }

  const out: ResolvedNodeStyle = { fill, stroke, text };
  if (strokeWidth !== undefined) out.strokeWidth = strokeWidth;
  if (strokeDasharray !== undefined) out.strokeDasharray = strokeDasharray;
  return out;
}
