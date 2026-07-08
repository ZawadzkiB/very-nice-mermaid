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
  /** Per-node **size overrides** from resizing (FR1/FR4). Only resized nodes. */
  sizes?: Record<string, { w: number; h: number }>;
  /**
   * Per-edge **manual anchor overrides** (FR7 / D7=A), keyed by edge index. Each
   * entry pins one or both endpoints to an explicit `{ side, offset }` on the
   * node border, overriding auto-distribute for that end only. Only edges with a
   * pinned end appear here; reset-layout clears them all.
   */
  anchors?: Record<string, EdgeAnchor>;
  transform?: { x: number; y: number; scale: number };
}

/** One edge end pinned to a node border side + offset (FR7). */
export interface EdgeAnchor {
  source?: { side: string; offset: number };
  target?: { side: string; offset: number };
  /**
   * Endpoint identity (REV-007): the pinned edge's `from`/`to` node ids, written
   * alongside the index key so an imported sidecar can confirm the index still
   * refers to the same edge (and re-map it if the edges were reordered). Optional
   * for backward-compat — sidecars written before REV-007 omit them.
   */
  from?: string;
  to?: string;
}

export interface RuntimeHandle {
  root: HTMLElement;
  destroy(): void;
  fit(): void;
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  /** Discard every manual edit — dragged positions AND resized sizes — and
   *  return to the computed layout, re-routing all edges and clearing the
   *  persisted layout so a reload stays reset. Pan/zoom is left alone (D2/D5=A). */
  resetLayout(): void;
  exportLayout(): LayoutData;
  importLayout(data: LayoutData): void;
  setTheme(theme: RuntimeTheme, cssVars: string): void;
  getPositions(): Record<string, { x: number; y: number }>;
  /** Serialize the current (dragged + resized + re-routed) model to a themed SVG
   *  string — parity with `src/render/svg.ts` on the same edited model (FR3/D4). */
  toSvgString(): string;
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
  // the layout's measured sizes — used to persist only nodes the user resized.
  const baseSizes: Record<string, { w: number; h: number }> = {};
  // node shape by id — lets the anchor projection (mirrors geometry.sidePoint)
  // land a channel-spread endpoint on the node's real outline, not its bbox.
  const shapeById: Record<string, string> = {};
  for (const nd of model.nodes) {
    positions[nd.id] = { x: nd.x - offsetX, y: nd.y - offsetY };
    sizes[nd.id] = { w: nd.width, h: nd.height };
    baseSizes[nd.id] = { w: nd.width, h: nd.height };
    shapeById[nd.id] = nd.shape;
  }
  // Manual per-anchor overrides (FR7 / D7=A), keyed by edge index → pinned end(s).
  // A pinned end is used verbatim and skips the auto-distribute spread; cleared by
  // resetLayout. Persisted in the layout sidecar.
  const anchorsOv: Record<number, { source?: { side: string; offset: number }; target?: { side: string; offset: number } }> = {};

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

