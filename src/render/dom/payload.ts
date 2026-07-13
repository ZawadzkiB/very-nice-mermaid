/**
 * Build the JSON-serializable {@link RuntimePayload} that both the live
 * `mount()` and the standalone HTML export feed to {@link vnmRuntime}.
 */

import { serializeModel, type PositionedModel } from "../../model/index.js";
import type { Theme, RenderStyle } from "../../theme/index.js";
import type { RuntimePayload } from "./runtime.js";
import { SKETCH_FONT_FAMILY, sketchFontFaceCss } from "../sketch-font.js";

export interface InteractiveOptions {
  /** Persist layout to localStorage: `true` (auto key), a string key, or `false`. */
  persist?: boolean | string;
  /** Show the minimap (default true). */
  minimap?: boolean;
  /** Fit padding in px (default from theme). */
  fitPadding?: number;
  minScale?: number;
  maxScale?: number;
  /** Drawing style axis (D1): `clean` (default) or hand-drawn `sketch`. */
  style?: RenderStyle;
  /** Edge-crossing bridges (FR7 / D4); forwarded to the runtime. */
  bridges?: boolean;
}

/** Stable, non-cryptographic hash (djb2) for deriving a persistence key. */
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function persistKey(persist: boolean | string | undefined, model: PositionedModel): string | null {
  if (persist === false) return null;
  if (typeof persist === "string") return persist;
  const sig = model.nodes.map((nnode) => nnode.id).join(",") + "|" + model.direction;
  return "vnm-layout:" + hash(sig);
}

export function buildPayload(
  model: PositionedModel,
  theme: Theme,
  opts: InteractiveOptions = {},
): RuntimePayload {
  const sketch = opts.style === "sketch";
  // Sketch mode overrides the font family for every card/label via cssVars (last
  // rule wins on the viewport's inline style), and ships the bundled @font-face
  // (base64, zero network) + the family string the serializer needs — the runtime
  // is `.toString()`-serialized so it can't import them; they ride the payload.
  const cssVars = sketch ? theme.cssVars() + `--vnm-font: ${SKETCH_FONT_FAMILY};` : theme.cssVars();
  const payload: RuntimePayload = {
    model: serializeModel(model),
    theme: { name: theme.name, edgeStyle: theme.edgeStyle, tokens: theme.tokens },
    cssVars,
    options: {
      fitPadding: opts.fitPadding ?? theme.tokens.spacing.fitPadding,
      persistKey: persistKey(opts.persist, model),
      minimap: opts.minimap ?? true,
      minScale: opts.minScale ?? 0.2,
      maxScale: opts.maxScale ?? 4,
      style: sketch ? "sketch" : "clean",
      bridges: opts.bridges,
    },
  };
  if (sketch) payload.sketch = { fontFace: sketchFontFaceCss(), fontFamily: SKETCH_FONT_FAMILY };
  return payload;
}
