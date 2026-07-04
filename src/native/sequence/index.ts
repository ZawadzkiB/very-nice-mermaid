/**
 * Native sequence renderer (FR2) — the first non-flowchart type re-skinned from
 * mermaid's SVG into our themed engine. Pipeline: `readSequenceModel` (mermaid
 * SVG → structure) → `layoutSequence` (our deterministic, themed geometry) →
 * SVG / ASCII / interactive-DOM renderers.
 *
 * Browser-safe: the reader loads mermaid through the shared lazy path; nothing
 * here statically imports mermaid/jsdom.
 */

export { readSequenceModel } from "./read.js";
export { layoutSequence, type SequenceLayoutOptions } from "./layout.js";
export { renderSequenceSvg } from "./svg.js";
export { renderSequenceAscii, renderSequenceMarkdown } from "./ascii.js";
export {
  buildSequencePayload,
  mountSequence,
  renderSequenceHtml,
  type SequenceInteractiveOptions,
  type SequenceHtmlOptions,
} from "./interactive.js";
