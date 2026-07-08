/**
 * Parity guard for the inlined DOM runtime (REV-003).
 *
 * `src/render/dom/runtime.ts` deliberately re-implements geometry + style
 * resolution inline so it can be `.toString()`-serialized into the standalone
 * HTML export. That copy has no compiler-enforced link to `src/geometry` /
 * `src/render/style`, so it can silently drift. This test drives the REAL
 * runtime through a minimal fake DOM and asserts its rendered edge paths and
 * card styles match the shared modules point-for-point — so any future drift
 * (e.g. dropping `simplify()` or ignoring `stroke-width`/`stroke-dasharray`)
 * fails here.
 *
 * There is no DOM test environment configured (vitest runs in `node`), and the
 * runtime is intentionally self-contained, so we stub just enough of the DOM to
 * boot it (minimap + persistence disabled to keep the surface tiny).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { XMLValidator } from "fast-xml-parser";
import type { PositionedModel } from "../src/model/index.js";
import { vnmRuntime, type RuntimeHandle } from "../src/render/dom/runtime.js";
import { buildPayload } from "../src/render/dom/payload.js";
import { prepare } from "../src/render/prepare.js";
import {
  routeEdge,
  computePerimeterPorts,
  contentBounds,
  type NodeBox,
  type EdgeAnchorOverride,
} from "../src/geometry/index.js";
import { resolveNodeStyle } from "../src/render/style.js";
import { applyPositions } from "../src/layout/index.js";
import { renderSvgFromModel } from "../src/render/svg.js";
import { themes, type Theme } from "../src/theme/index.js";

// ---- minimal fake DOM (only what vnmRuntime touches at boot) ----
class FakeEl {
  tagName: string;
  ownerDocument: FakeDoc;
  attrs: Record<string, string> = {};
  kids: FakeEl[] = [];
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  classList = { add() {} };
  className = "";
  textContent = "";
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
    this.kids.push(c);
    return c;
  }
  insertBefore(c: FakeEl, _ref?: unknown): FakeEl {
    this.kids.unshift(c);
    return c;
  }
  removeChild(c: FakeEl): FakeEl {
    const i = this.kids.indexOf(c);
    if (i >= 0) this.kids.splice(i, 1);
    return c;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
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

/** Mount the runtime into a fresh fake DOM and return the root for inspection. */
function mountFake(payload: ReturnType<typeof buildPayload>): FakeEl {
  const root = new FakeEl("div", new FakeDoc(new FakeWin()));
  vnmRuntime(root as unknown as HTMLElement, payload);
  return root;
}

/** Like {@link mountFake} but also returns the live handle (for drag re-routes). */
function mountFakeH(payload: ReturnType<typeof buildPayload>): { root: FakeEl; handle: RuntimeHandle } {
  const root = new FakeEl("div", new FakeDoc(new FakeWin()));
  const handle = vnmRuntime(root as unknown as HTMLElement, payload);
  return { root, handle };
}

/**
 * Mount with persistence enabled against a real, map-backed localStorage (the
 * default {@link FakeWin} stubs it to a no-op). Lets a test seed a persisted
 * edit and then assert resetLayout() actually clears the stored entry.
 */
function mountWithStore(
  payload: ReturnType<typeof buildPayload>,
  store: Record<string, string>,
): { root: FakeEl; handle: RuntimeHandle } {
  const win = new FakeWin();
  (win as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string): string | null => (k in store ? store[k]! : null),
    setItem: (k: string, v: string): void => {
      store[k] = v;
    },
    removeItem: (k: string): void => {
      delete store[k];
    },
  };
  const root = new FakeEl("div", new FakeDoc(win));
  const handle = vnmRuntime(root as unknown as HTMLElement, payload);
  return { root, handle };
}

/**
 * Shared-geometry expectation for every edge, in the runtime's offset-removed
 * ("world") coordinate space, recomputing the port channel offsets from the
 * given (possibly dragged) node boxes — exactly what the runtime does live.
 */
function expectedPaths(
  model: PositionedModel,
  boxes: Map<string, NodeBox>,
  theme: (typeof themes)["light"],
): string[] {
  const off = model.bounds;
  const ports = computePerimeterPorts(model.edges, boxes);
  return model.edges.map((e, i) => {
    const wps = (e.waypoints ?? []).map((p) => ({ x: p.x - off.x, y: p.y - off.y }));
    return routeEdge(boxes.get(e.from)!, boxes.get(e.to)!, model.direction, theme!.edgeStyle, wps, ports[i]).path;
  });
}

/** Node boxes in offset-removed coords, optionally overriding positions + sizes. */
function worldBoxes(
  model: PositionedModel,
  overrides: Record<string, { x: number; y: number }> = {},
  sizeOverrides: Record<string, { w: number; h: number }> = {},
): Map<string, NodeBox> {
  const off = model.bounds;
  const boxes = new Map<string, NodeBox>();
  for (const nd of model.nodes) {
    const ov = overrides[nd.id];
    const sz = sizeOverrides[nd.id];
    boxes.set(nd.id, {
      x: (ov ? ov.x : nd.x) - off.x,
      y: (ov ? ov.y : nd.y) - off.y,
      width: sz ? sz.w : nd.width,
      height: sz ? sz.h : nd.height,
      shape: nd.shape,
    });
  }
  return boxes;
}

