/**
 * The interactive renderer runtime — a **fully self-contained** function.
 *
 * It must not reference any module-scope value (only `import type`, which is
 * erased), because {@link renderHtml} inlines it into a standalone page via
 * `vnmRuntime.toString()`. The library `mount()` calls it directly, so both the
 * live component and the exported HTML share exactly this code.
 *
 * Responsibilities: HTML node cards in a CSS-transformed "world", an SVG edge
 * layer re-routed every frame from live positions, pan / wheel-zoom-at-cursor /
 * fit, a scaled minimap, node drag with click-slop, and layout persistence
 * (localStorage, debounced) + export/import.
 */

import type { SerializedModel, StyleDef } from "../../model/index.js";
import type { EdgeStyle, TokenSet } from "../../theme/index.js";

export interface RuntimeTheme {
  name: string;
  edgeStyle: EdgeStyle;
  tokens: TokenSet;
}

export interface RuntimeOptions {
  fitPadding: number;
  persistKey: string | null;
  minimap: boolean;
  minScale: number;
  maxScale: number;
}

export interface RuntimePayload {
  model: SerializedModel;
  theme: RuntimeTheme;
  cssVars: string;
  options: RuntimeOptions;
}

export interface LayoutData {
  version: number;
  positions: Record<string, { x: number; y: number }>;
  transform?: { x: number; y: number; scale: number };
}

export interface RuntimeHandle {
  root: HTMLElement;
  destroy(): void;
  fit(): void;
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  exportLayout(): LayoutData;
  importLayout(data: LayoutData): void;
  setTheme(theme: RuntimeTheme, cssVars: string): void;
  getPositions(): Record<string, { x: number; y: number }>;
}

