/**
 * Static SVG renderer for a positioned {@link SequenceLayout}. No DOM required
 * (powers the CLI + the PNG rasterizer), theme-driven (light/dark/fancy), and
 * valid XML. Reuses the shared style sanitization (`escapeXml*` — no raw label
 * text into an SVG sink) and the same edge-label plate + arrow marker idiom as
 * the flowchart SVG so sequence renders feel of a piece with the rest.
 */

import type { SequenceLayout, PositionedParticipant, PositionedMessage, PositionedActivation, MessageSemantic } from "../../model/sequence.js";
import type { Theme, TokenSet } from "../../theme/index.js";
import type { RenderStyle } from "../../theme/index.js";
import { n } from "../../geometry/index.js";
import { escapeXml, escapeXmlAttr } from "../../render/style.js";
import { SKETCH_FONT_FAMILY } from "../../render/sketch-font.js";
import { sketchFontDefs, sketchRectSvg, sketchLineSvg, sketchArrowSvg } from "../../render/sketch-svg.js";
import { inferRole, SEMANTIC_LABEL } from "./semantics.js";

/** Resolve a participant's box colors: its inferred role's palette, or plain surface. */
export function participantColors(label: string, theme: Theme): { fill: string; stroke: string; text: string } {
  const t = theme.tokens;
  const role = inferRole(label);
  const rc = role ? t.colors.roles[role] : undefined;
  return { fill: rc?.fill ?? t.colors.surface, stroke: rc?.stroke ?? t.colors.surfaceStroke, text: rc?.text ?? t.colors.text };
}

/** Map a message semantic → stroke color (via the shared role palette; response stays muted). */
function semanticColor(sem: MessageSemantic | undefined, t: TokenSet): string {
  const roles = t.colors.roles;
  switch (sem) {
    case "request": return roles.backend?.stroke ?? t.colors.accent;
    case "cache": return roles.database?.stroke ?? t.colors.accent;
    case "async": return roles.messagebus?.stroke ?? t.colors.accent;
    case "exception": return roles.danger?.stroke ?? "#ef4444";
    case "response":
    default:
      return t.colors.edge;
  }
}

/** Stable marker id for a semantic's colored arrowhead. */
const markerId = (sem: MessageSemantic | undefined): string => "vnm-arrow-" + (sem ?? "response");

/** Render a positioned sequence layout to a standalone SVG string. */
export function renderSequenceSvg(
  layout: SequenceLayout,
  theme: Theme,
  background?: string,
  style: RenderStyle = "clean",
): string {
  const b = layout.bounds;
  const t = theme.tokens;
  const sketch = style === "sketch";
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

  // lifelines behind everything
  for (const p of layout.participants) parts.push(renderLifeline(p, layout, theme, sketch));
  // activation bars over the lifelines, under the arrows (archify)
  for (const a of layout.activations) parts.push(renderActivation(a, layout, theme, sketch));
  // messages (arrows + labels)
  layout.messages.forEach((m, i) => parts.push(renderMessage(m, theme, sketch, i)));
  // participant boxes on top (top row + mirrored bottom row)
  for (const p of layout.participants) {
    parts.push(renderParticipant(p, layout.boxTop, theme, sketch, "t"));
    parts.push(renderParticipant(p, layout.boxBottom, theme, sketch, "b"));
  }
  // legend of the message semantics used (archify)
  if (layout.legend.length) parts.push(renderLegend(layout, theme));

  parts.push("</svg>");
  return parts.join("\n");
}

/** Every semantic that gets its own colored arrowhead marker. */
const SEMANTICS: MessageSemantic[] = ["request", "response", "cache", "async", "exception"];

function defs(theme: Theme, sketch: boolean): string {
  const t = theme.tokens;
  const a = t.edge.arrowSize;
  const shadow = t.effects.gradient
    ? `<filter id="vnm-shadow" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.35"/></filter>`
    : "";
  // One forward marker per semantic color (messages only carry a marker-END), plus the legacy
  // `vnm-arrow` for any caller that still references it. orient="auto" (resvg-safe).
  const marker = (id: string, fill: string): string =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${a}" markerHeight="${a}" orient="auto">` +
    `<path d="M0 0 L10 5 L0 10 z" fill="${fill}"/></marker>`;
  return (
    `<defs>` +
    marker("vnm-arrow", t.colors.edge) +
    SEMANTICS.map((s) => marker(markerId(s), semanticColor(s, t))).join("") +
    shadow +
    (sketch ? sketchFontDefs() : "") +
    `</defs>`
  );
}

