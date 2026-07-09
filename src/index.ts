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
  RenderStyle,
  ColorTokens,
  RoleColors,
  DefineThemeOptions,
} from "./theme/index.js";

// Geometry (advanced / reuse)
export * as geometry from "./geometry/index.js";

// Renderers (synchronous — flowchart family + already-built native layouts only).
// A raw non-flowchart string throws pointing at the async twin below (FR1: never
// silently misparse it into a garbage flowchart).
export { renderSvg, renderSvgFromModel } from "./render/svg.js";
export type { SvgRenderOptions } from "./render/svg.js";
export { renderAscii, renderMarkdown } from "./render/ascii.js";
export type { AsciiOptions } from "./render/ascii.js";
export { renderHtml } from "./export/html.js";
export type { HtmlExportOptions } from "./export/html.js";
export { renderPng, renderPngFromSvg } from "./export/png.js";
export type { PngRenderOptions } from "./export/png.js";

// Type-routed ASYNC renderers — the library twin of the CLI's dispatch. These
// classify a raw DSL (detectType) and render EVERY diagram type: flowchart
// (sync own-parser), sequence/class/state (native re-skin), everything else
// (mermaid.js fallback). Async because the non-flowchart tiers load mermaid.
export {
  renderSvgAsync,
  renderHtmlAsync,
  renderAsciiAsync,
  renderMarkdownAsync,
} from "./render/route.js";

// Interactive renderer (browser). `mount()` returns a handle synchronously and
// finishes a non-flowchart render asynchronously; `mountAsync()` resolves with
// the settled handle. Both route every diagram type through the router.
export { mount, mountAsync } from "./render/dom/index.js";
export type { MountOptions, AnyRuntimeHandle } from "./render/dom/index.js";
export type { RuntimeHandle, LayoutData } from "./render/dom/runtime.js";

// Native sequence renderer (FR2): read mermaid's SVG → our themed engine.
// `readSequenceModel` loads mermaid lazily (same path as the fallback tier);
// layout/SVG/ASCII/HTML are pure + sync and take the positioned layout.
export {
  readSequenceModel,
  layoutSequence,
  renderSequenceSvg,
  renderSequenceAscii,
  renderSequenceMarkdown,
  buildSequencePayload,
  mountSequence,
  renderSequenceHtml,
} from "./native/sequence/index.js";
export type {
  SequenceLayoutOptions,
  SequenceInteractiveOptions,
  SequenceHtmlOptions,
} from "./native/sequence/index.js";
export type { SeqRuntimeHandle } from "./render/dom/seq-runtime.js";
export type {
  SequenceModel,
  SequenceParticipant,
  SequenceMessage,
  SequenceArrowKind,
  SequenceLayout,
  PositionedParticipant,
  PositionedMessage,
} from "./model/sequence.js";
export { isSequenceLayout } from "./model/sequence.js";

// Native class renderer (FR2): read mermaid's SVG → our themed engine, re-laid
// out with our own dagre. `readClassModel` loads mermaid lazily (same path as
// the fallback tier); layout/SVG/interactive are pure + sync on the model.
export {
  readClassModel,
  layoutClass,
  renderClassSvg,
  classCardLines,
  buildClassPayload,
  mountClass,
} from "./native/class/index.js";
export type { ClassLayoutOptions, ClassCardLines } from "./native/class/index.js";
export type {
  ClassModel,
  ClassEntity,
  ClassMember,
  ClassRelation,
  ClassRelationType,
  ClassVisibility,
  ClassLayout,
} from "./model/class.js";
export { isClassLayout } from "./model/class.js";

// Native state renderer (FR2): same shape as class, simpler (no compartments).
export {
  readStateModel,
  layoutState,
  renderStateSvg,
  buildStatePayload,
  mountState,
} from "./native/state/index.js";
export type { StateLayoutOptions } from "./native/state/index.js";
export type {
  StateModel,
  StateNode,
  StateNodeKind,
  StateTransition,
  StateLayout,
} from "./model/state.js";
export { isStateLayout } from "./model/state.js";

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
