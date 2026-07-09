/**
 * The interactive renderer entry point.
 *
 * `mount(el, dsl, opts)` returns a handle **synchronously**. For a flowchart DSL
 * or an already-built layout/model it renders immediately (the sync own-parser
 * fast path). For a raw **non-flowchart** string (sequence / class / state, or a
 * mermaid.js fallback type) it routes through `detectType` — which needs mermaid
 * + a DOM — so rendering finishes **asynchronously** and swaps into `el` when
 * ready; the returned handle forwards to the real one once it settles. Use
 * {@link mountAsync} directly when you want to `await` the finished handle.
 */

import { prepare, type RenderInput } from "../prepare.js";
import type { Theme, PartialTokenSet } from "../../theme/index.js";
import {
  vnmRuntime,
  type RuntimeHandle,
  type RuntimeTheme,
  type LayoutData,
} from "./runtime.js";
import { buildPayload, type InteractiveOptions } from "./payload.js";
import { seqRuntime, type SeqRuntimeHandle, type SeqRuntimePayload } from "./seq-runtime.js";
import { isClassLayout, type ClassLayout } from "../../model/class.js";
import { isStateLayout, type StateLayout } from "../../model/state.js";
import { isSequenceLayout, type SequenceLayout } from "../../model/sequence.js";
import { resolveTheme } from "../../theme/index.js";
import { classify, explicitNonFlowchartType } from "../../mermaid/router.js";
import { renderFallbackSvg } from "../../mermaid/fallback.js";
import { readSequenceModel, layoutSequence, mountSequence } from "../../native/sequence/index.js";
import { readClassModel, layoutClass, mountClass } from "../../native/class/index.js";
import { readStateModel, layoutState, mountState } from "../../native/state/index.js";

export interface MountOptions extends InteractiveOptions {
  theme?: string | Theme | PartialTokenSet;
  strict?: boolean;
}

/** A handle from any tier — the draggable flowchart runtime or the pan/zoom shell. */
export type AnyRuntimeHandle = RuntimeHandle | SeqRuntimeHandle;

type MountInput = RenderInput | ClassLayout | StateLayout | SequenceLayout;

/**
 * Mount an interactive diagram into `el` and return a handle
 * (`fit`, `zoomIn/Out`, `exportLayout`, `importLayout`, `setTheme`, `destroy`).
 * Returns synchronously; a non-flowchart string finishes rendering async (see the
 * module doc). Prefer {@link mountAsync} when you need the settled handle.
 *
 * Note: the flowchart/class/state interactive renderer draws every node as a
 * **rounded card** (only the corner radius varies); full shape silhouettes
 * (diamond, hexagon, …) and per-type UML relation markers are drawn by the static
 * `renderSvg` / PNG output.
 */
export function mount(el: HTMLElement, dsl: MountInput, opts: MountOptions = {}): RuntimeHandle {
  // Already-built class/state layouts carry a flowchart PositionedModel — mount
  // them through the same vnmRuntime (full draggable nodes + live edge re-routing).
  if (isClassLayout(dsl) || isStateLayout(dsl)) {
    return vnmRuntime(el, buildPayload(dsl.model, resolveTheme(opts.theme), opts));
  }
  // A pre-built sequence layout mounts into the pan/zoom shell; wrap so the
  // static return type stays RuntimeHandle.
  if (isSequenceLayout(dsl)) {
    const deferred = new DeferredHandle(el);
    deferred._settle(mountSequence(el, dsl, resolveTheme(opts.theme), opts));
    return deferred;
  }
  // A raw non-flowchart string must be routed through detectType (async). Return
  // a deferred handle now and settle it when the real render lands.
  if (typeof dsl === "string" && explicitNonFlowchartType(dsl)) {
    const deferred = new DeferredHandle(el);
    void mountAsync(el, dsl, opts).then(
      (h) => deferred._settle(h),
      (err) => deferred._fail(err),
    );
    return deferred;
  }
  // A flowchart string (or a header-less one) → the sync own-parser fast path.
  const { model, theme } = prepare(dsl, { theme: opts.theme, strict: opts.strict });
  return vnmRuntime(el, buildPayload(model, theme, opts));
}

/**
 * Async, type-routed mount — the library twin of the CLI's dispatch. Resolves
 * with the settled handle once the diagram is rendered into `el`. Flowchart and
 * pre-built layouts resolve without loading mermaid; sequence/class/state and the
 * fallback tier load mermaid lazily.
 */
