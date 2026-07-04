/**
 * ASCII / unicode box-drawing renderer of the positioned model. Snaps node
 * boxes to a character grid and draws orthogonal connectors with box-drawing
 * glyphs. Deterministic. For `md` output, wrap the result in a fenced block via
 * {@link renderMarkdown}.
 */

import type { PositionedModel, PositionedNode, Point } from "../model/index.js";
import { prepare, type RenderInput, type PrepareOptions } from "./prepare.js";
import { isSequenceLayout, type SequenceLayout } from "../model/sequence.js";
import { renderSequenceAscii, renderSequenceMarkdown } from "../native/sequence/ascii.js";

export interface AsciiOptions extends PrepareOptions {
  /** Characters per model unit on x (default auto from spacing). */
  scaleX?: number;
  scaleY?: number;
}

/** Box-drawing glyphs. */
const G = {
  h: "─",
  v: "│",
  tl: "┌",
  tr: "┐",
  bl: "└",
  br: "┘",
  cross: "┼",
  arrowDown: "▼",
  arrowUp: "▲",
  arrowRight: "▶",
  arrowLeft: "◀",
};

const CORNERS = new Set([G.tl, G.tr, G.bl, G.br]);

/** The corner glyph joining a vertical arm (`up`/`down`) to a horizontal arm. */
function cornerGlyph(vert: "up" | "down", horiz: "left" | "right"): string {
  if (vert === "up") return horiz === "right" ? G.bl : G.br; // └ ┘
  return horiz === "right" ? G.tl : G.tr; // ┌ ┐
}

class Grid {
  private rows: string[][] = [];
  constructor(
    readonly cols: number,
    readonly height: number,
  ) {
    for (let r = 0; r < height; r++) this.rows.push(new Array<string>(cols).fill(" "));
  }
  set(x: number, y: number, ch: string): void {
    if (y < 0 || y >= this.height || x < 0 || x >= this.cols) return;
    this.rows[y]![x] = ch;
  }
  get(x: number, y: number): string {
    if (y < 0 || y >= this.height || x < 0 || x >= this.cols) return " ";
    return this.rows[y]![x]!;
  }
  /** Draw a line char, merging with any existing perpendicular line. */
  line(x: number, y: number, ch: string): void {
    const cur = this.get(x, y);
    if (cur === " " || cur === ch) {
      this.set(x, y, ch);
      return;
    }
    // crossing lines become a cross
    if ((cur === G.h && ch === G.v) || (cur === G.v && ch === G.h)) {
      this.set(x, y, G.cross);
      return;
    }
    this.set(x, y, ch);
  }
  /**
   * Place an elbow corner glyph. On an empty cell it draws the corner; where a
   * different edge's line/corner already runs it becomes a genuine crossing
   * (`┼`) instead of masquerading as a clean turn.
   */
  corner(x: number, y: number, ch: string): void {
    const cur = this.get(x, y);
    if (cur === " " || cur === ch) {
      this.set(x, y, ch);
      return;
    }
    if (cur === G.h || cur === G.v || cur === G.cross || CORNERS.has(cur)) {
      this.set(x, y, G.cross);
      return;
    }
    this.set(x, y, ch);
  }
  text(x: number, y: number, str: string): void {
    for (let i = 0; i < str.length; i++) this.set(x + i, y, str[i]!);
  }
  toString(): string {
    return this.rows.map((r) => r.join("").replace(/\s+$/u, "")).join("\n").replace(/\n+$/u, "");
  }
}

/** Render a diagram to unicode box-drawing text (no fence). */
export function renderAscii(input: RenderInput | SequenceLayout, opts: AsciiOptions = {}): string {
  if (isSequenceLayout(input)) return renderSequenceAscii(input);
  const { model } = prepare(input, opts);
  if (model.nodes.length === 0) return "";
  return draw(model, opts);
}

/** Render ASCII wrapped in a fenced code block (for `md` output). */
export function renderMarkdown(input: RenderInput | SequenceLayout, opts: AsciiOptions = {}): string {
  if (isSequenceLayout(input)) return renderSequenceMarkdown(input);
  return "```\n" + renderAscii(input, opts) + "\n```\n";
}

function draw(model: PositionedModel, opts: AsciiOptions): string {
  const b = model.bounds;
  // Map model coords → grid cells. Pick scales so the smallest node reads well.
  const minW = Math.min(...model.nodes.map((nn) => nn.width));
  const minH = Math.min(...model.nodes.map((nn) => nn.height));
  const scaleX = opts.scaleX ?? Math.max(0.06, 12 / Math.max(minW, 1));
  const scaleY = opts.scaleY ?? Math.max(0.03, 4 / Math.max(minH, 1));

  const gx = (x: number) => Math.round((x - b.x) * scaleX);
  const gy = (y: number) => Math.round((y - b.y) * scaleY);

  const cols = gx(b.x + b.width) + 2;
  const rows = gy(b.y + b.height) + 2;
  const grid = new Grid(Math.max(cols, 4), Math.max(rows, 4));

  const cells = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();
  for (const node of model.nodes) {
    const box = boxCells(node, gx, gy);
    cells.set(node.id, box);
  }

  // edges first (so boxes sit on top of connectors)
  for (const edge of model.edges) {
    const from = cells.get(edge.from);
    const to = cells.get(edge.to);
    if (!from || !to) continue;
    connect(grid, from, to, edge.arrows.end, edge.arrows.start);
  }

  // boxes
  for (const node of model.nodes) {
    const box = cells.get(node.id)!;
    drawBox(grid, box, node.label.split("\n")[0] ?? node.id);
  }

  return grid.toString();
}

