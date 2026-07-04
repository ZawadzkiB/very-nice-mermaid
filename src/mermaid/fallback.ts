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
import { loadMermaid, inNodeRuntime } from "./router.js";
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

/** Detect mermaid's degenerate-geometry symptom under jsdom (no text metrics). */
function viewBoxDegenerate(svg: string): boolean {
  const m =
    /viewBox="\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*"/.exec(svg);
  if (!m) return false;
  const w = parseFloat(m[3]!);
  const h = parseFloat(m[4]!);
  // dagre/getBBox-derived bounds collapse to ~0 or explode to tens of thousands.
  return !(w > 0 && h > 0) || w > 8000 || h > 8000;
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
  // In Node this also stands up the persistent jsdom DOM (before mermaid loads).
  const mermaid = await loadMermaid();
  const inNode = inNodeRuntime();

  const themeConfig = opts.theme ? toMermaidTheme(opts.theme) : {};
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

  let degraded = false;
  if (inNode && viewBoxDegenerate(svg)) {
    degraded = true;
    diagnostics.degraded(
      "geometry",
      detected,
      `'${detected}' geometry is approximate under jsdom (headless text measurement is unavailable); render in a browser for exact layout`,
    );
  }

  return { svg, diagnostics: diagnostics.all(), degraded };
}
