/**
 * Group-drag coverage for FR6 (D6=C): grabbing a subgraph container's border /
 * title band drags the WHOLE cluster — every member node moves together, the box
 * follows via auto-contain, and non-members stay put. Unlike the importLayout-
 * driven parity guard (dom-runtime-parity.test.ts), this drives the real
 * onPointerDown/Move/Up handlers through an event-capable fake DOM, so the
 * subgraph hit-test + group-move wiring itself is exercised (the e2e that drives
 * it in a real browser is phase ④'s job; this pins the logic at the unit level).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prepare } from "../src/render/prepare.js";
import { vnmRuntime, type RuntimeHandle } from "../src/render/dom/runtime.js";
import { buildPayload } from "../src/render/dom/payload.js";

// ---- event-capable fake DOM (stores listeners so tests can dispatch) ----
type Listener = (ev: unknown) => void;
class FakeEl {
  tagName: string;
  ownerDocument: FakeDoc;
  attrs: Record<string, string> = {};
  kids: FakeEl[] = [];
  parent: FakeEl | null = null;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  // A real-enough classList that reflects into `className` (so `closest()` and
  // the runtime's `classList.add("vnm-root")` both see the same class tokens).
  classList = {
    add: (c: string): void => {
      const set = new Set(this.className.split(/\s+/).filter(Boolean));
      set.add(c);
      this.className = [...set].join(" ");
    },
    remove: (c: string): void => {
      const set = new Set(this.className.split(/\s+/).filter(Boolean));
      set.delete(c);
      this.className = [...set].join(" ");
    },
    contains: (c: string): boolean => this.className.split(/\s+/).includes(c),
  };
  className = "";
  textContent = "";
  listeners: Record<string, Listener[]> = {};
  constructor(tag: string, doc: FakeDoc) {
    this.tagName = tag;
    this.ownerDocument = doc;
  }
  setAttribute(k: string, v: unknown): void {
    this.attrs[k] = String(v);
  }
  getAttribute(k: string): string | null {
    return k in this.attrs ? this.attrs[k]! : null;
  }
  removeAttribute(k: string): void {
    delete this.attrs[k];
  }
  appendChild(c: FakeEl): FakeEl {
    c.parent = this;
    this.kids.push(c);
    return c;
  }
  insertBefore(c: FakeEl): FakeEl {
    c.parent = this;
    this.kids.unshift(c);
    return c;
  }
  removeChild(c: FakeEl): FakeEl {
    const i = this.kids.indexOf(c);
    if (i >= 0) this.kids.splice(i, 1);
    c.parent = null;
    return c;
  }
  addEventListener(type: string, fn: Listener): void {
    (this.listeners[type] ?? (this.listeners[type] = [])).push(fn);
  }
  removeEventListener(): void {}
  dispatch(type: string, ev: unknown): void {
    for (const fn of this.listeners[type] ?? []) fn(ev);
  }
  // Class-selector matching, enough for the runtime's `.closest(".vnm-…")` calls:
  // an element matches when its className carries the requested class token.
  matches(sel: string): boolean {
    return sel[0] === "." && this.className.split(/\s+/).includes(sel.slice(1));
  }
  closest(sel: string): FakeEl | null {
    let el: FakeEl | null = this;
    while (el) {
      if (el.matches(sel)) return el;
      el = el.parent;
    }
    return null;
  }
  querySelector(): null {
    return null;
  }
  setPointerCapture(): void {}
  releasePointerCapture(): void {}
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 800, height: 600 };
  }
  getContext(): null {
    return null;
  }
  get firstChild(): FakeEl | null {
    return this.kids[0] ?? null;
  }
  get clientWidth(): number {
    return 800;
  }
  get clientHeight(): number {
    return 600;
  }
  set innerHTML(_v: string) {
    /* ignored */
  }
}
class FakeWin {
  localStorage = { getItem: (): null => null, setItem(): void {}, removeItem(): void {} };
  requestAnimationFrame(cb: () => void): number {
    cb();
    return 1;
  }
  cancelAnimationFrame(): void {}
}
class FakeDoc {
  defaultView: FakeWin;
  title = "d";
  constructor(win: FakeWin) {
    this.defaultView = win;
  }
  createElement(tag: string): FakeEl {
    return new FakeEl(tag, this);
  }
  createElementNS(_ns: string, tag: string): FakeEl {
    return new FakeEl(tag, this);
  }
}

