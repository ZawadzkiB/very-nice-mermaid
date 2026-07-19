/**
 * Pure static SVG renderer: `renderSvg(dsl | model, { theme }) → string`. No DOM
 * required, so it powers the CLI in Node and feeds the PNG rasterizer. Shares
 * the geometry + tokens + style resolution with the interactive renderer.
 */

import type {
  PositionedModel,
  PositionedNode,
  RoutedEdge,
  PositionedSubgraph,
  Point,
} from "../model/index.js";
import { n } from "../geometry/index.js";
import type { Theme, PartialTokenSet, RenderStyle } from "../theme/index.js";
import { resolveTheme } from "../theme/index.js";
import { resolveNodeStyle } from "./style.js";
import { roughShape, roughPolyline, openArrowhead, ellipsePoints, type Pt } from "../rough/index.js";
import { SKETCH_FONT_FAMILY, sketchFontFaceCss } from "./sketch-font.js";
import { prepare, ensureSyncRenderable, type RenderInput } from "./prepare.js";
import { isSequenceLayout, type SequenceLayout } from "../model/sequence.js";
import { renderSequenceSvg } from "../native/sequence/svg.js";
import { isClassLayout, type ClassLayout } from "../model/class.js";
import { renderClassSvg } from "../native/class/svg.js";
import { isStateLayout, type StateLayout } from "../model/state.js";
import { renderStateSvg } from "../native/state/svg.js";

export interface SvgRenderOptions {
  theme?: string | Theme | PartialTokenSet;
  strict?: boolean;
  /** Background fill; pass `"transparent"` to omit the background rect. */
  background?: string;
  /** Drawing style axis (D1): `clean` (default) or hand-drawn `sketch`. */
  style?: RenderStyle;
  /**
   * Edge-crossing bridges (FR7 / D4). `undefined` → the per-style default (ON for
   * clean elbow edges, OFF for curved); `true`/`false` force it.
   */
  bridges?: boolean;
}

/** Render a diagram to a standalone SVG string. */
export function renderSvg(
  input: RenderInput | SequenceLayout | ClassLayout | StateLayout,
  opts: SvgRenderOptions = {},
): string {
  if (isSequenceLayout(input)) {
    return renderSequenceSvg(input, resolveTheme(opts.theme), opts.background);
  }
  if (isClassLayout(input)) {
    return renderClassSvg(input, resolveTheme(opts.theme), opts.background);
  }
  if (isStateLayout(input)) {
    return renderStateSvg(input, resolveTheme(opts.theme), opts.background);
  }
  ensureSyncRenderable(input, "renderSvgAsync");
  const prepared = prepare(input, { theme: opts.theme, strict: opts.strict, bridges: opts.bridges });
  return renderSvgFromModel(prepared.model, prepared.theme, opts.background, opts.style);
}

