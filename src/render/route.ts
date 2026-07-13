/**
 * Type-routed async renderers — the library twins of the CLI's dispatch. Where
 * the synchronous `renderSvg` / `renderHtml` / `renderAscii` / `renderMarkdown`
 * only handle the flowchart family (and refuse a raw non-flowchart string), these
 * run mermaid's `detectType` router and dispatch every diagram type exactly like
 * `src/cli/run.ts`: flowchart via the sync own-parser fast path, sequence / class
 * / state re-skinned from mermaid's SVG, and everything else through the
 * mermaid.js fallback engine. Hence they are **async** (the non-flowchart tiers
 * need mermaid + a DOM); flowchart resolves without ever loading mermaid.
 *
 * Browser-safe: mermaid + jsdom are only reached through the lazy `classify` /
 * reader / fallback paths (dynamic `import()`), never statically here.
 */

import { classify } from "../mermaid/router.js";
import { renderFallbackSvg } from "../mermaid/fallback.js";
import { resolveTheme, type Theme } from "../theme/index.js";
import { renderSvg, type SvgRenderOptions } from "./svg.js";
import { renderAscii, renderMarkdown, type AsciiOptions } from "./ascii.js";
import { renderHtml, type HtmlExportOptions } from "../export/html.js";
import {
  readSequenceModel,
  layoutSequence,
  renderSequenceSvg,
  renderSequenceAscii,
  renderSequenceMarkdown,
} from "../native/sequence/index.js";
import { readClassModel, layoutClass, renderClassSvg } from "../native/class/index.js";
import { readStateModel, layoutState, renderStateSvg } from "../native/state/index.js";

/**
 * Surface (on the console) that `--style sketch` is dropped for a mermaid.js
 * fallback type — the library twin of the CLI's note, so the drop isn't invisible
 * to library / element callers (REV-003: the library surface must route AND
 * report, not just the CLI). Native flowchart/sequence/class/state DO sketch.
 */
function warnSketchFallback(detected: string): void {
  if (typeof console !== "undefined" && console.warn) {
    console.warn(
      `very-nice-mermaid: --style sketch is not supported for the mermaid.js fallback tier ('${detected}'); rendering in its normal style.`,
    );
  }
}

/** ASCII (FR4) is only meaningful for flowchart + sequence. */
function asciiUnavailable(type: string): Error {
  return new Error(
    `very-nice-mermaid: ASCII/Markdown output is unavailable for '${type}' — only ` +
      `flowchart and sequence diagrams render as ASCII (FR4). Use renderSvgAsync/renderHtmlAsync.`,
  );
}

/**
 * Render any diagram type to a standalone SVG string. Routes by `detectType`:
 * flowchart (sync own-parser), sequence/class/state (native re-skin), everything
 * else (mermaid.js fallback). Async because the non-flowchart tiers load mermaid.
 */
export async function renderSvgAsync(dsl: string, opts: SvgRenderOptions = {}): Promise<string> {
  const c = await classify(dsl);
  const theme = resolveTheme(opts.theme);
  switch (c.renderer) {
    case "flowchart":
      return renderSvg(dsl, opts); // sync own-parser fast path — no mermaid
    case "sequence":
      return renderSequenceSvg(layoutSequence(await readSequenceModel(dsl), { theme }), theme, opts.background, opts.style);
    case "class":
      return renderClassSvg(layoutClass(await readClassModel(dsl), { theme, bridges: opts.bridges }), theme, opts.background, opts.style);
    case "state":
      return renderStateSvg(layoutState(await readStateModel(dsl), { theme, bridges: opts.bridges }), theme, opts.background, opts.style);
    default: {
      const detected = c.detected ?? c.type;
      if (opts.style === "sketch") warnSketchFallback(detected);
      const { svg } = await renderFallbackSvg(dsl, { theme, detected });
      return svg;
    }
  }
}

/** Render any diagram type to a self-contained interactive HTML document. */
export async function renderHtmlAsync(dsl: string, opts: HtmlExportOptions = {}): Promise<string> {
  const c = await classify(dsl);
  const theme = resolveTheme(opts.theme);
  switch (c.renderer) {
    case "flowchart":
      return renderHtml(dsl, opts);
    case "sequence":
      return renderHtml(layoutSequence(await readSequenceModel(dsl), { theme }), opts);
    case "class":
      return renderHtml(layoutClass(await readClassModel(dsl), { theme, bridges: opts.bridges }), opts);
    case "state":
      return renderHtml(layoutState(await readStateModel(dsl), { theme, bridges: opts.bridges }), opts);
    default: {
      const detected = c.detected ?? c.type;
      if (opts.style === "sketch") warnSketchFallback(detected);
      const { svg } = await renderFallbackSvg(dsl, { theme, detected });
      return wrapFallbackHtml(svg, opts.title ?? detected, theme);
    }
  }
}

/** Render flowchart/sequence to ASCII (FR4). Other types throw a clear error. */
export async function renderAsciiAsync(dsl: string, opts: AsciiOptions = {}): Promise<string> {
  const c = await classify(dsl);
  const theme = resolveTheme(opts.theme);
  if (c.renderer === "flowchart") return renderAscii(dsl, opts);
  if (c.renderer === "sequence") return renderSequenceAscii(layoutSequence(await readSequenceModel(dsl), { theme }));
  throw asciiUnavailable(c.type);
}

/** Render flowchart/sequence to fenced Markdown (FR4). Other types throw. */
export async function renderMarkdownAsync(dsl: string, opts: AsciiOptions = {}): Promise<string> {
  const c = await classify(dsl);
  const theme = resolveTheme(opts.theme);
  if (c.renderer === "flowchart") return renderMarkdown(dsl, opts);
  if (c.renderer === "sequence") return renderSequenceMarkdown(layoutSequence(await readSequenceModel(dsl), { theme }));
  throw asciiUnavailable(c.type);
}

/** Escape a string for safe embedding as HTML text content. */
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Wrap a fallback (mermaid) SVG in a minimal, self-contained, zero-network HTML
 * document. Browser-safe twin of the CLI's `wrapFallbackHtml` (kept out of the
 * Node-only CLI module so the `.` entry stays browser-safe).
 */
export function wrapFallbackHtml(svg: string, title: string, theme?: Theme): string {
  const bg = theme?.tokens.colors.background ?? "#fff";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
<style>html,body{margin:0;height:100%}body{display:grid;place-items:center;background:${bg}}svg{max-width:100%;max-height:100%;height:auto}</style>
</head>
<body>
${svg}
</body>
</html>
`;
}
