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
  const svg = renderSvg(input, opts);
  const { Resvg } = await loadResvg();
  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1;
  const resvg = new Resvg(svg, { fitTo: { mode: "zoom", value: scale } });
  return resvg.render().asPng();
}