/** Render an already-positioned model + theme to SVG. */
export function renderSvgFromModel(
  model: PositionedModel,
  theme: Theme,
  background?: string,
  style: RenderStyle = "clean",
): string {
  const b = model.bounds;
  const t = theme.tokens;
  const sketch = style === "sketch";
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(b.width)}" height="${n(
      b.height,
    )}" viewBox="${n(b.x)} ${n(b.y)} ${n(b.width)} ${n(b.height)}" font-family="${escAttr(
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

  // Explicit z-layers (FR1), painted bottom→top so nothing legible is covered:
  //   1 subgraph boxes → 2 edges → 3 edge labels → 4 subgraph titles → 5 nodes
  //   → 6 arrowhead caps. Emitting all edges before any label/title means a later
  // edge can never paint over an earlier label (issue 2) or a subgraph title
  // (issue 1). Layer 6 re-draws only the arrowheads above the nodes so a head
  // ending on/inside a node (a DB cylinder's cap, a short interior leg) is never
  // hidden by the node fill (layer 5). The runtime twin (buildSvg) mirrors this
  // order for byte-parity.
  for (const sg of model.subgraphs) parts.push(renderSubgraphBox(sg, theme)); // 1
  for (const edge of model.edges) parts.push(renderEdge(edge, theme, sketch)); // 2
  for (const edge of model.edges) {
    if (edge.label && edge.labelPos) parts.push(edgeLabel(edge.label, edge.labelPos.x, edge.labelPos.y, theme)); // 3
  }
  for (const sg of model.subgraphs) parts.push(renderSubgraphTitle(sg, theme)); // 4
  for (const node of model.nodes) parts.push(renderNode(node, model, theme, sketch)); // 5
  for (const edge of model.edges) parts.push(renderEdgeArrowCaps(edge, theme, sketch)); // 6

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
  // Sketch mode embeds the handwriting @font-face (base64, zero network) so the
  // standalone SVG is portable, and draws its own open arrowheads (no marker).
  const font = sketch ? `<style>${sketchFontFaceCss()}</style>` : "";
  // orient="auto" (not "auto-start-reverse", an SVG2 value @resvg/resvg-js
  // ignores — it would render the head un-rotated / pointing +x). The end
  // marker's tip is at high-x so `auto` points it forward into the target; the
  // start marker is the horizontal mirror (tip at low-x, refX at the tip) so
  // `auto` points it backward at the source. Two markers, both resvg-safe.
  return (
    `<defs>` +
    `<marker id="vnm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${a}" markerHeight="${a}" orient="auto">` +
    `<path d="M0 0 L10 5 L0 10 z" fill="${t.colors.edge}"/></marker>` +
    `<marker id="vnm-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="${a}" markerHeight="${a}" orient="auto">` +
    `<path d="M10 0 L0 5 L10 10 z" fill="${t.colors.edge}"/></marker>` +
    shadow +
    font +
    `</defs>`
  );
}

/** Layer 1: a subgraph's dashed container box (drawn behind everything). */
function renderSubgraphBox(sg: PositionedSubgraph, theme: Theme): string {
  const t = theme.tokens;
  const x = n(sg.x - sg.width / 2);
  const y = n(sg.y - sg.height / 2);
  return `<rect x="${x}" y="${y}" width="${n(sg.width)}" height="${n(
    sg.height,
  )}" rx="${t.radii.card}" fill="${t.colors.subgraphFill}" stroke="${t.colors.subgraphStroke}" stroke-dasharray="4 4"/>`;
}

/**
 * Layer 4 (FR2): a subgraph's title on an **opaque** rounded plate (the subgraph
 * fill, sized to the text), drawn *after* the edges so any edge crossing the
 * title band reads as passing behind the title. Emits `""` for an untitled
 * subgraph. The plate geometry is mirrored verbatim in the runtime twin
 * (`svgSubgraphTitle` / live `renderSubgraphs`) — keep them in lockstep.
 */
function renderSubgraphTitle(sg: PositionedSubgraph, theme: Theme): string {
  if (!sg.title) return "";
  const t = theme.tokens;
  const x = n(sg.x - sg.width / 2);
  const y = n(sg.y - sg.height / 2);
  const fs = t.font.size - 1;
  const pad = 5;
  const pw = sg.title.length * fs * 0.6 + pad * 2;
  return (
    `<rect x="${n(x + 12 - pad)}" y="${n(y + 18 - fs + 1)}" width="${n(pw)}" height="${
      fs + 4
    }" rx="${t.radii.label}" fill="${t.colors.subgraphFill}"/>` +
    `<text x="${n(x + 12)}" y="${n(y + 18)}" fill="${t.colors.subgraphText}" font-size="${fs}" font-weight="600">${esc(
      sg.title,
    )}</text>`
  );
}

function renderEdge(edge: RoutedEdge, theme: Theme, sketch: boolean): string {
  const t = theme.tokens;
  const width = edge.kind === "thick" ? t.edge.thickWidth : t.edge.width;
  const dash =
    edge.kind === "dotted" ? ` stroke-dasharray="2 5"` : "";
  const parts: string[] = [];
  if (sketch) {
    parts.push(sketchEdgePath(edge, t.colors.edge, width, dash, t.edge.arrowSize));
  } else {
    const markerEnd = edge.arrows.end ? ` marker-end="url(#vnm-arrow)"` : "";
    const markerStart = edge.arrows.start ? ` marker-start="url(#vnm-arrow-start)"` : "";
    parts.push(
      `<path d="${edge.path}" fill="none" stroke="${t.colors.edge}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dash}${markerStart}${markerEnd}/>`,
    );
  }
  // The label is emitted in its own later layer (FR1) by renderSvgFromModel, not
  // here, so a subsequent edge's path can never paint over it.
  return parts.join("");
}

/**
 * Layer 6 — arrowhead caps. Re-draws each edge's arrowhead ABOVE the node layer
 * so a head that lands on/inside a node (a DB cylinder's curved cap, or a short
 * interior approach leg) is never repainted over by the node fill. A one-segment
 * stub of the final leg carries the SAME triangle marker, so where the head
 * already cleared the border the cap lands pixel-identically over the layer-2
 * marker (no doubling); where it was occluded it lifts the head on top. Sketch
 * re-emits its deterministic open-V head (same key → identical geometry).
 * Mirrored in the runtime twin (svgEdge caps + live gArrows) — keep in lockstep.
 */
function renderEdgeArrowCaps(edge: RoutedEdge, theme: Theme, sketch: boolean): string {
  const pts = edge.points;
  const m = pts.length;
  if (m < 2 || (!edge.arrows.end && !edge.arrows.start)) return "";
  const t = theme.tokens;
  const width = edge.kind === "thick" ? t.edge.thickWidth : t.edge.width;
  if (sketch) {
    const key = edge.from + "->" + edge.to;
    const arr: Pt[] = pts.map((p) => [p.x, p.y]);
    const base = ` fill="none" stroke="${t.colors.edge}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"`;
    const out: string[] = [];
    if (edge.arrows.end) out.push(`<path class="vnm-arrow-cap" d="${openArrowhead(arr[m - 1]!, arr[m - 2]!, t.edge.arrowSize, key + "@end")}"${base}/>`);
    if (edge.arrows.start) out.push(`<path class="vnm-arrow-cap" d="${openArrowhead(arr[0]!, arr[1]!, t.edge.arrowSize, key + "@start")}"${base}/>`);
    return out.join("");
  }
  const out: string[] = [];
  if (edge.arrows.end) out.push(capEnd(pts[m - 2]!, pts[m - 1]!, t.edge.arrowSize, t.colors.edge, width));
  if (edge.arrows.start) out.push(capStart(pts[0]!, pts[1]!, t.edge.arrowSize, t.colors.edge, width));
  return out.join("");
}

/** A stub ending at the arrow `tip` (marker-end), approaching from `prev` so the
 *  marker's `orient="auto"` matches the real edge's final leg. */
function capEnd(prev: Point, tip: Point, arrowSize: number, color: string, width: number): string {
  const dx = tip.x - prev.x;
  const dy = tip.y - prev.y;
  const mag = Math.hypot(dx, dy) || 1;
  const len = Math.min(arrowSize + 4, mag);
  const bx = tip.x - (dx / mag) * len;
  const by = tip.y - (dy / mag) * len;
  return `<path class="vnm-arrow-cap" d="M ${n(bx)} ${n(by)} L ${n(tip.x)} ${n(tip.y)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" marker-end="url(#vnm-arrow)"/>`;
}

/** A stub starting at the arrow `head` (marker-start), heading toward `next`. */
function capStart(head: Point, next: Point, arrowSize: number, color: string, width: number): string {
  const dx = next.x - head.x;
  const dy = next.y - head.y;
  const mag = Math.hypot(dx, dy) || 1;
  const len = Math.min(arrowSize + 4, mag);
  const bx = head.x + (dx / mag) * len;
  const by = head.y + (dy / mag) * len;
  return `<path class="vnm-arrow-cap" d="M ${n(head.x)} ${n(head.y)} L ${n(bx)} ${n(by)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" marker-start="url(#vnm-arrow-start)"/>`;
}

/**
 * SKETCH-PARITY: a hand-drawn edge — the routed polyline as N wobbly strokes +
 * open `V` arrowheads at the arrowed endpoints. Mirrored in `vnmRuntime`
 * (svgEdge sketch branch) — keep the two in lockstep.
 */
function sketchEdgePath(edge: RoutedEdge, color: string, width: number, dash: string, arrowSize: number): string {
  const key = edge.from + "->" + edge.to;
  const pts: Pt[] = edge.points.map((p) => [p.x, p.y]);
  const base = ` fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"`;
  // The line carries the dotted dash; the open arrowhead is always SOLID (a "2 5"
  // dash chops a ~19px V into fragments — REV-002).
  const lineStroke = base + dash;
  const parts: string[] = [];
  for (const d of roughPolyline(pts, key)) parts.push(`<path d="${d}"${lineStroke}/>`);
  const m = pts.length;
  if (edge.arrows.end && m >= 2)
    parts.push(`<path d="${openArrowhead(pts[m - 1]!, pts[m - 2]!, arrowSize, key + "@end")}"${base}/>`);
  if (edge.arrows.start && m >= 2)
    parts.push(`<path d="${openArrowhead(pts[0]!, pts[1]!, arrowSize, key + "@start")}"${base}/>`);
  return parts.join("");
}

function edgeLabel(label: string, cx: number, cy: number, theme: Theme): string {
  const t = theme.tokens;
  const lines = label.split("\n");
  const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
  // FR3 — tightened plate (keep in lockstep with layout.labelPlateSize + runtime).
  const w = maxChars * t.font.size * 0.6 + 6;
  const h = lines.length * t.font.lineHeight + 2;
  const x = n(cx - w / 2);
  const y = n(cy - h / 2);
  const parts = [
    `<rect x="${x}" y="${y}" width="${n(w)}" height="${n(h)}" rx="${t.radii.label}" fill="${t.colors.edgeLabelBg}"/>`,
  ];
  const startY = cy - ((lines.length - 1) * t.font.lineHeight) / 2;
  lines.forEach((line, i) => {
    parts.push(
      `<text x="${n(cx)}" y="${n(startY + i * t.font.lineHeight)}" fill="${
        t.colors.edgeLabelText
      }" font-size="${t.font.size - 1}" text-anchor="middle" dominant-baseline="central">${esc(line)}</text>`,
    );
  });
  return parts.join("");
}

function renderNode(node: PositionedNode, model: PositionedModel, theme: Theme, sketch: boolean): string {
  const t = theme.tokens;
  const s = resolveNodeStyle(node, model.classDefs, theme);
  const shadow = t.effects.gradient && !sketch ? ` filter="url(#vnm-shadow)"` : "";
  // Style values originate from user `style`/`classDef` statements. They are
  // already allowlist-sanitized in the parser (see isSafeStyleValue); escaping
  // them here too is defense in depth so nothing can break out of an attribute.
  const strokeWidth = escAttr(s.strokeWidth ?? "1.5");
  const dash = s.strokeDasharray ? ` stroke-dasharray="${escAttr(s.strokeDasharray)}"` : "";
  const shape = sketch
    ? sketchShape(node, escAttr(s.fill), escAttr(s.stroke), strokeWidth, dash)
    : nodeShape(node, escAttr(s.fill), escAttr(s.stroke), strokeWidth, dash);
  const text = nodeText(node, escAttr(s.text), theme);
  return `<g${shadow}>${shape}${text}</g>`;
}

/**
 * SKETCH-PARITY: the clean-geometry vertices of a shape (+ any extra open
 * strokes, e.g. a subroutine's side bars) that the rough generator wobbles.
 * Mirrored verbatim in `vnmRuntime` (sketchShapePoints) — keep in lockstep.
 */
function sketchShapePoints(
  shape: string,
  x: number,
  y: number,
  w: number,
  h: number,
): { pts: Pt[]; extras: Pt[][] } {
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (shape) {
    case "circle":
      return { pts: ellipsePoints(cx, cy, w / 2, h / 2), extras: [] };
    case "diamond":
      return { pts: [[cx, y], [x + w, cy], [cx, y + h], [x, cy]], extras: [] };
    case "hexagon": {
      const k = Math.min(w * 0.22, h * 0.5);
      return { pts: [[x + k, y], [x + w - k, y], [x + w, cy], [x + w - k, y + h], [x + k, y + h], [x, cy]], extras: [] };
    }
    case "parallelogram": {
      const k = Math.min(w * 0.22, h);
      return { pts: [[x + k, y], [x + w, y], [x + w - k, y + h], [x, y + h]], extras: [] };
    }
    case "parallelogram-alt": {
      const k = Math.min(w * 0.22, h);
      return { pts: [[x, y], [x + w - k, y], [x + w, y + h], [x + k, y + h]], extras: [] };
    }
    case "subroutine": {
      const inset = 6;
      return {
        pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
        extras: [[[x + inset, y], [x + inset, y + h]], [[x + w - inset, y], [x + w - inset, y + h]]],
      };
    }
    default:
      // rect / rounded / stadium / cylinder / default → a hand-drawn box
      return { pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], extras: [] };
  }
}

