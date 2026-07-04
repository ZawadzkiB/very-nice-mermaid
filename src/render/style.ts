/**
 * Resolve a node's effective colors from (lowest→highest precedence): theme
 * default → theme role (a class name matching a role) → `classDef` → inline
 * `style`. Shared by the SVG renderer; the DOM runtime mirrors this logic.
 */

import type { DiagramNode, StyleDef } from "../model/index.js";
import type { Theme } from "../theme/index.js";

/**
 * Style-value allowlists — the single source of truth for "is this CSS value
 * safe to interpolate into a render sink" (SVG attributes, HTML-export CSS, the
 * DOM runtime, AND mermaid's `themeVariables`). User-supplied `style`/`classDef`
 * values (parser) and theme tokens mapped onto the mermaid fallback tier are all
 * attacker-controllable, so a value outside these grammars — notably one holding
 * `url(`, quotes, `<`/`>`, `;`, `{`/`}`, backslashes, parens or whitespace where
 * the grammar forbids it — is DROPPED at the source rather than rendered raw
 * (coding-rules.md: "Sanitize user style values at the source … Never
 * interpolate them raw"). Browser-safe: pure regex/string, no Node/DOM.
 */
const SAFE_COLOR =
  /^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]*\)|[a-zA-Z]+)$/;

/** A safe font-name charset: letters, digits, spaces, commas, hyphens, quotes. */
const SAFE_FONT_FAMILY = /^[A-Za-z0-9 ,'"-]+$/;

/** Is a CSS color a safe hex / `rgb()|rgba()|hsl()|hsla()` / bare-name form? */
export function isSafeColor(value: string): boolean {
  return SAFE_COLOR.test(value.trim());
}

/**
 * Restrict a `font-family` to a safe name list. Anything with `;`, `{`, `}`,
 * `(`/`)` (hence `url(`), `<`/`>`, `:`, `/`, backslashes or other punctuation is
 * rejected (→ `null`) so a theme font can never break out of mermaid's `<style>`
 * into a top-level rule or a network `url()`.
 */
export function sanitizeFontFamily(value: string): string | null {
  const v = value.trim();
  if (v === "" || v.length > 200) return null;
  return SAFE_FONT_FAMILY.test(v) ? v : null;
}

/**
 * Coerce a `font-size` to a finite, positive number re-emitted as `${n}px`.
 * Non-numeric / out-of-range input (including anything a token JSON smuggled in
 * as a string) is rejected (→ `null`).
 */
export function sanitizeFontSize(value: number | string): string | null {
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(n) || n <= 0 || n > 512) return null;
  return `${n}px`;
}

/** Escape `&`/`<`/`>` for safe embedding as SVG/XML text content. */
export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape XML text plus `"` for safe embedding inside a double-quoted attribute. */
export function escapeXmlAttr(s: string): string {
  return escapeXml(s).replace(/"/g, "&quot;");
}

export interface ResolvedNodeStyle {
  fill: string;
  stroke: string;
  text: string;
  strokeWidth?: string;
  strokeDasharray?: string;
}

export function resolveNodeStyle(
  node: DiagramNode,
  classDefs: Map<string, StyleDef>,
  theme: Theme,
): ResolvedNodeStyle {
  const c = theme.tokens.colors;
  let fill = c.surface;
  let stroke = c.surfaceStroke;
  let text = c.text;
  let strokeWidth: string | undefined;
  let strokeDasharray: string | undefined;

  for (const cls of node.classes) {
    const role = c.roles[cls];
    if (role) {
      fill = role.fill;
      stroke = role.stroke;
      text = role.text;
    }
    const def = classDefs.get(cls);
    if (def) {
      if (def.fill) fill = def.fill;
      if (def.stroke) stroke = def.stroke;
      if (def.color) text = def.color;
      if (def.strokeWidth) strokeWidth = def.strokeWidth;
      if (def.strokeDasharray) strokeDasharray = def.strokeDasharray;
    }
  }

  const s = node.style;
  if (s) {
    if (s.fill) fill = s.fill;
    if (s.stroke) stroke = s.stroke;
    if (s.color) text = s.color;
    if (s.strokeWidth) strokeWidth = s.strokeWidth;
    if (s.strokeDasharray) strokeDasharray = s.strokeDasharray;
  }

  const out: ResolvedNodeStyle = { fill, stroke, text };
  if (strokeWidth !== undefined) out.strokeWidth = strokeWidth;
  if (strokeDasharray !== undefined) out.strokeDasharray = strokeDasharray;
  return out;
}
