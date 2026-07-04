/**
 * very-nice-mermaid — public API.
 *
 * Browser-safe: nothing here evaluates a Node built-in or a DOM global at
 * module load. The `<very-nice-mermaid>` custom element ships from the
 * `very-nice-mermaid/element` subpath (it extends `HTMLElement`, so it must
 * only load in a browser). The CLI lives behind the `vnm` bin.
 */

// Parsing
export { parse, ParseError, matchLink } from "./parser/index.js";
export type { ParseOptions } from "./parser/index.js";

// Layout
export { layout } from "./layout/index.js";
export type { LayoutOptions } from "./layout/index.js";
export { measureNode } from "./layout/measure.js";

// Themes
export {
  themes,
  defineTheme,
  resolveTheme,
  themeCssVars,
} from "./theme/index.js";
export type {
  Theme,
  TokenSet,
  PartialTokenSet,
  EdgeStyle,
  ColorTokens,
  RoleColors,
  DefineThemeOptions,
} from "./theme/index.js";

// Geometry (advanced / reuse)
export * as geometry from "./geometry/index.js";

// Renderers
export { renderSvg, renderSvgFromModel } from "./render/svg.js";
export type { SvgRenderOptions } from "./render/svg.js";
export { renderAscii, renderMarkdown } from "./render/ascii.js";
export type { AsciiOptions } from "./render/ascii.js";
export { renderHtml } from "./export/html.js";
export type { HtmlExportOptions } from "./export/html.js";
export { renderPng, renderPngFromSvg } from "./export/png.js";
export type { PngRenderOptions } from "./export/png.js";

// Interactive renderer (browser)
export { mount } from "./render/dom/index.js";
export type { MountOptions } from "./render/dom/index.js";
export type { RuntimeHandle, LayoutData } from "./render/dom/runtime.js";

// Diagram-type router + mermaid.js fallback tier (mermaid/jsdom loaded lazily)
export {
  classify,
  loadMermaid,
  renderFallbackSvg,
  toMermaidTheme,
  UNMAPPED_TOKEN_GROUPS,
} from "./mermaid/index.js";
export type {
  Classification,
  DiagramTier,
  RendererId,
  FallbackRenderOptions,
  FallbackRenderResult,
  MermaidThemeConfig,
} from "./mermaid/index.js";

// Structured render/fallback diagnostics (FR5)
export { Diagnostics, formatRenderDiagnostic } from "./diagnostics/index.js";
export type {
  RenderDiagnostic,
  RenderSeverity,
  RenderTier,
} from "./diagnostics/index.js";

// Model types
export type {
  DiagramModel,
  DiagramNode,
  DiagramEdge,
  Subgraph,
  PositionedModel,
  PositionedNode,
  RoutedEdge,
  PositionedSubgraph,
  SerializedModel,
  Direction,
  Shape,
  EdgeKind,
  StyleDef,
  Diagnostic,
  Point,
  Rect,
} from "./model/index.js";
export { serializeModel, deserializeModel, isPositionedModel } from "./model/index.js";
