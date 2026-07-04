/**
 * mermaid.js integration: the `detectType` router (native vs fallback tier) and
 * the fallback SVG renderer. mermaid + jsdom are loaded lazily (dynamic
 * `import()`) so the browser-safe core and flowchart-only paths never pay for
 * them until a fallback/native-reskin path needs them (D4 / FR8).
 */

export {
  classify,
  loadMermaid,
  type Classification,
  type DiagramTier,
  type RendererId,
  type MermaidLike,
} from "./router.js";
export {
  renderFallbackSvg,
  type FallbackRenderOptions,
  type FallbackRenderResult,
} from "./fallback.js";
export {
  toMermaidTheme,
  UNMAPPED_TOKEN_GROUPS,
  type MermaidThemeConfig,
} from "./theme-map.js";
