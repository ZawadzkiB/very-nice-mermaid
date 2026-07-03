/**
 * Deterministic node sizing. No DOM text metrics are available in Node, so we
 * estimate from the font size (monospace-ish advance) and pad per shape. Layout
 * and every renderer read the same `width`/`height`, so sizes stay consistent.
 */

import type { DiagramNode } from "../model/index.js";
import type { Theme } from "../theme/index.js";

export interface Size {
  width: number;
  height: number;
}

const MIN_WIDTH = 56;
const MIN_HEIGHT = 38;

/** Estimate a node's rendered box size from its label + shape + theme font. */
export function measureNode(node: DiagramNode, theme: Theme): Size {
  const t = theme.tokens;
  const lines = node.label.length ? node.label.split("\n") : [""];
  const charW = t.font.size * 0.62;
  const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
  let width = Math.ceil(maxChars * charW) + t.spacing.nodePadX * 2;
  let height = lines.length * t.font.lineHeight + t.spacing.nodePadY * 2;
  width = Math.max(width, MIN_WIDTH);
  height = Math.max(height, MIN_HEIGHT);

  switch (node.shape) {
    case "circle": {
      const d = Math.round(Math.max(width, height) * 1.15);
      return { width: d, height: d };
    }
    case "diamond":
      return { width: Math.round(width * 1.4), height: Math.round(height * 1.5) };
    case "hexagon":
      return { width: Math.round(width + height * 0.6), height };
    case "parallelogram":
    case "parallelogram-alt":
      return { width: Math.round(width + height * 0.5), height };
    case "cylinder":
      return { width, height: height + 12 };
    case "stadium":
      return { width: Math.round(width + height * 0.4), height };
    default:
      return { width, height };
  }
}
