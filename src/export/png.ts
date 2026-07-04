/**
 * PNG output via **@resvg/resvg-js** (native, no headless browser). The
 * dependency is **optional** and **lazily** imported, so the package installs
 * and runs fine without it — you only need it to actually rasterize a PNG.
 */

import { renderSvg, type SvgRenderOptions } from "../render/svg.js";
import type { RenderInput } from "../render/prepare.js";

export interface PngRenderOptions extends SvgRenderOptions {
  /** HiDPI scale factor (default 1). */
  scale?: number;
}

const INSTALL_HINT =
  "PNG output requires the optional dependency '@resvg/resvg-js'. " +
  "Install it with:\n\n  npm install @resvg/resvg-js\n";

interface ResvgModule {
  Resvg: new (
    svg: string,
    options?: { fitTo?: { mode: "zoom"; value: number } },
  ) => { render(): { asPng(): Uint8Array } };
}

async function loadResvg(): Promise<ResvgModule> {
  try {
    return (await import("@resvg/resvg-js")) as unknown as ResvgModule;
  } catch {
    throw new Error(INSTALL_HINT);
  }
}

/** Render a diagram to PNG bytes. Throws a clear error if resvg is absent. */
export async function renderPng(input: RenderInput, opts: PngRenderOptions = {}): Promise<Uint8Array> {
  return renderPngFromSvg(renderSvg(input, opts), opts.scale);
}

/**
 * Rasterize an already-rendered SVG string to PNG bytes. Used by the fallback
 * tier, whose SVG comes straight from mermaid (not from our model). Throws the
 * same clear error if the optional resvg dependency is absent.
 */
export async function renderPngFromSvg(svg: string, scale?: number): Promise<Uint8Array> {
  const { Resvg } = await loadResvg();
  const z = scale && scale > 0 ? scale : 1;
  const resvg = new Resvg(svg, { fitTo: { mode: "zoom", value: z } });
  return resvg.render().asPng();
}
