/**
 * SVG → model reader for native class diagrams (FR2 / D3).
 *
 * We render the class DSL **once** with mermaid.js (via the shared lazy
 * {@link loadMermaid} path — jsdom stood up before the first mermaid import, and
 * `htmlLabels:false` so labels are measurable SVG `<text>`; see spike-01.md),
 * then read a clean, structured {@link ClassModel} straight from the SVG.
 *
 * Unlike the sequence reader we keep **only the logical structure** (classes with
 * members/methods + typed relations) and **discard mermaid's geometry entirely**:
 * mermaid lays class diagrams out with dagre, whose headless bounds are
 * degenerate (spike-01.md), so `layoutClass` re-lays it out with our own dagre.
 *
 * Relation `(from, to, type)` recovery is the trickiest part (spike-flagged):
 *   - `from`/`to` come from the relation's `data-id` (`id_<From>_<To>_<n>`),
 *     split against the known class-name set (robust to `_` in names).
 *   - `type` comes from the relation's decorative **marker** (extension /
 *     composition / aggregation / dependency) + its **line pattern** (solid vs
 *     dashed): extension+solid = inheritance, extension+dashed = realization,
 *     dependency+solid = association, dependency+dashed = dependency.
 *   - Anything unrecoverable emits a diagnostic and is skipped.
 *
 * Browser-safe: no static mermaid/jsdom import — mermaid is loaded through
 * {@link loadMermaid} (dynamic), and the SVG is parsed with `DOMParser`.
 */

import type {
  ClassModel,
  ClassEntity,
  ClassMember,
  ClassRelation,
  ClassRelationType,
  ClassVisibility,
} from "../../model/class.js";
import type { Diagnostic } from "../../model/index.js";
import { loadMermaid } from "../../mermaid/router.js";
import { hasClass, readEdgeLabelMap } from "../read-util.js";

/** A stable id keeps mermaid's internal ids deterministic across runs. */
const READ_ID = "vnm-class-read";

/** Render the class DSL to an SVG string via mermaid (headless-safe config). */
async function renderMermaidSvg(dsl: string): Promise<string> {
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    deterministicIds: true,
    // SVG <text>/<tspan> labels, not HTML <foreignObject> — measurable + clean.
    htmlLabels: false,
    class: { htmlLabels: false },
  });
  const { svg } = await mermaid.render(READ_ID, dsl);
  return svg;
}

/** Find the first descendant `<g>` of `root` whose class list includes `token`. */
function groupByClass(root: Element, token: string): Element | null {
  for (const g of Array.from(root.querySelectorAll("g"))) {
    if (hasClass(g, token)) return g;
  }
  return null;
}

/** Split a compartment row's leading visibility marker from the rest. */
function parseMember(row: string): ClassMember {
  const text = row.trim();
  const first = text.charAt(0);
  if (first === "+" || first === "-" || first === "#" || first === "~") {
    return { visibility: first as ClassVisibility, text: text.slice(1).trim() };
  }
  return { visibility: "", text };
}

/** Read the member/method rows of one compartment group (each row a `<g>`'s text). */
function readRows(group: Element | null): ClassMember[] {
  if (!group) return [];
  const rows: ClassMember[] = [];
  for (const rowG of Array.from(group.children)) {
    const t = rowG.querySelector("text");
    const raw = (t?.textContent ?? rowG.textContent ?? "").trim();
    if (raw) rows.push(parseMember(raw));
  }
  return rows;
}

/**
 * Recover the class name from a node id (`<render>-classId-<Name>-<index>`).
 * The greedy `^.*` anchors to the LAST `-classId-`, so a render id that itself
 * contains the token can't be mis-captured.
 */
function classNameFromId(id: string): string | null {
  const m = /^.*-classId-(.+)-\d+$/.exec(id);
  return m ? m[1]! : null;
}

