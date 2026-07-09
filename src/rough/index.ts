/**
 * Deterministic "rough" (hand-drawn) geometry — the sketch-style engine.
 *
 * Pure + framework-free: given a shape's clean vertices (or an edge's routed
 * polyline) plus a **stable string key**, it emits wobbly SVG path `d` strings
 * that are **byte-identical for the same input**. There is NO `Date.now` /
 * `Math.random` (snapshots + the dom-runtime parity guard depend on it — the
 * jitter is seeded from the key, per D4/FR5).
 *
 * The SAME algorithm is mirrored, self-contained, inside `vnmRuntime`
 * (src/render/dom/runtime.ts) so the interactive / exported-HTML view matches
 * the static SVG; the `dom-runtime-parity` test byte-compares the two. **If you
 * change a function here, change its twin there** (search `ROUGH-PARITY`).
 *
 * Browser-safe: pure math + string, no Node/DOM, no imports.
 */

export type Pt = [number, number];

/** Sketch look constants — one tasteful default (per plan out-of-scope: no knobs). */
export const SKETCH = {
  /** Outline vertex jitter amplitude (px). */
  roughness: 2.4,
  /** How far a segment bows at its midpoint (px). */
  bowing: 2.2,
  /** Overlaid outline strokes per shape (the multi-stroke wobble). */
  outlineStrokes: 2,
  /** Polyline steps approximating an ellipse outline. */
  ellipseSteps: 22,
  /** Fill uses a single softened stroke under the outline. */
  fillRoughness: 1.2,
} as const;

/** Round to 2 decimals — matches geometry.n() / runtime.nAt() for parity. */
function rn(v: number): number {
  return Math.round(v * 100) / 100;
}

/** FNV-1a 32-bit hash of a key → a stable seed (identical in Node + browser). */
export function roughSeed(key: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 PRNG — deterministic [0,1); pure integer math (parity-safe). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ROUGH-PARITY: one wobbly stroke through `pts` (jittered vertices + bowed
 *  quadratic segments). `closed` loops back to the first point and appends `Z`. */
function strokePath(pts: Pt[], closed: boolean, rand: () => number, rough: number, bow: number): string {
  if (pts.length === 0) return "";
  const jv: Pt[] = pts.map(([x, y]) => [x + (rand() * 2 - 1) * rough, y + (rand() * 2 - 1) * rough]);
  const seq: Pt[] = closed ? [...jv, jv[0]!] : jv;
  let d = "M " + rn(seq[0]![0]) + " " + rn(seq[0]![1]);
  for (let i = 1; i < seq.length; i++) {
    const ax = seq[i - 1]![0];
    const ay = seq[i - 1]![1];
    const bx = seq[i]![0];
    const by = seq[i]![1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const px = -(by - ay) / len;
    const py = (bx - ax) / len;
    const k = (rand() * 2 - 1) * bow;
    const cx = (ax + bx) / 2 + px * k;
    const cy = (ay + by) / 2 + py * k;
    d += " Q " + rn(cx) + " " + rn(cy) + " " + rn(bx) + " " + rn(by);
  }
  if (closed) d += " Z";
  return d;
}

/** Rough paths for a CLOSED shape: one soft fill stroke + N overlaid outlines. */
export function roughShape(pts: Pt[], key: string): { fill: string; outline: string[] } {
  const fill = strokePath(pts, true, mulberry32(roughSeed(key + "#f")), SKETCH.fillRoughness, SKETCH.bowing);
  const outline: string[] = [];
  for (let s = 0; s < SKETCH.outlineStrokes; s++) {
    outline.push(strokePath(pts, true, mulberry32(roughSeed(key + "#o" + s)), SKETCH.roughness, SKETCH.bowing));
  }
  return { fill, outline };
}

/** Sample an ellipse outline as a closed polyline (deterministic step count). */
export function ellipsePoints(cx: number, cy: number, rx: number, ry: number): Pt[] {
  const steps = SKETCH.ellipseSteps;
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

/** Rough paths for an ellipse (circle shape) — reuses {@link roughShape}. */
export function roughEllipse(cx: number, cy: number, rx: number, ry: number, key: string): { fill: string; outline: string[] } {
  return roughShape(ellipsePoints(cx, cy, rx, ry), key);
}

/** Rough OPEN polyline (an edge): N overlaid wobbly strokes (no fill, no close). */
export function roughPolyline(pts: Pt[], key: string): string[] {
  const out: string[] = [];
  for (let s = 0; s < SKETCH.outlineStrokes; s++) {
    out.push(strokePath(pts, false, mulberry32(roughSeed(key + "#e" + s)), SKETCH.roughness * 0.8, SKETCH.bowing * 0.8));
  }
  return out;
}

/** ROUGH-PARITY: an open, hand-drawn arrowhead (`V`) at `tip`, pointing away
 *  from `from`. Two slightly-uneven barbs; `size` is the theme arrow size. */
export function openArrowhead(tip: Pt, from: Pt, size: number, key: string): string {
  const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const r = mulberry32(roughSeed(key + "#a"));
  const spread = 0.52; // ~30deg
  const len = size * 2.1;
  const a1 = ang + Math.PI - spread + (r() * 2 - 1) * 0.12;
  const a2 = ang + Math.PI + spread + (r() * 2 - 1) * 0.12;
  const l1 = len * (1 + (r() * 2 - 1) * 0.14);
  const l2 = len * (1 + (r() * 2 - 1) * 0.14);
  const b1x = tip[0] + Math.cos(a1) * l1;
  const b1y = tip[1] + Math.sin(a1) * l1;
  const b2x = tip[0] + Math.cos(a2) * l2;
  const b2y = tip[1] + Math.sin(a2) * l2;
  return "M " + rn(b1x) + " " + rn(b1y) + " L " + rn(tip[0]) + " " + rn(tip[1]) + " L " + rn(b2x) + " " + rn(b2y);
}