export function vnmRuntime(root: HTMLElement, payload: RuntimePayload): RuntimeHandle {
  const doc = root.ownerDocument;
  const win = doc.defaultView as Window;
  const SVGNS = "http://www.w3.org/2000/svg";
  const model = payload.model;
  const opt = payload.options;
  let tokens = payload.theme.tokens;
  let edgeStyle = payload.theme.edgeStyle;

  const offsetX = model.bounds.x;
  const offsetY = model.bounds.y;
  const contentW = model.bounds.width;
  const contentH = model.bounds.height;

  // center-based positions in normalized (offset-removed) coords
  const positions: Record<string, { x: number; y: number }> = {};
  const sizes: Record<string, { w: number; h: number }> = {};
  for (const nd of model.nodes) {
    positions[nd.id] = { x: nd.x - offsetX, y: nd.y - offsetY };
    sizes[nd.id] = { w: nd.width, h: nd.height };
  }

  let tx = 0;
  let ty = 0;
  let scale = 1;

  // ---- DOM scaffold ----
  root.classList.add("vnm-root");
  const viewport = doc.createElement("div");
  viewport.className = "vnm-viewport";
  viewport.setAttribute(
    "style",
    "position:absolute;inset:0;overflow:hidden;background:var(--vnm-bg);" +
      "cursor:grab;touch-action:none;user-select:none;font-family:var(--vnm-font);" +
      payload.cssVars,
  );
  if (getComputedStyle(root).position === "static") root.style.position = "relative";
  root.appendChild(viewport);

  const world = doc.createElement("div");
  world.className = "vnm-world";
  world.setAttribute("style", "position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;");
  viewport.appendChild(world);

  const svg = doc.createElementNS(SVGNS, "svg");
  svg.setAttribute("class", "vnm-edges");
  svg.setAttribute("width", String(contentW));
  svg.setAttribute("height", String(contentH));
  svg.setAttribute("style", "position:absolute;left:0;top:0;overflow:visible;pointer-events:none;");
  const defs = doc.createElementNS(SVGNS, "defs");
  defs.innerHTML =
    '<marker id="vnm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="' +
    tokens.edge.arrowSize +
    '" markerHeight="' +
    tokens.edge.arrowSize +
    '" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z"></path></marker>';
  svg.appendChild(defs);
  world.appendChild(svg);

  // subgraph boxes (behind everything)
  for (const sg of model.subgraphs) {
    const r = doc.createElementNS(SVGNS, "rect");
    r.setAttribute("x", String(sg.x - offsetX - sg.width / 2));
    r.setAttribute("y", String(sg.y - offsetY - sg.height / 2));
    r.setAttribute("width", String(sg.width));
    r.setAttribute("height", String(sg.height));
    r.setAttribute("rx", String(tokens.radii.card));
    r.setAttribute("fill", "var(--vnm-subgraph-fill)");
    r.setAttribute("stroke", "var(--vnm-subgraph-stroke)");
    r.setAttribute("stroke-dasharray", "4 4");
    svg.insertBefore(r, svg.firstChild);
    if (sg.title) {
      const tnode = doc.createElementNS(SVGNS, "text");
      tnode.setAttribute("x", String(sg.x - offsetX - sg.width / 2 + 12));
      tnode.setAttribute("y", String(sg.y - offsetY - sg.height / 2 + 18));
      tnode.setAttribute("fill", "var(--vnm-subgraph-text)");
      tnode.setAttribute("font-size", String(tokens.font.size - 1));
      tnode.setAttribute("font-weight", "600");
      tnode.textContent = sg.title;
      svg.appendChild(tnode);
    }
  }

  // edges: path + optional label group
  interface EdgeEls {
    from: string;
    to: string;
    kind: string;
    arrows: { start: boolean; end: boolean };
    label?: string;
    path: SVGPathElement;
    plate?: SVGRectElement;
    text?: SVGTextElement;
  }
  const edgeEls: EdgeEls[] = [];
  for (const e of model.edges) {
    const path = doc.createElementNS(SVGNS, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "var(--vnm-edge)");
    path.setAttribute("stroke-width", String(e.kind === "thick" ? tokens.edge.thickWidth : tokens.edge.width));
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    if (e.kind === "dotted") path.setAttribute("stroke-dasharray", "2 5");
    if (e.arrows.end) path.setAttribute("marker-end", "url(#vnm-arrow)");
    if (e.arrows.start) path.setAttribute("marker-start", "url(#vnm-arrow)");
    svg.appendChild(path);
    const rec: EdgeEls = { from: e.from, to: e.to, kind: e.kind, arrows: e.arrows, path };
    if (e.label) {
      rec.label = e.label;
      const plate = doc.createElementNS(SVGNS, "rect");
      plate.setAttribute("fill", "var(--vnm-edge-label-bg)");
      plate.setAttribute("rx", String(tokens.radii.label));
      svg.appendChild(plate);
      const text = doc.createElementNS(SVGNS, "text");
      text.setAttribute("fill", "var(--vnm-edge-label-text)");
      text.setAttribute("font-size", String(tokens.font.size - 1));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.textContent = e.label;
      svg.appendChild(text);
      rec.plate = plate;
      rec.text = text;
    }
    edgeEls.push(rec);
  }
  // arrowhead color follows the edge token
  (defs.querySelector("marker path") as SVGPathElement | null)?.setAttribute("fill", tokens.colors.edge);

  // node cards
  const classDefs = model.classDefs;
  const cards: Record<string, HTMLElement> = {};
  for (const nd of model.nodes) {
    const card = doc.createElement("div");
    card.className = "vnm-node";
    card.dataset.id = nd.id;
    card.dataset.shape = nd.shape;
    const st = styleForNode(nd.id, nd.classes, nd.style);
    card.setAttribute("style", cardStyle(nd.id, st));
    const inner = doc.createElement("div");
    inner.setAttribute("style", "white-space:pre-line;text-align:center;pointer-events:none;");
    inner.textContent = nd.label;
    card.appendChild(inner);
    world.appendChild(card);
    cards[nd.id] = card;
  }

  // ---- minimap ----
  let minimap: HTMLCanvasElement | null = null;
  if (opt.minimap) {
    minimap = doc.createElement("canvas");
    minimap.className = "vnm-minimap";
    minimap.width = 180;
    minimap.height = Math.max(80, Math.round((180 * contentH) / Math.max(contentW, 1)));
    minimap.setAttribute(
      "style",
      "position:absolute;right:12px;bottom:12px;border:1px solid var(--vnm-surface-stroke);" +
        "border-radius:8px;background:var(--vnm-minimap-bg);cursor:pointer;box-shadow:var(--vnm-node-shadow);",
    );
    viewport.appendChild(minimap);
  }

  // ---- toolbar ----
  const toolbar = doc.createElement("div");
  toolbar.className = "vnm-toolbar";
  toolbar.setAttribute(
    "style",
    "position:absolute;left:12px;top:12px;display:flex;gap:6px;",
  );
  const mkBtn = (label: string, title: string, on: () => void) => {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute(
      "style",
      "width:28px;height:28px;border:1px solid var(--vnm-surface-stroke);border-radius:6px;" +
        "background:var(--vnm-surface);color:var(--vnm-text);cursor:pointer;font-size:15px;line-height:1;",
    );
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      on();
    });
    toolbar.appendChild(btn);
    return btn;
  };
  mkBtn("⤢", "Fit to view", () => fit());
  mkBtn("+", "Zoom in", () => zoomBy(1.2));
  mkBtn("−", "Zoom out", () => zoomBy(1 / 1.2));
  viewport.appendChild(toolbar);

  // ================= geometry (inlined, mirrors src/geometry) =================
  function nAt(v: number): number {
    return Math.round(v * 100) / 100;
  }
  // mirrors geometry.simplify(): drop duplicate + exactly-collinear waypoints
  // so the interactive elbow route matches the static SVG point-for-point.
  function simplify(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (const p of points) {
      const last = out[out.length - 1];
      if (last && nAt(last.x) === nAt(p.x) && nAt(last.y) === nAt(p.y)) continue;
      out.push(p);
    }
    for (let i = out.length - 2; i >= 1; i--) {
      const a = out[i - 1]!;
      const b = out[i]!;
      const c = out[i + 1]!;
      const collinear =
        (nAt(a.x) === nAt(b.x) && nAt(b.x) === nAt(c.x)) ||
        (nAt(a.y) === nAt(b.y) && nAt(b.y) === nAt(c.y));
      if (collinear) out.splice(i, 1);
    }
    return out;
  }
  function pickSides(
    from: { x: number; y: number; w: number; h: number },
    to: { x: number; y: number; w: number; h: number },
  ): { exit: string; entry: string } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const horiz = model.direction === "LR" || model.direction === "RL";
    let axis: string;
    if (horiz) axis = Math.abs(dx) >= Math.abs(dy) * 0.5 ? "x" : "y";
    else axis = Math.abs(dy) >= Math.abs(dx) * 0.5 ? "y" : "x";
    if (axis === "x") return dx >= 0 ? { exit: "right", entry: "left" } : { exit: "left", entry: "right" };
    return dy >= 0 ? { exit: "bottom", entry: "top" } : { exit: "top", entry: "bottom" };
  }
  function anchor(b: { x: number; y: number; w: number; h: number }, side: string) {
    if (side === "top") return { x: b.x, y: b.y - b.h / 2 };
    if (side === "bottom") return { x: b.x, y: b.y + b.h / 2 };
    if (side === "left") return { x: b.x - b.w / 2, y: b.y };
    return { x: b.x + b.w / 2, y: b.y };
  }
  function routePoints(fromId: string, toId: string) {
    const fp = positions[fromId]!;
    const tp = positions[toId]!;
    const fs = sizes[fromId]!;
    const ts = sizes[toId]!;
    const from = { x: fp.x, y: fp.y, w: fs.w, h: fs.h };
    const to = { x: tp.x, y: tp.y, w: ts.w, h: ts.h };
    if (fromId === toId) {
      const r = anchor(from, "right");
      const t = anchor(from, "top");
      const off = Math.max(24, from.h * 0.6);
      return [r, { x: r.x + off, y: r.y }, { x: r.x + off, y: t.y - off }, { x: t.x, y: t.y - off }, t];
    }
    const s = pickSides(from, to);
    const start = anchor(from, s.exit);
    const end = anchor(to, s.entry);
    const horizontal = s.exit === "left" || s.exit === "right";
    if (edgeStyle === "curved") {
      const k = horizontal ? Math.max(24, Math.abs(end.x - start.x) * 0.5) : Math.max(24, Math.abs(end.y - start.y) * 0.5);
      const c1 = offAlong(start, s.exit, k);
      const c2 = offAlong(end, s.entry, k);
      return [start, c1, c2, end];
    }
    if (horizontal) {
      const midX = (start.x + end.x) / 2;
      return simplify([start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]);
    }
    const midY = (start.y + end.y) / 2;
    return simplify([start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]);
  }
  function offAlong(p: { x: number; y: number }, side: string, k: number) {
    if (side === "top") return { x: p.x, y: p.y - k };
    if (side === "bottom") return { x: p.x, y: p.y + k };
    if (side === "left") return { x: p.x - k, y: p.y };
    return { x: p.x + k, y: p.y };
  }
  function pathOf(points: Array<{ x: number; y: number }>): string {
    if (points.length === 0) return "";
    if (edgeStyle === "curved" && points.length === 4) {
      const p = points as Array<{ x: number; y: number }>;
      return (
        "M " + nAt(p[0]!.x) + " " + nAt(p[0]!.y) + " C " + nAt(p[1]!.x) + " " + nAt(p[1]!.y) + " " +
        nAt(p[2]!.x) + " " + nAt(p[2]!.y) + " " + nAt(p[3]!.x) + " " + nAt(p[3]!.y)
      );
    }
    let d = "M " + nAt(points[0]!.x) + " " + nAt(points[0]!.y);
    for (let i = 1; i < points.length; i++) d += " L " + nAt(points[i]!.x) + " " + nAt(points[i]!.y);
    return d;
  }
  function labelAt(points: Array<{ x: number; y: number }>) {
    if (edgeStyle === "curved" && points.length === 4) {
      const p = points;
      return {
        x: 0.125 * p[0]!.x + 0.375 * p[1]!.x + 0.375 * p[2]!.x + 0.125 * p[3]!.x,
        y: 0.125 * p[0]!.y + 0.375 * p[1]!.y + 0.375 * p[2]!.y + 0.125 * p[3]!.y,
      };
    }
    if (points.length === 2) return { x: (points[0]!.x + points[1]!.x) / 2, y: (points[0]!.y + points[1]!.y) / 2 };
    const mid = Math.floor(points.length / 2);
    return { x: (points[mid - 1]!.x + points[mid]!.x) / 2, y: (points[mid - 1]!.y + points[mid]!.y) / 2 };
  }

  // ================= style resolution (mirrors render/style) =================
  interface NodeStyle {
    fill: string;
    stroke: string;
    text: string;
    strokeWidth?: string;
    strokeDasharray?: string;
  }
  function styleForNode(_id: string, classes: string[], inline?: StyleDef): NodeStyle {
    const c = tokens.colors;
    let fill = c.surface;
    let stroke = c.surfaceStroke;
    let text = c.text;
    let strokeWidth: string | undefined;
    let strokeDasharray: string | undefined;
    for (const cls of classes) {
      const role = c.roles[cls];
      if (role) {
        fill = role.fill;
        stroke = role.stroke;
        text = role.text;
      }
      const def = classDefs[cls];
      if (def) {
        if (def.fill) fill = def.fill;
        if (def.stroke) stroke = def.stroke;
        if (def.color) text = def.color;
        if (def.strokeWidth) strokeWidth = def.strokeWidth;
        if (def.strokeDasharray) strokeDasharray = def.strokeDasharray;
      }
    }
    if (inline) {
      if (inline.fill) fill = inline.fill;
      if (inline.stroke) stroke = inline.stroke;
      if (inline.color) text = inline.color;
      if (inline.strokeWidth) strokeWidth = inline.strokeWidth;
      if (inline.strokeDasharray) strokeDasharray = inline.strokeDasharray;
    }
    const out: NodeStyle = { fill, stroke, text };
    if (strokeWidth !== undefined) out.strokeWidth = strokeWidth;
    if (strokeDasharray !== undefined) out.strokeDasharray = strokeDasharray;
    return out;
  }
  function cardStyle(id: string, st: NodeStyle): string {
    const s = sizes[id]!;
    let radius = tokens.radii.node + "px";
    const shapeEl = model.nodes.find((x) => x.id === id);
    const shape = shapeEl ? shapeEl.shape : "rect";
    if (shape === "stadium" || shape === "circle") radius = "999px";
    else if (shape === "rounded") radius = tokens.radii.card + 4 + "px";
    // Mirror the static SVG stroke: honor classDef/style stroke-width (SVG user
    // units → px for a CSS border) and render stroke-dasharray as a dashed edge.
    const borderWidth = st.strokeWidth
      ? /^[0-9.]+$/.test(st.strokeWidth)
        ? st.strokeWidth + "px"
        : st.strokeWidth
      : "1.5px";
    const borderStyle = st.strokeDasharray ? "dashed" : "solid";
    return (
      "position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;" +
      "width:" + s.w + "px;height:" + s.h + "px;padding:0 " + tokens.spacing.nodePadX + "px;" +
      "border-radius:" + radius + ";cursor:grab;transition:box-shadow .12s ease, transform .12s ease;" +
      "font-size:var(--vnm-font-size);font-weight:var(--vnm-font-weight);box-shadow:var(--vnm-node-shadow);" +
      "background:" + st.fill + ";border:" + borderWidth + " " + borderStyle + " " + st.stroke + ";color:" + st.text + ";"
    );
  }

  // ================= rendering =================
  function positionCard(id: string): void {
    const card = cards[id]!;
    const p = positions[id]!;
    const s = sizes[id]!;
    card.style.left = p.x - s.w / 2 + "px";
    card.style.top = p.y - s.h / 2 + "px";
  }
  function renderNodes(): void {
    for (const id in cards) positionCard(id);
  }
  function renderEdges(): void {
    for (const e of edgeEls) {
      const pts = routePoints(e.from, e.to);
      e.path.setAttribute("d", pathOf(pts));
      if (e.plate && e.text && e.label) {
        const lp = labelAt(pts);
        const w = e.label.length * (tokens.font.size * 0.62) + 10;
        const h = tokens.font.lineHeight + 4;
        e.plate.setAttribute("x", String(nAt(lp.x - w / 2)));
        e.plate.setAttribute("y", String(nAt(lp.y - h / 2)));
        e.plate.setAttribute("width", String(nAt(w)));
        e.plate.setAttribute("height", String(nAt(h)));
        e.text.setAttribute("x", String(nAt(lp.x)));
        e.text.setAttribute("y", String(nAt(lp.y)));
      }
    }
  }
  function applyTransform(): void {
    world.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
    drawMinimap();
  }
  function renderAll(): void {
    renderNodes();
    renderEdges();
    applyTransform();
  }

  // ================= minimap =================
  function drawMinimap(): void {
    if (!minimap) return;
    const ctx = minimap.getContext("2d");
    if (!ctx) return;
    const mw = minimap.width;
    const mh = minimap.height;
    ctx.clearRect(0, 0, mw, mh);
    const s = Math.min(mw / Math.max(contentW, 1), mh / Math.max(contentH, 1));
    ctx.save();
    ctx.scale(s, s);
    ctx.fillStyle = tokens.colors.accent;
    for (const nd of model.nodes) {
      const p = positions[nd.id]!;
      const sz = sizes[nd.id]!;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(p.x - sz.w / 2, p.y - sz.h / 2, sz.w, sz.h);
    }
    ctx.restore();
    // viewport rectangle
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const vx = (-tx / scale) * s;
    const vy = (-ty / scale) * s;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = tokens.colors.accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, (vw / scale) * s, (vh / scale) * s);
    ctx.fillStyle = tokens.colors.minimapViewport;
    ctx.fillRect(vx, vy, (vw / scale) * s, (vh / scale) * s);
  }

  // ================= view control =================
  function clampScale(v: number): number {
    return Math.max(opt.minScale, Math.min(opt.maxScale, v));
  }
  function fit(): void {
    const vw = viewport.clientWidth || 800;
    const vh = viewport.clientHeight || 600;
    const pad = opt.fitPadding;
    const s = clampScale(Math.min((vw - pad * 2) / Math.max(contentW, 1), (vh - pad * 2) / Math.max(contentH, 1)));
    scale = s;
    tx = (vw - contentW * s) / 2;
    ty = (vh - contentH * s) / 2;
    applyTransform();
  }
  function zoomBy(factor: number): void {
    zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, clampScale(scale * factor));
  }
  function zoomAt(cx: number, cy: number, next: number): void {
    const wx = (cx - tx) / scale;
    const wy = (cy - ty) / scale;
    scale = next;
    tx = cx - wx * scale;
    ty = cy - wy * scale;
    applyTransform();
  }
  function resetView(): void {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
  }

  // ================= interactions =================
  const SLOP = 4;
  let mode: "none" | "pan" | "drag" | "minimap" = "none";
  let dragId: string | null = null;
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;
  let startPos = { x: 0, y: 0 };
  let moved = false;

  function onPointerDown(ev: PointerEvent): void {
    const target = ev.target as HTMLElement;
    const card = target.closest ? (target.closest(".vnm-node") as HTMLElement | null) : null;
    moved = false;
    startX = ev.clientX;
    startY = ev.clientY;
    if (card && card.dataset.id) {
      mode = "drag";
      dragId = card.dataset.id;
      startPos = { x: positions[dragId]!.x, y: positions[dragId]!.y };
      card.style.cursor = "grabbing";
    } else {
      mode = "pan";
      startTx = tx;
      startTy = ty;
      viewport.style.cursor = "grabbing";
    }
    viewport.setPointerCapture(ev.pointerId);
  }
  function onPointerMove(ev: PointerEvent): void {
    if (mode === "none") return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP) moved = true;
    if (mode === "pan") {
      tx = startTx + dx;
      ty = startTy + dy;
      applyTransform();
    } else if (mode === "drag" && dragId) {
      positions[dragId] = { x: startPos.x + dx / scale, y: startPos.y + dy / scale };
      positionCard(dragId);
      renderEdges();
      drawMinimap();
    }
  }
  function onPointerUp(ev: PointerEvent): void {
    if (mode === "drag" && dragId) {
      cards[dragId]!.style.cursor = "grab";
      if (moved) schedulePersist();
      else selectNode(dragId);
    }
    viewport.style.cursor = "grab";
    try {
      viewport.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    mode = "none";
    dragId = null;
  }
  function onWheel(ev: WheelEvent): void {
    ev.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAt(cx, cy, clampScale(scale * factor));
  }
  function onMinimapDown(ev: PointerEvent): void {
    ev.stopPropagation();
    mode = "minimap";
    recenterFromMinimap(ev);
    minimap!.setPointerCapture(ev.pointerId);
  }
  function onMinimapMove(ev: PointerEvent): void {
    if (mode === "minimap") recenterFromMinimap(ev);
  }
  function onMinimapUp(ev: PointerEvent): void {
    mode = "none";
    try {
      minimap!.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  }
  function recenterFromMinimap(ev: PointerEvent): void {
    const rect = minimap!.getBoundingClientRect();
    const s = Math.min(minimap!.width / Math.max(contentW, 1), minimap!.height / Math.max(contentH, 1));
    const worldX = (ev.clientX - rect.left) / s;
    const worldY = (ev.clientY - rect.top) / s;
    tx = viewport.clientWidth / 2 - worldX * scale;
    ty = viewport.clientHeight / 2 - worldY * scale;
    applyTransform();
  }

  let selected: string | null = null;
  function selectNode(id: string): void {
    if (selected && cards[selected]) cards[selected]!.style.outline = "";
    selected = id;
    cards[id]!.style.outline = "2px solid var(--vnm-accent)";
    cards[id]!.style.outlineOffset = "2px";
  }

  // hover micro-lift
  for (const id in cards) {
    const card = cards[id]!;
    card.addEventListener("pointerenter", () => {
      if (mode === "none") card.style.transform = "translateY(calc(-1 * var(--vnm-hover-lift)))";
    });
    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
    });
  }

  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("wheel", onWheel, { passive: false });
  if (minimap) {
    minimap.addEventListener("pointerdown", onMinimapDown);
    minimap.addEventListener("pointermove", onMinimapMove);
    minimap.addEventListener("pointerup", onMinimapUp);
  }

  // ================= persistence =================
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  function schedulePersist(): void {
    if (!opt.persistKey) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 400);
  }
  function persistNow(): void {
    if (!opt.persistKey) return;
    try {
      win.localStorage.setItem(opt.persistKey, JSON.stringify(exportLayout()));
    } catch {
      /* storage unavailable */
    }
  }
  function loadPersisted(): void {
    if (!opt.persistKey) return;
    try {
      const raw = win.localStorage.getItem(opt.persistKey);
      if (raw) importLayout(JSON.parse(raw) as LayoutData);
    } catch {
      /* ignore malformed */
    }
  }

  function exportLayout(): LayoutData {
    const pos: Record<string, { x: number; y: number }> = {};
    for (const id in positions) pos[id] = { x: positions[id]!.x + offsetX, y: positions[id]!.y + offsetY };
    return { version: 1, positions: pos, transform: { x: tx, y: ty, scale } };
  }
  function importLayout(data: LayoutData): void {
    if (data && data.positions) {
      for (const id in data.positions) {
        if (positions[id]) positions[id] = { x: data.positions[id]!.x - offsetX, y: data.positions[id]!.y - offsetY };
      }
    }
    if (data && data.transform) {
      tx = data.transform.x;
      ty = data.transform.y;
      scale = data.transform.scale;
    }
    renderAll();
  }

  function setTheme(theme: RuntimeTheme, cssVars: string): void {
    tokens = theme.tokens;
    edgeStyle = theme.edgeStyle;
    viewport.setAttribute(
      "style",
      "position:absolute;inset:0;overflow:hidden;background:var(--vnm-bg);" +
        "cursor:grab;touch-action:none;user-select:none;font-family:var(--vnm-font);" +
        cssVars,
    );
    (defs.querySelector("marker path") as SVGPathElement | null)?.setAttribute("fill", tokens.colors.edge);
    for (const nd of model.nodes) {
      const st = styleForNode(nd.id, nd.classes, nd.style);
      cards[nd.id]!.setAttribute("style", cardStyle(nd.id, st));
    }
    renderAll();
  }

  function destroy(): void {
    viewport.removeEventListener("pointerdown", onPointerDown);
    viewport.removeEventListener("pointermove", onPointerMove);
    viewport.removeEventListener("pointerup", onPointerUp);
    viewport.removeEventListener("wheel", onWheel);
    if (persistTimer) clearTimeout(persistTimer);
    root.removeChild(viewport);
  }

  // ================= boot =================
  loadPersisted();
  renderAll();
  // fit once the container has a measured size
  if (viewport.clientWidth === 0) {
    win.requestAnimationFrame(() => fit());
  } else {
    fit();
  }
  const ROCtor = (win as unknown as {
    ResizeObserver?: new (cb: () => void) => { observe(el: Element): void };
  }).ResizeObserver;
  if (ROCtor) new ROCtor(() => drawMinimap()).observe(viewport);

  return {
    root,
    destroy,
    fit,
    zoomIn: () => zoomBy(1.2),
    zoomOut: () => zoomBy(1 / 1.2),
    resetView,
    exportLayout,
    importLayout,
    setTheme,
    getPositions: () => exportLayout().positions,
  };
}
