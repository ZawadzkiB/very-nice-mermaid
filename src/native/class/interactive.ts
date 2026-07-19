/**
 * Interactive glue for native class diagrams. Class diagrams are node-graphs, so
 * they reuse the flowchart {@link vnmRuntime} directly (full draggable nodes with
 * live edge re-routing) — the {@link ClassLayout} already carries a flowchart
 * {@link PositionedModel}. The standalone HTML export goes through the existing
 * `renderHtml` path (pass `layout.model`); nothing here forks the runtime, so the
 * `dom-runtime-parity` guard stays green.
 */

import type { ClassLayout } from "../../model/class.js";
import type { Theme } from "../../theme/index.js";
import { vnmRuntime, type RuntimeHandle, type RuntimePayload } from "../../render/dom/runtime.js";
import { buildPayload, type InteractiveOptions } from "../../render/dom/payload.js";

/** Build the vnmRuntime payload for a class layout (reuses the flowchart payload). */
export function buildClassPayload(
  layout: ClassLayout,
  theme: Theme,
  opts: InteractiveOptions = {},
): RuntimePayload {
  // arrowCaps off: class relations use per-type UML markers (renderClassSvg);
  // a generic vnm-arrow cap would draw over a diamond/triangle relation head.
  return buildPayload(layout.model, theme, { ...opts, arrowCaps: false });
}

/** Mount an interactive (draggable, re-routing) class diagram into `el`. */
export function mountClass(
  el: HTMLElement,
  layout: ClassLayout,
  theme: Theme,
  opts: InteractiveOptions = {},
): RuntimeHandle {
  return vnmRuntime(el, buildPayload(layout.model, theme, { ...opts, arrowCaps: false }));
}
