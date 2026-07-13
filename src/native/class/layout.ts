/**
 * Lay out a {@link ClassModel} with **our own dagre** (FR2 / spike-01.md: we
 * discard mermaid's degenerate headless class geometry). We build a flowchart
 * {@link DiagramModel} — each class a `rect` node whose label carries its full
 * compartment text (so `measureNode` sizes the card to fit), each relation a
 * directed edge in `relations` order — then reuse the shared `layout()`. The
 * resulting {@link PositionedModel} feeds the interactive DOM runtime + HTML
 * export unchanged; `renderClassSvg` uses it plus the structured classes/
 * relations to draw compartments + typed relation markers.
 *
 * Pure + deterministic (same model + theme ⇒ identical output).
 */

import type {
  DiagramModel,
  DiagramNode,
  DiagramEdge,
} from "../../model/index.js";
import type { ClassModel, ClassLayout } from "../../model/class.js";
import { themes, type Theme } from "../../theme/index.js";
import { layout } from "../../layout/index.js";
import { classCardLines } from "./card.js";

export interface ClassLayoutOptions {
  theme?: Theme;
  /** Edge-crossing bridges (FR7 / D4); forwarded to the shared `layout()`. */
  bridges?: boolean;
}

/** Lay out a {@link ClassModel} into a positioned {@link ClassLayout}. */
export function layoutClass(model: ClassModel, opts: ClassLayoutOptions = {}): ClassLayout {
  const theme = opts.theme ?? themes.light!;

  const nodes: DiagramNode[] = model.classes.map((c) => ({
    id: c.id,
    label: classCardLines(c).all.join("\n"),
    shape: "rect",
    classes: [],
  }));

  const edges: DiagramEdge[] = model.relations.map((r) => {
    const edge: DiagramEdge = {
      from: r.from,
      to: r.to,
      // realization + dependency are dashed; the rest solid.
      kind: r.type === "realization" || r.type === "dependency" ? "dotted" : "solid",
      arrows: { start: r.head === "from", end: r.head === "to" },
      length: 2,
    };
    if (r.label) edge.label = r.label;
    return edge;
  });

  const diagram: DiagramModel = {
    direction: "TB",
    nodes,
    edges,
    subgraphs: [],
    classDefs: new Map(),
    warnings: [],
  };

  const positioned = layout(diagram, { theme, bridges: opts.bridges });
  return {
    kind: "class-layout",
    model: positioned,
    classes: model.classes,
    relations: model.relations,
  };
}
