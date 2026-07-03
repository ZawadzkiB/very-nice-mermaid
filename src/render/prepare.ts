/**
 * Normalize any renderer input (DSL string, parsed model, or already-positioned
 * model) into a {@link PositionedModel}, running parse/layout as needed.
 */

import { parse } from "../parser/index.js";
import { layout } from "../layout/index.js";
import { isPositionedModel, type DiagramModel, type PositionedModel } from "../model/index.js";
import { resolveTheme, type Theme, type PartialTokenSet } from "../theme/index.js";

export type RenderInput = string | DiagramModel | PositionedModel;

export interface PrepareOptions {
  theme?: string | Theme | PartialTokenSet;
  strict?: boolean;
}

export interface Prepared {
  model: PositionedModel;
  theme: Theme;
}

/** Resolve `{ model, theme }` from mixed input. */
export function prepare(input: RenderInput, opts: PrepareOptions = {}): Prepared {
  const theme = resolveTheme(opts.theme);
  if (typeof input === "string") {
    return { model: layout(parse(input, { strict: opts.strict }), { theme }), theme };
  }
  if (isPositionedModel(input)) {
    return { model: input, theme };
  }
  return { model: layout(input, { theme }), theme };
}
