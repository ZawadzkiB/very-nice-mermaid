/**
 * PNG output via **@resvg/resvg-js** (native, no headless browser). The
 * dependency is **optional** and **lazily** imported, so the package installs
 * and runs fine without it — you only need it to actually rasterize a PNG.
 */

import { renderSvg, type SvgRenderOptions } from "../render/svg.js";
import type { RenderInput } from "../render/prepare.js";
import { SKETCH_FONT_BASE64, SKETCH_FONT_NAME } from "../render/sketch-font.js";

export interface PngRenderOptions extends SvgRenderOptions {
  /** HiDPI scale factor (default 1). */
  scale?: number;
}

const INSTALL_HINT =
  "PNG output requires the optional dependency '@resvg/resvg-js'. " +
  "Install it with:\n\n  npm install @resvg/resvg-js\n";

interface ResvgFontOptions {
  /** Raw font file buffers to register (so custom fonts render without install). */
  fontBuffers?: Uint8Array[];
  loadSystemFonts?: boolean;
  defaultFontFamily?: string;
}

interface ResvgModule {
  Resvg: new (
    svg: string,
    options?: { fitTo?: { mode: "zoom"; value: number }; font?: ResvgFontOptions },
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
  // Sketch mode: register the bundled handwriting font with resvg (the @font-face
  // in the SVG is embedded, but resvg rasterizes from registered font buffers).
  const fonts = opts.style === "sketch" ? sketchFontRegistration() : undefined;
  return renderPngFromSvg(renderSvg(input, opts), opts.scale, fonts);
}

/** Decode the bundled woff2 (base64) to bytes for resvg font registration. */
function sketchFontBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(SKETCH_FONT_BASE64, "base64"));
}

/**
 * resvg font registration for a sketch PNG — the bundled Kalam buffer + its real
 * family as the default. The native tiers (sequence/class/state) pass this into
 * {@link renderPngFromSvg} so their hand-drawn text rasterizes with the font.
 */
export function sketchFontRegistration(): { buffers: Uint8Array[]; defaultFontFamily: string } {
  return { buffers: [sketchFontBytes()], defaultFontFamily: SKETCH_FONT_NAME };
}

/**
 * Rasterize an already-rendered SVG string to PNG bytes. Used by the fallback
 * tier, whose SVG comes straight from mermaid (not from our model). Throws the
 * same clear error if the optional resvg dependency is absent. `fonts` registers
 * custom font buffers (sketch mode) so a bundled font rasterizes without install.
 */
export async function renderPngFromSvg(
  svg: string,
  scale?: number,
  fonts?: { buffers: Uint8Array[]; defaultFontFamily?: string },
): Promise<Uint8Array> {
  const { Resvg } = await loadResvg();
  const z = scale && scale > 0 ? scale : 1;
  const font: ResvgFontOptions | undefined = fonts
    ? { fontBuffers: fonts.buffers, loadSystemFonts: true, defaultFontFamily: fonts.defaultFontFamily ?? "" }
    : undefined;
  const resvg = new Resvg(svg, font ? { fitTo: { mode: "zoom", value: z }, font } : { fitTo: { mode: "zoom", value: z } });
  return resvg.render().asPng();
}
