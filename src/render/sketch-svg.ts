/**
 * Shared sketch-style SVG emitters for the **native** renderers (sequence /
 * class / state). They wrap the deterministic `src/rough` generator into the
 * small set of marks those renderers need — a hand-drawn rect / ellipse / open
 * line / open arrowhead — so every native tier draws the sketch look identically
 * (one source of truth) and stays deterministic (seeded by a stable key).
 *
 * The flowchart SVG (`svg.ts`) keeps its own inline sketch assembly because it is
 * byte-parity-mirrored inside `vnmRuntime`; these helpers are for the native
 * static SVGs, which have no runtime twin. Browser-safe: pure string + rough.
 */

import { roughShape, roughEllipse, roughPolyline, openArrowhead, type Pt } from "../rough/index.js";
import { sketchFontFaceCss } from "./sketch-font.js";

/** `<style>@font-face…</style>` for a native SVG's `<defs>` (base64, zero network). */
export function sketchFontDefs(): string {
  return `<style>${sketchFontFaceCss()}</style>`;
}

function shapeMarkup(rs: { fill: string; outline: string[] }, fill: string, stroke: string, sw: string): string {
  const strokeAttr = ` fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`;
  let out = fill === "none" ? "" : `<path d="${rs.fill}" fill="${fill}" stroke="none"/>`;
  for (const d of rs.outline) out += `<path d="${d}"${strokeAttr}/>`;
  return out;
}

/** A hand-drawn rectangle: soft rough fill under wobbly outline strokes. */
export function sketchRectSvg(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  sw: string,
  key: string,
): string {
  return shapeMarkup(roughShape([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], key), fill, stroke, sw);
}

/** A hand-drawn ellipse (soft rough fill under wobbly outline strokes). */
export function sketchEllipseSvg(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  stroke: string,
  sw: string,
  key: string,
): string {
  return shapeMarkup(roughEllipse(cx, cy, rx, ry, key), fill, stroke, sw);
}

/** A hand-drawn open polyline (edge / divider / lifeline). `dash` e.g. ` stroke-dasharray="4 4"`. */
export function sketchLineSvg(pts: Pt[], stroke: string, sw: string | number, key: string, dash = ""): string {
  const strokeAttr = ` fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"${dash}`;
  let out = "";
  for (const d of roughPolyline(pts, key)) out += `<path d="${d}"${strokeAttr}/>`;
  return out;
}

/** A hand-drawn open `V` arrowhead at `tip`, pointing away from `from`. */
export function sketchArrowSvg(
  tip: Pt,
  from: Pt,
  size: number,
  stroke: string,
  sw: string | number,
  key: string,
): string {
  return `<path d="${openArrowhead(tip, from, size, key)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
}