/** Read every class node (name, stereotype, members, methods). */
function readClasses(doc: Document): ClassEntity[] {
  const classes: ClassEntity[] = [];
  for (const g of Array.from(doc.querySelectorAll("g.node"))) {
    const id = g.getAttribute("id") ?? "";
    const name = classNameFromId(id);
    if (!name) continue;
    const stereoRaw = groupByClass(g, "annotation-group")?.textContent?.trim() ?? "";
    // strip guillemets « » (and any duplicated repetition mermaid emits)
    const stereotype = stereoRaw.replace(/[«»]/g, "").split(/\s{2,}/)[0]?.trim() || "";
    const labelText =
      groupByClass(g, "label-group")?.querySelector("text")?.textContent?.trim() || name;
    const members = readRows(groupByClass(g, "members-group"));
    const methods = readRows(groupByClass(g, "methods-group"));
    const entity: ClassEntity = { id: name, name: labelText, members, methods };
    if (stereotype) entity.stereotype = stereotype;
    classes.push(entity);
  }
  return classes;
}

/** Split `id_<From>_<To>_<n>` into (from, to) against the known class-name set. */
function splitEnds(dataId: string, names: Set<string>): { from: string; to: string } | null {
  // strip the `id_` prefix and the trailing `_<index>`
  const core = dataId.replace(/^id_/, "").replace(/_\d+$/, "");
  const parts = core.split("_");
  for (let i = 1; i < parts.length; i++) {
    const from = parts.slice(0, i).join("_");
    const to = parts.slice(i).join("_");
    if (names.has(from) && names.has(to)) return { from, to };
  }
  return null;
}

/** Which relation marker (if any) a `url(#…)` reference names, + which type it is. */
function markerToken(ref: string | null): "extension" | "composition" | "aggregation" | "dependency" | "lollipop" | null {
  if (!ref) return null;
  for (const tok of ["extension", "composition", "aggregation", "dependency", "lollipop"] as const) {
    if (ref.includes(tok)) return tok;
  }
  return null;
}

/** Map a marker token + line pattern to one of our six relation types. */
function relationType(
  token: NonNullable<ReturnType<typeof markerToken>>,
  dashed: boolean,
): ClassRelationType {
  switch (token) {
    case "extension":
      return dashed ? "realization" : "inheritance";
    case "composition":
      return "composition";
    case "aggregation":
      return "aggregation";
    case "dependency":
      return dashed ? "dependency" : "association";
    case "lollipop":
      return "association";
  }
}

/** Read typed relations (`from`, `to`, `type`, `head`, `label`). */
function readRelations(
  doc: Document,
  names: Set<string>,
  warnings: Diagnostic[],
): ClassRelation[] {
  const paths = Array.from(doc.querySelectorAll("g.edgePaths path.relation"));
  const labels = readEdgeLabelMap(doc);
  const relations: ClassRelation[] = [];

  paths.forEach((p, i) => {
    const dataId = p.getAttribute("data-id") ?? p.getAttribute("id") ?? "";
    const ends = splitEnds(dataId, names);
    const startRef = p.getAttribute("marker-start");
    const endRef = p.getAttribute("marker-end");
    const token = markerToken(startRef) ?? markerToken(endRef);
    if (!ends || !token) {
      warnings.push({
        severity: "warning",
        code: "class-relation-unrecoverable",
        message: `could not recover a relation (data-id='${dataId}')`,
        line: i + 1,
        col: 1,
      });
      return;
    }
    const rel: ClassRelation = {
      from: ends.from,
      to: ends.to,
      type: relationType(token, hasClass(p, "edge-pattern-dashed")),
      head: markerToken(startRef) ? "from" : "to",
    };
    // Direct, geometry-free label link: the relation's data-id is the label's.
    const label = labels.get(dataId);
    if (label) rel.label = label;
    relations.push(rel);
  });

  return relations;
}

/**
 * Read a {@link ClassModel} from a class DSL string by rendering it with mermaid
 * and parsing the SVG. Deterministic: classes, members/methods and typed
 * relations are recovered from structure (not from mermaid's pixel geometry,
 * which we discard and re-layout with our own dagre).
 */
export async function readClassModel(dsl: string): Promise<ClassModel> {
  const svg = await renderMermaidSvg(dsl);
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const warnings: Diagnostic[] = [];
  const classes = readClasses(doc);
  const names = new Set(classes.map((c) => c.id));
  const relations = readRelations(doc, names, warnings);
  return { kind: "class", classes, relations, warnings };
}
