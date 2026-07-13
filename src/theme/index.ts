/**
 * Theming: a theme is a **token set** (colors, radii, spacing, fonts, edge
 * style, effects). Built-ins `light` / `dark` / `fancy`; {@link defineTheme}
 * deep-merges a partial over a base; {@link Theme.cssVars} emits the CSS custom
 * properties the DOM renderer (and HTML export) apply to their root.
 */

export type EdgeStyle = "elbow" | "curved";

/**
 * The **drawing style** axis — orthogonal to the color theme + {@link EdgeStyle}
 * (D1). `clean` is today's crisp look; `sketch` renders every shape as a
 * hand-drawn (Excalidraw-like) rough outline with a handwriting font. Composes
 * with any theme (`light`/`dark`/`fancy`) and any `edge.style`.
 */
export type RenderStyle = "clean" | "sketch";

/** Fill/stroke/text for a semantic node role a theme offers. */
export interface RoleColors {
  fill: string;
  stroke: string;
  text: string;
}

export interface ColorTokens {
  background: string;
  /** Default node fill. */
  surface: string;
  /** Default node stroke. */
  surfaceStroke: string;
  text: string;
  textMuted: string;
  edge: string;
  /** Background plate behind edge labels (punches through the line). */
  edgeLabelBg: string;
  edgeLabelText: string;
  subgraphFill: string;
  subgraphStroke: string;
  subgraphText: string;
  accent: string;
  minimapBg: string;
  minimapViewport: string;
  /** Named semantic roles a DSL `class` can hit (fallback node colors). */
  roles: Record<string, RoleColors>;
}

export interface RadiusTokens {
  node: number;
  card: number;
  label: number;
}

export interface SpacingTokens {
  nodePadX: number;
  nodePadY: number;
  nodesep: number;
  ranksep: number;
  fitPadding: number;
}

export interface FontTokens {
  family: string;
  mono: string;
  size: number;
  lineHeight: number;
  weight: number;
}

export interface EdgeTokens {
  style: EdgeStyle;
  width: number;
  thickWidth: number;
  arrowSize: number;
}

export interface EffectTokens {
  nodeShadow: string;
  gradient: boolean;
  hoverLift: number;
}

export interface TokenSet {
  colors: ColorTokens;
  radii: RadiusTokens;
  spacing: SpacingTokens;
  font: FontTokens;
  edge: EdgeTokens;
  effects: EffectTokens;
}

export interface Theme {
  name: string;
  edgeStyle: EdgeStyle;
  tokens: TokenSet;
  /** CSS custom properties (`--vnm-*: …;`) for a root scope. */
  cssVars(): string;
}

const MONO =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
const SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const lightTokens: TokenSet = {
  colors: {
    background: "#f7f8fb",
    surface: "#ffffff",
    surfaceStroke: "#c7cdd9",
    text: "#1b2030",
    textMuted: "#5c6478",
    // Dark-parity edge contrast on the near-white bg (was #8a93a6 ≈ 2.9:1, too faint
    // for sketch·light + near-parallel runs). #69728a ≈ 4.5:1 on #f7f8fb, matching the
    // dark theme's edge legibility; colour-only, no geometry impact (D2=A).
    edge: "#69728a",
    edgeLabelBg: "#f7f8fb",
    edgeLabelText: "#3a4152",
    subgraphFill: "#eef1f6",
    subgraphStroke: "#c7cdd9",
    subgraphText: "#5c6478",
    accent: "#4f7cff",
    minimapBg: "rgba(240,242,247,0.9)",
    minimapViewport: "rgba(79,124,255,0.28)",
    roles: {
      accent: { fill: "#e8ecff", stroke: "#7c8bd9", text: "#1b2030" },
      success: { fill: "#e6f4ea", stroke: "#5db97a", text: "#12331f" },
      warn: { fill: "#fff3d6", stroke: "#caa54a", text: "#3b2f0b" },
      danger: { fill: "#fde8e8", stroke: "#d9534f", text: "#4a1210" },
    },
  },
  radii: { node: 10, card: 10, label: 4 },
  spacing: { nodePadX: 16, nodePadY: 12, nodesep: 40, ranksep: 60, fitPadding: 60 },
  font: { family: SANS, mono: MONO, size: 14, lineHeight: 18, weight: 500 },
  edge: { style: "elbow", width: 1.5, thickWidth: 3, arrowSize: 8 },
  effects: { nodeShadow: "0 1px 2px rgba(20,24,40,0.08)", gradient: false, hoverLift: 2 },
};

const darkTokens: TokenSet = {
  colors: {
    background: "#0f1117",
    surface: "#1a1f2b",
    surfaceStroke: "#3a4152",
    text: "#e7eaf2",
    textMuted: "#9aa3b8",
    edge: "#6b7488",
    edgeLabelBg: "#0f1117",
    edgeLabelText: "#c3cadb",
    subgraphFill: "#161b25",
    subgraphStroke: "#3a4152",
    subgraphText: "#9aa3b8",
    accent: "#6f9bff",
    minimapBg: "rgba(20,24,34,0.9)",
    minimapViewport: "rgba(111,155,255,0.32)",
    roles: {
      accent: { fill: "#26314f", stroke: "#6f9bff", text: "#e7eaf2" },
      success: { fill: "#183226", stroke: "#4bbf83", text: "#d6f5e4" },
      warn: { fill: "#33290f", stroke: "#d3ad4e", text: "#f7ecc9" },
      danger: { fill: "#3a1c1c", stroke: "#e06a66", text: "#ffd9d7" },
    },
  },
  radii: { node: 10, card: 10, label: 4 },
  spacing: { nodePadX: 16, nodePadY: 12, nodesep: 40, ranksep: 60, fitPadding: 60 },
  font: { family: SANS, mono: MONO, size: 14, lineHeight: 18, weight: 500 },
  edge: { style: "elbow", width: 1.5, thickWidth: 3, arrowSize: 8 },
  effects: { nodeShadow: "0 1px 3px rgba(0,0,0,0.5)", gradient: false, hoverLift: 2 },
};

