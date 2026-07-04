/**
 * Native state renderer (FR2) — a state diagram re-skinned from mermaid's SVG
 * into our themed engine. Pipeline: `readStateModel` (mermaid SVG → structure) →
 * `layoutState` (our dagre → positioned) → SVG / interactive-DOM renderers.
 * No ASCII (FR4 excludes state); the CLI reports `ascii-unavailable` for `-f md`.
 *
 * Browser-safe: the reader loads mermaid through the shared lazy path; nothing
 * here statically imports mermaid/jsdom.
 */

export { readStateModel } from "./read.js";
export { layoutState, type StateLayoutOptions } from "./layout.js";
export { renderStateSvg } from "./svg.js";
export { buildStatePayload, mountState } from "./interactive.js";