function walk(el: FakeEl, out: FakeEl[] = []): FakeEl[] {
  out.push(el);
  for (const k of el.kids) walk(k, out);
  return out;
}
const edgePaths = (root: FakeEl): string[] =>
  walk(root)
    .filter((e) => e.tagName === "path")
    .map((e) => e.getAttribute("d") ?? "");
const cardStyleById = (root: FakeEl, id: string): string => {
  const card = walk(root).find((e) => e.className === "vnm-node" && e.dataset.id === id);
  return card?.getAttribute("style") ?? "";
};

describe("DOM runtime parity with shared geometry + style (REV-003)", () => {
  beforeAll(() => {
    (globalThis as unknown as { getComputedStyle: () => { position: string } }).getComputedStyle =
      () => ({ position: "relative" });
  });
  afterAll(() => {
    delete (globalThis as unknown as { getComputedStyle?: unknown }).getComputedStyle;
  });

  it("routes elbow edges identically to geometry.routeEdge (simplify() applied)", () => {
    // Two vertically-aligned nodes: geometry's simplify() collapses the elbow to
    // a single straight segment. A runtime that skipped simplify() would keep the
    // redundant mid-waypoints and diverge here.
    const model: PositionedModel = {
      direction: "TB",
      nodes: [
        { id: "A", label: "A", shape: "rect", classes: [], x: 120, y: 60, width: 80, height: 40 },
        { id: "B", label: "B", shape: "rect", classes: [], x: 120, y: 220, width: 80, height: 40 },
      ],
      edges: [
        { from: "A", to: "B", kind: "solid", arrows: { start: false, end: true }, length: 2, points: [], path: "" },
      ],
      subgraphs: [],
      classDefs: new Map(),
      bounds: { x: 0, y: 0, width: 240, height: 320 },
    };
    const theme = themes.light!; // elbow edge style
    const root = mountFake(buildPayload(model, theme, { minimap: false, persist: false }));

    const off = model.bounds;
    const box = (id: string) => {
      const nd = model.nodes.find((n) => n.id === id)!;
      return { x: nd.x - off.x, y: nd.y - off.y, width: nd.width, height: nd.height, shape: nd.shape };
    };
    const expected = routeEdge(box("A"), box("B"), model.direction, theme.edgeStyle).path;

    // simplify() must have collapsed the route to one segment (guards the fix).
    expect(expected.match(/ L /g) ?? []).toHaveLength(1);
    expect(edgePaths(root)).toEqual([expected]);
  });

  it("threads dagre detour waypoints identically to the baked layout (TEST-001)", () => {
    // A skip-level edge (A->B->C plus A->C) makes dagre route A->C around B.
    // The live runtime recomputes edges from positions, so it must thread the
    // very same waypoints the static SVG baked, or the two renderers diverge.
    const { model, theme } = prepare("flowchart TD\nA-->B-->C\nA-->C", { theme: "light" });
    const ac = model.edges.find((e) => e.from === "A" && e.to === "C")!;
    // the routed detour is present and is a real poly-line (more than 2 points)
    expect(ac.waypoints && ac.waypoints.length).toBeGreaterThan(0);
    expect((ac.path.match(/ L /g) ?? []).length).toBeGreaterThan(1);

    const root = mountFake(buildPayload(model, theme, { minimap: false, persist: false }));

    // The runtime routes in offset-removed ("world") coords and recomputes the
    // perimeter ports live; compute the shared geometry's expectation the same way
    // (threading the same waypoints + recomputed ports) and require the live
    // runtime to match it for every edge, including the A->C detour.
    expect(edgePaths(root)).toEqual(expectedPaths(model, worldBoxes(model), theme));
  });

  it("routes CURVED (fancy) waypoint edges identically to geometry.routeEdge (REV-007)", () => {
    // The TEST-001 fix added a curved-style detour path — geometry.roundedPath()
    // and its inline twin runtime.pathRounded() — taken only when an edge has
    // dagre waypoints AND the theme uses the curved edge style (fancy). The
    // elbow cases above never reach it; this guards that .toString()-serialized
    // twin against future drift, same drift class as the elbow guard.
    const { model, theme } = prepare("flowchart TD\nA-->B-->C\nA-->C", { theme: "fancy" });
    expect(theme.edgeStyle).toBe("curved"); // sanity: fancy really selects curved

    const off = model.bounds;
    const box = (id: string) => {
      const nd = model.nodes.find((n) => n.id === id)!;
      return { x: nd.x - off.x, y: nd.y - off.y, width: nd.width, height: nd.height, shape: nd.shape };
    };

    // A->C is the skip-level detour: it must carry dagre waypoints and, under the
    // curved style, render as a *rounded* poly-path (the roundedPath/pathRounded
    // branch — quadratic `Q` corners), while the adjacent A->B / B->C edges take
    // the plain bezier (`C`) branch. Asserting the shapes here proves this case
    // genuinely exercises the curved+waypoint path the guard is meant to protect.
    const ac = model.edges.find((e) => e.from === "A" && e.to === "C")!;
    expect(ac.waypoints && ac.waypoints.length).toBeGreaterThan(0);
    const acWps = (ac.waypoints ?? []).map((p) => ({ x: p.x - off.x, y: p.y - off.y }));
    const acExpected = routeEdge(box("A"), box("C"), model.direction, theme.edgeStyle, acWps).path;
    expect(acExpected).toContain(" Q "); // rounded corners → curved waypoint branch
    const abExpected = routeEdge(box("A"), box("B"), model.direction, theme.edgeStyle).path;
    expect(abExpected).toContain(" C "); // plain curved bezier branch (no waypoints)

    const root = mountFake(buildPayload(model, theme, { minimap: false, persist: false }));

    // Require the live runtime to match the shared geometry (threading the same
    // waypoints + recomputed perimeter ports) for EVERY edge, so both the
    // pathRounded twin (A->C) and the bezier twin (A->B, B->C) stay in lockstep
    // with src/geometry under `curved`.
    expect(edgePaths(root)).toEqual(expectedPaths(model, worldBoxes(model), theme));
  });

  it("resolves card styles identically to resolveNodeStyle (stroke-width + dasharray)", () => {
    const dsl = [
      "flowchart TD",
      "A:::styled --> B",
      "classDef styled fill:#f00,stroke:#900,color:#fff,stroke-width:4px,stroke-dasharray:6 3",
    ].join("\n");
    const { model, theme } = prepare(dsl, { theme: "light" });
    const root = mountFake(buildPayload(model, theme, { minimap: false, persist: false }));

    const nodeA = model.nodes.find((n) => n.id === "A")!;
    const rs = resolveNodeStyle(nodeA, model.classDefs, theme);
    expect(rs).toMatchObject({ fill: "#f00", stroke: "#900", text: "#fff", strokeWidth: "4px", strokeDasharray: "6 3" });

    const styleA = cardStyleById(root, "A");
    expect(styleA).toContain("background:" + rs.fill + ";");
    expect(styleA).toContain("color:" + rs.text + ";");
    // stroke-width (SVG user units → px) + dasharray → dashed, mirroring the SVG
    expect(styleA).toContain("border:4px dashed " + rs.stroke + ";");

    // an unstyled node keeps the shared 1.5px solid default
    const nodeB = model.nodes.find((n) => n.id === "B")!;
    const styleB = cardStyleById(root, "B");
    expect(styleB).toContain("border:1.5px solid " + resolveNodeStyle(nodeB, model.classDefs, theme).stroke + ";");
  });

  // ---- port-offset parity (TEST-003): the runtime must read/recompute the same
  // channel spreads as computePortOffsets, or the interactive/exported-HTML view
  // occludes anti-parallel edges + collapses fans (the round-5 miss). These
  // multi-edge-per-side cases are the exact coverage the guard previously lacked.
  it("spreads an ANTI-PARALLEL pair onto distinct channels, matching computePortOffsets (TEST-003)", () => {
    const { model, theme } = prepare("flowchart TD\nA -->|go| B\nB -->|back| A", { theme: "light" });
    const expected = expectedPaths(model, worldBoxes(model), theme);
    const got = edgePaths(mountFake(buildPayload(model, theme, { minimap: false, persist: false })));
    expect(got).toEqual(expected);

    // the two opposite edges are genuinely on different channels — not the
    // original mirror-duplicate occlusion (their point SETS differ).
    const ab = model.edges.findIndex((e) => e.from === "A" && e.to === "B");
    const ba = model.edges.findIndex((e) => e.from === "B" && e.to === "A");
    const ptSet = (d: string): string =>
      d
        .replace(/[ML]/g, " ")
        .trim()
        .split(/\s+/)
        .join(" ")
        .match(/[-\d.]+ [-\d.]+/g)!
        .slice()
        .sort()
        .join("|");
    expect(ptSet(got[ab]!)).not.toBe(ptSet(got[ba]!));
  });

  it("spreads a FAN of edges leaving one node onto distinct source anchors (TEST-002/003)", () => {
    const { model, theme } = prepare("flowchart TD\nS --> L\nS --> M\nS --> R", { theme: "light" });
    const expected = expectedPaths(model, worldBoxes(model), theme);
    const got = edgePaths(mountFake(buildPayload(model, theme, { minimap: false, persist: false })));
    expect(got).toEqual(expected);
    // all three edges leave S at three DISTINCT start points (no shared trunk)
    const starts = got.map((d) => d.slice(0, d.indexOf(" L ") >= 0 ? d.indexOf(" L ") : d.length));
    expect(new Set(starts).size).toBe(3);
  });

  // ---- shape-aware anchoring (v0.4.1 bugfix): a channel-spread anchor on a
  // NON-rect node must be projected onto the drawn outline, and the runtime must
  // reproduce the shared geometry point-for-point. Before the fix the runtime's
  // inlined anchor ignored shape, so the interactive + exported-HTML view floated
  // an arrowhead beside a diamond / circle exactly like the static SVG did.
  it("projects a spread anchor onto a DIAMOND + CIRCLE outline, matching computePerimeterPorts (v0.4.1)", () => {
    // Anti-parallel edges between a diamond and a circle → offset != 0 at both
    // ends, on both non-rect shapes.
    const { model, theme } = prepare("flowchart TD\nB{Choice} --> C((Round))\nC --> B", { theme: "light" });
    const boxes = worldBoxes(model);
    const expected = expectedPaths(model, boxes, theme);
    const got = edgePaths(mountFake(buildPayload(model, theme, { minimap: false, persist: false })));
    // runtime == geometry for every edge, including the projected shape anchors
    expect(got).toEqual(expected);

    // the pair genuinely spread (a non-zero channel offset really is in play)
    const ports = computePerimeterPorts(model.edges, boxes);
    expect(ports.some((p) => p.source.offset !== 0 || p.target.offset !== 0)).toBe(true);

    // and the projection is genuinely active: the B->C start on the diamond B is
    // inset from B's bounding-box bottom (it rides the diamond edge, not the box).
    const B = boxes.get("B")!;
    const bc = model.edges.findIndex((e) => e.from === "B" && e.to === "C");
    const start = got[bc]!.match(/^M\s+([-\d.]+)\s+([-\d.]+)/)!;
    const sx = Number(start[1]);
    const sy = Number(start[2]);
    expect(sx).not.toBe(B.x); // spread off the side center
    expect(sy).toBeLessThan(B.y + B.height / 2 - 0.5); // inset above the box bottom
    // the point lies on the diamond outline: |dx|/hw + |dy|/hh == 1 (tolerance)
    expect(Math.abs(sx - B.x) / (B.width / 2) + Math.abs(sy - B.y) / (B.height / 2)).toBeCloseTo(1, 2);
  });

  it("keeps a dragged node's anti-parallel edges on distinct channels (live re-route)", () => {
    const { model, theme } = prepare("flowchart TD\nA -->|go| B\nB -->|back| A", { theme: "light" });
    const { root, handle } = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false }));
    const b0 = model.nodes.find((n) => n.id === "B")!;
    // simulate a drag: importLayout re-routes from the moved position, running
    // computePorts on the LIVE positions (not the baked ports).
    const movedAbs = { x: b0.x + 46, y: b0.y + 24 };
    handle.importLayout({ version: 1, positions: { B: movedAbs } });

    const got = edgePaths(root);
    const expected = expectedPaths(model, worldBoxes(model, { B: movedAbs }), theme);
    expect(got).toEqual(expected);

    // the pair did NOT collapse back onto one channel after the drag
    const ab = model.edges.findIndex((e) => e.from === "A" && e.to === "B");
    const ba = model.edges.findIndex((e) => e.from === "B" && e.to === "A");
    expect(got[ab]).not.toBe(got[ba]);
  });

  // ---- perimeter distribution (FR2): a hub's edges attach around the WHOLE
  // border (different sides by direction), and the runtime reproduces the shared
  // geometry point-for-point.
  it("distributes a hub's edges around the perimeter, matching computePerimeterPorts (FR2)", () => {
    // H sits in the middle with neighbours in every direction — the edges must
    // leave via all four borders (not cluster on one).
    const N = (id: string, x: number, y: number): NodeBox & { id: string } => ({ id, x, y, width: 70, height: 44 });
    const coords = [
      N("H", 240, 240),
      N("Nn", 240, 60),
      N("Ss", 240, 430),
      N("Ee", 430, 240),
      N("Ww", 40, 240),
      N("SEe", 400, 400),
    ];
    const edges = ["Nn", "Ss", "Ee", "Ww", "SEe"].map((to) => ({
      from: "H",
      to,
      kind: "solid" as const,
      arrows: { start: false, end: true },
      length: 2,
      points: [],
      path: "",
    }));
    const boxesAbs = new Map<string, NodeBox>(coords.map((c) => [c.id, { x: c.x, y: c.y, width: c.width, height: c.height }]));
    const bounds = contentBounds([...boxesAbs.values()], [], 20);
    const model: PositionedModel = {
      direction: "TB",
      nodes: coords.map((c) => ({ id: c.id, label: c.id, shape: "rect", classes: [], x: c.x, y: c.y, width: c.width, height: c.height })),
      edges,
      subgraphs: [],
      classDefs: new Map(),
      bounds,
    };
    const theme = themes.light!;
    const root = mountFake(buildPayload(model, theme, { minimap: false, persist: false }));
    expect(edgePaths(root)).toEqual(expectedPaths(model, worldBoxes(model), theme));

    // the five edges leave H via at least three distinct border sides (fanned out)
    const ports = computePerimeterPorts(model.edges, worldBoxes(model));
    const sides = new Set(ports.map((p) => p.source.side));
    expect(sides.size).toBeGreaterThanOrEqual(3);
  });

  it("re-routes a RESIZED node's edges to the new border, matching geometry (FR1)", () => {
    const { model, theme } = prepare("flowchart TD\nA-->B\nA-->C\nA-->D", { theme: "light" });
    const { root, handle } = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false }));
    const a = model.nodes.find((n) => n.id === "A")!;
    const newSize = { w: a.width + 90, h: a.height + 50 };
    // simulate a resize persisted through the sidecar (size override, center kept)
    handle.importLayout({ version: 1, positions: {}, sizes: { A: newSize } });

    const got = edgePaths(root);
    const expected = expectedPaths(model, worldBoxes(model, {}, { A: newSize }), theme);
    expect(got).toEqual(expected);
    // the fan still leaves A at three DISTINCT start points on the enlarged border
    const starts = got.map((d) => d.slice(0, d.indexOf(" L ") >= 0 ? d.indexOf(" L ") : d.length));
    expect(new Set(starts).size).toBe(3);
  });

  it("size overrides round-trip exportLayout → JSON → importLayout (FR4)", () => {
    const { model, theme } = prepare("flowchart TD\nA-->B", { theme: "light" });
    const { handle } = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false }));
    const a = model.nodes.find((n) => n.id === "A")!;
    const newSize = { w: a.width + 40, h: a.height + 20 };
    handle.importLayout({ version: 1, positions: {}, sizes: { A: newSize } });

    // exportLayout carries ONLY the resized node; a JSON round-trip preserves it
    const sidecar = JSON.parse(JSON.stringify(handle.exportLayout())) as ReturnType<RuntimeHandle["exportLayout"]>;
    expect(sidecar.sizes).toBeDefined();
    expect(sidecar.sizes!.A).toEqual(newSize);
    expect(sidecar.sizes!.B).toBeUndefined(); // unresized node is omitted

    // a fresh mount that imports the sidecar reproduces the size (reload keeps it)
    const { handle: h2 } = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false }));
    h2.importLayout(sidecar);
    expect(h2.exportLayout().sizes!.A).toEqual(newSize);
  });

  // ---- reset-layout (D2 / D5=A): the escape hatch the plan promised. A resize
  // or drag never re-runs layout, so resetLayout() is the only way back to the
  // computed layout — it must restore every position AND size, re-route all
  // edges, clear the persisted entry (so a reload stays reset), and leave pan/zoom.
  it("resetLayout() restores the computed positions + sizes, re-routes edges, clears persistence, keeps pan/zoom (D5=A)", () => {
    const { model, theme } = prepare("flowchart TD\nA-->B\nA-->C\nA-->D", { theme: "light" });
    const a = model.nodes.find((n) => n.id === "A")!;
    const KEY = "vnm-test-reset";
    // Seed localStorage as if the user dragged + resized A, then reloaded: the
    // runtime boots in the edited state (loadPersisted imports this on mount).
    const store: Record<string, string> = {
      [KEY]: JSON.stringify({
        version: 1,
        positions: { A: { x: a.x + 120, y: a.y + 80 } },
        sizes: { A: { w: a.width + 90, h: a.height + 50 } },
      }),
    };
    const { root, handle } = mountWithStore(
      buildPayload(model, theme, { minimap: false, persist: KEY }),
      store,
    );

    // sanity: it booted EDITED (moved + resized), not on the computed layout
    const edited = handle.exportLayout();
    expect(edited.positions.A).toEqual({ x: a.x + 120, y: a.y + 80 });
    expect(edited.sizes!.A).toEqual({ w: a.width + 90, h: a.height + 50 });
    const txBefore = edited.transform; // whatever the boot fit settled on

    handle.resetLayout();

    // positions + sizes are back to exactly what a fresh (un-edited) mount holds
    const fresh = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false })).handle.exportLayout();
    const reset = handle.exportLayout();
    expect(reset.positions).toEqual(fresh.positions);
    expect(reset.sizes).toBeUndefined(); // every size override discarded
    // edges re-routed/re-anchored to the computed boxes (perimeter re-spread)
    expect(edgePaths(root)).toEqual(expectedPaths(model, worldBoxes(model), theme));
    // the persisted layout entry is cleared, so a reload stays reset
    expect(KEY in store).toBe(false);
    // pan/zoom is deliberately left untouched — resetView() owns that, not this
    expect(reset.transform).toEqual(txBefore);
  });

  // ---- toSvgString parity (FR3 / D4): the runtime's inlined serializer must
  // byte-match renderSvg of the SAME edited model, so `Save SVG` in the browser
  // equals `vnm render -f svg` of the dragged + resized state.
  function editedModel(base: PositionedModel, theme: Theme, handle: RuntimeHandle): PositionedModel {
    const data = handle.exportLayout();
    const sizes = data.sizes
      ? Object.fromEntries(Object.entries(data.sizes).map(([id, s]) => [id, { width: s.w, height: s.h }]))
      : undefined;
    // data.anchors (FR7) is keyed by edge index — exactly applyPositions' shape
    // (its `side: string` widens to the geometry `Side` union here).
    const anchors = data.anchors as Record<string, EdgeAnchorOverride> | undefined;
    return applyPositions(base, data.positions, { theme, sizes, anchors });
  }

  for (const themeName of ["light", "fancy"] as const) {
    it(`toSvgString() == renderSvg of the edited model after drag + resize (${themeName})`, () => {
      const { model, theme } = prepare(
        "flowchart TD\nA[Start]-->B{Choice}\nB-->|yes| C([Done])\nB-->|no| D[(Store)]",
        { theme: themeName },
      );
      const { handle } = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false }));
      const b = model.nodes.find((n) => n.id === "B")!;
      const c = model.nodes.find((n) => n.id === "C")!;
      // drag C and resize B, then compare the serialized SVG to renderSvg of the
      // exact same edit applied through applyPositions.
      handle.importLayout({
        version: 1,
        positions: { C: { x: c.x - 30, y: c.y + 20 } },
        sizes: { B: { w: b.width + 44, h: b.height + 22 } },
      });
      const expected = renderSvgFromModel(editedModel(model, theme, handle), theme);
      const got = handle.toSvgString();
      expect(got).toBe(expected);
      // and the serialized SVG is well-formed XML
      expect(XMLValidator.validate(got)).toBe(true);
    });
  }

  // The first byte-parity loop drives only rect/diamond/stadium/cylinder and NO
  // subgraphs, so the inlined svgSubgraph() + the rounded / subroutine / circle /
  // hexagon / parallelogram / parallelogram-alt branches of svgShape() had no
  // guard. This second loop exercises a TITLED subgraph plus every remaining
  // shape (in both the elbow `light` and curved `fancy` themes) so any future
  // drift between the runtime's inlined serializer and src/render/svg.ts fails
  // here — REV-001.
  for (const themeName of ["light", "fancy"] as const) {
    it(`toSvgString() == renderSvg for a titled subgraph + every remaining shape (${themeName})`, () => {
      const dsl = [
        "flowchart TD",
        "subgraph G[Cluster One]",
        "  Rn(Rounded)",
        "  Sr[[Subroutine]]",
        "  Ci((Circle))",
        "end",
        "Hx{{Hexagon}} --> Rn",
        "Pl[/Parallel/] --> Sr",
        "Pa[\\Alt Para\\] --> Ci",
        "Rn --> Hx",
        "Sr -->|link| Pl",
      ].join("\n");
      const { model, theme } = prepare(dsl, { theme: themeName });
      // every shape the first loop skips is actually present in this model
      const shapes = new Set(model.nodes.map((nd) => nd.shape));
      for (const s of ["rounded", "subroutine", "circle", "hexagon", "parallelogram", "parallelogram-alt"]) {
        expect(shapes.has(s as (typeof model.nodes)[number]["shape"])).toBe(true);
      }
      expect(model.subgraphs.some((sg) => sg.title === "Cluster One")).toBe(true);

      const { handle } = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false }));
      const hx = model.nodes.find((n) => n.id === "Hx")!;
      const pl = model.nodes.find((n) => n.id === "Pl")!;
      // drag Hx + resize Pl (both outside the subgraph — its box is kept, matching
      // applyPositions), then byte-compare the serialized SVG to renderSvg.
      handle.importLayout({
        version: 1,
        positions: { Hx: { x: hx.x - 24, y: hx.y - 16 } },
        sizes: { Pl: { w: pl.width + 40, h: pl.height + 26 } },
      });
      const expected = renderSvgFromModel(editedModel(model, theme, handle), theme);
      const got = handle.toSvgString();
      expect(got).toBe(expected);
      expect(XMLValidator.validate(got)).toBe(true);

      // and the new branches were genuinely rendered (not silently absent)
      expect(got).toContain("Cluster One"); // svgSubgraph title
      expect(got).toMatch(/stroke-dasharray="4 4"/); // svgSubgraph border
      expect(got).toContain("<ellipse"); // circle branch
      expect(got).toContain("<polygon"); // hexagon + parallelogram branches
    });
  }

  // ---- FR6 (D6=C) subgraph auto-contain: when a MEMBER moves, the runtime's
  // live container rect + serialized SVG must re-hug it exactly as applyPositions
  // does — the whole point of the fix (the box never strands its children).
  for (const themeName of ["light", "fancy"] as const) {
    it(`re-hugs a subgraph when a member is dragged, matching renderSvg byte-for-byte (${themeName})`, () => {
      const dsl = [
        "flowchart TD",
        "subgraph G[Warehouse]",
        "  Stock[Stock check]",
        "  Pick[Pick & pack]",
        "end",
        "Order[Order] --> Stock",
        "Stock --> Pick",
        "Pick --> Ship[Ship]",
      ].join("\n");
      const { model, theme } = prepare(dsl, { theme: themeName });
      const g0 = model.subgraphs.find((s) => s.id === "G")!;
      const { handle } = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false }));
      const stock = model.nodes.find((n) => n.id === "Stock")!;
      // drag a MEMBER of the container far up-and-left (the screenshot's defect:
      // pulling a child "out" of the box)
      handle.importLayout({ version: 1, positions: { Stock: { x: stock.x - 160, y: stock.y - 90 } } });

      const expected = renderSvgFromModel(editedModel(model, theme, handle), theme);
      const got = handle.toSvgString();
      expect(got).toBe(expected);
      expect(XMLValidator.validate(got)).toBe(true);

      // the container genuinely re-hugged (its box changed — not left stranded)
      const edited = editedModel(model, theme, handle);
      const g1 = edited.subgraphs.find((s) => s.id === "G")!;
      expect({ x: g1.x, y: g1.y, width: g1.width, height: g1.height }).not.toEqual({
        x: g0.x,
        y: g0.y,
        width: g0.width,
        height: g0.height,
      });
    });
  }

  // ---- REV-008(a): a NESTED subgraph (resolve depth > 1). The recursive member
  // resolution + re-hug is char-identical in the geometry and the runtime twins,
  // but was never byte-parity-tested. Drag a deeply-nested member and require the
  // runtime's serialized SVG to byte-match renderSvg of the same edit — so any
  // drift in the recursion (or the nested-box hug) fails here — plus assert the
  // parent container's box still contains the child container's box after re-hug.
  for (const themeName of ["light", "fancy"] as const) {
    it(`re-hugs a NESTED subgraph on a member drag, byte-matching renderSvg + parent contains child (${themeName})`, () => {
      const dsl = [
        "flowchart TD",
        "subgraph Outer[Outer]",
        "  A[Alpha]",
        "  subgraph Inner[Inner]",
        "    B[Bravo]",
        "    C[Charlie]",
        "  end",
        "end",
        "Src[Src] --> B",
        "A --> C",
      ].join("\n");
      const { model, theme } = prepare(dsl, { theme: themeName });
      // sanity: Outer nests Inner (resolve depth > 1)
      const outer0 = model.subgraphs.find((s) => s.id === "Outer")!;
      expect(outer0.children).toContain("Inner");
      const { handle } = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false }));
      const b = model.nodes.find((n) => n.id === "B")!;
      // drag a member of the INNER container — both Inner and Outer must re-hug
      handle.importLayout({ version: 1, positions: { B: { x: b.x - 120, y: b.y + 70 } } });

      const edited = editedModel(model, theme, handle);
      const expected = renderSvgFromModel(edited, theme);
      const got = handle.toSvgString();
      expect(got).toBe(expected);
      expect(XMLValidator.validate(got)).toBe(true);

      // the nested hug is deterministic and coherent: the OUTER box encloses the
      // INNER box (a parent border may coincide with its child's, hence >=/<=).
      const outer = edited.subgraphs.find((s) => s.id === "Outer")!;
      const inner = edited.subgraphs.find((s) => s.id === "Inner")!;
      expect(outer.x - outer.width / 2).toBeLessThanOrEqual(inner.x - inner.width / 2);
      expect(outer.x + outer.width / 2).toBeGreaterThanOrEqual(inner.x + inner.width / 2);
      expect(outer.y - outer.height / 2).toBeLessThanOrEqual(inner.y - inner.height / 2);
      expect(outer.y + outer.height / 2).toBeGreaterThanOrEqual(inner.y + inner.height / 2);
    });
  }

  // ---- REV-008(b): pin an edge end, then RESIZE that node so the pinned side
  // SHRINKS past the pin's offset. Both the runtime (anchor→clampOff) and the
  // static SVG (sidePoint→clampOffset) must re-clamp the pin onto the shrunk
  // border — the edge stays attached (no visual detach) — and stay byte-identical.
  it("re-clamps a pinned anchor when its node is resized smaller, keeping parity + no detach (FR7/FR1)", () => {
    const { model, theme } = prepare("flowchart TD\nA-->B\nA-->C\nA-->D", { theme: "light" });
    const { root, handle } = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false }));
    const a = model.nodes.find((n) => n.id === "A")!;
    const off = model.bounds;
    // pin edge 0's source to A's RIGHT border at a big vertical offset (+40), then
    // SHRINK A's height so half of it is well below the offset → the pin must
    // re-clamp onto the shrunk border (clampOffset caps |offset| at halfH − 6).
    const smallH = Math.max(24, Math.round(a.height / 2)); // genuinely smaller than a.height
    expect(smallH).toBeLessThan(a.height);
    const clamped = smallH / 2 - 6; // 40 is far outside this → re-clamped down to it
    handle.importLayout({
      version: 1,
      positions: {},
      sizes: { A: { w: a.width, h: smallH } },
      anchors: { "0": { source: { side: "right", offset: 40 } } },
    });

    // byte-parity with applyPositions of the same pinned + resized model
    const expected = renderSvgFromModel(editedModel(model, theme, handle), theme);
    const got = handle.toSvgString();
    expect(got).toBe(expected);
    expect(XMLValidator.validate(got)).toBe(true);

    // the rendered edge 0 start sits on A's right border, re-clamped to halfH − 6
    // (NOT the requested +40, which would detach off the shrunk border):
    const start = edgePaths(root)[0]!.match(/^M\s+([-\d.]+)\s+([-\d.]+)/)!;
    const startX = Number(start[1]);
    const startY = Number(start[2]);
    const aWorldX = a.x - off.x;
    const aWorldY = a.y - off.y;
    expect(startX).toBeCloseTo(aWorldX + a.width / 2, 6); // on the right border
    expect(startY - aWorldY).toBeCloseTo(clamped, 6); // re-clamped, not +40
    expect(Math.abs(startY - aWorldY)).toBeLessThan(smallH / 2); // strictly on-border (no detach)
  });

  // ---- REV-007: index-keyed anchor pins are validated on import — an out-of-range
  // index is dropped (not applied, not re-persisted as a dangling entry), and a pin
  // that carries endpoint identity is re-mapped to its edge if the edges reordered.
  it("drops an out-of-range anchor index on import and never re-persists it (REV-007)", () => {
    const { model, theme } = prepare("flowchart TD\nA-->B\nA-->C", { theme: "light" });
    const { root, handle } = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false }));
    const baseline = edgePaths(root);
    // edge index 9 does not exist (model has 2 edges) → must be ignored
    handle.importLayout({ version: 1, positions: {}, anchors: { "9": { source: { side: "left", offset: 5 } } } });
    // no pin applied: edges unchanged, and exportLayout carries no dangling entry
    expect(edgePaths(root)).toEqual(baseline);
    expect(handle.exportLayout().anchors).toBeUndefined();
  });

  it("re-maps an id-tagged pin to its edge when the imported index no longer matches (REV-007)", () => {
    const { model, theme } = prepare("flowchart TD\nA-->B\nA-->C\nA-->D", { theme: "light" });
    const { root, handle } = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false }));
    // a sidecar captured when A-->D sat at index 0 (edges since reordered): the
    // stored from/to lets the import re-map the pin to A-->D's CURRENT index (2).
    handle.importLayout({
      version: 1,
      positions: {},
      anchors: { "0": { source: { side: "right", offset: 0 }, from: "A", to: "D" } },
    });
    const out = handle.exportLayout().anchors!;
    // the pin followed its edge to index 2, not mis-applied to index 0 (A-->B)
    expect(out["2"]).toEqual({ source: { side: "right", offset: 0 }, from: "A", to: "D" });
    expect(out["0"]).toBeUndefined();
    // edge 2 (A-->D) genuinely leaves A's right border; edge 0 (A-->B) stays auto
    const a = model.nodes.find((n) => n.id === "A")!;
    const off = model.bounds;
    const rightX = a.x - off.x + a.width / 2;
    const paths = edgePaths(root);
    expect(paths[2]!.startsWith("M " + rightX + " ")).toBe(true);
    expect(paths[0]!.startsWith("M " + rightX + " ")).toBe(false);
  });

  // ---- FR7 (D7=A) manual per-anchor override: a pinned end round-trips through
  // exportLayout/importLayout, toSvgString honors it (parity with renderSvg of
  // the same override applied via applyPositions), and resetLayout clears it.
  it("pins an edge endpoint: round-trips the sidecar, honors it in toSvgString, and reset clears it (FR7)", () => {
    const { model, theme } = prepare("flowchart TD\nA-->B\nA-->C\nA-->D", { theme: "light" });
    const { root, handle } = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false }));

    // pin edge 0's (A-->B) source to A's right border at a non-zero offset
    handle.importLayout({ version: 1, positions: {}, anchors: { "0": { source: { side: "right", offset: 12 } } } });

    // exportLayout carries ONLY the pinned edge, keyed by index; JSON round-trips.
    // Endpoint identity (from/to) is written alongside the pin (REV-007) so a
    // re-import can validate the index — edge 0 is A-->B.
    const sidecar = JSON.parse(JSON.stringify(handle.exportLayout())) as ReturnType<RuntimeHandle["exportLayout"]>;
    expect(sidecar.anchors).toBeDefined();
    expect(sidecar.anchors!["0"]).toEqual({ source: { side: "right", offset: 12 }, from: "A", to: "B" });
    expect(sidecar.anchors!["1"]).toBeUndefined(); // unpinned edges are omitted

    // the serialized SVG honors the pin (byte-parity with applyPositions' override)
    const expected = renderSvgFromModel(editedModel(model, theme, handle), theme);
    expect(handle.toSvgString()).toBe(expected);

    // a fresh mount that imports the sidecar reproduces the pin (reload keeps it)
    const { handle: h2 } = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false }));
    h2.importLayout(sidecar);
    expect(h2.exportLayout().anchors!["0"]).toEqual({ source: { side: "right", offset: 12 }, from: "A", to: "B" });

    // resetLayout() discards the pin — edges return to pure auto-distribute
    handle.resetLayout();
    expect(handle.exportLayout().anchors).toBeUndefined();
    expect(edgePaths(root)).toEqual(expectedPaths(model, worldBoxes(model), theme));
  });

  it("a pinned end is used verbatim while the OTHER end still auto-distributes (FR7)", () => {
    const { model, theme } = prepare("flowchart TD\nA-->B\nA-->C\nA-->D", { theme: "light" });
    const { root, handle } = mountFakeH(buildPayload(model, theme, { minimap: false, persist: false }));
    handle.importLayout({ version: 1, positions: {}, anchors: { "0": { source: { side: "right", offset: 0 } } } });

    // edge 0 now starts on A's right border; the runtime + applyPositions agree
    const a = model.nodes.find((n) => n.id === "A")!;
    const off = model.bounds;
    const rightX = a.x - off.x + a.width / 2; // world coords (offset removed)
    const paths = edgePaths(root);
    expect(paths[0]!.startsWith(`M ${rightX} `)).toBe(true);

    // the whole render still byte-matches renderSvg of the same pinned model
    expect(handle.toSvgString()).toBe(renderSvgFromModel(editedModel(model, theme, handle), theme));
  });
});