const fancyTokens: TokenSet = {
  colors: {
    background: "#0b1020",
    surface: "#151b34",
    surfaceStroke: "#3b4a7a",
    text: "#eef1ff",
    textMuted: "#9fa9d6",
    edge: "#7d88c4",
    edgeLabelBg: "#0b1020",
    edgeLabelText: "#c8cffb",
    subgraphFill: "#111834",
    subgraphStroke: "#3b4a7a",
    subgraphText: "#9fa9d6",
    accent: "#8b6cff",
    minimapBg: "rgba(12,16,34,0.9)",
    minimapViewport: "rgba(139,108,255,0.35)",
    roles: {
      accent: { fill: "#2a2160", stroke: "#8b6cff", text: "#eef1ff" },
      success: { fill: "#123a2e", stroke: "#3fd39b", text: "#d6ffef" },
      warn: { fill: "#3a2f0f", stroke: "#e6c04d", text: "#fff4cf" },
      danger: { fill: "#3f1830", stroke: "#ff6bb0", text: "#ffd9ec" },
    },
  },
  radii: { node: 14, card: 14, label: 6 },
  spacing: { nodePadX: 18, nodePadY: 14, nodesep: 48, ranksep: 72, fitPadding: 60 },
  font: { family: SANS, mono: MONO, size: 14, lineHeight: 19, weight: 600 },
  edge: { style: "curved", width: 1.75, thickWidth: 3.5, arrowSize: 9 },
  effects: {
    nodeShadow: "0 6px 22px rgba(80,60,180,0.35)",
    gradient: true,
    hoverLift: 3,
  },
};

/** Attach a `cssVars()` method to a plain token set. */
function makeTheme(name: string, tokens: TokenSet): Theme {
  return {
    name,
    edgeStyle: tokens.edge.style,
    tokens,
    cssVars() {
      return themeCssVars(this.tokens);
    },
  };
}

/** Emit `--vnm-*` custom properties for a token set. */
export function themeCssVars(t: TokenSet): string {
  const c = t.colors;
  const pairs: Array<[string, string]> = [
    ["--vnm-bg", c.background],
    ["--vnm-surface", c.surface],
    ["--vnm-surface-stroke", c.surfaceStroke],
    ["--vnm-text", c.text],
    ["--vnm-text-muted", c.textMuted],
    ["--vnm-edge", c.edge],
    ["--vnm-edge-label-bg", c.edgeLabelBg],
    ["--vnm-edge-label-text", c.edgeLabelText],
    ["--vnm-subgraph-fill", c.subgraphFill],
    ["--vnm-subgraph-stroke", c.subgraphStroke],
    ["--vnm-subgraph-text", c.subgraphText],
    ["--vnm-accent", c.accent],
    ["--vnm-minimap-bg", c.minimapBg],
    ["--vnm-minimap-viewport", c.minimapViewport],
    ["--vnm-radius", `${t.radii.node}px`],
    ["--vnm-label-radius", `${t.radii.label}px`],
    ["--vnm-font", t.font.family],
    ["--vnm-mono", t.font.mono],
    ["--vnm-font-size", `${t.font.size}px`],
    ["--vnm-font-weight", String(t.font.weight)],
    ["--vnm-node-shadow", t.effects.nodeShadow],
    ["--vnm-hover-lift", `${t.effects.hoverLift}px`],
    ["--vnm-edge-width", `${t.edge.width}px`],
  ];
  return pairs.map(([k, v]) => `${k}: ${v};`).join(" ");
}

/** The built-in themes, by name. */
export const themes: Record<string, Theme> = {
  light: makeTheme("light", lightTokens),
  dark: makeTheme("dark", darkTokens),
  fancy: makeTheme("fancy", fancyTokens),
};

/** Deep-partial of a token set for {@link defineTheme}. */
export type PartialTokenSet = DeepPartial<TokenSet>;
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface DefineThemeOptions {
  name?: string;
  /** Base theme name or object to merge over (default `light`). */
  base?: string | Theme;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge `patch` over `base`, returning a new object. */
function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    if (isPlainObject(value) && isPlainObject(current)) {
      out[key] = deepMerge(current, value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * Build a theme by deep-merging a partial token set over a base theme.
 */
export function defineTheme(
  partial: PartialTokenSet,
  opts: DefineThemeOptions = {},
): Theme {
  const base =
    typeof opts.base === "string"
      ? (themes[opts.base] ?? themes.light!)
      : (opts.base ?? themes.light!);
  const tokens = deepMerge<TokenSet>(base.tokens, partial);
  return makeTheme(opts.name ?? "custom", tokens);
}

/** Resolve a theme from a name, a Theme, or a raw token JSON object. */
export function resolveTheme(
  input: string | Theme | PartialTokenSet | undefined,
): Theme {
  if (input === undefined) return themes.light!;
  if (typeof input === "string") return themes[input] ?? themes.light!;
  if ("tokens" in input && "cssVars" in input) return input as Theme;
  // treat as a partial token set (e.g. parsed from a --theme JSON file)
  return defineTheme(input as PartialTokenSet);
}