function renderLifeline(
  p: PositionedParticipant,
  layout: SequenceLayout,
  theme: Theme,
  sketch: boolean,
): string {
  // Archify: the lifeline takes the participant's role color (falls back to the edge color).
  const stroke = participantColors(p.label, theme).stroke;
  if (sketch) {
    return sketchLineSvg(
      [
        [p.x, layout.lifelineTop],
        [p.x, layout.lifelineBottom],
      ],
      stroke,
      1,
      "life:" + p.id,
      ' stroke-dasharray="4 4"',
    );
  }
  return (
    `<line x1="${n(p.x)}" y1="${n(layout.lifelineTop)}" x2="${n(p.x)}" y2="${n(
      layout.lifelineBottom,
    )}" stroke="${stroke}" stroke-width="1" stroke-dasharray="4 4"/>`
  );
}

function renderParticipant(
  p: PositionedParticipant,
  cy: number,
  theme: Theme,
  sketch: boolean,
  posKey: string,
): string {
  const t = theme.tokens;
  const x = p.x - p.width / 2;
  const y = cy - p.height / 2;
  const shadow = t.effects.gradient && !sketch ? ` filter="url(#vnm-shadow)"` : "";
  // Archify-style: color the participant box by its inferred role (falls back to plain surface).
  const c = participantColors(p.label, theme);
  const rect = sketch
    ? sketchRectSvg(x, y, p.width, p.height, c.fill, c.stroke, "1.5", "p:" + p.id + "@" + posKey)
    : `<rect x="${n(x)}" y="${n(y)}" width="${n(p.width)}" height="${n(
        p.height,
      )}" rx="${t.radii.card}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>`;
  // Archify: name on top + a muted TYPE sub-label under it (single centered line when no type).
  const nameY = p.type ? cy - t.font.lineHeight * 0.42 : cy;
  const text =
    `<text x="${n(p.x)}" y="${n(nameY)}" fill="${c.text}" font-size="${t.font.size}" font-weight="${
      t.font.weight
    }" text-anchor="middle" dominant-baseline="central">${escapeXml(p.label)}</text>` +
    (p.type
      ? `<text x="${n(p.x)}" y="${n(cy + t.font.lineHeight * 0.52)}" fill="${c.stroke}" font-size="${
          t.font.size - 2
        }" text-anchor="middle" dominant-baseline="central" opacity="0.85">${escapeXml(p.type)}</text>`
      : "");
  return `<g${shadow}>${rect}${text}</g>`;
}

function renderMessage(m: PositionedMessage, theme: Theme, sketch: boolean, index: number): string {
  const t = theme.tokens;
  const dash = m.kind === "dashed" ? ` stroke-dasharray="6 4"` : "";
  // Archify: color the line + its arrowhead by the message semantic.
  const color = semanticColor(m.semantic, t);
  const marker = m.arrowEnd ? ` marker-end="url(#${markerId(m.semantic)})"` : "";
  const parts: string[] = [];

  if (sketch) {
    const dashAttr = m.kind === "dashed" ? ' stroke-dasharray="6 4"' : "";
    const key = "msg:" + index;
    let pts: [number, number][];
    if (m.self && m.loopWidth && m.loopHeight) {
      const x = m.fromX,
        w = m.loopWidth,
        h = m.loopHeight;
      pts = [
        [x, m.y],
        [x + w, m.y],
        [x + w, m.y + h],
        [x, m.y + h],
      ];
    } else {
      pts = [
        [m.fromX, m.y],
        [m.toX, m.y],
      ];
    }
    parts.push(sketchLineSvg(pts, color, t.edge.width, key, dashAttr));
    const mlen = pts.length;
    if (m.arrowEnd && mlen >= 2)
      parts.push(sketchArrowSvg(pts[mlen - 1]!, pts[mlen - 2]!, t.edge.arrowSize, color, t.edge.width, key + "@end"));
    if (m.label) parts.push(messageLabel(m.label, m.labelX, m.labelY, theme));
    return parts.join("");
  }

  if (m.self && m.loopWidth && m.loopHeight) {
    const x = m.fromX;
    const w = m.loopWidth;
    const h = m.loopHeight;
    const d =
      `M ${n(x)} ${n(m.y)} L ${n(x + w)} ${n(m.y)} L ${n(x + w)} ${n(m.y + h)} L ${n(x)} ${n(m.y + h)}`;
    parts.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="${t.edge.width}" stroke-linejoin="round"${dash}${marker}/>`,
    );
  } else {
    parts.push(
      `<line x1="${n(m.fromX)}" y1="${n(m.y)}" x2="${n(m.toX)}" y2="${n(m.y)}" stroke="${
        color
      }" stroke-width="${t.edge.width}" stroke-linecap="round"${dash}${marker}/>`,
    );
  }

  if (m.label) parts.push(messageLabel(m.label, m.labelX, m.labelY, theme));
  return parts.join("");
}