function walk(el: FakeEl, out: FakeEl[] = []): FakeEl[] {
  out.push(el);
  for (const k of el.kids) walk(k, out);
  return out;
}

function mount(dsl: string): { root: FakeEl; viewport: FakeEl; handle: RuntimeHandle } {
  const { model, theme } = prepare(dsl, { theme: "light" });
  const root = new FakeEl("div", new FakeDoc(new FakeWin()));
  const handle = vnmRuntime(root as unknown as HTMLElement, buildPayload(model, theme, { minimap: false, persist: false }));
  // pin the world transform to identity so world coords == client coords
  handle.importLayout({ version: 1, positions: {}, transform: { x: 0, y: 0, scale: 1 } });
  const viewport = walk(root).find((e) => e.className === "vnm-viewport")!;
  return { root, viewport, handle };
}

const SG_DSL = ["flowchart TD", "subgraph G[Warehouse]", "  A[Stock] --> B[Pick]", "end", "B --> C[Ship]"].join("\n");

describe("subgraph group-drag moves every member together (FR6 / D6=C)", () => {
  beforeAll(() => {
    (globalThis as unknown as { getComputedStyle: () => { position: string } }).getComputedStyle = () => ({
      position: "relative",
    });
  });
  afterAll(() => {
    delete (globalThis as unknown as { getComputedStyle?: unknown }).getComputedStyle;
  });

  it("dragging the container's title band moves all members + the box, leaving non-members put", () => {
    const { root, viewport, handle } = mount(SG_DSL);
    const { model } = prepare(SG_DSL, { theme: "light" });
    const off = model.bounds;

    // world boxes of the members (offset-removed)
    const wbox = (id: string): { x: number; y: number; w: number; h: number } => {
      const nd = model.nodes.find((n) => n.id === id)!;
      return { x: nd.x - off.x, y: nd.y - off.y, w: nd.width, h: nd.height };
    };
    const A = wbox("A");
    const B = wbox("B");
    // the container's world box (mirror of geometry.subgraphBox — titled)
    const minX = Math.min(A.x - A.w / 2, B.x - B.w / 2);
    const minY = Math.min(A.y - A.h / 2, B.y - B.h / 2);
    const maxX = Math.max(A.x + A.w / 2, B.x + B.w / 2);
    const SG_PAD = 14;
    const SG_TITLE = 18;
    const x0 = minX - SG_PAD;
    const y0 = minY - (SG_PAD + SG_TITLE);
    const x1 = maxX + SG_PAD;
    const grabX = (x0 + x1) / 2; // centre of the container, along the title band
    const grabY = y0 + 5; // inside the title band → group grab (not the interior)

    const before = handle.getPositions();
    const rect = () => walk(root).find((e) => e.getAttribute("class") === "vnm-subgraph")!;
    const boxXBefore = parseFloat(rect().getAttribute("x")!);

    const dx = 60;
    const dy = 40;
    viewport.dispatch("pointerdown", { target: {}, clientX: grabX, clientY: grabY, pointerId: 1 });
    viewport.dispatch("pointermove", { target: {}, clientX: grabX + dx, clientY: grabY + dy, pointerId: 1 });
    viewport.dispatch("pointerup", { target: {}, clientX: grabX + dx, clientY: grabY + dy, pointerId: 1 });

    const after = handle.getPositions();
    // both members shifted by exactly the drag delta (scale 1 → world == screen)
    expect(after.A!.x).toBeCloseTo(before.A!.x + dx, 6);
    expect(after.A!.y).toBeCloseTo(before.A!.y + dy, 6);
    expect(after.B!.x).toBeCloseTo(before.B!.x + dx, 6);
    expect(after.B!.y).toBeCloseTo(before.B!.y + dy, 6);
    // the non-member C did NOT move (membership is scoped to the container)
    expect(after.C!.x).toBeCloseTo(before.C!.x, 6);
    expect(after.C!.y).toBeCloseTo(before.C!.y, 6);
    // the container box followed its members (auto-contain), shifted by the delta
    expect(parseFloat(rect().getAttribute("x")!)).toBeCloseTo(boxXBefore + dx, 6);
  });

  it("grabbing the OPEN interior pans instead of dragging the cluster", () => {
    const { viewport, handle } = mount(SG_DSL);
    const { model } = prepare(SG_DSL, { theme: "light" });
    const off = model.bounds;
    // the geometric centre of the container is open interior (below the title
    // band, away from the borders) → a pan, so member positions must NOT change
    const a = model.nodes.find((n) => n.id === "A")!;
    const b = model.nodes.find((n) => n.id === "B")!;
    const cx = (a.x + b.x) / 2 - off.x;
    const cy = (a.y + b.y) / 2 - off.y;

    const before = handle.getPositions();
    viewport.dispatch("pointerdown", { target: {}, clientX: cx, clientY: cy, pointerId: 2 });
    viewport.dispatch("pointermove", { target: {}, clientX: cx + 50, clientY: cy + 30, pointerId: 2 });
    viewport.dispatch("pointerup", { target: {}, clientX: cx + 50, clientY: cy + 30, pointerId: 2 });

    const after = handle.getPositions();
    expect(after.A).toEqual(before.A);
    expect(after.B).toEqual(before.B);
    expect(after.C).toEqual(before.C);
  });
});