function boxCells(
  node: PositionedNode,
  gx: (x: number) => number,
  gy: (y: number) => number,
): { x1: number; y1: number; x2: number; y2: number } {
  const label = (node.label.split("\n")[0] ?? node.id) || node.id;
  const cx = gx(node.x);
  const cy = gy(node.y);
  const halfW = Math.max(2, Math.ceil(label.length / 2) + 1);
  return { x1: cx - halfW, y1: cy - 1, x2: cx + halfW, y2: cy + 1 };
}

function drawBox(
  grid: Grid,
  box: { x1: number; y1: number; x2: number; y2: number },
  label: string,
): void {
  const { x1, y1, x2, y2 } = box;
  grid.set(x1, y1, G.tl);
  grid.set(x2, y1, G.tr);
  grid.set(x1, y2, G.bl);
  grid.set(x2, y2, G.br);
  for (let x = x1 + 1; x < x2; x++) {
    grid.set(x, y1, G.h);
    grid.set(x, y2, G.h);
  }
  for (let y = y1 + 1; y < y2; y++) {
    grid.set(x1, y, G.v);
    grid.set(x2, y, G.v);
  }
  const inner = x2 - x1 - 1;
  const label2 = label.length > inner ? label.slice(0, Math.max(0, inner - 1)) + "…" : label;
  const start = x1 + 1 + Math.max(0, Math.floor((inner - label2.length) / 2));
  const midY = Math.round((y1 + y2) / 2);
  // clear interior of the mid row then write label
  for (let x = x1 + 1; x < x2; x++) grid.set(x, midY, " ");
  grid.text(start, midY, label2);
}

function center(box: { x1: number; y1: number; x2: number; y2: number }): Point {
  return { x: Math.round((box.x1 + box.x2) / 2), y: Math.round((box.y1 + box.y2) / 2) };
}

function connect(
  grid: Grid,
  from: { x1: number; y1: number; x2: number; y2: number },
  to: { x1: number; y1: number; x2: number; y2: number },
  arrowEnd: boolean,
  arrowStart: boolean,
): void {
  const a = center(from);
  const c = center(to);
  const dx = c.x - a.x;
  const dy = c.y - a.y;

  if (Math.abs(dy) >= Math.abs(dx)) {
    // vertical-dominant: exit top/bottom, elbow, enter
    const startY = dy >= 0 ? from.y2 + 1 : from.y1 - 1;
    const endY = dy >= 0 ? to.y1 - 1 : to.y2 + 1;
    const midY = Math.round((startY + endY) / 2);
    const turns = a.x !== c.x;
    // Leave the two elbow joints for the corner glyphs so the edge's own turn
    // isn't drawn as a `┼` crossing (that glyph is reserved for two edges).
    for (let y = Math.min(startY, midY); y <= Math.max(startY, midY); y++) {
      if (turns && y === midY) continue;
      grid.line(a.x, y, G.v);
    }
    for (let x = Math.min(a.x, c.x); x <= Math.max(a.x, c.x); x++) {
      if (turns && (x === a.x || x === c.x)) continue;
      grid.line(x, midY, G.h);
    }
    for (let y = Math.min(midY, endY); y <= Math.max(midY, endY); y++) {
      if (turns && y === midY) continue;
      grid.line(c.x, y, G.v);
    }
    if (turns) {
      const vertA = dy >= 0 ? "up" : "down"; // the source arm is above the joint when going down
      grid.corner(a.x, midY, cornerGlyph(vertA, c.x > a.x ? "right" : "left"));
      const vertC = dy >= 0 ? "down" : "up"; // the target arm continues past the joint
      grid.corner(c.x, midY, cornerGlyph(vertC, a.x > c.x ? "right" : "left"));
    }
    if (arrowEnd) grid.set(c.x, endY, dy >= 0 ? G.arrowDown : G.arrowUp);
    if (arrowStart) grid.set(a.x, startY, dy >= 0 ? G.arrowUp : G.arrowDown);
  } else {
    // horizontal-dominant
    const startX = dx >= 0 ? from.x2 + 1 : from.x1 - 1;
    const endX = dx >= 0 ? to.x1 - 1 : to.x2 + 1;
    const midX = Math.round((startX + endX) / 2);
    const turns = a.y !== c.y;
    for (let x = Math.min(startX, midX); x <= Math.max(startX, midX); x++) {
      if (turns && x === midX) continue;
      grid.line(x, a.y, G.h);
    }
    for (let y = Math.min(a.y, c.y); y <= Math.max(a.y, c.y); y++) {
      if (turns && (y === a.y || y === c.y)) continue;
      grid.line(midX, y, G.v);
    }
    for (let x = Math.min(midX, endX); x <= Math.max(midX, endX); x++) {
      if (turns && x === midX) continue;
      grid.line(x, c.y, G.h);
    }
    if (turns) {
      grid.corner(midX, a.y, cornerGlyph(c.y > a.y ? "down" : "up", startX < midX ? "left" : "right"));
      grid.corner(midX, c.y, cornerGlyph(a.y > c.y ? "down" : "up", endX > midX ? "right" : "left"));
    }
    if (arrowEnd) grid.set(endX, c.y, dx >= 0 ? G.arrowRight : G.arrowLeft);
    if (arrowStart) grid.set(startX, a.y, dx >= 0 ? G.arrowLeft : G.arrowRight);
  }
}
