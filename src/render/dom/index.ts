/**
 * The interactive renderer entry point: `mount(el, dsl, opts) → handle`.
 * Browser-only (it touches the DOM), but the parse/layout it drives is shared
 * with every other renderer.
 */

import { prepare, type RenderInput } from "../prepare.js";
import type { Theme, PartialTokenSet } from "../../theme/index.js";
import { vnmRuntime, type RuntimeHandle } from "./runtime.js";
import { buildPayload, type InteractiveOptions } from "./payload.js";

export interface MountOptions extends InteractiveOptions {
  theme?: string | Theme | PartialTokenSet;
  strict?: boolean;
}

/**
 * Mount an interactive diagram into `el` and return a handle
 * (`fit`, `zoomIn/Out`, `exportLayout`, `importLayout`, `setTheme`, `destroy`).
 */
export function mount(el: HTMLElement, dsl: RenderInput, opts: MountOptions = {}): RuntimeHandle {
  const { model, theme } = prepare(dsl, { theme: opts.theme, strict: opts.strict });
  const payload = buildPayload(model, theme, opts);
  return vnmRuntime(el, payload);
}

export type { RuntimeHandle, LayoutData } from "./runtime.js";