/** Archify activation bar: a colored rect on the participant's lifeline while it is active. */
function renderActivation(a: PositionedActivation, layout: SequenceLayout, theme: Theme, sketch: boolean): string {
  const t = theme.tokens;
  const p = layout.participants.find((pp) => pp.id === a.participant);
  const c = p ? participantColors(p.label, theme) : { fill: t.colors.surface, stroke: t.colors.edge };
  const x = a.x - a.width / 2;
  const h = a.endY - a.startY;
  if (sketch) {
    return sketchRectSvg(x, a.startY, a.width, h, c.fill, c.stroke, "1", "act:" + a.participant + "@" + Math.round(a.startY));
  }
  return `<rect x="${n(x)}" y="${n(a.startY)}" width="${n(a.width)}" height="${n(h)}" rx="2" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1"/>`;
}

/** Archify legend: a colored arrow swatch + name for each message semantic used, along the bottom. */
function renderLegend(layout: SequenceLayout, theme: Theme): string {
  const t = theme.tokens;
  const y = layout.legendY;
  const fs = t.font.size - 2;
  const swatch = 22;
  let x = layout.bounds.x + 24;
  const parts: string[] = [];
  for (const sem of layout.legend) {
    const color = semanticColor(sem, t);
    parts.push(
      `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + swatch)}" y2="${n(y)}" stroke="${color}" stroke-width="${
        t.edge.width
      }" stroke-linecap="round" marker-end="url(#${markerId(sem)})"/>`,
    );
    const label = SEMANTIC_LABEL[sem];
    parts.push(
      `<text x="${n(x + swatch + 6)}" y="${n(y)}" fill="${t.colors.subgraphText}" font-size="${fs}" dominant-baseline="central">${escapeXml(
        label,
      )}</text>`,
    );
    x += swatch + 6 + label.length * fs * 0.6 + 24;
  }
  return `<g>${parts.join("")}</g>`;
}

function messageLabel(label: string, cx: number, cy: number, theme: Theme): string {
  const t = theme.tokens;
  const lines = label.split("\n");
  const maxChars = lines.reduce((mx, l) => Math.max(mx, l.length), 0);
  // v0.6.4 (D2) — unify on the shared tightened plate (layout.labelPlateSize:
  // 0.6·size + 6 / lines·lh + 2), dropping the wider 0.62·size + 10 / lh + 4 so the
  // plate no longer blanks a wide band of crossing lifelines. The label still rides
  // LABEL_RISE above the arrow; a thin dashed lifeline behind the tight plate is fine.
  const w = maxChars * t.font.size * 0.6 + 6;
  const h = lines.length * t.font.lineHeight + 2;
  const x = n(cx - w / 2);
  const y = n(cy - h / 2);
  const parts = [
    `<rect x="${x}" y="${y}" width="${n(w)}" height="${n(h)}" rx="${t.radii.label}" fill="${
      t.colors.edgeLabelBg
    }"/>`,
  ];
  const startY = cy - ((lines.length - 1) * t.font.lineHeight) / 2;
  lines.forEach((line, i) => {
    parts.push(
      `<text x="${n(cx)}" y="${n(startY + i * t.font.lineHeight)}" fill="${
        t.colors.edgeLabelText
      }" font-size="${t.font.size - 1}" text-anchor="middle" dominant-baseline="central">${escapeXml(
        line,
      )}</text>`,
    );
  });
  return parts.join("");
}
