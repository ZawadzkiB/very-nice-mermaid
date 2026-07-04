/**
 * Static SVG renderer for a positioned {@link ClassLayout}. No DOM required
 * (powers the CLI + PNG), theme-driven (light/dark/fancy), and valid XML. Class
 * boxes are drawn as **compartmented cards** (name header · divider · members ·
 * divider · methods); relations carry the correct UML **arrowhead/line style per
 * type** (hollow triangle = inheritance/realization, filled diamond =
 * composition, hollow diamond = aggregation, open arrow = association/dependency;
 * realization + dependency dashed). Reuses the shared `escapeXml*` sanitization
 * and the edge-label-plate idiom from the flowchart SVG.
 */

import type { PositionedNode, RoutedEdge } from "../../model/index.js";
import type { ClassLayout, ClassEntity, ClassRelation, ClassRelationType } from "../../model/class.js";
import type { Theme } from "../../theme/index.js";
import { n } from "../../geometry/index.js";
import { escapeXml, escapeXmlAttr } from "../../render/style.js";
import { classCardLines } from "./card.js";

/** Which marker id renders a given relation's decorative head. */
function markerFor(type: ClassRelationType): string {
  switch (type) {
    case "inheritance":
    case "realization":
      return "vnm-cls-tri";
    case "composition":
      return "vnm-cls-diamond-solid";
    case "aggregation":
      return "vnm-cls-diamond-hollow";
    case "association":
    case "dependency":
      return "vnm-cls-open";
  }
}

/** Render a positioned class layout to a standalone SVG string. */
export function renderClassSvg(layout: ClassLayout, theme: Theme, background?: string): string {
  const b = layout.model.bounds;
  const t = theme.tokens;
  const byId = new Map<string, ClassEntity>(layout.classes.map((c) => [c.id, c]));
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(b.width)}" height="${n(
      b.height,
    )}" viewBox="${n(b.x)} ${n(b.y)} ${n(b.width)} ${n(b.height)}" font-family="${escapeXmlAttr(
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

  // relations behind the cards
  const count = Math.min(layout.model.edges.length, layout.relations.length);
  for (let i = 0; i < count; i++) {
    parts.push(renderRelation(layout.model.edges[i]!, layout.relations[i]!, theme));
  }
  // class cards on top
  for (const node of layout.model.nodes) {
    const entity = byId.get(node.id);
    if (entity) parts.push(renderCard(node, entity, theme));
  }

  parts.push("</svg>");
  return parts.join("\n");
}

function defs(theme: Theme): string {
  const t = theme.tokens;
  const edge = t.colors.edge;
  const fill = t.colors.surface;
  const shadow = t.effects.gradient
    ? `<filter id="vnm-shadow" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.35"/></filter>`
    : "";
  // Every marker's tip is at its high-x vertex with refX at that tip, and
  // orient="auto-start-reverse" so it points at whichever endpoint (from/to)
  // carries the head — start markers flip to point back at the source.
  return (
    `<defs>` +
    // hollow triangle — inheritance / realization
    `<marker id="vnm-cls-tri" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="14" markerHeight="14" orient="auto-start-reverse">` +
    `<path d="M0 0 L14 7 L0 14 z" fill="${fill}" stroke="${edge}" stroke-width="1"/></marker>` +
    // filled diamond — composition
    `<marker id="vnm-cls-diamond-solid" viewBox="0 0 20 12" refX="19" refY="6" markerWidth="18" markerHeight="12" orient="auto-start-reverse">` +
    `<path d="M20 6 L10 0 L0 6 L10 12 z" fill="${edge}" stroke="${edge}" stroke-width="1"/></marker>` +
    // hollow diamond — aggregation
    `<marker id="vnm-cls-diamond-hollow" viewBox="0 0 20 12" refX="19" refY="6" markerWidth="18" markerHeight="12" orient="auto-start-reverse">` +
    `<path d="M20 6 L10 0 L0 6 L10 12 z" fill="${fill}" stroke="${edge}" stroke-width="1"/></marker>` +
    // open arrow — association / dependency
    `<marker id="vnm-cls-open" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse">` +
    `<path d="M1 1 L11 6 L1 11" fill="none" stroke="${edge}" stroke-width="1.4"/></marker>` +
    shadow +
    `</defs>`
  );
}

function renderRelation(edge: RoutedEdge, rel: ClassRelation, theme: Theme): string {
  const t = theme.tokens;
  const dashed = rel.type === "realization" || rel.type === "dependency";
  const dash = dashed ? ` stroke-dasharray="6 4"` : "";
  const marker =
    rel.head === "from"
      ? ` marker-start="url(#${markerFor(rel.type)})"`
      : ` marker-end="url(#${markerFor(rel.type)})"`;
  const parts = [
    `<path d="${edge.path}" fill="none" stroke="${t.colors.edge}" stroke-width="${t.edge.width}" stroke-linejoin="round" stroke-linecap="round"${dash}${marker}/>`,
  ];
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

function renderCard(node: PositionedNode, entity: ClassEntity, theme: Theme): string {
  const t = theme.tokens;
  const lines = classCardLines(entity);
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;
  const w = node.width;
  const padX = t.spacing.nodePadX;
  const padY = t.spacing.nodePadY;
  const lh = t.font.lineHeight;
  const shadow = t.effects.gradient ? ` filter="url(#vnm-shadow)"` : "";

  const parts: string[] = [`<g${shadow}>`];
  // card
  parts.push(
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(
      node.height,
    )}" rx="${t.radii.card}" fill="${t.colors.surface}" stroke="${t.colors.surfaceStroke}" stroke-width="1.5"/>`,
  );

  const hasBody = lines.members.length + lines.methods.length > 0;
  const headerCount = lines.header.length;

  // header rows (centered, bold)
  lines.header.forEach((line, i) => {
    const baseline = y + padY + lh * (i + 0.5);
    parts.push(
      `<text x="${n(node.x)}" y="${n(baseline)}" fill="${t.colors.text}" font-size="${
        t.font.size
      }" font-weight="700" text-anchor="middle" dominant-baseline="central">${escapeXml(line)}</text>`,
    );
  });

  const divider = (dy: number) =>
    `<line x1="${n(x)}" y1="${n(dy)}" x2="${n(x + w)}" y2="${n(dy)}" stroke="${
      t.colors.surfaceStroke
    }" stroke-width="1"/>`;

  if (hasBody) parts.push(divider(y + padY + headerCount * lh));

  // member rows (left-aligned)
  lines.members.forEach((line, j) => {
    const baseline = y + padY + lh * (headerCount + j + 0.5);
    parts.push(rowText(line, x + padX, baseline, theme));
  });

  if (lines.members.length > 0 && lines.methods.length > 0) {
    parts.push(divider(y + padY + (headerCount + lines.members.length) * lh));
  }

  // method rows (left-aligned)
  const methodBase = headerCount + lines.members.length;
  lines.methods.forEach((line, k) => {
    const baseline = y + padY + lh * (methodBase + k + 0.5);
    parts.push(rowText(line, x + padX, baseline, theme));
  });

  parts.push(`</g>`);
  return parts.join("");
}

function rowText(line: string, x: number, baseline: number, theme: Theme): string {
  const t = theme.tokens;
  return `<text x="${n(x)}" y="${n(baseline)}" fill="${t.colors.text}" font-size="${
    t.font.size
  }" text-anchor="start" dominant-baseline="central">${escapeXml(line)}</text>`;
}
