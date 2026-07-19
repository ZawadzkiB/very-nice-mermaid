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
import type { EdgeStyle, TokenSet, RenderStyle } from "../../theme/index.js";

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
  /** Drawing style axis (D1): `clean` (default) or hand-drawn `sketch`. */
  style?: RenderStyle;
  /** Edge-crossing bridges (FR7 / D4); `undefined` → per-style default. */
  bridges?: boolean;
  /**
   * Re-draw arrowheads in a top layer so a head ending on/inside a node is never
   * hidden by the node fill. `undefined`/`true` → on (flowchart default); the
   * class/state native mounts set `false` because their static twins
   * (renderClassSvg — UML markers — / renderStateSvg) emit no caps, and capping
   * them would draw a plain arrow over a UML relation marker.
   */
  arrowCaps?: boolean;
}

export interface RuntimePayload {
  model: SerializedModel;
  theme: RuntimeTheme;
  cssVars: string;
  options: RuntimeOptions;
  /**
   * Sketch-mode font, present only in sketch: the bundled `@font-face` CSS
   * (base64, zero network) injected on boot, and the family string the SVG
   * serializer stamps. Rides the payload because the runtime is
   * `.toString()`-serialized and cannot import `sketch-font.ts`.
   */
  sketch?: { fontFace: string; fontFamily: string };
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
  // Sketch (hand-drawn) mode: cards go transparent and every node/edge is drawn
  // via the inlined rough generator (ROUGH-PARITY below). The @font-face rides
  // the payload (the runtime can't import it) and is injected on boot.
  const sketch = opt.style === "sketch";
  // Arrowhead caps (layer 6): on for flowcharts, off for class/state natives whose
  // static twins emit no caps (see RuntimeOptions.arrowCaps).
  const arrowCaps = opt.arrowCaps !== false;
  // Sketch look constants — mirror src/rough SKETCH (ROUGH-PARITY). Declared here
  // (not in the geometry block below) so the node-shape setup can read them.
  const SK_ROUGHNESS = 2.4;
  const SK_BOWING = 2.2;
  const SK_OUTLINE_STROKES = 2;
  const SK_ELLIPSE_STEPS = 22;
  const SK_FILL_ROUGHNESS = 1.2;

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

  // Inject the bundled handwriting @font-face (sketch mode) — self-contained
  // base64, no network. Scoped to this viewport so multiple mounts don't clash.
  if (sketch && payload.sketch) {
    const fontStyle = doc.createElement("style");
    fontStyle.textContent = payload.sketch.fontFace;
    viewport.appendChild(fontStyle);
  }

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
  // orient="auto" + a mirrored start marker (see src/render/svg.ts defs()): keep
  // both marker ids/geometry in lockstep with the static SVG so the interactive
  // view, the PNG, and Save-SVG all point their arrowheads the same way.
  defs.innerHTML =
    '<marker id="vnm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="' +
    tokens.edge.arrowSize +
    '" markerHeight="' +
    tokens.edge.arrowSize +
    '" orient="auto"><path d="M0 0 L10 5 L0 10 z"></path></marker>' +
    '<marker id="vnm-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="' +
    tokens.edge.arrowSize +
    '" markerHeight="' +
    tokens.edge.arrowSize +
    '" orient="auto"><path d="M10 0 L0 5 L10 10 z"></path></marker>';
  svg.appendChild(defs);
  // Explicit z-layer groups (FR1): append order = paint order, so nothing legible
  // is ever covered — 1 subgraph boxes, 2 edges (paths + arrowheads), 3 edge
  // labels, 4 subgraph titles (opaque plate). Node bodies sit on top of all of
  // them (clean = HTML cards in `world`; sketch = rough outlines in gNodes).
  // Mirrors the static SVG layer order in src/render/svg.ts (renderSvgFromModel).
  const gBoxes = doc.createElementNS(SVGNS, "g");
  const gEdges = doc.createElementNS(SVGNS, "g");
  const gLabels = doc.createElementNS(SVGNS, "g");
  const gTitles = doc.createElementNS(SVGNS, "g");
  const gNodes = doc.createElementNS(SVGNS, "g");
  gBoxes.setAttribute("class", "vnm-subgraph-layer");
  gEdges.setAttribute("class", "vnm-edge-layer");
  gLabels.setAttribute("class", "vnm-label-layer");
  gTitles.setAttribute("class", "vnm-title-layer");
  gNodes.setAttribute("class", "vnm-node-layer");
  svg.appendChild(gBoxes);
  svg.appendChild(gEdges);
  svg.appendChild(gLabels);
  svg.appendChild(gTitles);
  svg.appendChild(gNodes);
  world.appendChild(svg);