// ---- FR7 (D7=A) edge endpoint pinning, driven through the REAL pointer handlers
// (REV-006). The subgraph group-drag tests above dispatch with `target:{}`, which
// has no closest() and so deliberately can't reach the edge-handle branch. Here the
// dispatched target IS the runtime's actual `.vnm-edge-handle` element (with its
// live dataset.ei/end), so onPointerDown's `target.closest(".vnm-edge-handle")`
// branch, onPointerMove's "anchor" branch, and `anchorFromPointer` all genuinely
// run — the exact FR7 pin wiring that previously had zero pointer-event coverage.
// (The real-browser e2e that hit-tests the small handle over a card — z-index /
// pointer-events / pointer-capture — is phase ④'s job; this pins the logic.)
const HUB_DSL = ["flowchart TD", "A-->B", "A-->C", "A-->D"].join("\n");

describe("edge endpoint pin via pointer events on a .vnm-edge-handle (FR7 / D7=A, REV-006)", () => {
  beforeAll(() => {
    (globalThis as unknown as { getComputedStyle: () => { position: string } }).getComputedStyle = () => ({
      position: "relative",
    });
  });
  afterAll(() => {
    delete (globalThis as unknown as { getComputedStyle?: unknown }).getComputedStyle;
  });

  it("select reveals the incident handles; dragging edge 0's source to another border pins {side,offset}, siblings + the other end stay auto, reset clears it", () => {
    const { root, viewport, handle } = mount(HUB_DSL);
    const { model } = prepare(HUB_DSL, { theme: "light" });
    const off = model.bounds;
    const A = model.nodes.find((n) => n.id === "A")!;
    const ax = A.x - off.x; // A's centre in world coords (mount pins transform = identity)
    const ay = A.y - off.y;

    // the runtime created a handle per (edge, end); grab the real elements for edge 0
    const findHandle = (ei: string, end: string): FakeEl =>
      walk(root).find(
        (e) => e.className === "vnm-edge-handle" && e.dataset.ei === ei && e.dataset.end === end,
      )!;
    const src0 = findHandle("0", "source"); // edge 0 = A-->B, source end on A
    const tgt0 = findHandle("0", "target"); // edge 0 target end on B
    expect(src0).toBeTruthy();
    expect(tgt0).toBeTruthy();
    expect(src0.dataset.ei).toBe("0");
    expect(src0.dataset.end).toBe("source");
    // before selecting anything, every endpoint handle is hidden
    expect(src0.style.display).not.toBe("block");

    // 1) SELECT A by clicking its card (pointerdown+up, no move) — this reaches the
    //    card branch of onPointerDown (via closest(".vnm-node")) and selectNode().
    const cardA = walk(root).find((e) => e.className === "vnm-node" && e.dataset.id === "A")!;
    viewport.dispatch("pointerdown", { target: cardA, clientX: ax, clientY: ay, pointerId: 3 });
    viewport.dispatch("pointerup", { target: cardA, clientX: ax, clientY: ay, pointerId: 3 });
    // selectNode() reveals the incident edge handles SYNCHRONOUSLY, with NO
    // intervening layout/render call (TEST-002 regression guard — the previous
    // version masked the bug by calling a no-op importLayout() here to force a
    // render pass). A is selected, so its SOURCE handles show; edge 0's TARGET
    // handle (on the unselected B) stays hidden — both positionEdgeHandles branches.
    expect(src0.style.display).toBe("block");
    expect(tgt0.style.display).toBe("none");
    expect(handle.exportLayout().anchors).toBeUndefined(); // nothing pinned yet

    // 2) DRAG edge 0's source handle from A's bottom border (its TD auto-home) to
    //    A's RIGHT border. The dispatched target is the real handle, so the
    //    onPointerDown edge-handle branch + onPointerMove anchor branch both run.
    viewport.dispatch("pointerdown", { target: src0, clientX: ax, clientY: ay + A.height / 2, pointerId: 4 });
    viewport.dispatch("pointermove", { target: src0, clientX: ax + A.width, clientY: ay, pointerId: 4 });
    viewport.dispatch("pointerup", { target: src0, clientX: ax + A.width, clientY: ay, pointerId: 4 });

    // anchorFromPointer resolved the dominant +x axis → the RIGHT side, offset 0
    // (centre), and only edge 0's SOURCE is pinned:
    const pinned = handle.exportLayout();
    expect(pinned.anchors).toBeDefined();
    expect(pinned.anchors!["0"]).toEqual({ source: { side: "right", offset: 0 }, from: "A", to: "B" });
    expect(pinned.anchors!["0"]!.target).toBeUndefined(); // the other end still auto-distributes
    expect(pinned.anchors!["1"]).toBeUndefined(); // sibling A-->C untouched
    expect(pinned.anchors!["2"]).toBeUndefined(); // sibling A-->D untouched

    // the live edge 0 path now genuinely starts on A's right border (pin applied)
    const rightX = ax + A.width / 2;
    const paths = walk(root)
      .filter((e) => e.tagName === "path")
      .map((e) => e.getAttribute("d") ?? "");
    expect(paths[0]!.startsWith("M " + rightX + " ")).toBe(true);

    // 3) RESET clears every pin — edges return to pure auto-distribute
    handle.resetLayout();
    expect(handle.exportLayout().anchors).toBeUndefined();
  });

  it("edge-handle visibility tracks selection: a plain select shows them and a deselect hides them, with NO intervening layout call (TEST-002)", () => {
    const { root, viewport } = mount(HUB_DSL);
    const { model } = prepare(HUB_DSL, { theme: "light" });
    const off = model.bounds;
    const A = model.nodes.find((n) => n.id === "A")!;
    const ax = A.x - off.x;
    const ay = A.y - off.y;

    const findHandle = (ei: string, end: string): FakeEl =>
      walk(root).find(
        (e) => e.className === "vnm-edge-handle" && e.dataset.ei === ei && e.dataset.end === end,
      )!;
    const src0 = findHandle("0", "source"); // edge 0 = A-->B, source end on A
    const tgt0 = findHandle("0", "target"); // edge 0 target end on B (unselected)

    // nothing selected yet → every endpoint handle hidden
    expect(src0.style.display).not.toBe("block");
    expect(tgt0.style.display).not.toBe("block");

    // SELECT A (pointerdown+up, no move). Assert the incident SOURCE handle is
    // visible IMMEDIATELY afterward — no drag/resize/import/render call in
    // between. Before the TEST-002 fix, selectNode() only positioned the resize
    // corners, so this handle stayed display:none until some other render pass.
    const cardA = walk(root).find((e) => e.className === "vnm-node" && e.dataset.id === "A")!;
    viewport.dispatch("pointerdown", { target: cardA, clientX: ax, clientY: ay, pointerId: 7 });
    viewport.dispatch("pointerup", { target: cardA, clientX: ax, clientY: ay, pointerId: 7 });
    expect(src0.style.display).toBe("block"); // shown by select alone
    expect(tgt0.style.display).toBe("none"); // other end (on unselected B) stays hidden

    // DESELECT by pressing empty canvas (a pan starts with deselect() at
    // pointerdown). Assert the shown handle is hidden IMMEDIATELY — again no
    // intervening render call. Before the fix, deselect() only hid the resize
    // corners, so the edge handle lingered as a stale floating dot.
    viewport.dispatch("pointerdown", { target: viewport, clientX: 5, clientY: 5, pointerId: 8 });
    expect(src0.style.display).toBe("none"); // hidden by deselect alone
    viewport.dispatch("pointerup", { target: viewport, clientX: 5, clientY: 5, pointerId: 8 });
  });

  it("pins BOTH ends of an edge across two drags, keyed by edge index (FR7)", () => {
    const { root, viewport, handle } = mount(HUB_DSL);
    const { model } = prepare(HUB_DSL, { theme: "light" });
    const off = model.bounds;
    const A = model.nodes.find((n) => n.id === "A")!;
    const B = model.nodes.find((n) => n.id === "B")!;
    const findHandle = (ei: string, end: string): FakeEl =>
      walk(root).find(
        (e) => e.className === "vnm-edge-handle" && e.dataset.ei === ei && e.dataset.end === end,
      )!;

    // pin edge 0's source to A's LEFT border
    const src0 = findHandle("0", "source");
    const ax = A.x - off.x;
    const ay = A.y - off.y;
    viewport.dispatch("pointerdown", { target: src0, clientX: ax, clientY: ay, pointerId: 5 });
    viewport.dispatch("pointermove", { target: src0, clientX: ax - A.width, clientY: ay, pointerId: 5 });
    viewport.dispatch("pointerup", { target: src0, clientX: ax - A.width, clientY: ay, pointerId: 5 });

    // then pin edge 0's target to B's TOP border (a second, independent drag)
    const tgt0 = findHandle("0", "target");
    const bx = B.x - off.x;
    const by = B.y - off.y;
    viewport.dispatch("pointerdown", { target: tgt0, clientX: bx, clientY: by, pointerId: 6 });
    viewport.dispatch("pointermove", { target: tgt0, clientX: bx, clientY: by - B.height, pointerId: 6 });
    viewport.dispatch("pointerup", { target: tgt0, clientX: bx, clientY: by - B.height, pointerId: 6 });

    const anchors = handle.exportLayout().anchors!;
    expect(anchors["0"]).toEqual({
      source: { side: "left", offset: 0 },
      target: { side: "top", offset: 0 },
      from: "A",
      to: "B",
    });
    // the pinned edge 0 genuinely leaves A's LEFT border (source pin applied)
    const paths = walk(root)
      .filter((e) => e.tagName === "path")
      .map((e) => e.getAttribute("d") ?? "");
    expect(paths[0]!.startsWith("M " + (ax - A.width / 2) + " ")).toBe(true);
  });
});
