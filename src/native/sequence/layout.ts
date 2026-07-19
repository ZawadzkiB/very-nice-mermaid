/**
 * Our own deterministic sequence layout (FR2). Sequence has a bespoke ordered
 * layout — NOT dagre — so we own it entirely: participant boxes across the top,
 * lifelines straight down, messages as ordered horizontal arrows (self-messages
 * as right-side loops), all spaced from the theme's spacing/font tokens.
 *
 * Center-based geometry (`x`/`y` = center), matching the flowchart model and the
 * shared {@link contentBounds}. Pure + deterministic: same model + theme ⇒
 * identical output (no Date.now / Math.random).
 */

import type {
  SequenceModel,
  SequenceLayout,
  PositionedParticipant,
  PositionedMessage,
  PositionedActivation,
  MessageSemantic,
} from "../../model/sequence.js";
import type { Point } from "../../model/index.js";
import type { Theme } from "../../theme/index.js";
import { themes } from "../../theme/index.js";
import { contentBounds, type NodeBox } from "../../geometry/index.js";
import { typeLabel, messageSemantic, SEMANTIC_ORDER } from "./semantics.js";

export interface SequenceLayoutOptions {
  theme?: Theme;
}

/** Outer margin from the diagram edge to the first participant box. */
const MARGIN = 24;
/** Minimum participant box width. */
const MIN_BOX_W = 90;
/** Padding added around a message label when sizing a column gap / plate. */
const LABEL_PAD = 18;
/** Vertical distance a message label's plate rides above its line. */
const LABEL_RISE = 12;
/** Self-message loop extents. */
const SELF_LOOP_W = 40;
const SELF_LOOP_H = 30;
/** Bounds padding (matches the flowchart layout). */
const BOUNDS_PADDING = 20;

/** Rough text width in px for a label at the theme font size. */
function textWidth(label: string, fontSize: number): number {
  const longest = label.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
  return longest * fontSize * 0.6;
}

/** The label plate size for a message label (mirrors the SVG/edge-label plate). */
function labelBox(label: string, fontSize: number, lineHeight: number): { w: number; h: number } {
  const lines = label ? label.split("\n") : [];
  const w = label ? textWidth(label, fontSize) + 10 : 0;
  const h = label ? lines.length * lineHeight + 4 : 0;
  return { w, h };
}

