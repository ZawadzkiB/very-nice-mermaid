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

/** The subset of mermaid config we drive from a theme. */
export interface MermaidThemeConfig {
  theme: "base";
  themeVariables: Record<string, string>;
  fontFamily: string;
}

/**
 * Build a mermaid `base`-theme config from our theme tokens. Only the keys with
 * a faithful equivalent are set; mermaid fills the rest from its `base` theme.
 */
export function toMermaidTheme(theme: Theme): MermaidThemeConfig {
  const c = theme.tokens.colors;
  const accent = c.roles.accent?.fill ?? c.accent;
  const accentStroke = c.roles.accent?.stroke ?? c.surfaceStroke;
  return {
    theme: "base",
    fontFamily: theme.tokens.font.family,
    themeVariables: {
      // canvas
      background: c.background,
      // default node
      primaryColor: c.surface,
      mainBkg: c.surface,
      primaryBorderColor: c.surfaceStroke,
      nodeBorder: c.surfaceStroke,
      primaryTextColor: c.text,
      textColor: c.text,
      // edges / relations
      lineColor: c.edge,
      // secondary/tertiary surfaces (subgraphs, clusters, alt rows)
      secondaryColor: c.subgraphFill,
      secondaryBorderColor: c.subgraphStroke,
      secondaryTextColor: c.subgraphText,
      tertiaryColor: accent,
      tertiaryBorderColor: accentStroke,
      // labels riding on lines
      edgeLabelBackground: c.edgeLabelBg,
      // typography
      fontFamily: theme.tokens.font.family,
      fontSize: `${theme.tokens.font.size}px`,
    },
  };
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
