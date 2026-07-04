/**
 * Fallback tier (FR3): render any diagram mermaid.js understands to an SVG
 * string. In the browser mermaid uses the real DOM; in Node we stand up jsdom
 * (D1 — no Chromium) and report any degradation (FR5). Our theme tokens are
 * mapped onto mermaid `themeVariables` as far as they go (FR7).
 *
 * Browser-safe: jsdom is imported *dynamically and only on the Node branch*, so
 * it never enters the browser bundle.
 */

import type { Theme } from "../theme/index.js";
import { Diagnostics, type RenderDiagnostic } from "../diagnostics/index.js";
import { loadMermaid, usedHeadlessDom } from "./router.js";
import { toMermaidTheme } from "./theme-map.js";

export interface FallbackRenderOptions {
  /** Theme whose tokens are mapped onto mermaid `themeVariables`. */
  theme?: Theme;
  /** Shared diagnostics channel; a fresh one is created if omitted. */
  diagnostics?: Diagnostics;
  /** The `detectType` result, used only to word diagnostics. */
  detected?: string;
}

export interface FallbackRenderResult {
  svg: string;
  diagnostics: readonly RenderDiagnostic[];
  /** True when the geometry is known-unreliable (jsdom text measurement). */
  degraded: boolean;
}

/** A stable id keeps mermaid's internal ids deterministic across runs. */
const RENDER_ID = "vnm-fallback";

/** Thrown when a fallback render is degenerate/blank headless (D9-A honest fail). */
export class FallbackUnavailableError extends Error {
  constructor(
    public readonly detected: string,
    message: string,
  ) {
    super(message);
    this.name = "FallbackUnavailableError";
  }
}

/**
 * Detect a degenerate/blank mermaid render under jsdom (no real text metrics):
 * a zero/negative-area viewBox, an aspect ratio collapsed to a sliver (bounds
 * that explode to tens of thousands on one axis), a negative width/height on any
 * `<rect>`, or empty content. Any of these means the artifact is unusable — not
 * merely "approximate" (TEST-004) — so the caller hard-fails instead of emitting
 * a broken SVG.
 */
function isDegenerate(svg: string): boolean {
  const m =
    /viewBox="\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*"/.exec(svg);
  if (m) {
    const w = parseFloat(m[3]!);
    const h = parseFloat(m[4]!);
    // dagre/getBBox-derived bounds collapse to ~0 or explode to tens of thousands.
    if (!(w > 0 && h > 0) || w > 8000 || h > 8000) return true;
  }
  // A negative width/height attribute is spec-invalid and renders nothing.
  if (/\b(?:width|height)="\s*-[\d.]/.test(svg)) return true;
  // No drawable content at all (only the root <svg> wrapper).
  if (!/<(?:rect|path|circle|ellipse|line|polygon|text|g|foreignObject)\b/.test(svg)) return true;
  return false;
}

/**
 * Render `dsl` to an SVG string via mermaid. Emits FR5 diagnostics for degraded
 * geometry (jsdom) and throws with a clear message + `render-failed` diagnostic
 * for a type mermaid cannot render headless (e.g. cytoscape/canvas types).
 */
export async function renderFallbackSvg(
  dsl: string,
  opts: FallbackRenderOptions = {},
): Promise<FallbackRenderResult> {
  const diagnostics = opts.diagnostics ?? new Diagnostics();
  const detected = opts.detected ?? "unknown";
  // In Node (with no host DOM) this also stands up the persistent jsdom DOM
  // before mermaid loads; against a real/host DOM it uses that DOM as-is.
  const mermaid = await loadMermaid();
  // Geometry only degrades under our headless jsdom stubs — a host/browser DOM
  // measures text for real (REV-003).
  const headless = usedHeadlessDom();

  const themeConfig = opts.theme ? toMermaidTheme(opts.theme, diagnostics) : {};
  const config = {
    startOnLoad: false,
    securityLevel: "loose",
    deterministicIds: true,
    // SVG <text> labels (not HTML foreignObject): measurable under our jsdom
    // stubs, and cleaner to re-skin later. See spike-01.md.
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false },
    state: { htmlLabels: false },
    ...themeConfig,
  };

  let svg: string;
  try {
    mermaid.initialize(config);
    const result = await mermaid.render(RENDER_ID, dsl);
    svg = result.svg;
  } catch (err) {
    diagnostics.failed(
      detected,
      `mermaid could not render '${detected}' headless (${(err as Error).message}); this type needs a browser`,
    );
    throw new Error(
      `fallback render failed for '${detected}': ${(err as Error).message}`,
    );
  }

  // Headless (jsdom) renders of layout-heavy types collapse to a blank/invalid
  // SVG (TEST-004 / D9-A). Detect it and fail honestly with a clear FR5 error —
  // never return the broken SVG to be written to a file or baked into HTML. In a
  // real browser `headless` is false, so these types render normally there.
  if (headless && isDegenerate(svg)) {
    const message =
      `'${detected}' cannot be rendered headlessly (jsdom): the layout is degenerate/blank. ` +
      `It renders correctly in a browser / the library; use those for '${detected}'.`;
    diagnostics.fallbackUnavailable(detected, message);
    throw new FallbackUnavailableError(detected, message);
  }

  return { svg, diagnostics: diagnostics.all(), degraded: false };
}
