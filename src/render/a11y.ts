/**
 * Accessible title / description (`accTitle` / `accDescr`), wired the way
 * mermaid 11.16.0 does it (accessibility.ts addSVGa11yTitleDescription): a
 * `<title>` and a `<desc>` as the svg's first children, referenced from the root
 * by aria-labelledby / aria-describedby, each only when set.
 *
 * mermaid derives the ids from the svg element id (`chart-title-<id>`); a vnm SVG
 * has none, so the id is a hash of the diagram (texts and structure, not
 * positions or theme): two diagrams on one page get different ids, and the
 * static SVG, the interactive view and its Save-SVG agree. Kept apart from
 * `svg.ts` because the runtime payload needs it too.
 */

/** What the renderers need to emit the accessible title / description. */
export interface DiagramA11y {
  title?: string;
  desc?: string;
  titleId: string;
  descId: string;
}

interface A11ySource {
  accTitle?: string;
  accDescr?: string;
  direction: string;
  nodes: ReadonlyArray<{ id: string; label: string }>;
  edges: ReadonlyArray<{ from: string; to: string; label?: string }>;
  subgraphs: ReadonlyArray<{ id: string; title: string }>;
}

/** The accessible title / description of a diagram, or `undefined` when it has neither. */
export function diagramA11y(model: A11ySource): DiagramA11y | undefined {
  if (!model.accTitle && !model.accDescr) return undefined;
  const id = "vnm-" + fnv1a(
    JSON.stringify([
      model.accTitle ?? "",
      model.accDescr ?? "",
      model.direction,
      model.nodes.map((n) => [n.id, n.label]),
      model.edges.map((e) => [e.from, e.to, e.label ?? ""]),
      model.subgraphs.map((s) => [s.id, s.title]),
    ]),
  );
  const out: DiagramA11y = { titleId: `chart-title-${id}`, descId: `chart-desc-${id}` };
  if (model.accTitle) out.title = model.accTitle;
  if (model.accDescr) out.desc = model.accDescr;
  return out;
}

/** 32-bit FNV-1a, base 36: stable, non-cryptographic. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
