/**
 * Interactive glue for native state diagrams. Like class diagrams they are
 * node-graphs, so they reuse the flowchart {@link vnmRuntime} directly (full
 * draggable nodes with live edge re-routing) — the {@link StateLayout} already
 * carries a flowchart {@link PositionedModel}. The standalone HTML export goes
 * through the existing `renderHtml` path (pass `layout.model`); nothing here
 * forks the runtime, so the `dom-runtime-parity` guard stays green.
 */

import type { StateLayout } from "../../model/state.js";
import type { Theme } from "../../theme/index.js";
import { vnmRuntime, type RuntimeHandle, type RuntimePayload } from "../../render/dom/runtime.js";
import { buildPayload, type InteractiveOptions } from "../../render/dom/payload.js";

/** Build the vnmRuntime payload for a state layout (reuses the flowchart payload). */
export function buildStatePayload(
  layout: StateLayout,
  theme: Theme,
  opts: InteractiveOptions = {},
): RuntimePayload {
  return buildPayload(layout.model, theme, opts);
}

/** Mount an interactive (draggable, re-routing) state diagram into `el`. */
export function mountState(
  el: HTMLElement,
  layout: StateLayout,
  theme: Theme,
  opts: InteractiveOptions = {},
): RuntimeHandle {
  return vnmRuntime(el, buildPayload(layout.model, theme, opts));
}
