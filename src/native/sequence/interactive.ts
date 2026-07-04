/**
 * Interactive + HTML glue for native sequence diagrams. Builds the
 * JSON-serializable payload that both the live {@link mountSequence} and the
 * standalone {@link renderSequenceHtml} feed to {@link seqRuntime}, reusing the
 * themed static SVG ({@link renderSequenceSvg}) as the pannable/zoomable content.
 */

import type { SequenceLayout } from "../../model/sequence.js";
import type { Theme } from "../../theme/index.js";
import {
  seqRuntime,
  type SeqRuntimePayload,
  type SeqRuntimeHandle,
  type SeqMinimapBox,
} from "../../render/dom/seq-runtime.js";
import { renderSequenceSvg } from "./svg.js";

export interface SequenceInteractiveOptions {
  minimap?: boolean;
  fitPadding?: number;
  minScale?: number;
  maxScale?: number;
}

export interface SequenceHtmlOptions extends SequenceInteractiveOptions {
  /** Document `<title>` (default "Diagram"). */
  title?: string;
}

/** Build the runtime payload from a positioned layout + theme. */
export function buildSequencePayload(
  layout: SequenceLayout,
  theme: Theme,
  opts: SequenceInteractiveOptions = {},
): SeqRuntimePayload {
  const b = layout.bounds;
  const boxes: SeqMinimapBox[] = [];
  for (const p of layout.participants) {
    for (const cy of [layout.boxTop, layout.boxBottom]) {
      boxes.push({
        x: p.x - p.width / 2 - b.x,
        y: cy - p.height / 2 - b.y,
        w: p.width,
        h: p.height,
      });
    }
  }
  const lines = layout.messages.map((m) => m.y - b.y);

  return {
    svg: renderSequenceSvg(layout, theme, "transparent"),
    cssVars: theme.cssVars(),
    bg: theme.tokens.colors.background,
    content: { width: b.width, height: b.height },
    minimap: {
      boxes,
      lines,
      accent: theme.tokens.colors.accent,
      viewport: theme.tokens.colors.minimapViewport,
    },
    options: {
      fitPadding: opts.fitPadding ?? theme.tokens.spacing.fitPadding,
      minimap: opts.minimap ?? true,
      minScale: opts.minScale ?? 0.2,
      maxScale: opts.maxScale ?? 4,
    },
  };
}

/** Mount an interactive (pan/zoom/fit) sequence diagram into `el`. */
export function mountSequence(
  el: HTMLElement,
  layout: SequenceLayout,
  theme: Theme,
  opts: SequenceInteractiveOptions = {},
): SeqRuntimeHandle {
  return seqRuntime(el, buildSequencePayload(layout, theme, opts));
}

/** Escape a string for safe embedding as HTML text content. */
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** JS line/paragraph separators (U+2028/U+2029) — illegal in JS string literals. */
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

/** Embed a JSON payload safely inside an inline `<script>`. */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .split("<")
    .join("\\u003c")
    .split(LS)
    .join("\\u2028")
    .split(PS)
    .join("\\u2029");
}

/** Render a fully self-contained interactive HTML document for a sequence. */
export function renderSequenceHtml(
  layout: SequenceLayout,
  theme: Theme,
  opts: SequenceHtmlOptions = {},
): string {
  const payload = buildSequencePayload(layout, theme, opts);
  const runtimeSrc = seqRuntime.toString();
  const json = embedJson(payload);
  const title = escHtml(opts.title ?? "Diagram");
  const bg = theme.tokens.colors.background;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  html, body { margin: 0; height: 100%; }
  body { background: ${bg}; font-family: ${theme.tokens.font.family}; }
  #vnm-root { position: absolute; inset: 0; }
  button { font-family: inherit; }
</style>
</head>
<body>
<div id="vnm-root"></div>
<script>
"use strict";
var seqRuntime = ${runtimeSrc};
var __vnm_payload = ${json};
seqRuntime(document.getElementById("vnm-root"), __vnm_payload);
</script>
</body>
</html>
`;
}
