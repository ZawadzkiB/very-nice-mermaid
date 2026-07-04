/**
 * Static SVG renderer for a positioned {@link SequenceLayout}. No DOM required
 * (powers the CLI + the PNG rasterizer), theme-driven (light/dark/fancy), and
 * valid XML. Reuses the shared style sanitization (`escapeXml*` — no raw label
 * text into an SVG sink) and the same edge-label plate + arrow marker idiom as
 * the flowchart SVG so sequence renders feel of a piece with the rest.
 */

import type { SequenceLayout, PositionedParticipant, PositionedMessage } from "../../model/sequence.js";
import type { Theme } from "../../theme/index.js";
import { n } from "../../geometry/index.js";
import { escapeXml, escapeXmlAttr } from "../../render/style.js";

/** Render a positioned sequence layout to a standalone SVG string. */
export function renderSequenceSvg(
  layout: SequenceLayout,
  theme: Theme,
  background?: string,
): string {
  const b = layout.bounds;
  const t = theme.tokens;
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

  // lifelines behind everything
  for (const p of layout.participants) parts.push(renderLifeline(p, layout, theme));
  // messages (arrows + labels)
  for (const m of layout.messages) parts.push(renderMessage(m, theme));
  // participant boxes on top (top row + mirrored bottom row)
  for (const p of layout.participants) {
    parts.push(renderParticipant(p, layout.boxTop, theme));
    parts.push(renderParticipant(p, layout.boxBottom, theme));
  }

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

function renderLifeline(p: PositionedParticipant, layout: SequenceLayout, theme: Theme): string {
  const t = theme.tokens;
  return (
    `<line x1="${n(p.x)}" y1="${n(layout.lifelineTop)}" x2="${n(p.x)}" y2="${n(
      layout.lifelineBottom,
    )}" stroke="${t.colors.edge}" stroke-width="1" stroke-dasharray="4 4"/>`
  );
}

function renderParticipant(p: PositionedParticipant, cy: number, theme: Theme): string {
  const t = theme.tokens;
  const x = p.x - p.width / 2;
  const y = cy - p.height / 2;
  const shadow = t.effects.gradient ? ` filter="url(#vnm-shadow)"` : "";
  const rect =
    `<rect x="${n(x)}" y="${n(y)}" width="${n(p.width)}" height="${n(
      p.height,
    )}" rx="${t.radii.card}" fill="${t.colors.surface}" stroke="${t.colors.surfaceStroke}" stroke-width="1.5"/>`;
  const text =
    `<text x="${n(p.x)}" y="${n(cy)}" fill="${t.colors.text}" font-size="${t.font.size}" font-weight="${
      t.font.weight
    }" text-anchor="middle" dominant-baseline="central">${escapeXml(p.label)}</text>`;
  return `<g${shadow}>${rect}${text}</g>`;
}

function renderMessage(m: PositionedMessage, theme: Theme): string {
  const t = theme.tokens;
  const dash = m.kind === "dashed" ? ` stroke-dasharray="6 4"` : "";
  const marker = m.arrowEnd ? ` marker-end="url(#vnm-arrow)"` : "";
  const parts: string[] = [];

  if (m.self && m.loopWidth && m.loopHeight) {
    const x = m.fromX;
    const w = m.loopWidth;
    const h = m.loopHeight;
    const d =
      `M ${n(x)} ${n(m.y)} L ${n(x + w)} ${n(m.y)} L ${n(x + w)} ${n(m.y + h)} L ${n(x)} ${n(m.y + h)}`;
    parts.push(
      `<path d="${d}" fill="none" stroke="${t.colors.edge}" stroke-width="${t.edge.width}" stroke-linejoin="round"${dash}${marker}/>`,
    );
  } else {
    parts.push(
      `<line x1="${n(m.fromX)}" y1="${n(m.y)}" x2="${n(m.toX)}" y2="${n(m.y)}" stroke="${
        t.colors.edge
      }" stroke-width="${t.edge.width}" stroke-linecap="round"${dash}${marker}/>`,
    );
  }

  if (m.label) parts.push(messageLabel(m.label, m.labelX, m.labelY, theme));
  return parts.join("");
}

function messageLabel(label: string, cx: number, cy: number, theme: Theme): string {
  const t = theme.tokens;
  const lines = label.split("\n");
  const maxChars = lines.reduce((mx, l) => Math.max(mx, l.length), 0);
  const w = maxChars * t.font.size * 0.62 + 10;
  const h = lines.length * t.font.lineHeight + 4;
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
