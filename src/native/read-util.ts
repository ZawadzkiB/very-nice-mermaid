/**
 * Shared SVG-reading helpers for the node-graph native readers (class + state).
 * Both render their DSL with mermaid (`htmlLabels:false`) and read structure out
 * of the resulting SVG with `DOMParser`; these are the small parsing primitives
 * they have in common. Browser-safe: pure DOM traversal + string parsing, no
 * Node built-ins.
 */

/** Does an element's `class` attribute contain a whitespace-delimited token? */
export function hasClass(el: Element, token: string): boolean {
  const cls = el.getAttribute("class");
  return cls ? cls.split(/\s+/).includes(token) : false;
}

/** A 2D point. */
export interface Pt {
  x: number;
  y: number;
}

/** All coordinate pairs in an SVG path `d`, as points. */
export function pathPoints(d: string): Pt[] {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i]!, y: nums[i + 1]! });
  return pts;
}

/** Parse the `(x, y)` of a `translate(x, y)` transform, or `null`. */
export function parseTranslate(transform: string | null): Pt | null {
  if (!transform) return null;
  const m = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(transform);
  return m ? { x: parseFloat(m[1]!), y: parseFloat(m[2]!) } : null;
}

/**
 * Map each edge's id → its label text. mermaid emits every edge label in the
 * `.edgeLabels` layer inside a `g[data-id]` whose `data-id` is the exact edge id
 * (class relations `id_<From>_<To>_<n>`, state transitions `edge0`, …) — a
 * direct, geometry-free link that is robust even after we re-lay-out. First
 * non-empty text per id wins (mermaid repeats the text in a hidden background).
 */
export function readEdgeLabelMap(doc: Document): Map<string, string> {
  const map = new Map<string, string>();
  const layer = doc.querySelector("g.edgeLabels");
  if (!layer) return map;
  for (const g of Array.from(layer.querySelectorAll("g[data-id]"))) {
    const id = g.getAttribute("data-id");
    const text = (g.querySelector("text")?.textContent ?? "").trim();
    if (id && text && !map.has(id)) map.set(id, text);
  }
  return map;
}
