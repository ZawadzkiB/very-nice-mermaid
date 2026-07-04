/**
 * The interactive renderer entry point: `mount(el, dsl, opts) → handle`.
 * Browser-only (it touches the DOM), but the parse/layout it drives is shared
 * with every other renderer.
 */

import { prepare, type RenderInput } from "../prepare.js";
import type { Theme, PartialTokenSet } from "../../theme/index.js";
import { vnmRuntime, type RuntimeHandle } from "./runtime.js";
import { buildPayload, type InteractiveOptions } from "./payload.js";
import { isClassLayout, type ClassLayout } from "../../model/class.js";
import { isStateLayout, type StateLayout } from "../../model/state.js";
import { resolveTheme } from "../../theme/index.js";

export interface MountOptions extends InteractiveOptions {
  theme?: string | Theme | PartialTokenSet;
  strict?: boolean;
}

/**
 * Mount an interactive diagram into `el` and return a handle
 * (`fit`, `zoomIn/Out`, `exportLayout`, `importLayout`, `setTheme`, `destroy`).
 *
 * Note: the interactive renderer draws every node as a **rounded card** (only
 * the corner radius varies); full shape silhouettes (diamond, hexagon, cylinder,
 * …) are drawn by the static `renderSvg` / PNG output.
 */
export function mount(
  el: HTMLElement,
  dsl: RenderInput | ClassLayout | StateLayout,
  opts: MountOptions = {},
): RuntimeHandle {
  // Class + state layouts already carry a flowchart PositionedModel — mount them
  // through the same vnmRuntime (full draggable nodes + live edge re-routing).
  if (isClassLayout(dsl) || isStateLayout(dsl)) {
    return vnmRuntime(el, buildPayload(dsl.model, resolveTheme(opts.theme), opts));
  }
  const { model, theme } = prepare(dsl, { theme: opts.theme, strict: opts.strict });
  const payload = buildPayload(model, theme, opts);
  return vnmRuntime(el, payload);
}

export type { RuntimeHandle, LayoutData } from "./runtime.js";
