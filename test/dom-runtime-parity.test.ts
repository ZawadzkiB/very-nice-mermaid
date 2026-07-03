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
import type { PositionedModel } from "../src/model/index.js";
import { vnmRuntime } from "../src/render/dom/runtime.js";
import { buildPayload } from "../src/render/dom/payload.js";
import { prepare } from "../src/render/prepare.js";
import { routeEdge } from "../src/geometry/index.js";
import { resolveNodeStyle } from "../src/render/style.js";
import { themes } from "../src/theme/index.js";

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
      return { x: nd.x - off.x, y: nd.y - off.y, width: nd.width, height: nd.height };
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

    // The runtime routes in offset-removed ("world") coords; compute the shared
    // geometry's expectation in the same space (threading the same waypoints) and
    // require the live runtime to match it for every edge, including A->C.
    const off = model.bounds;
    const box = (id: string) => {
      const nd = model.nodes.find((n) => n.id === id)!;
      return { x: nd.x - off.x, y: nd.y - off.y, width: nd.width, height: nd.height };
    };
    const expected = model.edges.map((e) => {
      const wps = (e.waypoints ?? []).map((p) => ({ x: p.x - off.x, y: p.y - off.y }));
      return routeEdge(box(e.from), box(e.to), model.direction, theme.edgeStyle, wps).path;
    });
    expect(edgePaths(root)).toEqual(expected);
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
      return { x: nd.x - off.x, y: nd.y - off.y, width: nd.width, height: nd.height };
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
    // waypoints) for EVERY edge, so both the pathRounded twin (A->C) and the
    // bezier twin (A->B, B->C) stay in lockstep with src/geometry under `curved`.
    const expected = model.edges.map((e) => {
      const wps = (e.waypoints ?? []).map((p) => ({ x: p.x - off.x, y: p.y - off.y }));
      return routeEdge(box(e.from), box(e.to), model.direction, theme.edgeStyle, wps).path;
    });
    expect(edgePaths(root)).toEqual(expected);
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
});
