/**
 * Static SVG renderer for a positioned {@link StateLayout}. No DOM required
 * (powers the CLI + PNG), theme-driven (light/dark/fancy), and valid XML. Normal
 * states are our rounded cards; `[*]` start/end pseudo-states are small
 * filled/ringed circles; transitions are labeled arrows. Reuses the shared
 * `escapeXml*` sanitization + the arrow-marker / edge-label-plate idiom.
 */

import type { PositionedNode, RoutedEdge } from "../../model/index.js";
import type { StateLayout, StateNode } from "../../model/state.js";
import type { Theme } from "../../theme/index.js";
import type { RenderStyle } from "../../theme/index.js";
import { n } from "../../geometry/index.js";
import { escapeXml, escapeXmlAttr } from "../../render/style.js";
import { SKETCH_FONT_FAMILY } from "../../render/sketch-font.js";
import { sketchFontDefs, sketchRectSvg, sketchLineSvg, sketchArrowSvg } from "../../render/sketch-svg.js";

/** Render a positioned state layout to a standalone SVG string. */
export function renderStateSvg(
  layout: StateLayout,
  theme: Theme,
  background?: string,
  style: RenderStyle = "clean",
): string {
  const b = layout.model.bounds;
  const t = theme.tokens;
  const sketch = style === "sketch";
  const kinds = new Map<string, StateNode["kind"]>(layout.states.map((s) => [s.id, s.kind]));
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(b.width)}" height="${n(
      b.height,
    )}" viewBox="${n(b.x)} ${n(b.y)} ${n(b.width)} ${n(b.height)}" font-family="${escapeXmlAttr(
      sketch ? SKETCH_FONT_FAMILY : t.font.family,
    )}">`,
  );
  parts.push(defs(theme, sketch));

  if (background !== "transparent") {
    parts.push(
      `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.width)}" height="${n(
        b.height,
      )}" fill="${background ?? t.colors.background}"/>`,
    );
  }

  for (const edge of layout.model.edges) parts.push(renderTransition(edge, theme, sketch));
  for (const node of layout.model.nodes) {
    parts.push(renderState(node, kinds.get(node.id) ?? "normal", theme, sketch));
  }

  parts.push("</svg>");
  return parts.join("\n");
}

function defs(theme: Theme, sketch: boolean): string {
  const t = theme.tokens;
  const a = t.edge.arrowSize;
  const shadow = t.effects.gradient
    ? `<filter id="vnm-shadow" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.35"/></filter>`
    : "";
  // orient="auto" (never "auto-start-reverse" — resvg ignores that SVG2 value
  // and renders the head un-rotated). Transitions only carry a marker-END, so a
  // single forward-pointing marker suffices here.
  return (
    `<defs>` +
    `<marker id="vnm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${a}" markerHeight="${a}" orient="auto">` +
    `<path d="M0 0 L10 5 L0 10 z" fill="${t.colors.edge}"/></marker>` +
    shadow +
    (sketch ? sketchFontDefs() : "") +
    `</defs>`
  );
}

function renderTransition(edge: RoutedEdge, theme: Theme, sketch: boolean): string {
  const t = theme.tokens;
  let parts: string[];
  if (sketch) {
    const pts = edge.points.map((p) => [p.x, p.y] as [number, number]);
    const key = edge.from + "->" + edge.to;
    parts = [sketchLineSvg(pts, t.colors.edge, t.edge.width, key)];
    const m = pts.length;
    if (edge.arrows.end && m >= 2) {
      parts.push(
        sketchArrowSvg(pts[m - 1]!, pts[m - 2]!, t.edge.arrowSize, t.colors.edge, t.edge.width, key + "@end"),
      );
    }
  } else {
    const marker = edge.arrows.end ? ` marker-end="url(#vnm-arrow)"` : "";
    parts = [
      `<path d="${edge.path}" fill="none" stroke="${t.colors.edge}" stroke-width="${t.edge.width}" stroke-linejoin="round" stroke-linecap="round"${marker}/>`,
    ];
  }
  if (edge.label && edge.labelPos) {
    parts.push(edgeLabel(edge.label, edge.labelPos.x, edge.labelPos.y, theme));
  }
  return parts.join("");
}

function edgeLabel(label: string, cx: number, cy: number, theme: Theme): string {
  const t = theme.tokens;
  const w = label.length * t.font.size * 0.62 + 10;
  const h = t.font.lineHeight + 4;
  return (
    `<rect x="${n(cx - w / 2)}" y="${n(cy - h / 2)}" width="${n(w)}" height="${n(
      h,
    )}" rx="${t.radii.label}" fill="${t.colors.edgeLabelBg}"/>` +
    `<text x="${n(cx)}" y="${n(cy)}" fill="${t.colors.edgeLabelText}" font-size="${
      t.font.size - 1
    }" text-anchor="middle" dominant-baseline="central">${escapeXml(label)}</text>`
  );
}

function renderState(
  node: PositionedNode,
  kind: StateNode["kind"],
  theme: Theme,
  sketch: boolean,
): string {
  const t = theme.tokens;
  const cx = node.x;
  const cy = node.y;
  const shadow = t.effects.gradient && !sketch ? ` filter="url(#vnm-shadow)"` : "";

  if (kind === "start") {
    const r = Math.min(9, node.width / 2);
    return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${t.colors.text}"/>`;
  }
  if (kind === "end") {
    const r = Math.min(9, node.width / 2);
    return (
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="${t.colors.text}" stroke-width="1.5"/>` +
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r - 4)}" fill="${t.colors.text}"/>`
    );
  }

  const x = cx - node.width / 2;
  const y = cy - node.height / 2;
  const rect = sketch
    ? sketchRectSvg(x, y, node.width, node.height, t.colors.surface, t.colors.surfaceStroke, "1.5", node.id)
    : `<rect x="${n(x)}" y="${n(y)}" width="${n(node.width)}" height="${n(
        node.height,
      )}" rx="${t.radii.card + 4}" fill="${t.colors.surface}" stroke="${t.colors.surfaceStroke}" stroke-width="1.5"/>`;
  const text = `<text x="${n(cx)}" y="${n(cy)}" fill="${t.colors.text}" font-size="${
    t.font.size
  }" font-weight="${t.font.weight}" text-anchor="middle" dominant-baseline="central">${escapeXml(
    node.label,
  )}</text>`;
  return `<g${shadow}>${rect}${text}</g>`;
}