  // ---- subgraph containers (FR6 / D6=C) ----
  // Auto-contain constants — mirror src/geometry (SUBGRAPH_PADDING/TITLE_BAND).
  const SG_PAD = 14;
  const SG_TITLE = 18;
  // Static membership from the DSL: resolve each container's full member NODE ids
  // (expanding nested subgraph ids recursively). Dragging a child OUT never
  // un-groups it — the box just re-hugs (auto-contain).
  const subgraphMembers: Record<string, string[]> = {};
  {
    const childrenById: Record<string, string[]> = {};
    for (const sg of model.subgraphs) childrenById[sg.id] = sg.children;
    const isNode = (id: string): boolean => !!positions[id];
    const resolve = (id: string, seen: Record<string, boolean>): string[] => {
      const out: string[] = [];
      for (const child of childrenById[id] || []) {
        if (isNode(child)) out.push(child);
        else if (childrenById[child] && !seen[child]) {
          seen[child] = true;
          out.push(...resolve(child, seen));
        }
      }
      return out;
    };
    for (const sg of model.subgraphs) subgraphMembers[sg.id] = resolve(sg.id, { [sg.id]: true });
  }
  // Container box from member boxes (mirrors geometry.subgraphBox — keep the
  // padding/title-band + rounding in lockstep for parity). Returns null with no
  // members. Works in any coord space (translation-invariant bbox).
  function sgBoxFrom(
    boxes: Array<{ x: number; y: number; w: number; h: number }>,
    hasTitle: boolean,
  ): { x: number; y: number; w: number; h: number } | null {
    if (!boxes.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b.x - b.w / 2);
      minY = Math.min(minY, b.y - b.h / 2);
      maxX = Math.max(maxX, b.x + b.w / 2);
      maxY = Math.max(maxY, b.y + b.h / 2);
    }
    const top = SG_PAD + (hasTitle ? SG_TITLE : 0);
    const x0 = minX - SG_PAD;
    const y0 = minY - top;
    const x1 = maxX + SG_PAD;
    const y1 = maxY + SG_PAD;
    return { x: nAt((x0 + x1) / 2), y: nAt((y0 + y1) / 2), w: nAt(x1 - x0), h: nAt(y1 - y0) };
  }
  // Live container box (offset-removed "world" coords), recomputed from members.
  function subgraphWorldBox(sg: SvgSub): { x: number; y: number; w: number; h: number } {
    const ids = subgraphMembers[sg.id] || [];
    const boxes = ids.map((id) => ({ x: positions[id]!.x, y: positions[id]!.y, w: sizes[id]!.w, h: sizes[id]!.h }));
    return sgBoxFrom(boxes, !!sg.title) ?? { x: sg.x - offsetX, y: sg.y - offsetY, w: sg.width, h: sg.height };
  }
  interface SubgraphEls {
    sg: SvgSub;
    rect: SVGRectElement;
    text?: SVGTextElement;
  }
  const subgraphEls: SubgraphEls[] = [];
  for (const sg of model.subgraphs) {
    const r = doc.createElementNS(SVGNS, "rect");
    r.setAttribute("class", "vnm-subgraph");
    r.setAttribute("rx", String(tokens.radii.card));
    r.setAttribute("fill", "var(--vnm-subgraph-fill)");
    r.setAttribute("stroke", "var(--vnm-subgraph-stroke)");
    r.setAttribute("stroke-dasharray", "4 4");
    svg.insertBefore(r, svg.firstChild);
    const rec: SubgraphEls = { sg, rect: r };
    if (sg.title) {
      const tnode = doc.createElementNS(SVGNS, "text");
      tnode.setAttribute("class", "vnm-subgraph-title");
      tnode.setAttribute("fill", "var(--vnm-subgraph-text)");
      tnode.setAttribute("font-size", String(tokens.font.size - 1));
      tnode.setAttribute("font-weight", "600");
      tnode.textContent = sg.title;
      svg.appendChild(tnode);
      rec.text = tnode;
    }
    subgraphEls.push(rec);
  }
  // Recompute + reposition every container rect (+ title) from its live members.
  function renderSubgraphs(): void {
    for (const rec of subgraphEls) {
      const b = subgraphWorldBox(rec.sg);
      rec.rect.setAttribute("x", String(b.x - b.w / 2));
      rec.rect.setAttribute("y", String(b.y - b.h / 2));
      rec.rect.setAttribute("width", String(b.w));
      rec.rect.setAttribute("height", String(b.h));
      if (rec.text) {
        rec.text.setAttribute("x", String(b.x - b.w / 2 + 12));
        rec.text.setAttribute("y", String(b.y - b.h / 2 + 18));
      }
    }
  }

  // edges: path + optional label group
  interface EdgeEls {
    from: string;
    to: string;
    kind: string;
    arrows: { start: boolean; end: boolean };
    label?: string;
    /** dagre detour bends (offset-removed) for multi-rank / back edges. */
    waypoints?: Array<{ x: number; y: number }>;
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
    if (e.waypoints && e.waypoints.length) {
      rec.waypoints = e.waypoints.map((p) => ({ x: p.x - offsetX, y: p.y - offsetY }));
    }
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

  // ---- resize handles (FR1) ----
  // Four corner handles shown on the selected node; dragging one resizes it live
  // (min clamp) with the opposite corner pinned, then the card + connected edges
  // re-route and the size persists. Anchors auto-distribute, so there are no
  // per-anchor handles (D1=A).
  const HANDLE = 10;
  const MIN_SIZE = 24;
  const handleEls: HTMLElement[] = [];
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as Array<[number, number]>) {
    const h = doc.createElement("div");
    h.className = "vnm-resize-handle";
    h.dataset.sx = String(sx);
    h.dataset.sy = String(sy);
    h.setAttribute(
      "style",
      "position:absolute;width:" + HANDLE + "px;height:" + HANDLE + "px;box-sizing:border-box;" +
        "background:var(--vnm-surface);border:1.5px solid var(--vnm-accent);border-radius:2px;" +
        "display:none;touch-action:none;z-index:6;cursor:" +
        (sx * sy > 0 ? "nwse-resize" : "nesw-resize") + ";",
    );
    world.appendChild(h);
    handleEls.push(h);
  }
  function hideHandles(): void {
    for (const h of handleEls) h.style.display = "none";
  }
  function positionHandles(): void {
    if (!selected || !cards[selected]) {
      hideHandles();
      return;
    }
    const p = positions[selected]!;
    const s = sizes[selected]!;
    for (const h of handleEls) {
      const sx = Number(h.dataset.sx);
      const sy = Number(h.dataset.sy);
      h.style.left = p.x + (sx * s.w) / 2 - HANDLE / 2 + "px";
      h.style.top = p.y + (sy * s.h) / 2 - HANDLE / 2 + "px";
      h.style.display = "block";
    }
  }
  function applyCardSize(id: string): void {
    const s = sizes[id]!;
    cards[id]!.style.width = s.w + "px";
    cards[id]!.style.height = s.h + "px";
  }

  // ---- edge endpoint anchor handles (FR7 / D7=A) ----
  // A small grab handle at each edge endpoint. It appears when the node that end
  // attaches to is SELECTED (reusing the resize-handle idiom: select a node to
  // reveal its edit affordances), and dragging it pins that end's {side,offset}
  // on the node border while the other end keeps auto-distributing.
  const EP = 9;
  interface EdgeHandle {
    el: HTMLElement;
    ei: number;
    end: "source" | "target";
  }
  const edgeHandles: EdgeHandle[] = [];
  edgeEls.forEach((_e, i) => {
    for (const end of ["source", "target"] as const) {
      const h = doc.createElement("div");
      h.className = "vnm-edge-handle";
      h.dataset.ei = String(i);
      h.dataset.end = end;
      h.setAttribute(
        "style",
        "position:absolute;width:" + EP + "px;height:" + EP + "px;box-sizing:border-box;" +
          "background:var(--vnm-accent);border:1.5px solid var(--vnm-surface);border-radius:50%;" +
          "display:none;touch-action:none;z-index:7;cursor:grab;",
      );
      world.appendChild(h);
      edgeHandles.push({ el: h, ei: i, end });
    }
  });
  // Position (+ show/hide) every endpoint handle from the given per-edge ports.
  function positionEdgeHandles(ports: Ports[]): void {
    for (const eh of edgeHandles) {
      const e = edgeEls[eh.ei]!;
      const nodeId = eh.end === "source" ? e.from : e.to;
      const isSelf = e.from === e.to;
      if (nodeId !== selected || isSelf) {
        eh.el.style.display = "none";
        continue;
      }
      const p = positions[nodeId]!;
      const s = sizes[nodeId]!;
      const a = ports[eh.ei]![eh.end];
      const pt = anchor({ x: p.x, y: p.y, w: s.w, h: s.h, shape: shapeById[nodeId] }, a.side, a.offset);
      eh.el.style.left = pt.x - EP / 2 + "px";
      eh.el.style.top = pt.y - EP / 2 + "px";
      eh.el.style.display = "block";
    }
  }
  // Which border side + offset the pointer (world coords) pins an anchor to: the
  // dominant normalized axis picks the side, the along-border delta is the offset.
  function anchorFromPointer(
    box: { x: number; y: number; w: number; h: number },
    wx: number,
    wy: number,
  ): { side: string; offset: number } {
    const dx = wx - box.x;
    const dy = wy - box.y;
    const nx = box.w ? dx / (box.w / 2) : 0;
    const ny = box.h ? dy / (box.h / 2) : 0;
    if (Math.abs(nx) >= Math.abs(ny)) {
      return { side: dx >= 0 ? "right" : "left", offset: clampOff(dy, box.h / 2) };
    }
    return { side: dy >= 0 ? "bottom" : "top", offset: clampOff(dx, box.w / 2) };
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
  // Reset layout (D2/D5=A): discard manual drags + resizes, return to the
  // computed layout, and clear the persisted layout so a reload stays reset.
  mkBtn("⟲", "Reset layout", () => resetLayout());
  // Save controls (FR3): download the current edited diagram as SVG / PNG.
  const mkTextBtn = (label: string, title: string, on: () => void): HTMLElement => {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.title = title;
    btn.className = "vnm-export-btn";
    btn.setAttribute(
      "style",
      "height:28px;padding:0 9px;border:1px solid var(--vnm-surface-stroke);border-radius:6px;" +
        "background:var(--vnm-surface);color:var(--vnm-text);cursor:pointer;font-size:12px;" +
        "font-weight:600;line-height:1;",
    );
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      on();
    });
    toolbar.appendChild(btn);
    return btn;
  };
  mkTextBtn("SVG", "Save as SVG", () => saveSvg());
  mkTextBtn("PNG", "Save as PNG", () => savePng());
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
  // mirrors geometry.raySide(): the border side a ray from the box center in
  // direction (dx,dy) exits — aspect-aware, so a hub's edges fan out across the
  // whole perimeter instead of clustering on the layout's primary axis.
  function raySide(
    b: { x: number; y: number; w: number; h: number },
    dx: number,
    dy: number,
  ): string {
    const sx = dx !== 0 ? b.w / 2 / Math.abs(dx) : Infinity;
    const sy = dy !== 0 ? b.h / 2 / Math.abs(dy) : Infinity;
    if (sx < sy) return dx > 0 ? "right" : "left";
    return dy > 0 ? "bottom" : "top";
  }
  // mirrors geometry.clampOffset(): keep a pinned pointer offset off the corners
  // (half − margin). The auto-spread anchor uses anchorBound() below instead.
  function clampOff(off: number, half: number): number {
    const max = Math.max(0, half - 6);
    return Math.max(-max, Math.min(max, off));
  }
  // mirrors geometry.anchorBound(): furthest a spread anchor may slide on a side
  // and still project onto the drawn outline — flat part for the rounded family
  // (rounded / stadium) and the flat sides of hexagon / parallelogram / cylinder;
  // full span for the tapered / curved sides. Keep in lockstep with geometry.
  function anchorBound(shape: string, horiz: boolean, hw: number, hh: number): number {
    const half = horiz ? hw : hh;
    const cap = half - 6;
    if (shape === "rounded") return Math.min(cap, half - 14);
    if (shape === "stadium") return Math.min(cap, half - hh);
    if (shape === "hexagon") return horiz ? Math.min(cap, half - Math.min(hw * 0.44, hh)) : cap;
    if (shape === "parallelogram" || shape === "parallelogram-alt")
      return horiz ? Math.min(cap, half - Math.min(hw * 0.44, 2 * hh)) : cap;
    if (shape === "cylinder") return horiz ? cap : Math.min(cap, half - Math.min(10, hh * 0.36));
    return cap;
  }
  // mirrors geometry.sidePoint()+outlinePoint(): a border anchor slid along the
  // side by `off` (its own channel) then PROJECTED onto the node's real outline
  // for its shape, so a channel-spread endpoint never floats off a tapered /
  // rounded shape (the arrowhead-in-empty-space bug). Keep in lockstep.
  function anchor(
    b: { x: number; y: number; w: number; h: number; shape?: string },
    side: string,
    off = 0,
  ) {
    const hw = b.w / 2;
    const hh = b.h / 2;
    const cx = b.x;
    const cy = b.y;
    const shape = b.shape || "rect";
    const horiz = side === "top" || side === "bottom";
    const bound = Math.max(0, anchorBound(shape, horiz, hw, hh));
    const t = Math.max(-bound, Math.min(bound, off));
    if (horiz) {
      const sgn = side === "top" ? -1 : 1;
      let y = cy + sgn * hh;
      if (shape === "diamond") y = cy + sgn * hh * (1 - Math.abs(t) / hw);
      else if (shape === "circle") y = cy + sgn * hh * Math.sqrt(1 - (t / hw) * (t / hw));
      else if (shape === "cylinder") {
        const ry = Math.min(10, hh * 0.36);
        y = cy + sgn * (hh - ry + ry * Math.sqrt(1 - (t / hw) * (t / hw)));
      }
      return { x: cx + t, y };
    }
    const sgn = side === "left" ? -1 : 1;
    let x = cx + sgn * hw;
    if (shape === "diamond") x = cx + sgn * hw * (1 - Math.abs(t) / hh);
    else if (shape === "circle") x = cx + sgn * hw * Math.sqrt(1 - (t / hh) * (t / hh));
    else if (shape === "hexagon") {
      const k = Math.min(hw * 0.44, hh);
      x = cx + sgn * (hw - (k * Math.abs(t)) / hh);
    } else if (shape === "parallelogram") {
      const k = Math.min(hw * 0.44, 2 * hh);
      x = side === "left" ? cx - hw + (k * (hh - t)) / (2 * hh) : cx + hw - (k * (t + hh)) / (2 * hh);
    } else if (shape === "parallelogram-alt") {
      const k = Math.min(hw * 0.44, 2 * hh);
      x = side === "left" ? cx - hw + (k * (t + hh)) / (2 * hh) : cx + hw - (k * (hh - t)) / (2 * hh);
    }
    return { x, y: cy + t };
  }
  type Pt = { x: number; y: number };
  function offAlong(p: Pt, side: string, k: number): Pt {
    if (side === "top") return { x: p.x, y: p.y - k };
    if (side === "bottom") return { x: p.x, y: p.y + k };
    if (side === "left") return { x: p.x - k, y: p.y };
    return { x: p.x + k, y: p.y };
  }
  // mirrors geometry.snapWaypoints(): snap dagre's sub-pixel jogs onto an anchor axis.
  function snapWaypoints(interior: Pt[], start: Pt, end: Pt): Pt[] {
    const xs = [start.x, end.x];
    const ys = [start.y, end.y];
    return interior.map((p) => {
      let x = p.x;
      let y = p.y;
      for (const ax of xs) {
        if (Math.abs(x - ax) <= 2) { x = ax; break; }
      }
      for (const ay of ys) {
        if (Math.abs(y - ay) <= 2) { y = ay; break; }
      }
      return { x, y };
    });
  }
  // mirrors geometry.elbowThrough(): thread a border-anchored orthogonal
  // staircase through dagre's interior detour bends (multi-rank / back edges).
  function elbowThrough(
    start: Pt,
    end: Pt,
    interior: Pt[],
    exitVertical: boolean,
    entryVertical: boolean,
    primaryVertical: boolean,
  ): Pt[] {
    const guide = [start, ...snapWaypoints(interior, start, end), end];
    const out: Pt[] = [guide[0]!];
    for (let i = 1; i < guide.length; i++) {
      const prev = out[out.length - 1]!;
      const cur = guide[i]!;
      if (nAt(prev.x) !== nAt(cur.x) && nAt(prev.y) !== nAt(cur.y)) {
        let verticalFirst: boolean;
        if (i === 1) verticalFirst = exitVertical;
        else if (i === guide.length - 1) verticalFirst = !entryVertical;
        else verticalFirst = primaryVertical;
        out.push(verticalFirst ? { x: prev.x, y: cur.y } : { x: cur.x, y: prev.y });
      }
      out.push(cur);
    }
    return simplify(out);
  }
  function dist(a: Pt, b: Pt): number {
    return Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
  }
  function along(from: Pt, toward: Pt, r: number): Pt {
    const d = dist(from, toward) || 1;
    return { x: from.x + ((toward.x - from.x) * r) / d, y: from.y + ((toward.y - from.y) * r) / d };
  }
  // mirrors geometry.roundedPath(): smooth an orthogonal polyline for curved edges.
  function pathRounded(points: Pt[]): string {
    if (points.length <= 2) return pathPoly(points);
    let d = "M " + nAt(points[0]!.x) + " " + nAt(points[0]!.y);
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1]!;
      const cur = points[i]!;
      const next = points[i + 1]!;
      const r = Math.min(12, dist(prev, cur) / 2, dist(cur, next) / 2);
      const a = along(cur, prev, r);
      const b = along(cur, next, r);
      d += " L " + nAt(a.x) + " " + nAt(a.y) + " Q " + nAt(cur.x) + " " + nAt(cur.y) + " " + nAt(b.x) + " " + nAt(b.y);
    }
    const last = points[points.length - 1]!;
    d += " L " + nAt(last.x) + " " + nAt(last.y);
    return d;
  }
  function pathPoly(points: Pt[]): string {
    if (points.length === 0) return "";
    let d = "M " + nAt(points[0]!.x) + " " + nAt(points[0]!.y);
    for (let i = 1; i < points.length; i++) d += " L " + nAt(points[i]!.x) + " " + nAt(points[i]!.y);
    return d;
  }
  function pathBezier(p: Pt[]): string {
    return (
      "M " + nAt(p[0]!.x) + " " + nAt(p[0]!.y) + " C " + nAt(p[1]!.x) + " " + nAt(p[1]!.y) + " " +
      nAt(p[2]!.x) + " " + nAt(p[2]!.y) + " " + nAt(p[3]!.x) + " " + nAt(p[3]!.y)
    );
  }
  function labelPoly(points: Pt[]): Pt {
    if (points.length === 2) return { x: (points[0]!.x + points[1]!.x) / 2, y: (points[0]!.y + points[1]!.y) / 2 };
    const mid = Math.floor(points.length / 2);
    return { x: (points[mid - 1]!.x + points[mid]!.x) / 2, y: (points[mid - 1]!.y + points[mid]!.y) / 2 };
  }
  function labelBezier(p: Pt[]): Pt {
    return {
      x: 0.125 * p[0]!.x + 0.375 * p[1]!.x + 0.375 * p[2]!.x + 0.125 * p[3]!.x,
      y: 0.125 * p[0]!.y + 0.375 * p[1]!.y + 0.375 * p[2]!.y + 0.125 * p[3]!.y,
    };
  }
  type Anchor = { side: string; offset: number };
  type Ports = { source: Anchor; target: Anchor; labelShift?: Pt };
  // mirrors geometry.computePerimeterPorts(): recompute the per-edge perimeter
  // anchors (border side by direction + channel offset + label stagger) from the
  // LIVE positions/sizes every frame, so a drag or resize keeps a hub's edges
  // fanned out and anti-parallel edges / fans on their own channels instead of
  // collapsing them back onto one point. Aligned index-for-index with `edgeEls`.
  function computePorts(): Ports[] {
    const res: Ports[] = edgeEls.map(() => ({
      source: { side: "bottom", offset: 0 },
      target: { side: "top", offset: 0 },
    }));
    const boxOf = (id: string): { x: number; y: number; w: number; h: number; shape?: string } => {
      const p = positions[id]!;
      const sz = sizes[id]!;
      return { x: p.x, y: p.y, w: sz.w, h: sz.h, shape: shapeById[id] };
    };
    const axisX = (side: string): boolean => side === "top" || side === "bottom";
    // choose each end's border side by the direction to the other node, then
    // group endpoints by (node, border-side) and spread any 2+ onto channels
    const groups: Record<string, Array<{ i: number; role: "source" | "target"; along: number }>> = {};
    edgeEls.forEach((e, i) => {
      const from = boxOf(e.from);
      const to = boxOf(e.to);
      if (from.x === to.x && from.y === to.y) return; // self-loop
      const exit = raySide(from, to.x - from.x, to.y - from.y);
      const entry = raySide(to, from.x - to.x, from.y - to.y);
      // A manually pinned end (FR7) is used verbatim + excluded from the spread
      // groups, so it stays put while its unpinned siblings auto-distribute —
      // mirrors computePerimeterPorts' override handling for byte parity.
      const ov = anchorsOv[i];
      if (ov && ov.source) {
        res[i]!.source = { side: ov.source.side, offset: ov.source.offset };
      } else {
        res[i]!.source = { side: exit, offset: 0 };
        const gs = e.from + "|" + exit;
        (groups[gs] || (groups[gs] = [])).push({ i, role: "source", along: axisX(exit) ? to.x : to.y });
      }
      if (ov && ov.target) {
        res[i]!.target = { side: ov.target.side, offset: ov.target.offset };
      } else {
        res[i]!.target = { side: entry, offset: 0 };
        const gt = e.to + "|" + entry;
        (groups[gt] || (groups[gt] = [])).push({ i, role: "target", along: axisX(entry) ? from.x : from.y });
      }
    });
    for (const key in groups) {
      const recs = groups[key]!;
      if (recs.length < 2) continue;
      const side = key.slice(key.lastIndexOf("|") + 1);
      const b = boxOf(key.slice(0, key.lastIndexOf("|")));
      const borderLen = side === "top" || side === "bottom" ? b.w : b.h;
      recs.sort((a, c) => a.along - c.along || a.i - c.i || a.role.localeCompare(c.role));
      const k = recs.length;
      const step = Math.min(20, (borderLen * 0.7) / (k - 1));
      recs.forEach((r, slot) => {
        res[r.i]![r.role].offset = (slot - (k - 1) / 2) * step;
      });
    }
    // stagger labels of edges that share a node pair so their plates don't clip
    const pairs: Record<string, number[]> = {};
    edgeEls.forEach((e, i) => {
      if (!e.label) return;
      const from = boxOf(e.from);
      const to = boxOf(e.to);
      if (from.x === to.x && from.y === to.y) return;
      // Unordered-pair key; "|" can never occur in a node id ([A-Za-z0-9_]+), so
      // distinct pairs never collide. Keep this delimiter in lockstep with the
      // geometry twin (computeLabelShifts, src/geometry/index.ts).
      const key = e.from < e.to ? e.from + "|" + e.to : e.to + "|" + e.from;
      (pairs[key] || (pairs[key] = [])).push(i);
    });
    for (const key in pairs) {
      const idxs = pairs[key]!;
      if (idxs.length < 2) continue;
      idxs.sort((a, c) => a - c);
      const first = edgeEls[idxs[0]!]!;
      const a = boxOf(first.from);
      const b = boxOf(first.to);
      const runX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
      const extent = (i: number): number => {
        const lns = edgeEls[i]!.label!.split("\n");
        const maxChars = lns.reduce((m, l) => Math.max(m, l.length), 0);
        return runX ? maxChars * (tokens.font.size * 0.62) + 10 : lns.length * tokens.font.lineHeight + 4;
      };
      const pos: number[] = [0];
      for (let s = 1; s < idxs.length; s++) {
        pos.push(pos[s - 1]! + (extent(idxs[s - 1]!) + extent(idxs[s]!)) / 2 + 6);
      }
      const center = (pos[0]! + pos[pos.length - 1]!) / 2;
      idxs.forEach((i, s) => {
        const d = pos[s]! - center;
        res[i]!.labelShift = runX ? { x: d, y: 0 } : { x: 0, y: d };
      });
    }
    return res;
  }

  // mirrors geometry.routeEdge(): recompute path + label from live positions,
  // threading dagre's detour waypoints (kept fixed) when the edge has them, and
  // applying the live per-edge channel offsets + label stagger from computePorts.
  type Box = { x: number; y: number; w: number; h: number; shape?: string };
  // Core routing given explicit boxes (so the live render works in offset-removed
  // "world" coords while toSvgString routes the identical geometry in absolute
  // coords for parity with src/render/svg.ts).
  function routeBoxes(
    from: Box,
    to: Box,
    waypoints: Pt[] | undefined,
    ports: Ports | undefined,
    isSelf: boolean,
  ): { path: string; labelPos: Pt; points: Pt[] } {
    const shift = ports && ports.labelShift;
    const withShift = (p: Pt): Pt => (shift ? { x: p.x + shift.x, y: p.y + shift.y } : p);
    if (isSelf) {
      const r = anchor(from, "right");
      const t = anchor(from, "top");
      const off = Math.max(24, from.h * 0.6);
      const pts = [r, { x: r.x + off, y: r.y }, { x: r.x + off, y: t.y - off }, { x: t.x, y: t.y - off }, t];
      return { path: pathPoly(pts), labelPos: labelPoly(pts), points: pts };
    }
    const exit = ports ? ports.source.side : raySide(from, to.x - from.x, to.y - from.y);
    const entry = ports ? ports.target.side : raySide(to, from.x - to.x, from.y - to.y);
    const start = anchor(from, exit, ports ? ports.source.offset : 0);
    const end = anchor(to, entry, ports ? ports.target.offset : 0);
    const horizontal = exit === "left" || exit === "right";
    const hasWps = !!(waypoints && waypoints.length > 0);
    if (edgeStyle === "curved" && !hasWps) {
      const k = horizontal ? Math.max(24, Math.abs(end.x - start.x) * 0.5) : Math.max(24, Math.abs(end.y - start.y) * 0.5);
      const c1 = offAlong(start, exit, k);
      const c2 = offAlong(end, entry, k);
      const pts = [start, c1, c2, end];
      return { path: pathBezier(pts), labelPos: withShift(labelBezier(pts)), points: pts };
    }
    let pts: Pt[];
    if (hasWps) {
      pts = elbowThrough(
        start,
        end,
        waypoints!,
        !horizontal,
        entry === "top" || entry === "bottom",
        !(model.direction === "LR" || model.direction === "RL"),
      );
    } else if (horizontal) {
      const midX = (start.x + end.x) / 2;
      pts = simplify([start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]);
    } else {
      const midY = (start.y + end.y) / 2;
      pts = simplify([start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]);
    }
    const path = edgeStyle === "curved" ? pathRounded(pts) : pathPoly(pts);
    return { path, labelPos: withShift(labelPoly(pts)), points: pts };
  }
  function routeEdgePath(
    fromId: string,
    toId: string,
    waypoints?: Pt[],
    ports?: Ports,
  ): { path: string; labelPos: Pt } {
    const fp = positions[fromId]!;
    const tp = positions[toId]!;
    const fs = sizes[fromId]!;
    const ts = sizes[toId]!;
    return routeBoxes(
      { x: fp.x, y: fp.y, w: fs.w, h: fs.h, shape: shapeById[fromId] },
      { x: tp.x, y: tp.y, w: ts.w, h: ts.h, shape: shapeById[toId] },
      waypoints,
      ports,
      fromId === toId,
    );
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
    for (const id in cards) {
      applyCardSize(id);
      positionCard(id);
    }
  }
  function renderEdges(): void {
    const ports = computePorts();
    edgeEls.forEach((e, i) => {
      const routed = routeEdgePath(e.from, e.to, e.waypoints, ports[i]);
      e.path.setAttribute("d", routed.path);
      if (e.plate && e.text && e.label) {
        const lp = routed.labelPos;
        const w = e.label.length * (tokens.font.size * 0.62) + 10;
        const h = tokens.font.lineHeight + 4;
        e.plate.setAttribute("x", String(nAt(lp.x - w / 2)));
        e.plate.setAttribute("y", String(nAt(lp.y - h / 2)));
        e.plate.setAttribute("width", String(nAt(w)));
        e.plate.setAttribute("height", String(nAt(h)));
        e.text.setAttribute("x", String(nAt(lp.x)));
        e.text.setAttribute("y", String(nAt(lp.y)));
      }
    });
    positionEdgeHandles(ports);
  }
  function applyTransform(): void {
    world.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
    drawMinimap();
  }
  function renderAll(): void {
    renderNodes();
    renderSubgraphs();
    renderEdges();
    positionHandles();
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
  let mode: "none" | "pan" | "drag" | "minimap" | "resize" | "anchor" | "group" = "none";
  let dragId: string | null = null;
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;
  let startPos = { x: 0, y: 0 };
  let moved = false;
  // resize state: which node + corner, and the pinned/movable edges at grab time
  let resizeId: string | null = null;
  let rsx = 0;
  let rsy = 0;
  let rFixedX = 0;
  let rFixedY = 0;
  let rMovableX = 0;
  let rMovableY = 0;
  // anchor-drag state (FR7): which edge + end is being pinned, and its node.
  let anchorEi = -1;
  let anchorEnd: "source" | "target" = "source";
  let anchorNode = "";
  // group-drag state (FR6): the member ids + their positions at grab time.
  let groupMembers: string[] = [];
  let groupStart: Record<string, { x: number; y: number }> = {};

  // World coords of a pointer event (offset-removed "world" space).
  function pointerWorld(ev: PointerEvent): { x: number; y: number } {
    const rect = viewport.getBoundingClientRect();
    return { x: (ev.clientX - rect.left - tx) / scale, y: (ev.clientY - rect.top - ty) / scale };
  }
  // A pointerdown that missed every card lands here: if it grabbed a subgraph's
  // dashed BORDER frame or its TITLE band (not the open interior, which stays
  // pannable), start a group drag of the whole cluster. Returns the container id
  // to drag, or null. Nested containers: the smallest matching one wins.
  const GRAB = 10;
  function subgraphHit(wx: number, wy: number): string | null {
    let best: string | null = null;
    let bestArea = Infinity;
    for (const sg of model.subgraphs) {
      if (!(subgraphMembers[sg.id] || []).length) continue;
      const b = subgraphWorldBox(sg);
      const left = b.x - b.w / 2;
      const right = b.x + b.w / 2;
      const top = b.y - b.h / 2;
      const bottom = b.y + b.h / 2;
      if (wx < left || wx > right || wy < top || wy > bottom) continue;
      const nearBorder =
        wx <= left + GRAB || wx >= right - GRAB || wy <= top + GRAB || wy >= bottom - GRAB;
      const inTitle = !!sg.title && wy <= top + SG_PAD + SG_TITLE;
      if (!nearBorder && !inTitle) continue; // open interior → let it pan
      const area = b.w * b.h;
      if (area < bestArea) {
        bestArea = area;
        best = sg.id;
      }
    }
    return best;
  }

  function onPointerDown(ev: PointerEvent): void {
    const target = ev.target as HTMLElement;
    // Toolbar controls (fit / zoom-in / zoom-out / SVG / PNG) live inside the
    // viewport, so their pointerdown bubbles here. Capturing the pointer for a
    // pan would steal the implicit pointerup and suppress the button's
    // synthesized click, so bail out and let the button's own click handler run
    // (it stops propagation itself) — mirroring the minimap's stopPropagation guard.
    if (target.closest && target.closest(".vnm-toolbar")) return;
    // An edge endpoint handle (shown on the selected node's incident edges)
    // starts a per-anchor pin drag (FR7). Checked before resize/card so the
    // small border handle wins its own pointerdown.
    const epHandle = target.closest ? (target.closest(".vnm-edge-handle") as HTMLElement | null) : null;
    if (epHandle && epHandle.dataset.ei !== undefined) {
      mode = "anchor";
      anchorEi = Number(epHandle.dataset.ei);
      anchorEnd = epHandle.dataset.end === "target" ? "target" : "source";
      const e = edgeEls[anchorEi]!;
      anchorNode = anchorEnd === "source" ? e.from : e.to;
      moved = false;
      startX = ev.clientX;
      startY = ev.clientY;
      viewport.setPointerCapture(ev.pointerId);
      return;
    }
    // A resize handle (shown on the selected node) starts a live resize.
    const handle = target.closest ? (target.closest(".vnm-resize-handle") as HTMLElement | null) : null;
    if (handle && selected && positions[selected]) {
      mode = "resize";
      resizeId = selected;
      rsx = Number(handle.dataset.sx);
      rsy = Number(handle.dataset.sy);
      const c = positions[resizeId]!;
      const s = sizes[resizeId]!;
      rFixedX = c.x - (rsx * s.w) / 2;
      rFixedY = c.y - (rsy * s.h) / 2;
      rMovableX = c.x + (rsx * s.w) / 2;
      rMovableY = c.y + (rsy * s.h) / 2;
      moved = false;
      startX = ev.clientX;
      startY = ev.clientY;
      viewport.setPointerCapture(ev.pointerId);
      return;
    }
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
      // Not on a card: a grab on a subgraph's border/title drags the whole
      // cluster (FR6 / D6=C); anything else pans the canvas.
      const w = pointerWorld(ev);
      const sgId = subgraphHit(w.x, w.y);
      if (sgId) {
        mode = "group";
        deselect();
        groupMembers = subgraphMembers[sgId] || [];
        groupStart = {};
        for (const id of groupMembers) groupStart[id] = { x: positions[id]!.x, y: positions[id]!.y };
      } else {
        mode = "pan";
        deselect();
        startTx = tx;
        startTy = ty;
        viewport.style.cursor = "grabbing";
      }
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
      renderSubgraphs();
      renderEdges();
      if (dragId === selected) positionHandles();
      drawMinimap();
    } else if (mode === "resize" && resizeId) {
      // Move the grabbed corner (world delta) with the opposite corner pinned;
      // clamp to a minimum size, then recompute center + re-route live.
      const movX = rMovableX + dx / scale;
      const movY = rMovableY + dy / scale;
      const newW = Math.max(MIN_SIZE, rsx * (movX - rFixedX));
      const newH = Math.max(MIN_SIZE, rsy * (movY - rFixedY));
      sizes[resizeId] = { w: newW, h: newH };
      positions[resizeId] = { x: rFixedX + (rsx * newW) / 2, y: rFixedY + (rsy * newH) / 2 };
      applyCardSize(resizeId);
      positionCard(resizeId);
      renderSubgraphs();
      renderEdges();
      positionHandles();
      drawMinimap();
    } else if (mode === "group") {
      // Move every member of the grabbed container by the same world delta; the
      // box follows via auto-contain, edges re-route from the moved boxes.
      for (const id of groupMembers) {
        const s0 = groupStart[id]!;
        positions[id] = { x: s0.x + dx / scale, y: s0.y + dy / scale };
        positionCard(id);
      }
      renderSubgraphs();
      renderEdges();
      positionHandles();
      drawMinimap();
    } else if (mode === "anchor" && anchorEi >= 0) {
      // Pin this edge end to the nearest border point under the pointer (FR7);
      // the other end keeps auto-distributing.
      const w = pointerWorld(ev);
      const p = positions[anchorNode]!;
      const s = sizes[anchorNode]!;
      const pin = anchorFromPointer({ x: p.x, y: p.y, w: s.w, h: s.h }, w.x, w.y);
      const cur = anchorsOv[anchorEi] || (anchorsOv[anchorEi] = {});
      cur[anchorEnd] = pin;
      renderEdges();
      drawMinimap();
    }
  }
  function onPointerUp(ev: PointerEvent): void {
    if (mode === "drag" && dragId) {
      cards[dragId]!.style.cursor = "grab";
      if (moved) schedulePersist();
      else selectNode(dragId);
    } else if (mode === "resize" && resizeId) {
      if (moved) schedulePersist();
    } else if (mode === "group") {
      if (moved) schedulePersist();
    } else if (mode === "anchor") {
      if (moved) schedulePersist();
    }
    viewport.style.cursor = "grab";
    try {
      viewport.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    mode = "none";
    dragId = null;
    resizeId = null;
    anchorEi = -1;
    groupMembers = [];
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
    positionHandles();
    // Mirror the resize-handle pattern for the edge-endpoint handles: reveal the
    // newly selected node's edge handles synchronously with the selection, not
    // only as an incidental side effect of a later render pass (TEST-002).
    positionEdgeHandles(computePorts());
  }
  function deselect(): void {
    if (selected && cards[selected]) cards[selected]!.style.outline = "";
    selected = null;
    hideHandles();
    // With nothing selected, this hides any still-visible edge handle at once
    // (mirrors hideHandles() for the resize corners) — TEST-002.
    positionEdgeHandles(computePorts());
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

  // Discard every manual edit and return to the computed layout the payload
  // shipped with — the escape hatch D2 relies on (resize/drag never re-runs
  // layout, so this is the only way back). Restores each node's original
  // position + size, re-routes all edges (computePorts re-spreads the perimeter
  // anchors from the restored boxes), and clears the persisted layout so a
  // reload stays reset. Pan/zoom is deliberately untouched — resetView() owns
  // that, and a reset of the arrangement shouldn't fling the viewport around.
  function resetLayout(): void {
    for (const nd of model.nodes) {
      positions[nd.id] = { x: nd.x - offsetX, y: nd.y - offsetY };
      sizes[nd.id] = { w: baseSizes[nd.id]!.w, h: baseSizes[nd.id]!.h };
    }
    // Discard every manual anchor pin (FR7) so edges return to auto-distribute.
    for (const k in anchorsOv) delete anchorsOv[Number(k)];
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (opt.persistKey) {
      try {
        win.localStorage.removeItem(opt.persistKey);
      } catch {
        /* storage unavailable */
      }
    }
    renderAll();
  }

  function exportLayout(): LayoutData {
    const pos: Record<string, { x: number; y: number }> = {};
    for (const id in positions) pos[id] = { x: positions[id]!.x + offsetX, y: positions[id]!.y + offsetY };
    // Only nodes the user actually resized (FR4) — keeps the sidecar minimal and
    // lets a re-measured base size win for everything else.
    const sz: Record<string, { w: number; h: number }> = {};
    for (const id in sizes) {
      const base = baseSizes[id];
      if (!base || sizes[id]!.w !== base.w || sizes[id]!.h !== base.h) {
        sz[id] = { w: sizes[id]!.w, h: sizes[id]!.h };
      }
    }
    // Manual anchor pins (FR7) — only the pinned edges, keyed by edge index. The
    // edge's from/to are stored alongside (REV-007) so a re-import can validate
    // the index still refers to the same edge (and re-map it if edges reordered).
    const an: Record<string, EdgeAnchor> = {};
    for (const k in anchorsOv) {
      const ov = anchorsOv[Number(k)]!;
      if (ov.source || ov.target) {
        const entry: EdgeAnchor = {};
        if (ov.source) entry.source = { side: ov.source.side, offset: ov.source.offset };
        if (ov.target) entry.target = { side: ov.target.side, offset: ov.target.offset };
        const e = edgeEls[Number(k)];
        if (e) {
          entry.from = e.from;
          entry.to = e.to;
        }
        an[k] = entry;
      }
    }
    const out: LayoutData = { version: 1, positions: pos, transform: { x: tx, y: ty, scale } };
    if (Object.keys(sz).length) out.sizes = sz;
    if (Object.keys(an).length) out.anchors = an;
    return out;
  }
  function importLayout(data: LayoutData): void {
    if (data && data.positions) {
      for (const id in data.positions) {
        if (positions[id]) positions[id] = { x: data.positions[id]!.x - offsetX, y: data.positions[id]!.y - offsetY };
      }
    }
    if (data && data.sizes) {
      for (const id in data.sizes) {
        if (sizes[id]) sizes[id] = { w: data.sizes[id]!.w, h: data.sizes[id]!.h };
      }
    }
    if (data && data.anchors) {
      // Validate index-keyed pins (FR7) against the current edges before applying
      // (REV-007): drop an out-of-range index, and — when the pin carries endpoint
      // identity — re-map it to the edge that still has that from/to (surviving an
      // edge reorder) or drop it if that edge is gone, so a stale sidecar never
      // silently pins a different edge. Mirrors applyPositions' resolver.
      const claimed: Record<number, boolean> = {};
      for (const k in data.anchors) {
        const src = data.anchors[k]!;
        const entry: { source?: { side: string; offset: number }; target?: { side: string; offset: number } } = {};
        if (src.source) entry.source = { side: src.source.side, offset: src.source.offset };
        if (src.target) entry.target = { side: src.target.side, offset: src.target.offset };
        if (!entry.source && !entry.target) continue;
        const idx = Number(k);
        const inRange = idx >= 0 && idx < edgeEls.length && Math.floor(idx) === idx;
        const hasId = src.from !== undefined && src.to !== undefined;
        let ti = -1;
        if (inRange && (!hasId || (edgeEls[idx]!.from === src.from && edgeEls[idx]!.to === src.to))) {
          ti = idx;
        } else if (hasId) {
          ti = edgeEls.findIndex((e, i) => !claimed[i] && e.from === src.from && e.to === src.to);
        }
        if (ti < 0 || claimed[ti]) continue; // out of range / edge gone / duplicate → drop
        claimed[ti] = true;
        anchorsOv[ti] = entry;
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

  // ================= SVG / PNG export (FR3 / D4) =================
  // An inlined serializer with parity to src/render/svg.ts: it builds our themed
  // SVG from the LIVE positioned model (current positions + sizes + re-routed
  // edges) in ABSOLUTE coords, so the saved image equals `vnm render -f svg` of
  // the edited state. The dom-runtime-parity guard byte-compares this to
  // renderSvg — keep the two in lockstep.
  type SvgNode = (typeof model.nodes)[number];
  type SvgSub = (typeof model.subgraphs)[number];
  function xmlEsc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function xmlAttr(s: string): string {
    return xmlEsc(s).replace(/"/g, "&quot;");
  }
  function absBox(id: string): Box {
    const p = positions[id]!;
    const s = sizes[id]!;
    return { x: p.x + offsetX, y: p.y + offsetY, w: s.w, h: s.h, shape: shapeById[id] };
  }
  function svgDefs(): string {
    const a = tokens.edge.arrowSize;
    const shadow = tokens.effects.gradient
      ? '<filter id="vnm-shadow" x="-30%" y="-30%" width="160%" height="160%">' +
        '<feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.35"/></filter>'
      : "";
    return (
      '<defs><marker id="vnm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="' + a +
      '" markerHeight="' + a + '" orient="auto-start-reverse">' +
      '<path d="M0 0 L10 5 L0 10 z" fill="' + tokens.colors.edge + '"/></marker>' + shadow + "</defs>"
    );
  }
  // Recompute the container box in ABSOLUTE coords from its live member boxes —
  // the same shared recompute applyPositions bakes, so `toSvgString()` stays
  // byte-identical to `renderSvg` of the edited model (FR6 parity).
  function subgraphAbsBox(sg: SvgSub): { x: number; y: number; w: number; h: number } {
    const ids = subgraphMembers[sg.id] || [];
    const boxes = ids.map(absBox);
    const b = sgBoxFrom(boxes, !!sg.title);
    return b ?? { x: sg.x, y: sg.y, w: sg.width, h: sg.height };
  }
  function svgSubgraph(sg: SvgSub): string {
    const b = subgraphAbsBox(sg);
    const x = nAt(b.x - b.w / 2);
    const y = nAt(b.y - b.h / 2);
    let out =
      '<rect x="' + x + '" y="' + y + '" width="' + nAt(b.w) + '" height="' + nAt(b.h) +
      '" rx="' + tokens.radii.card + '" fill="' + tokens.colors.subgraphFill + '" stroke="' +
      tokens.colors.subgraphStroke + '" stroke-dasharray="4 4"/>';
    if (sg.title) {
      out +=
        '<text x="' + nAt(x + 12) + '" y="' + nAt(y + 18) + '" fill="' + tokens.colors.subgraphText +
        '" font-size="' + (tokens.font.size - 1) + '" font-weight="600">' + xmlEsc(sg.title) + "</text>";
    }
    return out;
  }
  function svgEdgeLabel(label: string, cx: number, cy: number): string {
    const lines = label.split("\n");
    const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
    const w = maxChars * tokens.font.size * 0.62 + 10;
    const h = lines.length * tokens.font.lineHeight + 4;
    const x = nAt(cx - w / 2);
    const y = nAt(cy - h / 2);
    let out =
      '<rect x="' + x + '" y="' + y + '" width="' + nAt(w) + '" height="' + nAt(h) + '" rx="' +
      tokens.radii.label + '" fill="' + tokens.colors.edgeLabelBg + '"/>';
    const startY = cy - ((lines.length - 1) * tokens.font.lineHeight) / 2;
    lines.forEach((line, i) => {
      out +=
        '<text x="' + nAt(cx) + '" y="' + nAt(startY + i * tokens.font.lineHeight) + '" fill="' +
        tokens.colors.edgeLabelText + '" font-size="' + (tokens.font.size - 1) +
        '" text-anchor="middle" dominant-baseline="central">' + xmlEsc(line) + "</text>";
    });
    return out;
  }
  function svgEdge(e: EdgeEls, path: string, labelPos: Pt): string {
    const width = e.kind === "thick" ? tokens.edge.thickWidth : tokens.edge.width;
    const dash = e.kind === "dotted" ? ' stroke-dasharray="2 5"' : "";
    const mEnd = e.arrows.end ? ' marker-end="url(#vnm-arrow)"' : "";
    const mStart = e.arrows.start ? ' marker-start="url(#vnm-arrow)"' : "";
    let out =
      '<path d="' + path + '" fill="none" stroke="' + tokens.colors.edge + '" stroke-width="' + width +
      '" stroke-linejoin="round" stroke-linecap="round"' + dash + mStart + mEnd + "/>";
    if (e.label && labelPos) out += svgEdgeLabel(e.label, labelPos.x, labelPos.y);
    return out;
  }
  function svgPolygon(pts: number[][], common: string): string {
    return '<polygon points="' + pts.map((p) => nAt(p[0]!) + "," + nAt(p[1]!)).join(" ") + '" ' + common + "/>";
  }
  function svgShape(shape: string, box: Box, fill: string, stroke: string, sw: string, dash: string): string {
    const x = box.x - box.w / 2;
    const y = box.y - box.h / 2;
    const w = box.w;
    const h = box.h;
    const cx = box.x;
    const cy = box.y;
    const common = 'fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + dash;
    const rect = (rx: number): string =>
      '<rect x="' + nAt(x) + '" y="' + nAt(y) + '" width="' + nAt(w) + '" height="' + nAt(h) + '" rx="' + rx + '" ' + common + "/>";
    if (shape === "rounded") return rect(14);
    if (shape === "stadium") return rect(nAt(h / 2));
    if (shape === "subroutine") {
      const inset = 6;
      return (
        rect(4) +
        '<line x1="' + nAt(x + inset) + '" y1="' + nAt(y) + '" x2="' + nAt(x + inset) + '" y2="' + nAt(y + h) +
        '" stroke="' + stroke + '" stroke-width="' + sw + '"/>' +
        '<line x1="' + nAt(x + w - inset) + '" y1="' + nAt(y) + '" x2="' + nAt(x + w - inset) + '" y2="' + nAt(y + h) +
        '" stroke="' + stroke + '" stroke-width="' + sw + '"/>'
      );
    }
    if (shape === "circle")
      return '<ellipse cx="' + nAt(cx) + '" cy="' + nAt(cy) + '" rx="' + nAt(w / 2) + '" ry="' + nAt(h / 2) + '" ' + common + "/>";
    if (shape === "diamond")
      return svgPolygon([[cx, y], [x + w, cy], [cx, y + h], [x, cy]], common);
    if (shape === "hexagon") {
      const k = Math.min(w * 0.22, h * 0.5);
      return svgPolygon([[x + k, y], [x + w - k, y], [x + w, cy], [x + w - k, y + h], [x + k, y + h], [x, cy]], common);
    }
    if (shape === "parallelogram") {
      const k = Math.min(w * 0.22, h);
      return svgPolygon([[x + k, y], [x + w, y], [x + w - k, y + h], [x, y + h]], common);
    }
    if (shape === "parallelogram-alt") {
      const k = Math.min(w * 0.22, h);
      return svgPolygon([[x, y], [x + w - k, y], [x + w, y + h], [x + k, y + h]], common);
    }
    if (shape === "cylinder") {
      const ry = Math.min(10, h * 0.18);
      const top = y + ry;
      const bottom = y + h - ry;
      const d =
        "M " + nAt(x) + " " + nAt(top) + " C " + nAt(x) + " " + nAt(top - ry * 1.3) + " " + nAt(x + w) + " " +
        nAt(top - ry * 1.3) + " " + nAt(x + w) + " " + nAt(top) + " L " + nAt(x + w) + " " + nAt(bottom) +
        " C " + nAt(x + w) + " " + nAt(bottom + ry * 1.3) + " " + nAt(x) + " " + nAt(bottom + ry * 1.3) + " " +
        nAt(x) + " " + nAt(bottom) + " Z";
      const lid =
        "M " + nAt(x) + " " + nAt(top) + " C " + nAt(x) + " " + nAt(top + ry * 1.3) + " " + nAt(x + w) + " " +
        nAt(top + ry * 1.3) + " " + nAt(x + w) + " " + nAt(top);
      return '<path d="' + d + '" ' + common + '/><path d="' + lid + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
    }
    return rect(6);
  }
  function svgNodeText(node: SvgNode, box: Box, color: string): string {
    const lines = node.label.length ? node.label.split("\n") : [""];
    const startY = box.y - ((lines.length - 1) * tokens.font.lineHeight) / 2;
    return lines
      .map(
        (line, i) =>
          '<text x="' + nAt(box.x) + '" y="' + nAt(startY + i * tokens.font.lineHeight) + '" fill="' + color +
          '" font-size="' + tokens.font.size + '" font-weight="' + tokens.font.weight +
          '" text-anchor="middle" dominant-baseline="central">' + xmlEsc(line) + "</text>",
      )
      .join("");
  }
  function svgNode(node: SvgNode): string {
    const box = absBox(node.id);
    const st = styleForNode(node.id, node.classes, node.style);
    const shadow = tokens.effects.gradient ? ' filter="url(#vnm-shadow)"' : "";
    const sw = xmlAttr(st.strokeWidth ?? "1.5");
    const dash = st.strokeDasharray ? ' stroke-dasharray="' + xmlAttr(st.strokeDasharray) + '"' : "";
    const shape = svgShape(node.shape, box, xmlAttr(st.fill), xmlAttr(st.stroke), sw, dash);
    const text = svgNodeText(node, box, xmlAttr(st.text));
    return "<g" + shadow + ">" + shape + text + "</g>";
  }
  function boundsAbs(boxes: Box[], pts: Pt[]): { x: number; y: number; width: number; height: number } {
    const pad = 20;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b.x - b.w / 2);
      minY = Math.min(minY, b.y - b.h / 2);
      maxX = Math.max(maxX, b.x + b.w / 2);
      maxY = Math.max(maxY, b.y + b.h / 2);
    }
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
    return {
      x: nAt(minX - pad),
      y: nAt(minY - pad),
      width: nAt(maxX - minX + pad * 2),
      height: nAt(maxY - minY + pad * 2),
    };
  }
  function buildSvg(): { svg: string; width: number; height: number } {
    const ports = computePorts();
    const boxes: Box[] = [];
    for (const sg of model.subgraphs) boxes.push(subgraphAbsBox(sg));
    for (const nd of model.nodes) boxes.push(absBox(nd.id));
    const edgeParts: string[] = [];
    const allPts: Pt[] = [];
    edgeEls.forEach((e, i) => {
      const wps = e.waypoints ? e.waypoints.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })) : undefined;
      const r = routeBoxes(absBox(e.from), absBox(e.to), wps, ports[i], e.from === e.to);
      for (const p of r.points) allPts.push(p);
      edgeParts.push(svgEdge(e, r.path, r.labelPos));
    });
    const b = boundsAbs(boxes, allPts);
    const parts: string[] = [];
    parts.push(
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + nAt(b.width) + '" height="' + nAt(b.height) +
        '" viewBox="' + nAt(b.x) + " " + nAt(b.y) + " " + nAt(b.width) + " " + nAt(b.height) +
        '" font-family="' + xmlAttr(tokens.font.family) + '">',
    );
    parts.push(svgDefs());
    parts.push(
      '<rect x="' + nAt(b.x) + '" y="' + nAt(b.y) + '" width="' + nAt(b.width) + '" height="' + nAt(b.height) +
        '" fill="' + tokens.colors.background + '"/>',
    );
    for (const sg of model.subgraphs) parts.push(svgSubgraph(sg));
    for (const ep of edgeParts) parts.push(ep);
    for (const nd of model.nodes) parts.push(svgNode(nd));
    parts.push("</svg>");
    return { svg: parts.join("\n"), width: b.width, height: b.height };
  }
  function toSvgString(): string {
    return buildSvg().svg;
  }
  function exportFileBase(): string {
    const t = (doc.title || "").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return t || "diagram";
  }
  function triggerDownload(href: string, filename: string): void {
    const a = doc.createElement("a");
    a.setAttribute("href", href);
    a.setAttribute("download", filename);
    a.style.display = "none";
    if (doc.body) doc.body.appendChild(a);
    a.click();
    if (doc.body && a.parentNode) doc.body.removeChild(a);
  }
  function saveSvg(): void {
    const href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(toSvgString());
    triggerDownload(href, exportFileBase() + ".svg");
  }
  function savePng(): void {
    const built = buildSvg();
    const dpr = (win as unknown as { devicePixelRatio?: number }).devicePixelRatio || 1;
    const scale = Math.max(1, Math.min(3, dpr * 1.5));
    const w = Math.max(1, Math.round(built.width * scale));
    const h = Math.max(1, Math.round(built.height * scale));
    // NFR: no silent failures — every miss below reports a clear diagnostic.
    const fail = (msg: string): void => {
      const c = (win as unknown as { console?: { error?: (m: string) => void } }).console;
      if (c && c.error) c.error("[very-nice-mermaid] " + msg);
    };
    const img = doc.createElement("img") as HTMLImageElement;
    img.onload = (): void => {
      const canvas = doc.createElement("canvas") as HTMLCanvasElement;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        fail("PNG export failed: 2D canvas context is unavailable");
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      // D3 chose in-browser canvas rasterizing to a data: URI (no server, no
      // network). toDataURL can throw on a tainted canvas — surface it, never a
      // silent no-op. The export-html zero-network guard only flags a *CSS* url(
      // token (one not preceded by an identifier char), so the plain call is fine.
      let dataUrl: string;
      try {
        dataUrl = canvas.toDataURL("image/png");
      } catch (err) {
        fail("PNG export failed while encoding the canvas: " + err);
        return;
      }
      triggerDownload(dataUrl, exportFileBase() + ".png");
    };
    img.onerror = (): void =>
      fail("PNG export failed: the diagram SVG could not be loaded for rasterizing");
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(built.svg);
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
    resetLayout,
    exportLayout,
    importLayout,
    setTheme,
    getPositions: () => exportLayout().positions,
    toSvgString,
  };
}
