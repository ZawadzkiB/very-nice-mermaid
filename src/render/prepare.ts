/**
 * Normalize any renderer input (DSL string, parsed model, or already-positioned
 * model) into a {@link PositionedModel}, running parse/layout as needed.
 */

import { parse } from "../parser/index.js";
import { layout } from "../layout/index.js";
import { isPositionedModel, type DiagramModel, type PositionedModel } from "../model/index.js";
import { resolveTheme, type Theme, type PartialTokenSet } from "../theme/index.js";
import { explicitNonFlowchartType } from "../mermaid/router.js";

export type RenderInput = string | DiagramModel | PositionedModel;

export interface PrepareOptions {
  theme?: string | Theme | PartialTokenSet;
  strict?: boolean;
  /** Edge-crossing bridges (FR7 / D4); forwarded to `layout()`. */
  bridges?: boolean;
}

export interface Prepared {
  model: PositionedModel;
  theme: Theme;
}

/**
 * Guard the **synchronous** renderer surface (`renderSvg`/`renderHtml`/
 * `renderAscii`/`renderMarkdown`/`mount`, which drive the v1 flowchart parser):
 * a raw string that declares an explicit non-flowchart type (sequence, class,
 * state, pie, gantt, …) cannot be rendered synchronously — sequence/class/state
 * are re-skinned from an async mermaid read, and everything else takes the async
 * mermaid.js fallback. Rather than silently misparse it into a garbage flowchart
 * (the historical FR1 bug), throw a clear error pointing at the async API.
 */
export function ensureSyncRenderable(input: RenderInput, asyncApi: string): void {
  if (typeof input !== "string") return;
  const type = explicitNonFlowchartType(input);
  if (type) {
    throw new Error(
      `very-nice-mermaid: '${type}' is not a flowchart, so it cannot be rendered by the ` +
        `synchronous API. Use the async \`${asyncApi}(dsl)\` (renders sequence/class/state ` +
        `natively and other types via the mermaid.js fallback), or \`mount()\` / the ` +
        `<very-nice-mermaid> element, which route every diagram type.`,
    );
  }
}

/** Resolve `{ model, theme }` from mixed input. */
export function prepare(input: RenderInput, opts: PrepareOptions = {}): Prepared {
  const theme = resolveTheme(opts.theme);
  if (typeof input === "string") {
    return { model: layout(parse(input, { strict: opts.strict }), { theme, bridges: opts.bridges }), theme };
  }
  if (isPositionedModel(input)) {
    return { model: input, theme };
  }
  return { model: layout(input, { theme, bridges: opts.bridges }), theme };
}
