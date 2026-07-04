/**
 * Interactive shell for a native sequence diagram — a **fully self-contained**
 * function (like {@link vnmRuntime}): it references no module-scope value (only
 * `import type`, which is erased) so {@link renderSequenceHtml} can inline it
 * into a standalone page via `seqRuntime.toString()`.
 *
 * Sequence interactivity per the plan is **themed + pan / zoom / fit** (the
 * floor), not draggable participants — the diagram is a fixed ordered layout, so
 * we render our themed static SVG into a pannable/zoomable "world" with a
 * minimap and a fit/zoom toolbar. Shares the `.vnm-*` class names + toolbar
 * glyphs with the flowchart runtime so the two feel of a piece.
 */

export interface SeqRuntimeOptions {
  fitPadding: number;
  minimap: boolean;
  minScale: number;
  maxScale: number;
}

/** A participant box in offset-removed ("world") coords, for the minimap. */
export interface SeqMinimapBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SeqRuntimePayload {
  /** Themed static sequence SVG (transparent background), sized to `content`. */
  svg: string;
  cssVars: string;
  /** Canvas background color (the theme background). */
  bg: string;
  content: { width: number; height: number };
  /** Minimap geometry in offset-removed coords. */
  minimap: { boxes: SeqMinimapBox[]; lines: number[]; accent: string; viewport: string };
  options: SeqRuntimeOptions;
}

export interface SeqRuntimeHandle {
  root: HTMLElement;
  destroy(): void;
  fit(): void;
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
}

export function seqRuntime(root: HTMLElement, payload: SeqRuntimePayload): SeqRuntimeHandle {
  const doc = root.ownerDocument;
  const win = doc.defaultView as Window;
  const opt = payload.options;
  const contentW = payload.content.width;
  const contentH = payload.content.height;

  let tx = 0;
  let ty = 0;
  let scale = 1;

  // ---- scaffold ----
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
  world.setAttribute(
    "style",
    "position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;",
  );
  world.innerHTML = payload.svg;
  viewport.appendChild(world);

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
  toolbar.setAttribute("style", "position:absolute;left:12px;top:12px;display:flex;gap:6px;");
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

  // ---- view control ----
  function clampScale(v: number): number {
    return Math.max(opt.minScale, Math.min(opt.maxScale, v));
  }
  function applyTransform(): void {
    world.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
    drawMinimap();
  }
  function fit(): void {
    const vw = viewport.clientWidth || 800;
    const vh = viewport.clientHeight || 600;
    const pad = opt.fitPadding;
    const s = clampScale(
      Math.min((vw - pad * 2) / Math.max(contentW, 1), (vh - pad * 2) / Math.max(contentH, 1)),
    );
    scale = s;
    tx = (vw - contentW * s) / 2;
    ty = (vh - contentH * s) / 2;
    applyTransform();
  }
  function zoomAt(cx: number, cy: number, next: number): void {
    const wx = (cx - tx) / scale;
    const wy = (cy - ty) / scale;
    scale = next;
    tx = cx - wx * scale;
    ty = cy - wy * scale;
    applyTransform();
  }
  function zoomBy(factor: number): void {
    zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, clampScale(scale * factor));
  }
  function resetView(): void {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
  }

  // ---- minimap draw ----
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
    ctx.strokeStyle = payload.minimap.accent;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.45;
    for (const y of payload.minimap.lines) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(contentW, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = payload.minimap.accent;
    for (const box of payload.minimap.boxes) ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.restore();
    // viewport rectangle
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const vx = (-tx / scale) * s;
    const vy = (-ty / scale) * s;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = payload.minimap.accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, (vw / scale) * s, (vh / scale) * s);
    ctx.fillStyle = payload.minimap.viewport;
    ctx.fillRect(vx, vy, (vw / scale) * s, (vh / scale) * s);
  }

  // ---- interactions ----
  let mode: "none" | "pan" | "minimap" = "none";
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;

  function onPointerDown(ev: PointerEvent): void {
    const target = ev.target as HTMLElement;
    if (target.closest && target.closest(".vnm-toolbar")) return;
    mode = "pan";
    startX = ev.clientX;
    startY = ev.clientY;
    startTx = tx;
    startTy = ty;
    viewport.style.cursor = "grabbing";
    viewport.setPointerCapture(ev.pointerId);
  }
  function onPointerMove(ev: PointerEvent): void {
    if (mode !== "pan") return;
    tx = startTx + (ev.clientX - startX);
    ty = startTy + (ev.clientY - startY);
    applyTransform();
  }
  function onPointerUp(ev: PointerEvent): void {
    viewport.style.cursor = "grab";
    try {
      viewport.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    mode = "none";
  }
  function onWheel(ev: WheelEvent): void {
    ev.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAt(cx, cy, clampScale(scale * factor));
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

  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("wheel", onWheel, { passive: false });
  if (minimap) {
    minimap.addEventListener("pointerdown", onMinimapDown);
    minimap.addEventListener("pointermove", onMinimapMove);
    minimap.addEventListener("pointerup", onMinimapUp);
  }

  function destroy(): void {
    viewport.removeEventListener("pointerdown", onPointerDown);
    viewport.removeEventListener("pointermove", onPointerMove);
    viewport.removeEventListener("pointerup", onPointerUp);
    viewport.removeEventListener("wheel", onWheel);
    root.removeChild(viewport);
  }

  // ---- boot ----
  if (viewport.clientWidth === 0) win.requestAnimationFrame(() => fit());
  else fit();
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
  };
}
