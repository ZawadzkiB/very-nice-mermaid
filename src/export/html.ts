/**
 * Standalone interactive HTML export. Produces **one self-contained document**:
 * inlined CSS + JS (the {@link vnmRuntime}) + the embedded model, with **zero
 * network requests** — no `<link>`, no external `<script>`, no remote fonts or
 * images. Open the file anywhere and drag away.
 */

import type { RenderInput } from "../render/prepare.js";
import { prepare } from "../render/prepare.js";
import type { Theme, PartialTokenSet } from "../theme/index.js";
import { vnmRuntime } from "../render/dom/runtime.js";
import { buildPayload, type InteractiveOptions } from "../render/dom/payload.js";

export interface HtmlExportOptions extends InteractiveOptions {
  theme?: string | Theme | PartialTokenSet;
  strict?: boolean;
  /** Document `<title>` (default "Diagram"). */
  title?: string;
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

/**
 * Render a fully self-contained interactive HTML document.
 *
 * Like `mount()`, the embedded interactive renderer draws every node as a
 * **rounded card** (only the corner radius varies); full shape silhouettes are
 * in the static `renderSvg` / PNG output.
 */
export function renderHtml(input: RenderInput, opts: HtmlExportOptions = {}): string {
  const { model, theme } = prepare(input, { theme: opts.theme, strict: opts.strict });
  const payload = buildPayload(model, theme, opts);
  const runtimeSrc = vnmRuntime.toString();
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
  .vnm-node { box-sizing: border-box; }
  button { font-family: inherit; }
</style>
</head>
<body>
<div id="vnm-root"></div>
<script>
"use strict";
var vnmRuntime = ${runtimeSrc};
var __vnm_payload = ${json};
vnmRuntime(document.getElementById("vnm-root"), __vnm_payload);
</script>
</body>
</html>
`;
}
