/**
 * Map our {@link Theme} tokens onto mermaid's `themeVariables` (FR7).
 *
 * mermaid's fallback tier is themed through a fixed set of `themeVariables`
 * keys, which cover far less than our token set. We map the tokens that have a
 * clear mermaid equivalent (background, node fill/stroke/text, edge/line color,
 * font); everything mermaid derives internally (per-type accents, gradients,
 * shadows) stays mermaid's — those gaps are *documented*, not hidden (a
 * `render-degraded`/theme note is emitted by the caller when it matters).
 *
 * Browser-safe: pure data mapping, no Node/DOM.
 */

import type { Theme } from "../theme/index.js";
import type { Diagnostics } from "../diagnostics/index.js";
import { isSafeColor, sanitizeFontFamily, sanitizeFontSize } from "../render/style.js";

/** The subset of mermaid config we drive from a theme. */
export interface MermaidThemeConfig {
  theme: "base";
  themeVariables: Record<string, string>;
  fontFamily: string;
}

/** A safe generic fallback when a theme's `font.family` fails the allowlist. */
const FALLBACK_FONT_FAMILY = "sans-serif";

/**
 * Build a mermaid `base`-theme config from our theme tokens. Only the keys with
 * a faithful equivalent are set; mermaid fills the rest from its `base` theme.
 *
 * **Security (FR5/FR7):** every value here lands in mermaid's `themeVariables`,
 * which mermaid emits into the rendered SVG's `<style>` block — and the CLI
 * inlines that SVG straight into an HTML page. Theme tokens are untrusted
 * (`resolveTheme` deep-merges raw `--theme` JSON, and `toMermaidTheme` is a
 * public export), so each value is allowlisted **at the source** here: a color
 * outside the safe-CSS grammar, a font family outside the safe name charset, or
 * a non-numeric size is DROPPED/replaced (never interpolated raw) and reported
 * via an `unsafe-theme-value` diagnostic. This closes the CSS-rule breakout +
 * `url()` network-fetch injection through the fallback `<style>` sink (REV-001).
 */
export function toMermaidTheme(
  theme: Theme,
  diagnostics?: Diagnostics,
): MermaidThemeConfig {
  const c = theme.tokens.colors;
  const accent = c.roles.accent?.fill ?? c.accent;
  const accentStroke = c.roles.accent?.stroke ?? c.surfaceStroke;

  const themeVariables: Record<string, string> = {};

  /** Set a color themeVariable only if it passes the allowlist; else drop+report. */
  const putColor = (mermaidKey: string, token: string, value: string): void => {
    if (isSafeColor(value)) {
      themeVariables[mermaidKey] = value;
      return;
    }
    diagnostics?.unsafeThemeValue(
      token,
      `theme color '${token}' ('${value}') is not a safe CSS color and was dropped before mermaid themeVariables`,
    );
  };

  // canvas
  putColor("background", "colors.background", c.background);
  // default node
  putColor("primaryColor", "colors.surface", c.surface);
  putColor("mainBkg", "colors.surface", c.surface);
  putColor("primaryBorderColor", "colors.surfaceStroke", c.surfaceStroke);
  putColor("nodeBorder", "colors.surfaceStroke", c.surfaceStroke);
  putColor("primaryTextColor", "colors.text", c.text);
  putColor("textColor", "colors.text", c.text);
  // edges / relations
  putColor("lineColor", "colors.edge", c.edge);
  // secondary/tertiary surfaces (subgraphs, clusters, alt rows)
  putColor("secondaryColor", "colors.subgraphFill", c.subgraphFill);
  putColor("secondaryBorderColor", "colors.subgraphStroke", c.subgraphStroke);
  putColor("secondaryTextColor", "colors.subgraphText", c.subgraphText);
  putColor("tertiaryColor", "colors.accent", accent);
  putColor("tertiaryBorderColor", "colors.accentStroke", accentStroke);
  // labels riding on lines
  putColor("edgeLabelBackground", "colors.edgeLabelBg", c.edgeLabelBg);

  // typography — font family restricted to a safe charset (else a safe default),
  // size coerced to a finite `${n}px` (else dropped).
  const safeFamily = sanitizeFontFamily(theme.tokens.font.family);
  const fontFamily = safeFamily ?? FALLBACK_FONT_FAMILY;
  if (safeFamily === null) {
    diagnostics?.unsafeThemeValue(
      "font.family",
      `theme font.family ('${theme.tokens.font.family}') is not a safe font name and was replaced with '${FALLBACK_FONT_FAMILY}'`,
    );
  }
  themeVariables.fontFamily = fontFamily;

  const safeSize = sanitizeFontSize(theme.tokens.font.size);
  if (safeSize !== null) {
    themeVariables.fontSize = safeSize;
  } else {
    diagnostics?.unsafeThemeValue(
      "font.size",
      `theme font.size ('${String(theme.tokens.font.size)}') is not a valid size and was dropped before mermaid themeVariables`,
    );
  }

  return { theme: "base", fontFamily, themeVariables };
}

/**
 * Token keys mermaid's `themeVariables` cannot express, for the documented-gap
 * diagnostic (FR7). Kept as data so the CLI/report can list what didn't map.
 */
export const UNMAPPED_TOKEN_GROUPS = [
  "effects.nodeShadow",
  "effects.gradient",
  "effects.hoverLift",
  "radii.*",
  "colors.roles.* (beyond accent)",
  "colors.minimap*",
] as const;