/** Lay out a {@link SequenceModel} into positioned, themed geometry. */
export function layoutSequence(
  model: SequenceModel,
  opts: SequenceLayoutOptions = {},
): SequenceLayout {
  const theme = opts.theme ?? themes.light!;
  const t = theme.tokens;
  const fontSize = t.font.size;
  const lineHeight = t.font.lineHeight;
  // Archify: a two-line box (name + TYPE sub-label) when any participant has a recognized type.
  const types = model.participants.map((p) => typeLabel(p.label));
  const twoLine = types.some((ty) => ty !== "");
  const typeFont = fontSize - 2;
  const boxH = lineHeight * (twoLine ? 2 : 1) + t.spacing.nodePadY * 2;
  const rowPitch = Math.max(44, lineHeight * 2 + 8);
  const topGap = lineHeight + 12;
  const bottomGap = lineHeight + 8;
  const colSep = t.spacing.nodesep;

  const order = new Map<string, number>();
  model.participants.forEach((p, i) => order.set(p.id, i));

  // ---- participant box widths + horizontal positions ----
  const widths = model.participants.map((p, i) =>
    Math.max(
      MIN_BOX_W,
      textWidth(p.label, fontSize) + t.spacing.nodePadX * 2,
      textWidth(types[i]!, typeFont) + t.spacing.nodePadX * 2,
    ),
  );

  // widest adjacent-pair message label drives that column gap so the label fits.
  const adjacentLabel = new Array<number>(Math.max(0, widths.length - 1)).fill(0);
  for (const m of model.messages) {
    if (m.self) continue;
    const a = order.get(m.from);
    const b = order.get(m.to);
    if (a === undefined || b === undefined) continue;
    if (Math.abs(a - b) !== 1) continue; // adjacent columns only
    const gap = Math.min(a, b);
    const need = textWidth(m.label, fontSize) + LABEL_PAD;
    adjacentLabel[gap] = Math.max(adjacentLabel[gap]!, need);
  }

  const xs: number[] = [];
  for (let i = 0; i < widths.length; i++) {
    if (i === 0) {
      xs.push(MARGIN + widths[0]! / 2);
      continue;
    }
    const base = widths[i - 1]! / 2 + widths[i]! / 2 + colSep;
    const gap = Math.max(base, adjacentLabel[i - 1]!);
    xs.push(xs[i - 1]! + gap);
  }

  const boxTop = MARGIN + boxH / 2;
  const lifelineTop = boxTop + boxH / 2;

  const participants: PositionedParticipant[] = model.participants.map((p, i) => ({
    ...p,
    x: xs[i]!,
    width: widths[i]!,
    height: boxH,
    type: types[i] || undefined,
  }));

  // ---- ordered messages down the lifelines ----
  const messages: PositionedMessage[] = [];
  let y = lifelineTop + topGap;
  let lastBottom = lifelineTop;
  for (const m of model.messages) {
    const fromI = order.get(m.from);
    const toI = order.get(m.to);
    if (fromI === undefined || toI === undefined) continue;
    const fromX = xs[fromI]!;
    const semantic = messageSemantic(m.kind, m.label);
    if (m.self) {
      const toX = fromX;
      messages.push({
        ...m,
        semantic,
        y,
        fromX,
        toX,
        loopWidth: SELF_LOOP_W,
        loopHeight: SELF_LOOP_H,
        labelX: fromX + SELF_LOOP_W + 8 + labelBox(m.label, fontSize, lineHeight).w / 2,
        labelY: y + SELF_LOOP_H / 2,
      });
      lastBottom = y + SELF_LOOP_H;
      y += SELF_LOOP_H + rowPitch - lineHeight;
    } else {
      const toX = xs[toI]!;
      messages.push({
        ...m,
        semantic,
        y,
        fromX,
        toX,
        labelX: (fromX + toX) / 2,
        labelY: y - LABEL_RISE,
      });
      lastBottom = y;
      y += rowPitch;
    }
  }

  const lifelineBottom = lastBottom + bottomGap;
  const boxBottom = lifelineBottom + boxH / 2;

  // ---- activation bars: from message order (activate) to message order (deactivate) ----
  const ACTIVATION_W = 10;
  const byOrder = new Map(messages.map((m) => [m.order, m]));
  const activations: PositionedActivation[] = (model.activations ?? []).map((a) => {
    const pi = order.get(a.participant);
    const px = pi !== undefined ? xs[pi]! : 0;
    const sm = byOrder.get(a.startOrder);
    const em = byOrder.get(a.endOrder);
    const startY = sm ? sm.y : lifelineTop;
    const endY = em ? (em.self && em.loopHeight ? em.y + em.loopHeight : em.y) : lifelineBottom;
    return {
      participant: a.participant,
      x: px + a.depth * (ACTIVATION_W - 3),
      width: ACTIVATION_W,
      startY,
      endY: Math.max(endY, startY + 10),
    };
  });

  // ---- legend of the message semantics actually used (archify) ----
  const used = new Set(messages.map((m) => m.semantic));
  const legend: MessageSemantic[] = SEMANTIC_ORDER.filter((s) => used.has(s));
  const legendH = legend.length ? lineHeight + 6 : 0;
  const legendY = boxBottom + boxH / 2 + 22 + legendH / 2;

  // ---- bounds over both box rows + message extents + labels ----
  const boxes: NodeBox[] = [];
  for (const p of participants) {
    boxes.push({ x: p.x, y: boxTop, width: p.width, height: boxH });
    boxes.push({ x: p.x, y: boxBottom, width: p.width, height: boxH });
  }
  const extra: Point[] = [];
  for (const m of messages) {
    extra.push({ x: m.fromX, y: m.y }, { x: m.toX, y: m.y });
    const lb = labelBox(m.label, fontSize, lineHeight);
    if (lb.w > 0) {
      extra.push(
        { x: m.labelX - lb.w / 2, y: m.labelY - lb.h / 2 },
        { x: m.labelX + lb.w / 2, y: m.labelY + lb.h / 2 },
      );
    }
    if (m.self && m.loopWidth && m.loopHeight) {
      extra.push({ x: m.fromX + m.loopWidth, y: m.y + m.loopHeight });
    }
  }
  // Reserve space for the legend row so it never clips.
  if (legend.length) {
    const legendLeft = xs[0]! - widths[0]! / 2;
    extra.push({ x: legendLeft, y: legendY - legendH / 2 }, { x: legendLeft + legend.length * 132, y: legendY + legendH / 2 });
  }
  const bounds = contentBounds(boxes, extra, BOUNDS_PADDING);

  return {
    kind: "sequence-layout",
    participants,
    messages,
    boxTop,
    boxBottom,
    lifelineTop,
    lifelineBottom,
    activations,
    legend,
    legendY,
    bounds,
  };
}