/**
 * SKETCH-PARITY: a hand-drawn node — a soft rough fill under N wobbly outline
 * strokes, plus any extra open strokes. Mirrored in `vnmRuntime` (svgShape
 * sketch branch) — keep in lockstep.
 */
function sketchShape(node: PositionedNode, fill: string, stroke: string, strokeWidth: string, dash: string): string {
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;
  const { pts, extras } = sketchShapePoints(node.shape, x, y, node.width, node.height);
  const rs = roughShape(pts, node.id);
  const strokeAttr = ` fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"${dash}`;
  const parts: string[] = [`<path d="${rs.fill}" fill="${fill}" stroke="none"/>`];
  for (const d of rs.outline) parts.push(`<path d="${d}"${strokeAttr}/>`);
  extras.forEach((seg, i) => {
    for (const d of roughPolyline(seg, node.id + "#x" + i)) parts.push(`<path d="${d}"${strokeAttr}/>`);
  });
  return parts.join("");
}

function nodeShape(
  node: PositionedNode,
  fill: string,
  stroke: string,
  strokeWidth: string,
  dash: string,
): string {
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;
  const w = node.width;
  const h = node.height;
  const cx = node.x;
  const cy = node.y;
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}`;
  const rect = (rx: number) =>
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${rx}" ${common}/>`;

  switch (node.shape) {
    case "rounded":
      return rect(14);
    case "stadium":
      return rect(n(h / 2));
    case "subroutine": {
      const inset = 6;
      return (
        rect(4) +
        `<line x1="${n(x + inset)}" y1="${n(y)}" x2="${n(x + inset)}" y2="${n(
          y + h,
        )}" stroke="${stroke}" stroke-width="${strokeWidth}"/>` +
        `<line x1="${n(x + w - inset)}" y1="${n(y)}" x2="${n(x + w - inset)}" y2="${n(
          y + h,
        )}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
      );
    }
    case "circle":
      return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(w / 2)}" ry="${n(h / 2)}" ${common}/>`;
    case "diamond":
      return polygon(
        [
          [cx, y],
          [x + w, cy],
          [cx, y + h],
          [x, cy],
        ],
        common,
      );
    case "hexagon": {
      const k = Math.min(w * 0.22, h * 0.5);
      return polygon(
        [
          [x + k, y],
          [x + w - k, y],
          [x + w, cy],
          [x + w - k, y + h],
          [x + k, y + h],
          [x, cy],
        ],
        common,
      );
    }
    case "parallelogram": {
      const k = Math.min(w * 0.22, h);
      return polygon(
        [
          [x + k, y],
          [x + w, y],
          [x + w - k, y + h],
          [x, y + h],
        ],
        common,
      );
    }
    case "parallelogram-alt": {
      const k = Math.min(w * 0.22, h);
      return polygon(
        [
          [x, y],
          [x + w - k, y],
          [x + w, y + h],
          [x + k, y + h],
        ],
        common,
      );
    }
    case "cylinder": {
      const ry = Math.min(10, h * 0.18);
      const top = y + ry;
      const bottom = y + h - ry;
      const d =
        `M ${n(x)} ${n(top)} ` +
        `C ${n(x)} ${n(top - ry * 1.3)} ${n(x + w)} ${n(top - ry * 1.3)} ${n(x + w)} ${n(top)} ` +
        `L ${n(x + w)} ${n(bottom)} ` +
        `C ${n(x + w)} ${n(bottom + ry * 1.3)} ${n(x)} ${n(bottom + ry * 1.3)} ${n(x)} ${n(bottom)} Z`;
      const lid = `M ${n(x)} ${n(top)} C ${n(x)} ${n(top + ry * 1.3)} ${n(x + w)} ${n(
        top + ry * 1.3,
      )} ${n(x + w)} ${n(top)}`;
      return `<path d="${d}" ${common}/><path d="${lid}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    }
    default:
      return rect(6);
  }
}

function polygon(pts: Array<[number, number]>, common: string): string {
  const points = pts.map(([px, py]) => `${n(px)},${n(py)}`).join(" ");
  return `<polygon points="${points}" ${common}/>`;
}

function nodeText(node: PositionedNode, color: string, theme: Theme): string {
  const t = theme.tokens;
  const lines = node.label.length ? node.label.split("\n") : [""];
  const startY = node.y - ((lines.length - 1) * t.font.lineHeight) / 2;
  return lines
    .map(
      (line, i) =>
        `<text x="${n(node.x)}" y="${n(startY + i * t.font.lineHeight)}" fill="${color}" font-size="${
          t.font.size
        }" font-weight="${t.font.weight}" text-anchor="middle" dominant-baseline="central">${esc(line)}</text>`,
    )
    .join("");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(s: string): string {
  return esc(s).replace(/"/g, "&quot;");
}
