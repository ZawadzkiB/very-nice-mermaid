/**
 * Native class renderer (FR2) — a class diagram re-skinned from mermaid's SVG
 * into our themed engine. Pipeline: `readClassModel` (mermaid SVG → structure) →
 * `layoutClass` (our dagre → positioned) → SVG / interactive-DOM renderers.
 * No ASCII (FR4 excludes class); the CLI reports `ascii-unavailable` for `-f md`.
 *
 * Browser-safe: the reader loads mermaid through the shared lazy path; nothing
 * here statically imports mermaid/jsdom.
 */

export { readClassModel } from "./read.js";
export { layoutClass, type ClassLayoutOptions } from "./layout.js";
export { renderClassSvg } from "./svg.js";
export { classCardLines, type ClassCardLines } from "./card.js";
export { buildClassPayload, mountClass } from "./interactive.js";