  // ---- subgraph containers (FR6 / D6=C) ----
  // Auto-contain constants — mirror src/geometry (SUBGRAPH_PADDING/TITLE_BAND).
  // SG_TITLE bumped to 22 (FR2) so the title's opaque plate clears the top member.
  const SG_PAD = 14;
  const SG_TITLE = 22;
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
    plate?: SVGRectElement;
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
    gBoxes.appendChild(r); // layer 1
    const rec: SubgraphEls = { sg, rect: r };
    if (sg.title) {
      // Opaque title plate (FR2): the subgraph fill, sized to the text, in the
      // titles layer (after edges) so a crossing edge reads as passing behind it.
      const plate = doc.createElementNS(SVGNS, "rect");
      plate.setAttribute("class", "vnm-subgraph-title-plate");
      plate.setAttribute("fill", "var(--vnm-subgraph-fill)");
      plate.setAttribute("rx", String(tokens.radii.label));
      gTitles.appendChild(plate); // layer 4 (plate behind text)
      const tnode = doc.createElementNS(SVGNS, "text");
      tnode.setAttribute("class", "vnm-subgraph-title");
      tnode.setAttribute("fill", "var(--vnm-subgraph-text)");
      tnode.setAttribute("font-size", String(tokens.font.size - 1));
      tnode.setAttribute("font-weight", "600");
      tnode.textContent = sg.title;
      gTitles.appendChild(tnode); // layer 4
      rec.plate = plate;
      rec.text = tnode;
    }
    subgraphEls.push(rec);
  }
  // Recompute + reposition every container rect (+ title plate + title) from its
  // live members. The plate geometry mirrors src/render/svg.ts renderSubgraphTitle.
  function renderSubgraphs(): void {
    for (const rec of subgraphEls) {
      const b = subgraphWorldBox(rec.sg);
      rec.rect.setAttribute("x", String(b.x - b.w / 2));
      rec.rect.setAttribute("y", String(b.y - b.h / 2));
      rec.rect.setAttribute("width", String(b.w));
      rec.rect.setAttribute("height", String(b.h));
      if (rec.text) {
        const tx = b.x - b.w / 2 + 12;
        const ty = b.y - b.h / 2 + 18;
        rec.text.setAttribute("x", String(tx));
        rec.text.setAttribute("y", String(ty));
        if (rec.plate) {
          const fs = tokens.font.size - 1;
          const pad = 5;
          const pw = rec.sg.title!.length * fs * 0.6 + pad * 2;
          rec.plate.setAttribute("x", String(nAt(tx - pad)));
          rec.plate.setAttribute("y", String(nAt(ty - fs + 1)));
          rec.plate.setAttribute("width", String(nAt(pw)));
          rec.plate.setAttribute("height", String(fs + 4));
        }
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
    /** Sketch mode only: a separate SOLID path for the open arrowhead (REV-002),
     *  so the line's dotted dash never fragments the V. */
    headPath?: SVGPathElement;
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
    // Clean mode uses the triangle marker; sketch mode draws its own open
    // arrowheads directly into the (multi-subpath) edge `d`, so no marker.
    if (!sketch && e.arrows.end) path.setAttribute("marker-end", "url(#vnm-arrow)");
    if (!sketch && e.arrows.start) path.setAttribute("marker-start", "url(#vnm-arrow-start)");
    gEdges.appendChild(path); // layer 2
    const rec: EdgeEls = { from: e.from, to: e.to, kind: e.kind, arrows: e.arrows, path };
    // Sketch: a separate SOLID arrowhead path (never dashed), so a dotted line's
    // dash can't fragment the open V (REV-002).
    if (sketch && (e.arrows.end || e.arrows.start)) {
      const head = doc.createElementNS(SVGNS, "path");
      head.setAttribute("fill", "none");
      head.setAttribute("stroke", "var(--vnm-edge)");
      head.setAttribute("stroke-width", String(e.kind === "thick" ? tokens.edge.thickWidth : tokens.edge.width));
      head.setAttribute("stroke-linejoin", "round");
      head.setAttribute("stroke-linecap", "round");
      gEdges.appendChild(head); // layer 2 (sketch open arrowhead)
      rec.headPath = head;
    }
    if (e.waypoints && e.waypoints.length) {
      rec.waypoints = e.waypoints.map((p) => ({ x: p.x - offsetX, y: p.y - offsetY }));
    }
    if (e.label) {
      rec.label = e.label;
      const plate = doc.createElementNS(SVGNS, "rect");
      plate.setAttribute("fill", "var(--vnm-edge-label-bg)");
      plate.setAttribute("rx", String(tokens.radii.label));
      gLabels.appendChild(plate); // layer 3 (after all edges)
      const text = doc.createElementNS(SVGNS, "text");
      text.setAttribute("fill", "var(--vnm-edge-label-text)");
      text.setAttribute("font-size", String(tokens.font.size - 1));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.textContent = e.label;
      gLabels.appendChild(text); // layer 3
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

  // Layer 6 — arrowhead cap overlay. Clean-mode node bodies are HTML cards in
  // `world` (painted OVER the edge <svg>), so a head ending on/inside a node is
  // hidden by its card. This overlay <svg> is appended AFTER the cards, so its
  // re-drawn heads sit on top of everything; it references the main <svg>'s
  // markers (document-scoped url(#…)) and repaints on every renderEdges. Off for
  // class/state natives (arrowCaps=false). pointer-events:none so it never eats
  // a drag. Mirrors the static layer 6 (svgEdgeArrowCap) for on-screen parity.
  const capOverlay = arrowCaps ? doc.createElementNS(SVGNS, "svg") : null;
  if (capOverlay) {
    capOverlay.setAttribute("class", "vnm-arrow-caps");
    capOverlay.setAttribute("width", String(contentW));
    capOverlay.setAttribute("height", String(contentH));
    capOverlay.setAttribute("style", "position:absolute;left:0;top:0;overflow:visible;pointer-events:none;");
    world.appendChild(capOverlay);
  }

  // ---- sketch node outlines (D2 / FR2) ----
  // In sketch mode each node's visible body is a rough SVG outline drawn in the
  // edge layer (behind the transparent card): one soft fill path + N wobbly
  // outline strokes (+ a subroutine's side bars). Re-generated on drag/resize
  // from the live box; seeded by node id so the wobble is stable (ROUGH-PARITY
  // with src/render/svg.ts sketchShape).
  interface NodeShapeEls {
    fill: SVGPathElement;
    strokes: SVGPathElement[];
  }
  const nodeShapeEls: Record<string, NodeShapeEls> = {};
  // State `[*]` pseudo-state markers stay CLEAN even in sketch (a solid dot for
  // start, a ringed circle for end) — mirrors the static state SVG (TEST-001).
  const stateMarkerEls: Record<string, SVGCircleElement[]> = {};
  if (sketch) {
    for (const nd of model.nodes) {
      if (nd.stateMarker) {
        const circles: SVGCircleElement[] = [];
        const mk = (): SVGCircleElement => {
          const c = doc.createElementNS(SVGNS, "circle") as SVGCircleElement;
          gNodes.appendChild(c); // layer 5 (node bodies on top)
          circles.push(c);
          return c;
        };
        if (nd.stateMarker === "start") {
          mk().setAttribute("fill", tokens.colors.text); // solid dot
        } else {
          const ring = mk(); // ringed "end" circle
          ring.setAttribute("fill", "none");
          ring.setAttribute("stroke", tokens.colors.text);
          ring.setAttribute("stroke-width", "1.5");
          mk().setAttribute("fill", tokens.colors.text); // inner dot
        }
        stateMarkerEls[nd.id] = circles;
        continue;
      }
      const st = styleForNode(nd.id, nd.classes, nd.style);
      const sw = st.strokeWidth ?? "1.5";
      const fillEl = doc.createElementNS(SVGNS, "path");
      fillEl.setAttribute("fill", st.fill);
      fillEl.setAttribute("stroke", "none");
      gNodes.appendChild(fillEl); // layer 5 (sketch node body on top)
      const probe = sketchShapePoints(nd.shape, 0, 0, 100, 100);
      const strokeCount = SK_OUTLINE_STROKES + probe.extras.length * SK_OUTLINE_STROKES;
      const strokes: SVGPathElement[] = [];
      for (let i = 0; i < strokeCount; i++) {
        const p = doc.createElementNS(SVGNS, "path");
        p.setAttribute("fill", "none");
        p.setAttribute("stroke", st.stroke);
        p.setAttribute("stroke-width", sw);
        p.setAttribute("stroke-linejoin", "round");
        p.setAttribute("stroke-linecap", "round");
        if (st.strokeDasharray) p.setAttribute("stroke-dasharray", st.strokeDasharray);
        gNodes.appendChild(p); // layer 5
        strokes.push(p);
      }
      nodeShapeEls[nd.id] = { fill: fillEl, strokes };
    }
  }
  // Regenerate one node's rough outline from its live box (sketch mode).
  function renderNodeShape(id: string): void {
    const markers = stateMarkerEls[id];
    if (markers) {
      const mp = positions[id]!;
      const ms = sizes[id]!;
      const r = Math.min(9, ms.w / 2);
      for (const c of markers) {
        c.setAttribute("cx", String(nAt(mp.x)));
        c.setAttribute("cy", String(nAt(mp.y)));
      }
      markers[0]!.setAttribute("r", String(nAt(r))); // dot (start) or ring (end)
      if (markers[1]) markers[1].setAttribute("r", String(nAt(r - 4))); // end inner dot
      return;
    }
    const els = nodeShapeEls[id];
    if (!els) return;
    const p = positions[id]!;
    const s = sizes[id]!;
    const { pts, extras } = sketchShapePoints(shapeById[id]!, p.x - s.w / 2, p.y - s.h / 2, s.w, s.h);
    const rs = roughShape(pts, id);
    els.fill.setAttribute("d", rs.fill);
    const ds: string[] = rs.outline.slice();
    extras.forEach((seg, i) => {
      for (const d of roughPolyline(seg, id + "#x" + i)) ds.push(d);
    });
    els.strokes.forEach((el, i) => el.setAttribute("d", ds[i] ?? ""));
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

  // ========== rough sketch generator — MIRRORS src/rough (ROUGH-PARITY) ========
  // Byte-identical to src/rough/index.ts so toSvgString() matches renderSvg in
  // sketch mode. `nAt` here == src/rough's `rn` (both round to 2 decimals). The
  // SK_* constants are declared at the top of vnmRuntime (used earlier too).
  // If you change a function here, change its twin there.
  function roughSeed(key: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return function (): number {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function roughStroke(pts: number[][], closed: boolean, rand: () => number, rough: number, bow: number): string {
    if (pts.length === 0) return "";
    const jv: number[][] = pts.map((p) => [p[0]! + (rand() * 2 - 1) * rough, p[1]! + (rand() * 2 - 1) * rough]);
    const seq: number[][] = closed ? [...jv, jv[0]!] : jv;
    let d = "M " + nAt(seq[0]![0]!) + " " + nAt(seq[0]![1]!);
    for (let i = 1; i < seq.length; i++) {
      const ax = seq[i - 1]![0]!;
      const ay = seq[i - 1]![1]!;
      const bx = seq[i]![0]!;
      const by = seq[i]![1]!;
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const px = -(by - ay) / len;
      const py = (bx - ax) / len;
      const k = (rand() * 2 - 1) * bow;
      const cx = (ax + bx) / 2 + px * k;
      const cy = (ay + by) / 2 + py * k;
      d += " Q " + nAt(cx) + " " + nAt(cy) + " " + nAt(bx) + " " + nAt(by);
    }
    if (closed) d += " Z";
    return d;
  }
  function roughShape(pts: number[][], key: string): { fill: string; outline: string[] } {
    const fill = roughStroke(pts, true, mulberry32(roughSeed(key + "#f")), SK_FILL_ROUGHNESS, SK_BOWING);
    const outline: string[] = [];
    for (let s = 0; s < SK_OUTLINE_STROKES; s++) {
      outline.push(roughStroke(pts, true, mulberry32(roughSeed(key + "#o" + s)), SK_ROUGHNESS, SK_BOWING));
    }
    return { fill, outline };
  }
  function sketchEllipsePoints(cx: number, cy: number, rx: number, ry: number): number[][] {
    const pts: number[][] = [];
    for (let i = 0; i < SK_ELLIPSE_STEPS; i++) {
      const a = (i / SK_ELLIPSE_STEPS) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return pts;
  }
  function roughPolyline(pts: number[][], key: string): string[] {
    const out: string[] = [];
    for (let s = 0; s < SK_OUTLINE_STROKES; s++) {
      out.push(roughStroke(pts, false, mulberry32(roughSeed(key + "#e" + s)), SK_ROUGHNESS * 0.8, SK_BOWING * 0.8));
    }
    return out;
  }
  function openArrowhead(tip: number[], from: number[], size: number, key: string): string {
    const ang = Math.atan2(tip[1]! - from[1]!, tip[0]! - from[0]!);
    const r = mulberry32(roughSeed(key + "#a"));
    const spread = 0.52;
    const len = size * 2.1;
    const a1 = ang + Math.PI - spread + (r() * 2 - 1) * 0.12;
    const a2 = ang + Math.PI + spread + (r() * 2 - 1) * 0.12;
    const l1 = len * (1 + (r() * 2 - 1) * 0.14);
    const l2 = len * (1 + (r() * 2 - 1) * 0.14);
    const b1x = tip[0]! + Math.cos(a1) * l1;
    const b1y = tip[1]! + Math.sin(a1) * l1;
    const b2x = tip[0]! + Math.cos(a2) * l2;
    const b2y = tip[1]! + Math.sin(a2) * l2;
    return "M " + nAt(b1x) + " " + nAt(b1y) + " L " + nAt(tip[0]!) + " " + nAt(tip[1]!) + " L " + nAt(b2x) + " " + nAt(b2y);
  }
  function sketchShapePoints(shape: string, x: number, y: number, w: number, h: number): { pts: number[][]; extras: number[][][] } {
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (shape === "circle") return { pts: sketchEllipsePoints(cx, cy, w / 2, h / 2), extras: [] };
    if (shape === "diamond") return { pts: [[cx, y], [x + w, cy], [cx, y + h], [x, cy]], extras: [] };
    if (shape === "hexagon") {
      const k = Math.min(w * 0.22, h * 0.5);
      return { pts: [[x + k, y], [x + w - k, y], [x + w, cy], [x + w - k, y + h], [x + k, y + h], [x, cy]], extras: [] };
    }
    if (shape === "parallelogram") {
      const k = Math.min(w * 0.22, h);
      return { pts: [[x + k, y], [x + w, y], [x + w - k, y + h], [x, y + h]], extras: [] };
    }
    if (shape === "parallelogram-alt") {
      const k = Math.min(w * 0.22, h);
      return { pts: [[x, y], [x + w - k, y], [x + w, y + h], [x + k, y + h]], extras: [] };
    }
    if (shape === "subroutine") {
      const inset = 6;
      return {
        pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
        extras: [[[x + inset, y], [x + inset, y + h]], [[x + w - inset, y], [x + w - inset, y + h]]],
      };
    }
    return { pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], extras: [] };
  }
  // Live-edge sketch `d`s, split so the LINE can carry the dotted dash while the
  // open arrowhead stays SOLID (REV-002) — they go to two separate <path>s.
  function sketchEdgeParts(
    pts: Array<{ x: number; y: number }>,
    key: string,
    arrows: { start: boolean; end: boolean },
    size: number,
  ): { line: string; head: string } {
    const arr = pts.map((p) => [p.x, p.y]);
    const line = roughPolyline(arr, key).join(" ");
    const m = arr.length;
    let head = "";
    if (arrows.end && m >= 2) head += openArrowhead(arr[m - 1]!, arr[m - 2]!, size, key + "@end");
    if (arrows.start && m >= 2) head += (head ? " " : "") + openArrowhead(arr[0]!, arr[1]!, size, key + "@start");
    return { line, head };
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
    perpendicularizeEntry(out, entryVertical);
    return simplify(out);
  }
  // mirrors geometry.perpendicularizeEntry() (FR2): force the closing segment to enter
  // its target perpendicular to the border (arrowhead INTO the node) by swapping the
  // last elbow corner when a bend left the final approach parallel to it. Endpoints
  // fixed; a route already entering perpendicular is untouched. Keep in lockstep.
  function perpendicularizeEntry(out: Pt[], entryVertical: boolean): void {
    if (out.length < 3) return;
    const end = out[out.length - 1]!;
    const a = out[out.length - 3]!;
    const b = out[out.length - 2]!;
    const finalPerp = entryVertical ? nAt(b.x) === nAt(end.x) : nAt(b.y) === nAt(end.y);
    const swappable = entryVertical ? nAt(a.y) !== nAt(end.y) : nAt(a.x) !== nAt(end.x);
    if (!finalPerp && swappable) {
      out[out.length - 2] = entryVertical ? { x: end.x, y: a.y } : { x: a.x, y: end.y };
    }
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
  // mirrors geometry.labelPoint(): the routed label anchor, ROUNDED to 2dp exactly
  // like geometry (n(...)). Rounding here (not just at the SVG sink) keeps
  // `labelPos` byte-identical to the static side *before* the FR9 lane pass reads
  // it (shiftLabelOnSeg), and folds a labelShift in the same order geometry does
  // (round the midpoint, then add the shift).
  function labelPoly(points: Pt[]): Pt {
    if (points.length === 2) return { x: nAt((points[0]!.x + points[1]!.x) / 2), y: nAt((points[0]!.y + points[1]!.y) / 2) };
    const mid = Math.floor(points.length / 2);
    return { x: nAt((points[mid - 1]!.x + points[mid]!.x) / 2), y: nAt((points[mid - 1]!.y + points[mid]!.y) / 2) };
  }
  function labelBezier(p: Pt[]): Pt {
    return {
      x: nAt(0.125 * p[0]!.x + 0.375 * p[1]!.x + 0.375 * p[2]!.x + 0.125 * p[3]!.x),
      y: nAt(0.125 * p[0]!.y + 0.375 * p[1]!.y + 0.375 * p[2]!.y + 0.125 * p[3]!.y),
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
      // Order ports by the edge's actual heading (first bend at the source, last at
      // the target) so a detoured edge takes the port on its detour's side; a
      // straight edge (no kept bends) falls back to the far node's centre. Mirrors
      // geometry.computePerimeterPorts' `bends` handling for byte parity.
      const wp = e.waypoints;
      const srcHead = wp && wp.length ? wp[0]! : to;
      const tgtHead = wp && wp.length ? wp[wp.length - 1]! : from;
      // A manually pinned end (FR7) is used verbatim + excluded from the spread
      // groups, so it stays put while its unpinned siblings auto-distribute —
      // mirrors computePerimeterPorts' override handling for byte parity.
      const ov = anchorsOv[i];
      if (ov && ov.source) {
        res[i]!.source = { side: ov.source.side, offset: ov.source.offset };
      } else {
        res[i]!.source = { side: exit, offset: 0 };
        const gs = e.from + "|" + exit;
        (groups[gs] || (groups[gs] = [])).push({ i, role: "source", along: axisX(exit) ? srcHead.x : srcHead.y });
      }
      if (ov && ov.target) {
        res[i]!.target = { side: ov.target.side, offset: ov.target.offset };
      } else {
        res[i]!.target = { side: entry, offset: 0 };
        const gt = e.to + "|" + entry;
        (groups[gt] || (groups[gt] = [])).push({ i, role: "target", along: axisX(entry) ? tgtHead.x : tgtHead.y });
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
      // FR4 spread — keep in lockstep with geometry.computePerimeterPorts: the
      // preferred PORT_STEP (30) caps a small fan, while a large fan on a wide
      // border uses the border-filling step that lands the extreme anchors on
      // anchorBound (borderLen/2 − PORT_MARGIN, PORT_MARGIN = 6).
      const step = Math.min(30, (borderLen - 2 * 6) / (k - 1));
      recs.forEach((r, slot) => {
        res[r.i]![r.role].offset = (slot - (k - 1) / 2) * step;
      });
    }
    // v0.6.5 (defect #2) — de-skewer a lone-in / lone-out collinear pass-through:
    // a node with exactly one lone-top + lone-bottom (or lone-left + lone-right) edge
    // heading in OPPOSITE directions gets one port nudged PORT_STEP/2 (=15) toward its
    // own heading. Keep byte-identical to geometry.computePerimeterPorts' deskewer
    // (PORT_STEP/2 tolerance + nudge, PORT_MARGIN=6 room gate); a straight A→B→C pass
    // (headings on the centre) and any spread side stay untouched.
    const deskewer = (nodeId: string, sideA: string, sideB: string): void => {
      const ra = groups[nodeId + "|" + sideA];
      const rb = groups[nodeId + "|" + sideB];
      if (!ra || !rb || ra.length !== 1 || rb.length !== 1) return;
      const box = boxOf(nodeId);
      const axisIsX = sideA === "top" || sideA === "bottom";
      const c = axisIsX ? box.x : box.y;
      // Heading = each edge's FAR node centre (dagre may run both waypoint columns
      // straight through the node, so the immediate bend is a false "aligned").
      const farOff = (rec: { i: number; role: "source" | "target" }): number | undefined => {
        const e = edgeEls[rec.i]!;
        const fb = boxOf(rec.role === "target" ? e.from : e.to);
        return fb ? (axisIsX ? fb.x : fb.y) - c : undefined;
      };
      const dA = farOff(ra[0]!);
      const dB = farOff(rb[0]!);
      if (dA === undefined || dB === undefined) return;
      const tol = 30 / 2;
      if (Math.sign(dA) === Math.sign(dB) || Math.abs(dA) < tol || Math.abs(dB) < tol) return;
      if ((axisIsX ? box.w : box.h) / 2 - 6 < tol) return;
      const rec = ra[0]!;
      res[rec.i]![rec.role].offset = Math.sign(dA) * tol;
    };
    const skNodes: Record<string, boolean> = {};
    for (const key in groups) skNodes[key.slice(0, key.lastIndexOf("|"))] = true;
    for (const nodeId in skNodes) {
      deskewer(nodeId, "top", "bottom");
      deskewer(nodeId, "left", "right");
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
        // FR3 tightened plate — keep in lockstep with layout.labelPlateSize.
        return runX ? maxChars * (tokens.font.size * 0.6) + 6 : lns.length * tokens.font.lineHeight + 2;
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

  // FR3-tightened plate size for one label — mirrors layout.labelPlateSize
  // (0.6·size+6 / lines·lh+2). Used by the FR6 de-collision twin below.
  function plateSizeOf(label: string): { w: number; h: number } {
    const lns = label.split("\n");
    const maxChars = lns.reduce((m, l) => Math.max(m, l.length), 0);
    return { w: maxChars * tokens.font.size * 0.6 + 6, h: lns.length * tokens.font.lineHeight + 2 };
  }
  // mirrors geometry.resolveLabelCollisions() (FR6): all-pairs edge-label plate
  // de-collision — nudge overlapping plates apart along the axis of least
  // penetration until they clear by PORT_LABEL_PAD (=6). Deterministic (fixed
  // pair + tiebreak order, no RNG), so it produces byte-identical shifts to the
  // static twin. Returns a shift {x,y} per input index. Keep in lockstep.
  function resolveLabelCollisions(plates: Array<{ x: number; y: number; w: number; h: number } | undefined>): Pt[] {
    const shifts: Pt[] = plates.map(() => ({ x: 0, y: 0 }));
    const idxs: number[] = [];
    plates.forEach((p, i) => {
      if (p) idxs.push(i);
    });
    if (idxs.length < 2) return shifts;
    const cx = plates.map((p) => (p ? p.x : 0));
    const cy = plates.map((p) => (p ? p.y : 0));
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (let a = 0; a < idxs.length; a++) {
        for (let b = a + 1; b < idxs.length; b++) {
          const i = idxs[a]!;
          const j = idxs[b]!;
          const pi = plates[i]!;
          const pj = plates[j]!;
          const dx = cx[j]! - cx[i]!;
          const dy = cy[j]! - cy[i]!;
          const ox = (pi.w + pj.w) / 2 + 6 - Math.abs(dx);
          const oy = (pi.h + pj.h) / 2 + 6 - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          if (ox <= oy) {
            const push = ox / 2;
            const dir = dx === 0 ? 1 : Math.sign(dx);
            cx[i] = cx[i]! - push * dir;
            cx[j] = cx[j]! + push * dir;
          } else {
            const push = oy / 2;
            const dir = dy === 0 ? 1 : Math.sign(dy);
            cy[i] = cy[i]! - push * dir;
            cy[j] = cy[j]! + push * dir;
          }
        }
      }
      if (!moved) break;
    }
    for (const i of idxs) shifts[i] = { x: nAt(cx[i]! - plates[i]!.x), y: nAt(cy[i]! - plates[i]!.y) };
    return shifts;
  }

  // mirrors geometry.segmentsCross() (FR7): proper crossing of two segments or null.
  function segmentsCross(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
    const rx = a2.x - a1.x;
    const ry = a2.y - a1.y;
    const sx = b2.x - b1.x;
    const sy = b2.y - b1.y;
    const denom = rx * sy - ry * sx;
    if (denom === 0) return null;
    const qpx = b1.x - a1.x;
    const qpy = b1.y - a1.y;
    const t = (qpx * sy - qpy * sx) / denom;
    const u = (qpx * ry - qpy * rx) / denom;
    if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) return { x: a1.x + t * rx, y: a1.y + t * ry };
    return null;
  }
  // mirrors geometry.applyEdgeBridges()/gappedPath() (FR7 gap pivot): a small pen-up
  // GAP at each crossing (radius 4, ~8px total), byte-identical to the static twin
  // (same more-vertical-breaks / lower-index-tie rule, same `L .. M ..` d format).
  // Keep in lockstep.
  function gappedPath(points: Pt[], gaps: Array<{ seg: number; at: Pt; dist: number }>): string {
    const bySeg: Record<number, Array<{ at: Pt; dist: number }>> = {};
    for (const g of gaps) (bySeg[g.seg] || (bySeg[g.seg] = [])).push({ at: g.at, dist: g.dist });
    for (const k in bySeg) bySeg[k]!.sort((p, q) => p.dist - q.dist);
    let d = "M " + nAt(points[0]!.x) + " " + nAt(points[0]!.y);
    for (let s = 0; s + 1 < points.length; s++) {
      const p = points[s]!;
      const q = points[s + 1]!;
      const segGaps = bySeg[s];
      if (!segGaps || !segGaps.length) {
        d += " L " + nAt(q.x) + " " + nAt(q.y);
        continue;
      }
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const ux = (q.x - p.x) / len;
      const uy = (q.y - p.y) / len;
      let lastGapDist = -Infinity;
      for (const g of segGaps) {
        // Skip a gap overlapping the previous one on this segment (mirrors geometry).
        if (g.dist - lastGapDist < 8) continue;
        lastGapDist = g.dist;
        const ex = g.at.x - ux * 4;
        const ey = g.at.y - uy * 4;
        const xx = g.at.x + ux * 4;
        const xy = g.at.y + uy * 4;
        d += " L " + nAt(ex) + " " + nAt(ey) + " M " + nAt(xx) + " " + nAt(xy);
      }
      d += " L " + nAt(q.x) + " " + nAt(q.y);
    }
    return d;
  }
  function applyEdgeBridges(polys: Pt[][], enabled: boolean): (string | null)[] {
    const out: (string | null)[] = polys.map(() => null);
    if (!enabled) return out;
    const rp = polys.map((pts) => pts.map((p) => ({ x: nAt(p.x), y: nAt(p.y) })));
    const gaps: Array<Array<{ seg: number; at: Pt; dist: number }>> = polys.map(() => []);
    for (let i = 0; i < rp.length; i++) {
      const pi = rp[i]!;
      if (pi.length < 2) continue;
      for (let j = i + 1; j < rp.length; j++) {
        const pj = rp[j]!;
        if (pj.length < 2) continue;
        for (let si = 0; si + 1 < pi.length; si++) {
          const a1 = pi[si]!;
          const a2 = pi[si + 1]!;
          for (let sj = 0; sj + 1 < pj.length; sj++) {
            const b1 = pj[sj]!;
            const b2 = pj[sj + 1]!;
            const x = segmentsCross(a1, a2, b1, b2);
            if (!x) continue;
            const horizI = Math.abs(a2.x - a1.x) >= Math.abs(a2.y - a1.y);
            const horizJ = Math.abs(b2.x - b1.x) >= Math.abs(b2.y - b1.y);
            const iGaps = horizI === horizJ ? true : !horizI;
            const ge = iGaps ? i : j;
            const gs = iGaps ? si : sj;
            const s1 = iGaps ? a1 : b1;
            const s2 = iGaps ? a2 : b2;
            const dEntry = Math.hypot(x.x - s1.x, x.y - s1.y);
            const dExit = Math.hypot(x.x - s2.x, x.y - s2.y);
            if (dEntry < 4 || dExit < 4) continue;
            gaps[ge]!.push({ seg: gs, at: x, dist: dEntry });
          }
        }
      }
    }
    for (let e = 0; e < rp.length; e++) if (gaps[e]!.length) out[e] = gappedPath(rp[e]!, gaps[e]!);
    return out;
  }
  // mirrors geometry.shiftLabelOnSeg() (FR9): if an edge's label sits on the run
  // being re-laned, slide it into the new lane. Keep in lockstep with geometry.
  type LaneSeg = { edge: number; i: number; along: number; lo: number; hi: number };
  function shiftLabelOnSeg(e: { labelPos: Pt }, vertical: boolean, seg: LaneSeg, target: number): void {
    const lp = e.labelPos;
    if (!lp) return;
    if (vertical) {
      if (Math.abs(lp.x - seg.along) < 26 && lp.y >= seg.lo - 1 && lp.y <= seg.hi + 1) {
        e.labelPos = { x: nAt(lp.x + (target - seg.along)), y: lp.y };
      }
    } else if (Math.abs(lp.y - seg.along) < 26 && lp.x >= seg.lo - 1 && lp.x <= seg.hi + 1) {
      e.labelPos = { x: lp.x, y: nAt(lp.y + (target - seg.along)) };
    }
  }
  // mirrors geometry.avoidSubgraphs() (v0.6.6, defect #3, D1=A): pull an edge's long
  // interior trunk OUT of a container box that doesn't hold BOTH its endpoints (push to
  // the container's nearest side + MARGIN=28), then lower the re-entry corner near the
  // interior endpoint (D2=A) so the residual interior crossing is a short approach. Runs
  // FIRST on the routed results (before the label-line-offset + lanes), matching
  // finishEdges. Byte-identical constants + logic to geometry (MARGIN=28; MIN_CROSS=120;
  // APPROACH=30; same i>=1 && i+2<len interior rule; nAt == n; pathPoly == toPath elbow).
  // pairs[i] === edgeEls[i] carry from/to; containers carry the live box + member lookup.
  // Elbow only; keep in lockstep with the static pass.
  type AvoidC = { box: { x: number; y: number; w: number; h: number }; members: Record<string, boolean> };
  function avoidSubgraphs(
    edges: Array<{ points: Pt[]; path: string; labelPos: Pt }>,
    pairs: Array<{ from: string; to: string }>,
    containers: AvoidC[],
  ): void {
    if (edgeStyle !== "elbow" || !containers.length) return;
    const MARGIN = 28;
    const MIN_CROSS = 120;
    const APPROACH = 30;
    const moveLane = (e: { points: Pt[]; labelPos: Pt }, vertical: boolean, seg: LaneSeg, target: number): void => {
      const p = e.points;
      if (vertical) {
        shiftLabelOnSeg(e, true, seg, target);
        p[seg.i] = { x: target, y: p[seg.i]!.y };
        p[seg.i + 1] = { x: target, y: p[seg.i + 1]!.y };
      } else {
        shiftLabelOnSeg(e, false, seg, target);
        p[seg.i] = { x: p[seg.i]!.x, y: target };
        p[seg.i + 1] = { x: p[seg.i + 1]!.x, y: target };
      }
      seg.along = target;
    };
    const lowerReentry = (p: Pt[], trunkEndIdx: number, cornerIdx: number, anchor: Pt, vertical: boolean): void => {
      if (cornerIdx < 0 || cornerIdx >= p.length || trunkEndIdx < 0 || trunkEndIdx >= p.length) return;
      const anchorPar = vertical ? anchor.y : anchor.x;
      const cornerOld = vertical ? p[cornerIdx]!.y : p[cornerIdx]!.x;
      const dir = Math.sign(cornerOld - anchorPar);
      if (dir === 0) return;
      const target = nAt(anchorPar + dir * APPROACH);
      if (Math.abs(target - anchorPar) >= Math.abs(cornerOld - anchorPar)) return;
      if (vertical) {
        p[cornerIdx] = { x: p[cornerIdx]!.x, y: target };
        p[trunkEndIdx] = { x: p[trunkEndIdx]!.x, y: target };
      } else {
        p[cornerIdx] = { x: target, y: p[cornerIdx]!.y };
        p[trunkEndIdx] = { x: target, y: p[trunkEndIdx]!.y };
      }
    };
    const moved: Record<number, boolean> = {};
    edges.forEach((e, ei) => {
      const p = e.points;
      const len = p.length;
      if (len < 4) return;
      const ep = pairs[ei]!;
      let best:
        | { i: number; vertical: boolean; along: number; lo: number; hi: number; side: number; container: AvoidC; runLen: number }
        | undefined;
      for (let i = 1; i + 2 < len; i++) {
        const a = p[i]!;
        const b = p[i + 1]!;
        const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
        const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
        if (!isVert && !isHorz) continue;
        const along = isVert ? a.x : a.y;
        const lo = isVert ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
        const hi = isVert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
        const runLen = hi - lo;
        for (const c of containers) {
          if (c.members[ep.from] && c.members[ep.to]) continue;
          // approach-into-member run (incl. this pass's own re-entry residual) → not a
          // pierce; keeps the pass idempotent. Mirrors geometry.avoidSubgraphs.
          if ((i === 1 && c.members[ep.from]) || (i === len - 3 && c.members[ep.to])) continue;
          const cx0 = c.box.x - c.box.w / 2;
          const cx1 = c.box.x + c.box.w / 2;
          const cy0 = c.box.y - c.box.h / 2;
          const cy1 = c.box.y + c.box.h / 2;
          const perpLo = isVert ? cx0 : cy0;
          const perpHi = isVert ? cx1 : cy1;
          const parLo = isVert ? cy0 : cx0;
          const parHi = isVert ? cy1 : cx1;
          if (along <= perpLo || along >= perpHi) continue;
          if (Math.min(hi, parHi) - Math.max(lo, parLo) < MIN_CROSS) continue;
          const side = along - perpLo <= perpHi - along ? nAt(perpLo - MARGIN) : nAt(perpHi + MARGIN);
          if (!best || runLen > best.runLen) best = { i, vertical: isVert, along, lo, hi, side, container: c, runLen };
        }
      }
      if (!best) return;
      moveLane(edges[ei]!, best.vertical, { edge: ei, i: best.i, along: best.along, lo: best.lo, hi: best.hi }, best.side);
      moved[ei] = true;
      if (best.container.members[ep.from]) lowerReentry(p, best.i, best.i - 1, p[0]!, best.vertical);
      if (best.container.members[ep.to]) lowerReentry(p, best.i + 1, best.i + 2, p[len - 1]!, best.vertical);
    });
    for (const kk in moved) edges[Number(kk)]!.path = pathPoly(edges[Number(kk)]!.points);
  }
  // Build the avoidSubgraphs container obstacle set from the live member boxes via
  // `boxOf` (subgraphWorldBox for the live view / subgraphAbsBox for Save-SVG), mirroring
  // geometry.computeAvoidContainers (skip a container with no resolvable members).
  function avoidContainersFrom(boxOf: (sg: SvgSub) => { x: number; y: number; w: number; h: number }): AvoidC[] {
    const out: AvoidC[] = [];
    for (const sg of model.subgraphs) {
      const ids = subgraphMembers[sg.id] || [];
      if (!ids.length) continue;
      const members: Record<string, boolean> = {};
      for (const id of ids) members[id] = true;
      out.push({ box: boxOf(sg), members });
    }
    return out;
  }
  // R1/R2 — byte-parity twins of geometry.avoidNodes / detourApproaches / trimEndpointReentry.
  // w/h boxes (carry `id` so an edge skips its own endpoints); nAt==n; pathPoly==toPath elbow;
  // simplify == geometry.simplify; same constants. `pairs[i]===edgeEls[i]` carry from/to.
  type AvoidNB = { id?: string; x: number; y: number; w: number; h: number };
  const NODE_AVOID_MARGIN = 14;
  const NODE_AVOID_MIN_CROSS = 14;
  const NODE_AVOID_PASSES = 4;
  // R1/R2 run on orthogonal routes (elbow, or curved-with-bends via pathRounded); never a cubic.
  const isOrthoT = (pts: Pt[]): boolean => {
    for (let i = 0; i + 1 < pts.length; i++) if (Math.abs(pts[i]!.x - pts[i + 1]!.x) >= 0.5 && Math.abs(pts[i]!.y - pts[i + 1]!.y) >= 0.5) return false;
    return true;
  };
  const orthoPathT = (pts: Pt[]): string => (edgeStyle === "curved" ? pathRounded(pts) : pathPoly(pts));
  function avoidNodes(
    edges: Array<{ points: Pt[]; path: string; labelPos: Pt }>,
    pairs: Array<{ from: string; to: string }>,
    nodeBoxes: AvoidNB[],
  ): void {
    if (!nodeBoxes.length) return;
    const moveLane = (e: { points: Pt[]; labelPos: Pt }, vertical: boolean, seg: LaneSeg, target: number): void => {
      const p = e.points;
      if (vertical) { shiftLabelOnSeg(e, true, seg, target); p[seg.i] = { x: target, y: p[seg.i]!.y }; p[seg.i + 1] = { x: target, y: p[seg.i + 1]!.y }; }
      else { shiftLabelOnSeg(e, false, seg, target); p[seg.i] = { x: p[seg.i]!.x, y: target }; p[seg.i + 1] = { x: p[seg.i + 1]!.x, y: target }; }
      seg.along = target;
    };
    const moved: Record<number, boolean> = {};
    edges.forEach((e, ei) => {
      const p = e.points;
      const len = p.length;
      if (len < 4 || (edgeStyle === "curved" && !isOrthoT(p))) return;
      const ep = pairs[ei]!;
      let best: { i: number; vertical: boolean; along: number; lo: number; hi: number; side: number; runLen: number } | undefined;
      for (let i = 1; i + 2 < len; i++) {
        const a = p[i]!;
        const b = p[i + 1]!;
        const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
        const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
        if (!isVert && !isHorz) continue;
        const along = isVert ? a.x : a.y;
        const lo = isVert ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
        const hi = isVert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
        const runLen = hi - lo;
        for (const nb of nodeBoxes) {
          if (nb.id === ep.from || nb.id === ep.to) continue;
          const cx0 = nb.x - nb.w / 2;
          const cx1 = nb.x + nb.w / 2;
          const cy0 = nb.y - nb.h / 2;
          const cy1 = nb.y + nb.h / 2;
          const perpLo = isVert ? cx0 : cy0;
          const perpHi = isVert ? cx1 : cy1;
          const parLo = isVert ? cy0 : cx0;
          const parHi = isVert ? cy1 : cx1;
          if (along <= perpLo || along >= perpHi) continue;
          if (Math.min(hi, parHi) - Math.max(lo, parLo) < NODE_AVOID_MIN_CROSS) continue;
          const side = along - perpLo <= perpHi - along ? nAt(perpLo - NODE_AVOID_MARGIN) : nAt(perpHi + NODE_AVOID_MARGIN);
          if (!best || runLen > best.runLen) best = { i, vertical: isVert, along, lo, hi, side, runLen };
        }
      }
      if (!best) return;
      moveLane(edges[ei]!, best.vertical, { edge: ei, i: best.i, along: best.along, lo: best.lo, hi: best.hi }, best.side);
      moved[ei] = true;
    });
    for (const kk in moved) edges[Number(kk)]!.path = orthoPathT(edges[Number(kk)]!.points);
  }
  function detourApproaches(
    edges: Array<{ points: Pt[]; path: string; labelPos: Pt }>,
    pairs: Array<{ from: string; to: string }>,
    nodeBoxes: AvoidNB[],
  ): void {
    if (!nodeBoxes.length) return;
    const spans = (nb: AvoidNB) => ({ l: nb.x - nb.w / 2, r: nb.x + nb.w / 2, t: nb.y - nb.h / 2, b: nb.y + nb.h / 2 });
    const detour = (a: Pt, pp: Pt, nb: AvoidNB): Pt[] => {
      const s = spans(nb);
      if (Math.abs(a.x - pp.x) < 0.5) {
        const sideX = a.x - s.l <= s.r - a.x ? nAt(s.l - NODE_AVOID_MARGIN) : nAt(s.r + NODE_AVOID_MARGIN);
        const gapY = pp.y > a.y ? nAt(s.b + NODE_AVOID_MARGIN) : nAt(s.t - NODE_AVOID_MARGIN);
        return [{ x: sideX, y: a.y }, { x: sideX, y: gapY }, { x: nAt(a.x), y: gapY }];
      }
      const sideY = a.y - s.t <= s.b - a.y ? nAt(s.t - NODE_AVOID_MARGIN) : nAt(s.b + NODE_AVOID_MARGIN);
      const gapX = pp.x > a.x ? nAt(s.r + NODE_AVOID_MARGIN) : nAt(s.l - NODE_AVOID_MARGIN);
      return [{ x: a.x, y: sideY }, { x: gapX, y: sideY }, { x: gapX, y: nAt(a.y) }];
    };
    const pierces = (a: Pt, pp: Pt, nb: AvoidNB): boolean => {
      const s = spans(nb);
      const vert = Math.abs(a.x - pp.x) < 0.5;
      if (!vert && Math.abs(a.y - pp.y) >= 0.5) return false;
      const along = vert ? a.x : a.y;
      const lo = vert ? Math.min(a.y, pp.y) : Math.min(a.x, pp.x);
      const hi = vert ? Math.max(a.y, pp.y) : Math.max(a.x, pp.x);
      const perpLo = vert ? s.l : s.t;
      const perpHi = vert ? s.r : s.b;
      const parLo = vert ? s.t : s.l;
      const parHi = vert ? s.b : s.r;
      if (along <= perpLo || along >= perpHi) return false;
      return Math.min(hi, parHi) - Math.max(lo, parLo) >= NODE_AVOID_MIN_CROSS;
    };
    const changed: Record<number, boolean> = {};
    edges.forEach((e, ei) => {
      const p = e.points;
      if (p.length < 2 || (edgeStyle === "curved" && !isOrthoT(p))) return;
      const ep = pairs[ei]!;
      const a = p[p.length - 2]!;
      const port = p[p.length - 1]!;
      for (const nb of nodeBoxes) {
        if (nb.id === ep.from || nb.id === ep.to) continue;
        if (pierces(a, port, nb)) { p.splice(p.length - 1, 0, ...detour(a, port, nb)); changed[ei] = true; break; }
      }
    });
    for (const kk in changed) {
      const e = edges[Number(kk)]!;
      const sp = simplify(e.points);
      e.points.splice(0, e.points.length, ...sp);
      e.path = orthoPathT(e.points);
    }
  }
  function trimEndpointReentry(
    edges: Array<{ points: Pt[]; path: string; labelPos: Pt }>,
    pairs: Array<{ from: string; to: string }>,
    nodeBoxes: AvoidNB[],
  ): void {
    const boxById: Record<string, AvoidNB> = {};
    for (const b of nodeBoxes) if (b.id) boxById[b.id] = b;
    const inside = (pt: Pt, b: AvoidNB): boolean =>
      pt.x > b.x - b.w / 2 + 0.5 && pt.x < b.x + b.w / 2 - 0.5 && pt.y > b.y - b.h / 2 + 0.5 && pt.y < b.y + b.h / 2 - 0.5;
    const cross = (inPt: Pt, outPt: Pt, b: AvoidNB): Pt =>
      Math.abs(inPt.x - outPt.x) < 0.5
        ? { x: nAt(inPt.x), y: nAt(outPt.y > inPt.y ? b.y + b.h / 2 : b.y - b.h / 2) }
        : { x: nAt(outPt.x > inPt.x ? b.x + b.w / 2 : b.x - b.w / 2), y: nAt(inPt.y) };
    edges.forEach((e, ei) => {
      const p = e.points;
      if (p.length < 3 || (edgeStyle === "curved" && !isOrthoT(p))) return;
      const ep = pairs[ei]!;
      const src = boxById[ep.from];
      const tgt = boxById[ep.to];
      let did = false;
      if (src && inside(p[1]!, src)) {
        let k = 1;
        while (k < p.length && inside(p[k]!, src)) k++;
        if (k < p.length) { p.splice(0, k, cross(p[k - 1]!, p[k]!, src)); did = true; }
      }
      if (tgt && p.length >= 3 && inside(p[p.length - 2]!, tgt)) {
        let j = p.length - 2;
        while (j >= 0 && inside(p[j]!, tgt)) j--;
        if (j >= 0) { p.splice(j + 1, p.length - 1 - j, cross(p[j + 1]!, p[j]!, tgt)); did = true; }
      }
      if (did) { const sp = simplify(p); p.splice(0, p.length, ...sp); e.path = orthoPathT(p); }
    });
  }
  // Live/Save node-obstacle box list (w/h + id), mirroring geometry's positionedNodes.map(toBox).
  const avoidNodeBoxes = (boxOf: (id: string) => { x: number; y: number; w: number; h: number }): AvoidNB[] =>
    model.nodes.map((nd) => { const b = boxOf(nd.id); return { id: nd.id, x: b.x, y: b.y, w: b.w, h: b.h }; });
  // mirrors geometry.separateLanes() (FR9): pull apart bundles of near-parallel,
  // near-collinear INTERIOR orthogonal runs sharing a channel into distinct lanes
  // (≥ LANE_GAP apart, centred on the bundle mean), mutating each routed edge's
  // points/path/labelPos in place. Byte-identical constants + logic to geometry
  // (LANE_GAP=26 / LANE_MIN_OVERLAP=40 / LANE_PASSES=8, all-pairs push; same
  // interior-segment detection i>=1 && i+2<len; nAt == geometry's n). Runs FIRST
  // on the routed results (before FR6 label de-collision + FR7 bridges) so the
  // live view + Save-SVG re-lane exactly like the static finishEdges. Elbow only.
  function separateLanes(edges: Array<{ points: Pt[]; path: string; labelPos: Pt }>): void {
    if (edgeStyle !== "elbow" && edgeStyle !== "curved") return;
    const LANE_GAP = 26;
    const LANE_MIN_OVERLAP = 40;
    const LANE_PASSES = 8;
    const moved: Record<number, boolean> = {};
    const moveLane = (e: { points: Pt[]; labelPos: Pt }, vertical: boolean, seg: LaneSeg, target: number): void => {
      const p = e.points;
      if (vertical) {
        shiftLabelOnSeg(e, true, seg, target);
        p[seg.i] = { x: target, y: p[seg.i]!.y };
        p[seg.i + 1] = { x: target, y: p[seg.i + 1]!.y };
      } else {
        shiftLabelOnSeg(e, false, seg, target);
        p[seg.i] = { x: p[seg.i]!.x, y: target };
        p[seg.i + 1] = { x: p[seg.i + 1]!.x, y: target };
      }
      seg.along = target;
    };
    for (let pass = 0; pass < LANE_PASSES; pass++) {
      let changed = false;
      for (const vertical of [true, false]) {
        const segs: LaneSeg[] = [];
        edges.forEach((e, ei) => {
          const p = e.points;
          for (let i = 1; i + 2 < p.length; i++) {
            const a = p[i]!;
            const b = p[i + 1]!;
            const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
            const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
            if (vertical ? !isVert : !isHorz) continue;
            const along = vertical ? a.x : a.y;
            const lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
            const hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
            segs.push({ edge: ei, i, along, lo, hi });
          }
        });
        segs.sort((s, t) => s.along - t.along || s.edge - t.edge || s.i - t.i);
        // All-pairs push (mirrors geometry.separateLanes — TEST-004): robust to any
        // drag geometry, unlike the earlier greedy bundle.
        for (let a = 0; a < segs.length; a++) {
          for (let b = a + 1; b < segs.length; b++) {
            const sa = segs[a]!;
            const sb = segs[b]!;
            if (sa.edge === sb.edge) continue;
            if (Math.min(sa.hi, sb.hi) - Math.max(sa.lo, sb.lo) < LANE_MIN_OVERLAP) continue;
            const d = LANE_GAP - Math.abs(sb.along - sa.along);
            if (d <= 1e-6) continue;
            const dir = sb.along >= sa.along ? 1 : -1;
            const push = d / 2;
            moveLane(edges[sa.edge]!, vertical, sa, nAt(sa.along - push * dir));
            moveLane(edges[sb.edge]!, vertical, sb, nAt(sb.along + push * dir));
            moved[sa.edge] = true;
            moved[sb.edge] = true;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    for (const kk in moved) edges[Number(kk)]!.path = orthoPathT(edges[Number(kk)]!.points);
  }
  // mirrors geometry.separateAntiParallelJogs() (v0.6.2): de-cramp a collinear
  // anti-parallel A→B/B→A elbow pair that separateLanes' overlap gate skips. Group
  // the routed edges by their unordered node pair (pairs[i] === edgeEls[i]); a
  // ≥2-edge bundle whose interior jog segments are collinear is spread onto lanes
  // JOG_GAP=26 apart, centred on the mean, ordered by each edge's target-side
  // perpendicular coord so every jog moves toward its own target. Byte-identical
  // constants + logic to geometry (JOG_GAP=26; same i>=1 && i+2<len interior-run
  // detection; nAt == n; pathPoly == toPath elbow). Elbow only; runs right after
  // separateLanes on the routed results. Keep in lockstep with the static pass.
  function separateAntiParallelJogs(
    edges: Array<{ points: Pt[]; path: string; labelPos: Pt }>,
    pairs: Array<{ from: string; to: string }>,
  ): void {
    if (edgeStyle !== "elbow") return;
    const JOG_GAP = 26;
    const moveLane = (e: { points: Pt[]; labelPos: Pt }, vertical: boolean, seg: LaneSeg, target: number): void => {
      const p = e.points;
      if (vertical) {
        shiftLabelOnSeg(e, true, seg, target);
        p[seg.i] = { x: target, y: p[seg.i]!.y };
        p[seg.i + 1] = { x: target, y: p[seg.i + 1]!.y };
      } else {
        shiftLabelOnSeg(e, false, seg, target);
        p[seg.i] = { x: p[seg.i]!.x, y: target };
        p[seg.i + 1] = { x: p[seg.i + 1]!.x, y: target };
      }
      seg.along = target;
    };
    const groups: Record<string, number[]> = {};
    pairs.forEach((e, i) => {
      const key = e.from < e.to ? e.from + "|" + e.to : e.to + "|" + e.from;
      (groups[key] = groups[key] || []).push(i);
    });
    const moved: Record<number, boolean> = {};
    for (const key in groups) {
      const idxs = groups[key]!;
      if (idxs.length < 2) continue;
      idxs.sort((a, b) => a - b);
      type Jog = { edge: number; seg: LaneSeg; vertical: boolean; target: number };
      const jogs: Jog[] = [];
      let orient: boolean | undefined;
      for (const ei of idxs) {
        const p = edges[ei]!.points;
        let jog: Jog | undefined;
        for (let i = 1; i + 2 < p.length; i++) {
          const a = p[i]!;
          const b = p[i + 1]!;
          const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
          const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
          if (!isVert && !isHorz) continue;
          const along = isVert ? a.x : a.y;
          const lo = isVert ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
          const hi = isVert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
          const end = p[p.length - 1]!;
          const target = isVert ? end.x : end.y;
          jog = { edge: ei, seg: { edge: ei, i, along, lo, hi }, vertical: isVert, target };
          break;
        }
        if (!jog) break;
        if (orient === undefined) orient = jog.vertical;
        else if (orient !== jog.vertical) { jogs.length = 0; break; }
        jogs.push(jog);
      }
      if (jogs.length < 2) continue;
      const a0 = jogs[0]!.seg.along;
      let collinear = true;
      for (const j of jogs) if (Math.abs(j.seg.along - a0) >= 1) collinear = false;
      if (!collinear) continue;
      jogs.sort((x, y) => x.target - y.target || x.edge - y.edge);
      let sum = 0;
      for (const j of jogs) sum += j.seg.along;
      const mean = sum / jogs.length;
      const k = jogs.length;
      jogs.forEach((j, s) => {
        const lane = nAt(mean + (s - (k - 1) / 2) * JOG_GAP);
        if (Math.abs(lane - j.seg.along) < 1e-6) return;
        moveLane(edges[j.edge]!, j.vertical, j.seg, lane);
        moved[j.edge] = true;
      });
    }
    for (const kk in moved) edges[Number(kk)]!.path = pathPoly(edges[Number(kk)]!.points);
  }
  // mirrors geometry.separateConvergentJogs() (v0.6.5, defect #1): de-tangle a
  // ≥CONVERGE_MIN(=3)-edge convergence bundle at ONE node side — the generalization
  // of separateAntiParallelJogs from a node pair to a node side. Group each endpoint's
  // border-adjacent jog (a target's LAST interior run, a source's FIRST) by (node,
  // orientation, toward-border, collinear along); a bucket of ≥3 is spread onto lanes
  // JOG_GAP=26 apart, ordered by far-end perp coord, centred on the mean then anchored
  // so the fan opens away from the border. Byte-identical constants + logic to geometry
  // (JOG_GAP=26; CONVERGE_MIN=3; same len-3 / 1 border-run pick; i>=1 && i+2<=len; nAt
  // == n; pathPoly == toPath elbow). Runs right after separateAntiParallelJogs on the
  // routed results; pairs[i] === edgeEls[i] carry from/to. Elbow only; keep in lockstep
  // with the static pass.
  function separateConvergentJogs(
    edges: Array<{ points: Pt[]; path: string; labelPos: Pt }>,
    pairs: Array<{ from: string; to: string }>,
  ): void {
    if (edgeStyle !== "elbow") return;
    const JOG_GAP = 26;
    const CONVERGE_MIN = 3;
    const moveLane = (e: { points: Pt[]; labelPos: Pt }, vertical: boolean, seg: LaneSeg, target: number): void => {
      const p = e.points;
      if (vertical) {
        shiftLabelOnSeg(e, true, seg, target);
        p[seg.i] = { x: target, y: p[seg.i]!.y };
        p[seg.i + 1] = { x: target, y: p[seg.i + 1]!.y };
      } else {
        shiftLabelOnSeg(e, false, seg, target);
        p[seg.i] = { x: p[seg.i]!.x, y: target };
        p[seg.i + 1] = { x: p[seg.i + 1]!.x, y: target };
      }
      seg.along = target;
    };
    type Rec = { edge: number; seg: LaneSeg; vertical: boolean; toward: number; far: number };
    const jogOf = (p: Pt[], role: "source" | "target"): { seg: LaneSeg; vertical: boolean; toward: number; far: number } | null => {
      const len = p.length;
      if (len < 4) return null;
      const i = role === "target" ? len - 3 : 1;
      if (i < 1 || i + 2 > len) return null;
      const a = p[i]!;
      const b = p[i + 1]!;
      const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
      const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
      if (!isVert && !isHorz) return null;
      const along = isVert ? a.x : a.y;
      const lo = isVert ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
      const hi = isVert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
      const appFrom = role === "target" ? p[i + 1]! : p[1]!;
      const appTo = role === "target" ? p[len - 1]! : p[0]!;
      const toward = isVert ? Math.sign(appTo.x - appFrom.x) : Math.sign(appTo.y - appFrom.y);
      const end = role === "target" ? p[0]! : p[len - 1]!;
      const far = isVert ? end.x : end.y;
      return { seg: { edge: 0, i, along, lo, hi }, vertical: isVert, toward, far };
    };
    const buckets: Record<string, Rec[]> = {};
    edges.forEach((e, idx) => {
      const ep = pairs[idx]!;
      const roles: Array<["source" | "target", string]> = [["source", ep.from], ["target", ep.to]];
      for (const [role, node] of roles) {
        const j = jogOf(e.points, role);
        if (!j) continue;
        const key = node + "|" + (j.vertical ? "V" : "H") + "|" + j.toward + "|" + nAt(j.seg.along);
        const rec: Rec = { edge: idx, seg: { edge: idx, i: j.seg.i, along: j.seg.along, lo: j.seg.lo, hi: j.seg.hi }, vertical: j.vertical, toward: j.toward, far: j.far };
        (buckets[key] || (buckets[key] = [])).push(rec);
      }
    });
    const moved: Record<number, boolean> = {};
    for (const key in buckets) {
      const recs = buckets[key]!;
      if (recs.length < CONVERGE_MIN) continue;
      recs.sort((x, y) => x.far - y.far || x.edge - y.edge);
      let sum = 0;
      for (const r of recs) sum += r.seg.along;
      const mean = sum / recs.length;
      const k = recs.length;
      const toward = recs[0]!.toward;
      recs.forEach((r, s) => {
        const lane = nAt(mean + (s - (k - 1) / 2 - (toward * (k - 1)) / 2) * JOG_GAP);
        if (Math.abs(lane - r.seg.along) < 1e-6) return;
        moveLane(edges[r.edge]!, r.vertical, r.seg, lane);
        moved[r.edge] = true;
      });
    }
    for (const kk in moved) edges[Number(kk)]!.path = pathPoly(edges[Number(kk)]!.points);
  }
  // mirrors geometry.resolveLabelNodeCollisions() (UAT-1): push any edge-label
  // plate that overlaps a NODE box off it by the smallest move (least-penetration
  // axis, away from the node centre; centred tie → +y then +x). Nodes are fixed
  // obstacles. Deterministic (fixed plate×node order, LABEL_NODE_PAD=10, 4 bounded
  // passes, no RNG). Returns a shift {x,y} per input index. Keep in lockstep.
  function resolveLabelNodeCollisions(
    plates: Array<{ x: number; y: number; w: number; h: number } | undefined>,
    nodeBoxes: Array<{ x: number; y: number; w: number; h: number }>,
  ): Pt[] {
    const shifts: Pt[] = plates.map(() => ({ x: 0, y: 0 }));
    if (!nodeBoxes.length) return shifts;
    const cx = plates.map((p) => (p ? p.x : 0));
    const cy = plates.map((p) => (p ? p.y : 0));
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (let i = 0; i < plates.length; i++) {
        const p = plates[i];
        if (!p) continue;
        for (const nb of nodeBoxes) {
          const dx = cx[i]! - nb.x;
          const dy = cy[i]! - nb.y;
          const ox = (p.w + nb.w) / 2 + 10 - Math.abs(dx);
          const oy = (p.h + nb.h) / 2 + 10 - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          if (oy <= ox) cy[i] = cy[i]! + oy * (dy < 0 ? -1 : 1);
          else cx[i] = cx[i]! + ox * (dx < 0 ? -1 : 1);
        }
      }
      if (!moved) break;
    }
    for (let i = 0; i < plates.length; i++) if (plates[i]) shifts[i] = { x: nAt(cx[i]! - plates[i]!.x), y: nAt(cy[i]! - plates[i]!.y) };
    return shifts;
  }
  // mirrors geometry.nearestRunAxis(): orientation ("x"/"y"/null) of the polyline's
  // axis-aligned run closest to (cx,cy); the first run wins a distance tie.
  function nearestRunAxis(points: Pt[], cx: number, cy: number): "x" | "y" | null {
    let best = Infinity;
    let axis: "x" | "y" | null = null;
    for (let s = 0; s + 1 < points.length; s++) {
      const a = points[s]!;
      const b = points[s + 1]!;
      const horiz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 0.5;
      const vert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 0.5;
      if (!horiz && !vert) continue;
      let dx: number;
      let dy: number;
      if (horiz) {
        const lo = Math.min(a.x, b.x);
        const hi = Math.max(a.x, b.x);
        dx = cx < lo ? cx - lo : cx > hi ? cx - hi : 0;
        dy = cy - a.y;
      } else {
        const lo = Math.min(a.y, b.y);
        const hi = Math.max(a.y, b.y);
        dx = cx - a.x;
        dy = cy < lo ? cy - lo : cy > hi ? cy - hi : 0;
      }
      const dd = dx * dx + dy * dy;
      if (dd < best) {
        best = dd;
        axis = horiz ? "x" : "y";
      }
    }
    return axis;
  }
  // mirrors geometry.resolveLabelEdgeCollisions() (UAT-round, gRPC-stream fix): slide
  // any label plate sitting ON a foreign edge's crossing run along its OWN edge until
  // it clears (PORT_LABEL_PAD=6, +axis tiebreak, 4 bounded passes, no RNG). A foreign
  // run PARALLEL to (and bisecting) the own run is escaped by the same along-axis slide
  // (FR3, "give up" fix). Byte-identical shifts to the static twin. Keep in lockstep.
  function resolveLabelEdgeCollisions(
    plates: Array<{ x: number; y: number; w: number; h: number } | undefined>,
    polylines: Pt[][],
  ): Pt[] {
    const shifts: Pt[] = plates.map(() => ({ x: 0, y: 0 }));
    const cx = plates.map((p) => (p ? p.x : 0));
    const cy = plates.map((p) => (p ? p.y : 0));
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (let i = 0; i < plates.length; i++) {
        const p = plates[i];
        if (!p) continue;
        const axis = nearestRunAxis(polylines[i] ?? [], cx[i]!, cy[i]!);
        if (!axis) continue;
        const hw = p.w / 2;
        const hh = p.h / 2;
        let hasHit = false;
        let hiTarget = -Infinity;
        let loTarget = Infinity;
        for (let j = 0; j < polylines.length; j++) {
          if (j === i) continue;
          const pts = polylines[j] ?? [];
          for (let s = 0; s + 1 < pts.length; s++) {
            const a = pts[s]!;
            const b = pts[s + 1]!;
            if (axis === "x") {
              if (Math.abs(a.x - b.x) < 0.5) {
                // perpendicular (vertical) foreign run → slide in x past it (unchanged)
                const gx = a.x;
                if (gx <= cx[i]! - hw || gx >= cx[i]! + hw) continue;
                if (cy[i]! + hh <= Math.min(a.y, b.y) || cy[i]! - hh >= Math.max(a.y, b.y)) continue;
                hasHit = true;
                hiTarget = Math.max(hiTarget, gx + hw + 6);
                loTarget = Math.min(loTarget, gx - hw - 6);
              } else if (Math.abs(a.y - b.y) < 0.5) {
                // FR3 — parallel bisecting foreign run → slide in x past its nearer x-end
                const gy = a.y;
                if (gy <= cy[i]! - hh || gy >= cy[i]! + hh) continue;
                const lo = Math.min(a.x, b.x);
                const hi = Math.max(a.x, b.x);
                if (cx[i]! + hw <= lo || cx[i]! - hw >= hi) continue;
                hasHit = true;
                hiTarget = Math.max(hiTarget, hi + hw + 6);
                loTarget = Math.min(loTarget, lo - hw - 6);
              }
            } else {
              if (Math.abs(a.y - b.y) < 0.5) {
                // perpendicular (horizontal) foreign run → slide in y past it (unchanged)
                const gy = a.y;
                if (gy <= cy[i]! - hh || gy >= cy[i]! + hh) continue;
                if (cx[i]! + hw <= Math.min(a.x, b.x) || cx[i]! - hw >= Math.max(a.x, b.x)) continue;
                hasHit = true;
                hiTarget = Math.max(hiTarget, gy + hh + 6);
                loTarget = Math.min(loTarget, gy - hh - 6);
              } else if (Math.abs(a.x - b.x) < 0.5) {
                // FR3 — parallel bisecting foreign run → slide in y past its nearer y-end
                const gx = a.x;
                if (gx <= cx[i]! - hw || gx >= cx[i]! + hw) continue;
                const lo = Math.min(a.y, b.y);
                const hi = Math.max(a.y, b.y);
                if (cy[i]! + hh <= lo || cy[i]! - hh >= hi) continue;
                hasHit = true;
                hiTarget = Math.max(hiTarget, hi + hh + 6);
                loTarget = Math.min(loTarget, lo - hh - 6);
              }
            }
          }
        }
        if (!hasHit) continue;
        const cur = axis === "x" ? cx[i]! : cy[i]!;
        const target = hiTarget - cur <= cur - loTarget ? hiTarget : loTarget;
        if (axis === "x") cx[i] = target;
        else cy[i] = target;
        moved = true;
      }
      if (!moved) break;
    }
    for (let i = 0; i < plates.length; i++) if (plates[i]) shifts[i] = { x: nAt(cx[i]! - plates[i]!.x), y: nAt(cy[i]! - plates[i]!.y) };
    return shifts;
  }
  // Plate rects (rounded routed centre + FR3 size) for the two label passes,
  // aligned index-for-index with edgeEls (undefined for an unlabelled edge).
  function labelPlatesOf(routed: Array<{ labelPos: Pt }>): Array<{ x: number; y: number; w: number; h: number } | undefined> {
    return edgeEls.map((e, i) => {
      if (!e.label) return undefined;
      const s = plateSizeOf(e.label);
      return { x: nAt(routed[i]!.labelPos.x), y: nAt(routed[i]!.labelPos.y), w: s.w, h: s.h };
    });
  }
  // Fold a per-edge shift back into each routed edge's labelPos (mirrors the
  // static deCollideLabels / deCollideLabelsFromNodes writeback: round the centre,
  // then add the shift), so a later label pass reads the already-moved plate.
  function foldLabelShifts(routed: Array<{ labelPos: Pt }>, shifts: Pt[]): void {
    routed.forEach((r, i) => {
      const sh = shifts[i]!;
      if (edgeEls[i]!.label && (sh.x !== 0 || sh.y !== 0)) {
        r.labelPos = { x: nAt(r.labelPos.x) + sh.x, y: nAt(r.labelPos.y) + sh.y };
      }
    });
  }
  // mirrors geometry.resolveLabelLineOffsets() (v0.6.4, option d): lift each label OFF
  // its home line so the edge line reads continuous — clearing by the plate dimension
  // FACING the line: a (near-)horizontal home segment shifts the plate UP by plateHalfH
  // + LABEL_LINE_GAP(=3), a (near-)vertical one RIGHT by plateHalfW + 3. The home segment
  // is the one geometry.labelPoint centres the label on (curved 4-pt → mid-curve tangent;
  // else the interior midpoint segment). Run FIRST (before lanes), so the de-collision
  // passes below de-collide the offset (drawn) plates. Byte-identical to the static twin.
  function resolveLabelLineOffsets(
    plates: Array<{ x: number; y: number; w: number; h: number } | undefined>,
    polylines: Pt[][],
  ): Pt[] {
    return plates.map((p, i) => {
      if (!p) return { x: 0, y: 0 };
      const pts = polylines[i] ?? [];
      if (pts.length < 2) return { x: 0, y: 0 };
      // REV-001: only a genuine cubic (curved AND no waypoints — labelPoint used its
      // "curved" branch) uses the mid-curve tangent; a curved+waypoints edge routes as
      // an elbow, so its home segment is the interior mid segment. Byte-identical to the
      // static twin's per-edge `cubics` test (theme curved && no waypoints).
      const el = edgeEls[i];
      const cubic = edgeStyle === "curved" && !(el && el.waypoints && el.waypoints.length);
      let a: Pt;
      let b: Pt;
      if (cubic && pts.length === 4) {
        a = { x: pts[0]!.x + pts[1]!.x, y: pts[0]!.y + pts[1]!.y };
        b = { x: pts[2]!.x + pts[3]!.x, y: pts[2]!.y + pts[3]!.y };
      } else if (pts.length === 2) {
        a = pts[0]!;
        b = pts[1]!;
      } else {
        const mid = Math.floor(pts.length / 2);
        a = pts[mid - 1]!;
        b = pts[mid]!;
      }
      const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
      // Clear the plate off the line by the dimension FACING it: height (horizontal
      // segment → up) or width (vertical segment → right).
      const dist = (horizontal ? p.h : p.w) / 2 + 3;
      return horizontal ? { x: 0, y: -dist } : { x: dist, y: 0 };
    });
  }
  // Whether crossing bridges are baked into the clean path (FR7 / D4): ON for
  // elbow edges unless the option forces off; curved is deferred, sketch draws
  // from points so never shows a bridge. Matches layout.applyBridges' gate.
  const bridgesEnabled = (): boolean => edgeStyle === "elbow" && (opt.bridges ?? true);

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
    const entryVertical = entry === "top" || entry === "bottom";
    let pts: Pt[];
    if (hasWps) {
      pts = elbowThrough(
        start,
        end,
        waypoints!,
        !horizontal,
        entryVertical,
        !(model.direction === "LR" || model.direction === "RL"),
      );
    } else if (horizontal) {
      const midX = (start.x + end.x) / 2;
      pts = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
      perpendicularizeEntry(pts, entryVertical); // FR2 — perpendicular final approach
      pts = simplify(pts);
    } else {
      const midY = (start.y + end.y) / 2;
      pts = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
      perpendicularizeEntry(pts, entryVertical); // FR2 — perpendicular final approach
      pts = simplify(pts);
    }
    const path = edgeStyle === "curved" ? pathRounded(pts) : pathPoly(pts);
    return { path, labelPos: withShift(labelPoly(pts)), points: pts };
  }
  function routeEdgePath(
    fromId: string,
    toId: string,
    waypoints?: Pt[],
    ports?: Ports,
  ): { path: string; labelPos: Pt; points: Pt[] } {
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
    // Sketch mode: the visible node body is the rough SVG outline drawn behind the
    // card (nodeShapeEls), so the card itself is a transparent, borderless text +
    // hit-area layer. Keep size/padding/cursor/font so drag + text still work.
    if (sketch) {
      return (
        "position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;" +
        "width:" + s.w + "px;height:" + s.h + "px;padding:0 " + tokens.spacing.nodePadX + "px;" +
        "cursor:grab;transition:transform .12s ease;" +
        "font-size:var(--vnm-font-size);font-weight:var(--vnm-font-weight);" +
        "background:transparent;border:0;color:" + st.text + ";"
      );
    }
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
    if (sketch) renderNodeShape(id);
  }
  function renderNodes(): void {
    for (const id in cards) {
      applyCardSize(id);
      positionCard(id);
    }
  }
  function renderEdges(): void {
    const ports = computePorts();
    const routed = edgeEls.map((e, i) => routeEdgePath(e.from, e.to, e.waypoints, ports[i]));
    // v0.6.6 (defect #3): FIRST, pull a trunk piercing a foreign container outside it and
    // re-enter near its endpoint (matching finishEdges) — live-view container boxes.
    avoidSubgraphs(routed, edgeEls, avoidContainersFrom(subgraphWorldBox));
    // R1/R2 (mirror finishEdges): clamp endpoint re-entry, then push interior/approach node pierces out.
    const nabL = avoidNodeBoxes((id) => ({ x: positions[id]!.x, y: positions[id]!.y, w: sizes[id]!.w, h: sizes[id]!.h }));
    trimEndpointReentry(routed, edgeEls, nabL);
    for (let k = 0; k < NODE_AVOID_PASSES; k++) { avoidNodes(routed, edgeEls, nabL); detourApproaches(routed, edgeEls, nabL); }
    // v0.6.4 (option d): lift each label off its line FIRST so the line stays continuous
    // and the de-collision passes below de-collide the offset (drawn) plates.
    foldLabelShifts(routed, resolveLabelLineOffsets(labelPlatesOf(routed), routed.map((r) => r.points)));
    // FR9: lane-separate FIRST (mutates points/path/labelPos), matching finishEdges.
    separateLanes(routed);
    // v0.6.2: de-cramp a collinear anti-parallel elbow pair the lane gate skips.
    separateAntiParallelJogs(routed, edgeEls);
    // v0.6.5: de-tangle a ≥3-edge convergence bundle at one node side (defect #1).
    separateConvergentJogs(routed, edgeEls);
    // FR6: de-collide label plates, folding the shift back into labelPos so the
    // label-vs-node pass sees the moved plate (uses the same rounded-centre
    // resolver as buildSvg → the live view matches the exported SVG).
    foldLabelShifts(routed, resolveLabelCollisions(labelPlatesOf(routed)));
    // label-vs-edge (UAT-round): slide any label off a foreign edge's crossing line.
    foldLabelShifts(routed, resolveLabelEdgeCollisions(labelPlatesOf(routed), routed.map((r) => r.points)));
    // label-vs-node (UAT-1): push any label off a node box (live world coords).
    const nodeBoxesL = model.nodes.map((nd) => ({ x: positions[nd.id]!.x, y: positions[nd.id]!.y, w: sizes[nd.id]!.w, h: sizes[nd.id]!.h }));
    foldLabelShifts(routed, resolveLabelNodeCollisions(labelPlatesOf(routed), nodeBoxesL));
    // v0.6.4: final label-label pass — node de-collision can repack an offset label into
    // a neighbour, so re-separate labels last (matches finishEdges).
    foldLabelShifts(routed, resolveLabelCollisions(labelPlatesOf(routed)));
    // FR7: bake crossing hops into the clean path (sketch draws from points).
    const bridgedL = applyEdgeBridges(routed.map((r) => r.points), bridgesEnabled());
    edgeEls.forEach((e, i) => {
      const r = routed[i]!;
      // Sketch: the line (rough strokes, may be dashed) and the SOLID open
      // arrowhead go to two separate paths so a dotted dash can't fragment the V.
      if (sketch) {
        const sk = sketchEdgeParts(r.points, e.from + "->" + e.to, e.arrows, tokens.edge.arrowSize);
        e.path.setAttribute("d", sk.line);
        if (e.headPath) e.headPath.setAttribute("d", sk.head);
      } else {
        e.path.setAttribute("d", bridgedL[i] ?? r.path);
      }
      if (e.plate && e.text && e.label) {
        const lx = r.labelPos.x;
        const ly = r.labelPos.y;
        // FR3 tightened plate — keep in lockstep with layout.labelPlateSize.
        const w = e.label.length * (tokens.font.size * 0.6) + 6;
        const h = tokens.font.lineHeight + 2;
        e.plate.setAttribute("x", String(nAt(lx - w / 2)));
        e.plate.setAttribute("y", String(nAt(ly - h / 2)));
        e.plate.setAttribute("width", String(nAt(w)));
        e.plate.setAttribute("height", String(nAt(h)));
        e.text.setAttribute("x", String(nAt(lx)));
        e.text.setAttribute("y", String(nAt(ly)));
      }
    });
    // Layer 6: repaint the arrowhead caps above the cards from the live routes
    // (same svgEdgeArrowCap the static/Save-SVG sinks use → on-screen parity).
    if (capOverlay) {
      let caps = "";
      edgeEls.forEach((e, i) => {
        caps += svgEdgeArrowCap(e, routed[i]!.points);
      });
      capOverlay.innerHTML = caps;
    }
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
      // Sketch node bodies are literal-colored SVG paths (not CSS-var driven),
      // so refresh their fill/stroke from the new theme.
      const els = nodeShapeEls[nd.id];
      if (els) {
        els.fill.setAttribute("fill", st.fill);
        const sw = st.strokeWidth ?? "1.5";
        for (const p of els.strokes) {
          p.setAttribute("stroke", st.stroke);
          p.setAttribute("stroke-width", sw);
        }
      }
      // Refresh state pseudo-state marker colors (literal text color) too.
      const markers = stateMarkerEls[nd.id];
      if (markers) {
        for (const c of markers) {
          if (c.getAttribute("fill") === "none") c.setAttribute("stroke", tokens.colors.text);
          else c.setAttribute("fill", tokens.colors.text);
        }
      }
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
    // Mirror src/render/svg.ts defs(): sketch embeds the bundled @font-face
    // (rides the payload — the runtime can't import sketch-font.ts).
    const font = sketch && payload.sketch ? "<style>" + payload.sketch.fontFace + "</style>" : "";
    return (
      '<defs><marker id="vnm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="' + a +
      '" markerHeight="' + a + '" orient="auto">' +
      '<path d="M0 0 L10 5 L0 10 z" fill="' + tokens.colors.edge + '"/></marker>' +
      '<marker id="vnm-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="' + a +
      '" markerHeight="' + a + '" orient="auto">' +
      '<path d="M10 0 L0 5 L10 10 z" fill="' + tokens.colors.edge + '"/></marker>' + shadow + font + "</defs>"
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
  // Layer 1: the dashed container box. Byte-parity with src/render/svg.ts
  // renderSubgraphBox.
  function svgSubgraphBox(sg: SvgSub): string {
    const b = subgraphAbsBox(sg);
    const x = nAt(b.x - b.w / 2);
    const y = nAt(b.y - b.h / 2);
    return (
      '<rect x="' + x + '" y="' + y + '" width="' + nAt(b.w) + '" height="' + nAt(b.h) +
      '" rx="' + tokens.radii.card + '" fill="' + tokens.colors.subgraphFill + '" stroke="' +
      tokens.colors.subgraphStroke + '" stroke-dasharray="4 4"/>'
    );
  }
  // Layer 4 (FR2): the title on an opaque plate, drawn after edges. Byte-parity
  // with src/render/svg.ts renderSubgraphTitle (same plate geometry + string).
  function svgSubgraphTitle(sg: SvgSub): string {
    if (!sg.title) return "";
    const b = subgraphAbsBox(sg);
    const x = nAt(b.x - b.w / 2);
    const y = nAt(b.y - b.h / 2);
    const fs = tokens.font.size - 1;
    const pad = 5;
    const pw = sg.title.length * fs * 0.6 + pad * 2;
    return (
      '<rect x="' + nAt(x + 12 - pad) + '" y="' + nAt(y + 18 - fs + 1) + '" width="' + nAt(pw) +
      '" height="' + (fs + 4) + '" rx="' + tokens.radii.label + '" fill="' + tokens.colors.subgraphFill + '"/>' +
      '<text x="' + nAt(x + 12) + '" y="' + nAt(y + 18) + '" fill="' + tokens.colors.subgraphText +
      '" font-size="' + fs + '" font-weight="600">' + xmlEsc(sg.title) + "</text>"
    );
  }
  function svgEdgeLabel(label: string, cx: number, cy: number): string {
    const lines = label.split("\n");
    const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
    // FR3 tightened plate — byte-parity with src/render/svg.ts edgeLabel.
    const w = maxChars * tokens.font.size * 0.6 + 6;
    const h = lines.length * tokens.font.lineHeight + 2;
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
  // Edge path + arrowhead only (layer 2). The label is emitted separately into
  // layer 3 by buildSvg, mirroring src/render/svg.ts renderEdge / edgeLabel.
  function svgEdge(e: EdgeEls, path: string, points: Pt[]): string {
    const width = e.kind === "thick" ? tokens.edge.thickWidth : tokens.edge.width;
    const dash = e.kind === "dotted" ? ' stroke-dasharray="2 5"' : "";
    let out: string;
    if (sketch) {
      // Mirror src/render/svg.ts sketchEdgePath: rough strokes + open arrowheads
      // from the routed polyline, all as separate <path>s (byte-parity). The line
      // carries the dotted dash; the arrowhead is always SOLID (REV-002).
      const key = e.from + "->" + e.to;
      const arr = points.map((p) => [p.x, p.y]);
      const base =
        ' fill="none" stroke="' + tokens.colors.edge + '" stroke-width="' + width +
        '" stroke-linejoin="round" stroke-linecap="round"';
      const lineStroke = base + dash;
      let s = "";
      for (const d of roughPolyline(arr, key)) s += '<path d="' + d + '"' + lineStroke + "/>";
      const m = arr.length;
      if (e.arrows.end && m >= 2)
        s += '<path d="' + openArrowhead(arr[m - 1]!, arr[m - 2]!, tokens.edge.arrowSize, key + "@end") + '"' + base + "/>";
      if (e.arrows.start && m >= 2)
        s += '<path d="' + openArrowhead(arr[0]!, arr[1]!, tokens.edge.arrowSize, key + "@start") + '"' + base + "/>";
      out = s;
    } else {
      const mEnd = e.arrows.end ? ' marker-end="url(#vnm-arrow)"' : "";
      const mStart = e.arrows.start ? ' marker-start="url(#vnm-arrow-start)"' : "";
      out =
        '<path d="' + path + '" fill="none" stroke="' + tokens.colors.edge + '" stroke-width="' + width +
        '" stroke-linejoin="round" stroke-linecap="round"' + dash + mStart + mEnd + "/>";
    }
    return out;
  }
  // Layer 6 (parity with src/render/svg.ts renderEdgeArrowCaps): re-draw the
  // arrowhead ABOVE the nodes so a head ending on/inside a node is never hidden
  // by the node fill. Byte-identical strings to the static sink (Save-SVG parity).
  function svgEdgeArrowCap(e: EdgeEls, points: Pt[]): string {
    const m = points.length;
    if (m < 2 || (!e.arrows.end && !e.arrows.start)) return "";
    const width = e.kind === "thick" ? tokens.edge.thickWidth : tokens.edge.width;
    if (sketch) {
      const key = e.from + "->" + e.to;
      const arr = points.map((p) => [p.x, p.y]);
      const base =
        ' fill="none" stroke="' + tokens.colors.edge + '" stroke-width="' + width +
        '" stroke-linejoin="round" stroke-linecap="round"';
      let s = "";
      if (e.arrows.end) s += '<path class="vnm-arrow-cap" d="' + openArrowhead(arr[m - 1]!, arr[m - 2]!, tokens.edge.arrowSize, key + "@end") + '"' + base + "/>";
      if (e.arrows.start) s += '<path class="vnm-arrow-cap" d="' + openArrowhead(arr[0]!, arr[1]!, tokens.edge.arrowSize, key + "@start") + '"' + base + "/>";
      return s;
    }
    let s = "";
    if (e.arrows.end) s += svgCapEnd(points[m - 2]!, points[m - 1]!, width);
    if (e.arrows.start) s += svgCapStart(points[0]!, points[1]!, width);
    return s;
  }
  function svgCapEnd(prev: Pt, tip: Pt, width: number): string {
    const dx = tip.x - prev.x;
    const dy = tip.y - prev.y;
    const mag = Math.hypot(dx, dy) || 1;
    const len = Math.min(tokens.edge.arrowSize + 4, mag);
    const bx = tip.x - (dx / mag) * len;
    const by = tip.y - (dy / mag) * len;
    return '<path class="vnm-arrow-cap" d="M ' + nAt(bx) + " " + nAt(by) + " L " + nAt(tip.x) + " " + nAt(tip.y) +
      '" fill="none" stroke="' + tokens.colors.edge + '" stroke-width="' + width + '" stroke-linecap="round" marker-end="url(#vnm-arrow)"/>';
  }
  function svgCapStart(head: Pt, next: Pt, width: number): string {
    const dx = next.x - head.x;
    const dy = next.y - head.y;
    const mag = Math.hypot(dx, dy) || 1;
    const len = Math.min(tokens.edge.arrowSize + 4, mag);
    const bx = head.x + (dx / mag) * len;
    const by = head.y + (dy / mag) * len;
    return '<path class="vnm-arrow-cap" d="M ' + nAt(head.x) + " " + nAt(head.y) + " L " + nAt(bx) + " " + nAt(by) +
      '" fill="none" stroke="' + tokens.colors.edge + '" stroke-width="' + width + '" stroke-linecap="round" marker-start="url(#vnm-arrow-start)"/>';
  }
  function svgPolygon(pts: number[][], common: string): string {
    return '<polygon points="' + pts.map((p) => nAt(p[0]!) + "," + nAt(p[1]!)).join(" ") + '" ' + common + "/>";
  }
  function svgShape(shape: string, box: Box, fill: string, stroke: string, sw: string, dash: string, key: string): string {
    const x = box.x - box.w / 2;
    const y = box.y - box.h / 2;
    const w = box.w;
    const h = box.h;
    const cx = box.x;
    const cy = box.y;
    if (sketch) {
      // Mirror src/render/svg.ts sketchShape: soft rough fill + N wobbly outline
      // strokes (+ subroutine side bars), byte-identical for toSvgString parity.
      const sp = sketchShapePoints(shape, x, y, w, h);
      const rs = roughShape(sp.pts, key);
      const strokeAttr =
        ' fill="none" stroke="' + stroke + '" stroke-width="' + sw +
        '" stroke-linejoin="round" stroke-linecap="round"' + dash;
      let out = '<path d="' + rs.fill + '" fill="' + fill + '" stroke="none"/>';
      for (const d of rs.outline) out += '<path d="' + d + '"' + strokeAttr + "/>";
      sp.extras.forEach((seg, i) => {
        for (const d of roughPolyline(seg, key + "#x" + i)) out += '<path d="' + d + '"' + strokeAttr + "/>";
      });
      return out;
    }
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
    // Sketch: a state pseudo-state stays a CLEAN marker in the serialized SVG too
    // (Save SVG / PNG), matching the static state renderer (TEST-001).
    if (sketch && node.stateMarker) {
      const b = absBox(node.id);
      const r = Math.min(9, b.w / 2);
      const cx = nAt(b.x);
      const cy = nAt(b.y);
      const col = tokens.colors.text;
      if (node.stateMarker === "start") {
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + nAt(r) + '" fill="' + col + '"/>';
      }
      return (
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + nAt(r) + '" fill="none" stroke="' + col + '" stroke-width="1.5"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + nAt(r - 4) + '" fill="' + col + '"/>'
      );
    }
    const box = absBox(node.id);
    const st = styleForNode(node.id, node.classes, node.style);
    const shadow = tokens.effects.gradient && !sketch ? ' filter="url(#vnm-shadow)"' : "";
    const sw = xmlAttr(st.strokeWidth ?? "1.5");
    const dash = st.strokeDasharray ? ' stroke-dasharray="' + xmlAttr(st.strokeDasharray) + '"' : "";
    const shape = svgShape(node.shape, box, xmlAttr(st.fill), xmlAttr(st.stroke), sw, dash, node.id);
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
    const edgePathParts: string[] = [];
    const edgeLabelParts: string[] = [];
    const edgeArrowCapParts: string[] = [];
    const allPts: Pt[] = [];
    const routesB = edgeEls.map((e, i) => {
      const wps = e.waypoints ? e.waypoints.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })) : undefined;
      return routeBoxes(absBox(e.from), absBox(e.to), wps, ports[i], e.from === e.to);
    });
    // v0.6.6 (defect #3): FIRST, pull a trunk piercing a foreign container outside it and
    // re-enter near its endpoint (matching finishEdges) — absolute-coord container boxes so
    // Save-SVG byte-matches the static layout()'s re-routed trunks (parity).
    avoidSubgraphs(routesB, edgeEls, avoidContainersFrom(subgraphAbsBox));
    // R1/R2 (mirror finishEdges): clamp endpoint re-entry, then push interior/approach node pierces out.
    const nabB = avoidNodeBoxes((id) => { const b = absBox(id); return { x: b.x, y: b.y, w: b.w, h: b.h }; });
    trimEndpointReentry(routesB, edgeEls, nabB);
    for (let k = 0; k < NODE_AVOID_PASSES; k++) { avoidNodes(routesB, edgeEls, nabB); detourApproaches(routesB, edgeEls, nabB); }
    // v0.6.4 (option d): lift each label off its line FIRST so the line stays continuous
    // and the de-collision passes below de-collide the offset (drawn) plates (parity).
    foldLabelShifts(routesB, resolveLabelLineOffsets(labelPlatesOf(routesB), routesB.map((r) => r.points)));
    // FR9: lane-separate FIRST (mutates points/path/labelPos), matching finishEdges,
    // so Save-SVG byte-matches the static layout()'s re-laned routes (parity).
    separateLanes(routesB);
    // v0.6.2: de-cramp a collinear anti-parallel elbow pair the lane gate skips.
    separateAntiParallelJogs(routesB, edgeEls);
    // v0.6.5: de-tangle a ≥3-edge convergence bundle at one node side (defect #1).
    separateConvergentJogs(routesB, edgeEls);
    // FR6: de-collide label plates from the ROUNDED routed midpoints (== the value
    // the sink emits), folding each shift into labelPos so the shift byte-matches
    // the static layout()'s and the label-vs-node pass reads the moved plate.
    foldLabelShifts(routesB, resolveLabelCollisions(labelPlatesOf(routesB)));
    // label-vs-edge (UAT-round): slide any label off a foreign edge's crossing line.
    foldLabelShifts(routesB, resolveLabelEdgeCollisions(labelPlatesOf(routesB), routesB.map((r) => r.points)));
    // label-vs-node (UAT-1): push any label off a node box (absolute coords).
    const nodeBoxesB = model.nodes.map((nd) => {
      const b = absBox(nd.id);
      return { x: b.x, y: b.y, w: b.w, h: b.h };
    });
    foldLabelShifts(routesB, resolveLabelNodeCollisions(labelPlatesOf(routesB), nodeBoxesB));
    // v0.6.4: final label-label pass — node de-collision can repack an offset label into
    // a neighbour, so re-separate labels last (matches finishEdges).
    foldLabelShifts(routesB, resolveLabelCollisions(labelPlatesOf(routesB)));
    // FR7: bake crossing hops into the clean path (svgEdge sketch ignores `path`).
    const bridgedB = applyEdgeBridges(routesB.map((r) => r.points), bridgesEnabled());
    edgeEls.forEach((e, i) => {
      const r = routesB[i]!;
      for (const p of r.points) allPts.push(p);
      edgePathParts.push(svgEdge(e, bridgedB[i] ?? r.path, r.points));
      if (arrowCaps) edgeArrowCapParts.push(svgEdgeArrowCap(e, r.points));
      if (e.label) {
        edgeLabelParts.push(svgEdgeLabel(e.label, r.labelPos.x, r.labelPos.y));
      }
    });
    // v0.6.4: include off-line label plates in the bounds (mirrors the static
    // labelPlateCorners → contentBounds) so Save-SVG never clips an offset label.
    for (const pl of labelPlatesOf(routesB)) {
      if (pl) allPts.push({ x: pl.x - pl.w / 2, y: pl.y - pl.h / 2 }, { x: pl.x + pl.w / 2, y: pl.y + pl.h / 2 });
    }
    const b = boundsAbs(boxes, allPts);
    const parts: string[] = [];
    parts.push(
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + nAt(b.width) + '" height="' + nAt(b.height) +
        '" viewBox="' + nAt(b.x) + " " + nAt(b.y) + " " + nAt(b.width) + " " + nAt(b.height) +
        '" font-family="' + xmlAttr(sketch && payload.sketch ? payload.sketch.fontFamily : tokens.font.family) + '">',
    );
    parts.push(svgDefs());
    parts.push(
      '<rect x="' + nAt(b.x) + '" y="' + nAt(b.y) + '" width="' + nAt(b.width) + '" height="' + nAt(b.height) +
        '" fill="' + tokens.colors.background + '"/>',
    );
    // 6-layer order (FR1) mirroring src/render/svg.ts renderSvgFromModel for
    // byte-parity: 1 boxes → 2 edge paths → 3 edge labels → 4 titles → 5 nodes
    // → 6 arrowhead caps (heads re-drawn above nodes so none is ever hidden).
    for (const sg of model.subgraphs) parts.push(svgSubgraphBox(sg)); // 1
    for (const ep of edgePathParts) parts.push(ep); // 2
    for (const lp of edgeLabelParts) parts.push(lp); // 3
    for (const sg of model.subgraphs) parts.push(svgSubgraphTitle(sg)); // 4
    for (const nd of model.nodes) parts.push(svgNode(nd)); // 5
    for (const cap of edgeArrowCapParts) parts.push(cap); // 6
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
