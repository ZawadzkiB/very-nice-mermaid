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
} from "../model/index.js";
import { n } from "../geometry/index.js";
import type { Theme, PartialTokenSet } from "../theme/index.js";
import { resolveTheme } from "../theme/index.js";
import { resolveNodeStyle } from "./style.js";
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
  const prepared = prepare(input, { theme: opts.theme, strict: opts.strict });
  return renderSvgFromModel(prepared.model, prepared.theme, opts.background);
}

/** Render an already-positioned model + theme to SVG. */
export function renderSvgFromModel(
  model: PositionedModel,
  theme: Theme,
  background?: string,
): string {
  const b = model.bounds;
  const t = theme.tokens;
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(b.width)}" height="${n(
      b.height,
    )}" viewBox="${n(b.x)} ${n(b.y)} ${n(b.width)} ${n(b.height)}" font-family="${escAttr(
      t.font.family,
    )}">`,
  );

  parts.push(defs(theme));

  if (background !== "transparent") {
    parts.push(
      `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.width)}" height="${n(
        b.height,
      )}" fill="${background ?? t.colors.background}"/>`,
    );
  }

  for (const sg of model.subgraphs) parts.push(renderSubgraph(sg, theme));
  for (const edge of model.edges) parts.push(renderEdge(edge, theme));
  for (const node of model.nodes) parts.push(renderNode(node, model, theme));

  parts.push("</svg>");
  return parts.join("\n");
}

function defs(theme: Theme): string {
  const t = theme.tokens;
  const a = t.edge.arrowSize;
  const shadow = t.effects.gradient
    ? `<filter id="vnm-shadow" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.35"/></filter>`
    : "";
  return (
    `<defs>` +
    `<marker id="vnm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${a}" markerHeight="${a}" orient="auto-start-reverse">` +
    `<path d="M0 0 L10 5 L0 10 z" fill="${t.colors.edge}"/></marker>` +
    shadow +
    `</defs>`
  );
}

function renderSubgraph(sg: PositionedSubgraph, theme: Theme): string {
  const t = theme.tokens;
  const x = n(sg.x - sg.width / 2);
  const y = n(sg.y - sg.height / 2);
  const parts = [
    `<rect x="${x}" y="${y}" width="${n(sg.width)}" height="${n(
      sg.height,
    )}" rx="${t.radii.card}" fill="${t.colors.subgraphFill}" stroke="${t.colors.subgraphStroke}" stroke-dasharray="4 4"/>`,
  ];
  if (sg.title) {
    parts.push(
      `<text x="${n(x + 12)}" y="${n(y + 18)}" fill="${t.colors.subgraphText}" font-size="${
        t.font.size - 1
      }" font-weight="600">${esc(sg.title)}</text>`,
    );
  }
  return parts.join("");
}

function renderEdge(edge: RoutedEdge, theme: Theme): string {
  const t = theme.tokens;
  const width = edge.kind === "thick" ? t.edge.thickWidth : t.edge.width;
  const dash =
    edge.kind === "dotted" ? ` stroke-dasharray="2 5"` : "";
  const markerEnd = edge.arrows.end ? ` marker-end="url(#vnm-arrow)"` : "";
  const markerStart = edge.arrows.start ? ` marker-start="url(#vnm-arrow)"` : "";
  const parts = [
    `<path d="${edge.path}" fill="none" stroke="${t.colors.edge}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dash}${markerStart}${markerEnd}/>`,
  ];
  if (edge.label && edge.labelPos) parts.push(edgeLabel(edge.label, edge.labelPos.x, edge.labelPos.y, theme));
  return parts.join("");
}

function edgeLabel(label: string, cx: number, cy: number, theme: Theme): string {
  const t = theme.tokens;
  const lines = label.split("\n");
  const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const w = maxChars * t.font.size * 0.62 + 10;
  const h = lines.length * t.font.lineHeight + 4;
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

function renderNode(node: PositionedNode, model: PositionedModel, theme: Theme): string {
  const t = theme.tokens;
  const s = resolveNodeStyle(node, model.classDefs, theme);
  const shadow = t.effects.gradient ? ` filter="url(#vnm-shadow)"` : "";
  // Style values originate from user `style`/`classDef` statements. They are
  // already allowlist-sanitized in the parser (see isSafeStyleValue); escaping
  // them here too is defense in depth so nothing can break out of an attribute.
  const strokeWidth = escAttr(s.strokeWidth ?? "1.5");
  const dash = s.strokeDasharray ? ` stroke-dasharray="${escAttr(s.strokeDasharray)}"` : "";
  const shape = nodeShape(node, escAttr(s.fill), escAttr(s.stroke), strokeWidth, dash);
  const text = nodeText(node, escAttr(s.text), theme);
  return `<g${shadow}>${shape}${text}</g>`;
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
