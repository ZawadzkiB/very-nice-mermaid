/**
 * ASCII / unicode sequence renderer (FR4 — sequence is one of the two types
 * that read as box-art). Participant header boxes across the top, vertical
 * lifelines (`│`) down, and ordered horizontal message arrows with labels;
 * self-messages get a loop marker. Deterministic. `renderSequenceMarkdown`
 * wraps the result in a fenced code block for `md` output.
 */

import type { SequenceLayout, PositionedParticipant } from "../../model/sequence.js";

const G = {
  h: "─",
  hd: "╌", // dashed horizontal (dashed message)
  v: "│",
  tl: "┌",
  tr: "┐",
  bl: "└",
  br: "┘",
  right: "▶",
  left: "◀",
  self: "↺",
};

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
  text(x: number, y: number, str: string): void {
    for (let i = 0; i < str.length; i++) this.set(x + i, y, str[i]!);
  }
  toString(): string {
    return this.rows
      .map((r) => r.join("").replace(/\s+$/u, ""))
      .join("\n")
      .replace(/\n+$/u, "");
  }
}

/** Half-width (in chars) of a participant's header box. */
function halfWidth(p: PositionedParticipant): number {
  return Math.max(2, Math.ceil((oneLine(p.label).length + 1) / 2));
}

/** First line of a (possibly multi-line) label — ASCII rows are single-line. */
function oneLine(label: string): string {
  return label.split("\n")[0] ?? "";
}

/** Render a positioned sequence layout to unicode box-drawing text (no fence). */
export function renderSequenceAscii(layout: SequenceLayout): string {
  const parts = layout.participants;
  if (parts.length === 0) return "";

  // ---- column char positions ----
  const half = parts.map(halfWidth);
  const order = new Map<string, number>();
  parts.forEach((p, i) => order.set(p.id, i));

  // widest adjacent-pair message label sets the minimum column gap.
  const adjLabel = new Array<number>(Math.max(0, parts.length - 1)).fill(0);
  for (const m of layout.messages) {
    if (m.self) continue;
    const a = order.get(m.from);
    const b = order.get(m.to);
    if (a === undefined || b === undefined || Math.abs(a - b) !== 1) continue;
    adjLabel[Math.min(a, b)] = Math.max(adjLabel[Math.min(a, b)]!, oneLine(m.label).length);
  }

  const centers: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i === 0) {
      centers.push(half[0]!);
      continue;
    }
    const base = half[i - 1]! + half[i]! + 4;
    const gap = Math.max(base, adjLabel[i - 1]! + 4);
    centers.push(centers[i - 1]! + gap);
  }
  const rightPad = Math.max(...layout.messages.filter((m) => m.self).map(() => 12), 2);
  const cols = centers[centers.length - 1]! + half[half.length - 1]! + rightPad;

  // ---- row plan: top box (3) · spacer · 2 per message · spacer · bottom box (3) ----
  const HEADER = 3;
  const perMsg = 2;
  const topBoxRow = 0;
  const firstMsgRow = HEADER + 1;
  const msgRows = layout.messages.length * perMsg;
  const bottomBoxRow = firstMsgRow + msgRows + 1;
  const height = bottomBoxRow + HEADER;
  const grid = new Grid(cols, height);

  // ---- top + bottom participant boxes ----
  for (let i = 0; i < parts.length; i++) {
    drawBox(grid, centers[i]!, half[i]!, topBoxRow, oneLine(parts[i]!.label));
    drawBox(grid, centers[i]!, half[i]!, bottomBoxRow, oneLine(parts[i]!.label));
  }

  // ---- lifelines through every non-box row ----
  for (let r = HEADER; r < bottomBoxRow; r++) {
    for (let i = 0; i < parts.length; i++) grid.set(centers[i]!, r, G.v);
  }

  // ---- messages ----
  layout.messages.forEach((m, idx) => {
    const labelRow = firstMsgRow + idx * perMsg;
    const arrowRow = labelRow + 1;
    const a = order.get(m.from);
    const b = order.get(m.to);
    if (a === undefined || b === undefined) return;

    if (m.self) {
      const c = centers[a]!;
      const text = (m.label ? G.self + " " + oneLine(m.label) : G.self).trim();
      grid.text(c + 2, labelRow, text);
      grid.set(c, arrowRow, G.v);
      return;
    }

    const ca = centers[a]!;
    const cb = centers[b]!;
    const lo = Math.min(ca, cb);
    const hi = Math.max(ca, cb);
    const glyph = m.kind === "dashed" ? G.hd : G.h;
    for (let x = lo + 1; x < hi; x++) grid.set(x, arrowRow, glyph);
    if (m.arrowEnd) {
      if (cb > ca) grid.set(hi - 1, arrowRow, G.right);
      else grid.set(lo + 1, arrowRow, G.left);
    }
    // keep the endpoint lifelines visible
    grid.set(ca, arrowRow, G.v);
    grid.set(cb, arrowRow, G.v);

    // label centered above the arrow (over its own span), lifelines redrawn first
    if (m.label) {
      const label = oneLine(m.label);
      const mid = Math.round((ca + cb) / 2);
      const start = Math.max(lo + 1, mid - Math.floor(label.length / 2));
      grid.text(start, labelRow, label);
    }
  });

  return grid.toString();
}

/** Render sequence ASCII wrapped in a fenced code block (for `md` output). */
export function renderSequenceMarkdown(layout: SequenceLayout): string {
  return "```\n" + renderSequenceAscii(layout) + "\n```\n";
}

function drawBox(grid: Grid, center: number, half: number, topRow: number, label: string): void {
  const x1 = center - half;
  const x2 = center + half;
  const midRow = topRow + 1;
  grid.set(x1, topRow, G.tl);
  grid.set(x2, topRow, G.tr);
  grid.set(x1, topRow + 2, G.bl);
  grid.set(x2, topRow + 2, G.br);
  for (let x = x1 + 1; x < x2; x++) {
    grid.set(x, topRow, G.h);
    grid.set(x, topRow + 2, G.h);
  }
  grid.set(x1, midRow, G.v);
  grid.set(x2, midRow, G.v);
  const inner = x2 - x1 - 1;
  const shown = label.length > inner ? label.slice(0, Math.max(0, inner - 1)) + "…" : label;
  const start = x1 + 1 + Math.max(0, Math.floor((inner - shown.length) / 2));
  grid.text(start, midRow, shown);
}