export async function mountAsync(
  el: HTMLElement,
  dsl: MountInput,
  opts: MountOptions = {},
): Promise<AnyRuntimeHandle> {
  const theme = resolveTheme(opts.theme);
  if (isClassLayout(dsl)) return mountClass(el, dsl, theme, opts);
  if (isStateLayout(dsl)) return mountState(el, dsl, theme, opts);
  if (isSequenceLayout(dsl)) return mountSequence(el, dsl, theme, opts);
  if (typeof dsl !== "string") {
    const { model } = prepare(dsl, { theme: opts.theme, strict: opts.strict });
    return vnmRuntime(el, buildPayload(model, theme, opts));
  }

  const c = await classify(dsl);
  switch (c.renderer) {
    case "flowchart": {
      const { model } = prepare(dsl, { theme: opts.theme, strict: opts.strict });
      return vnmRuntime(el, buildPayload(model, theme, opts));
    }
    case "sequence":
      return mountSequence(el, layoutSequence(await readSequenceModel(dsl), { theme }), theme, opts);
    case "class":
      return mountClass(el, layoutClass(await readClassModel(dsl), { theme }), theme, opts);
    case "state":
      return mountState(el, layoutState(await readStateModel(dsl), { theme }), theme, opts);
    default: {
      // Sketch isn't supported for the mermaid.js fallback tier — surface the drop
      // to library/element callers instead of silently ignoring it (REV-003).
      if (opts.style === "sketch" && typeof console !== "undefined" && console.warn) {
        console.warn(
          `very-nice-mermaid: --style sketch is not supported for the mermaid.js fallback tier ('${c.detected ?? c.type}'); rendering in its normal style.`,
        );
      }
      const { svg } = await renderFallbackSvg(dsl, { theme, detected: c.detected ?? c.type });
      return mountFallback(el, svg, theme, opts);
    }
  }
}

/** Content size of a mermaid SVG (from its viewBox, then width/height). */
function svgContentSize(svg: string): { width: number; height: number } {
  const vb = /viewBox="\s*-?[\d.]+\s+-?[\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(svg);
  if (vb) return { width: parseFloat(vb[1]!), height: parseFloat(vb[2]!) };
  const w = /\bwidth="([\d.]+)/.exec(svg);
  const h = /\bheight="([\d.]+)/.exec(svg);
  return { width: w ? parseFloat(w[1]!) : 800, height: h ? parseFloat(h[1]!) : 600 };
}

/** Wrap a fallback (mermaid) SVG in the shared pan/zoom/fit shell (FR3). */
function mountFallback(
  el: HTMLElement,
  svg: string,
  theme: Theme,
  opts: MountOptions,
): SeqRuntimeHandle {
  const size = svgContentSize(svg);
  const payload: SeqRuntimePayload = {
    svg,
    cssVars: theme.cssVars(),
    bg: theme.tokens.colors.background,
    content: size,
    minimap: {
      boxes: [],
      lines: [],
      accent: theme.tokens.colors.accent,
      viewport: theme.tokens.colors.minimapViewport,
    },
    options: {
      fitPadding: opts.fitPadding ?? theme.tokens.spacing.fitPadding,
      minimap: false, // the fallback SVG is opaque to us — no structural minimap
      minScale: opts.minScale ?? 0.2,
      maxScale: opts.maxScale ?? 4,
    },
  };
  return seqRuntime(el, payload);
}

/**
 * A {@link RuntimeHandle}-shaped proxy for the async `mount()` path: it is
 * returned immediately and forwards every call to the real handle once it
 * settles (queuing an `importLayout`/`setTheme` issued before then). Methods the
 * settled handle doesn't have (a sequence/fallback shell has no layout
 * export/import) become safe no-ops.
 */
class DeferredHandle implements RuntimeHandle {
  root: HTMLElement;
  private real: AnyRuntimeHandle | null = null;
  private destroyed = false;
  private pendingImport: LayoutData | null = null;
  private pendingTheme: { theme: RuntimeTheme; cssVars: string } | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  _settle(real: AnyRuntimeHandle): void {
    if (this.destroyed) {
      real.destroy();
      return;
    }
    this.real = real;
    if (this.pendingImport && "importLayout" in real) real.importLayout(this.pendingImport);
    if (this.pendingTheme && "setTheme" in real) {
      real.setTheme(this.pendingTheme.theme, this.pendingTheme.cssVars);
    }
    this.pendingImport = null;
    this.pendingTheme = null;
  }

  _fail(err: unknown): void {
    // The render genuinely failed (e.g. a degenerate fallback under jsdom). Surface
    // it without throwing across the async boundary; the DOM is left untouched.
    if (typeof console !== "undefined") console.error("very-nice-mermaid:", (err as Error)?.message ?? err);
  }

  destroy(): void {
    this.destroyed = true;
    this.real?.destroy();
  }
  fit(): void {
    this.real?.fit();
  }
  zoomIn(): void {
    this.real?.zoomIn();
  }
  zoomOut(): void {
    this.real?.zoomOut();
  }
  resetView(): void {
    this.real?.resetView();
  }
  resetLayout(): void {
    const r = this.real;
    if (r && "resetLayout" in r) r.resetLayout();
  }
  exportLayout(): LayoutData {
    const r = this.real;
    return r && "exportLayout" in r ? r.exportLayout() : { version: 1, positions: {} };
  }
  importLayout(data: LayoutData): void {
    const r = this.real;
    if (r && "importLayout" in r) r.importLayout(data);
    else this.pendingImport = data;
  }
  setTheme(theme: RuntimeTheme, cssVars: string): void {
    const r = this.real;
    if (r && "setTheme" in r) r.setTheme(theme, cssVars);
    else this.pendingTheme = { theme, cssVars };
  }
  getPositions(): Record<string, { x: number; y: number }> {
    const r = this.real;
    return r && "getPositions" in r ? r.getPositions() : {};
  }
  toSvgString(): string {
    const r = this.real;
    return r && "toSvgString" in r ? r.toSvgString() : "";
  }
}

export type { RuntimeHandle, LayoutData } from "./runtime.js";
