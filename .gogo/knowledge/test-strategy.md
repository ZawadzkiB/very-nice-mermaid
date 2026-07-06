# Test strategy

**Purpose:** how to test a change — journeys, UI / design checks, e2e levels,
deployment checks, and the done-bar. (The tools themselves are in
`testing-tools.md`.)

<!-- gogo:meta
Mode: owned
Source: [ ]
Confidence: low
Generated-by: /gogo:build (scaffold)
-->
> How to test, level by level. Verify the bars in `non-functional-requirements.md`.

## Levels
- **Unit / integration** — none exist yet; the first feature must establish the
  framework and location (record them in `testing-tools.md`).
- **e2e** — Playwright MCP browser tooling is available (see
  `testing-tools.md`); use it once there is a UI to drive.

## How to test a change (per level it touches)
- **UI** → drive real clicks / flows with the browser tooling; assert the journey
  AND that it looks right (matches the design); explore edges, not just the happy path.
- **API** → hit endpoints (status, shape, errors).
- **CLI** → run the commands; assert stdout / exit code.

## Key user journeys (from v1, 2026-07-03)
- **CLI:** `vnm render <file|-> -f html|svg|png|md [--theme …] [--strict] [--scale N]`
  — verify all 4 formats from a file and stdin; format inferred from `-o` extension;
  bad DSL → line/col diagnostic + non-zero exit; zero-node input → "no diagram found".
- **Interactive component:** `mount()` and `<very-nice-mermaid>` — drag a node and
  confirm edges re-route live and stay border-anchored; pan / wheel-zoom-at-cursor /
  fit; minimap recenter; layout persists across reload (localStorage) + export/import;
  theme switch restyles. Drive with **real pointer events**, watch the console.
- **"Looks right":** diagrams must beat mermaid-cli — no edges through node boxes
  (overlap scan), readable labels, flush arrowheads, good theme contrast (light/dark/fancy).

## Key user journeys (added — feature `interactive-editing`, 2026-07-05)
- **Edit + export journey** (`e2e/interactive-editing.spec.ts`): select a node →
  drag a corner resize handle with **real pointer events** (unit tests simulate via
  `importLayout()` and never execute the pointer math) → edges re-anchor around the
  perimeter (hub: anchors pairwise distinct, spread on both axes) → reload keeps
  size AND position → **Save SVG** (valid XML incl. subgraphs + every node shape)
  and **Save PNG** (real rasterize: PNG magic bytes, no canvas taint) → **⟲ Reset
  layout** restores the computed layout, survives reload, leaves pan/zoom alone —
  then **edit again after reset and confirm it persists** (the one path a naive
  suite misses). Zero console errors + zero network throughout, PNG click included.
- **Rasterization needs a real browser.** jsdom can't draw an SVG image into a
  canvas — any `Image`/`<canvas>`/download path gets its only real coverage in
  Playwright e2e; don't count unit tests as covering it.
- **Sequence diagrams are the negative case:** no resize handles, no reset button
  (hidden, not a dead control) — assert absence + no console errors.

## Key user journeys (added — v0.4.0 UAT delta, 2026-07-05)
- **Subgraph group-drag:** grab the container's dashed border/title band → ALL
  members move together, edges re-route, box follows, persists; the open interior
  pans instead; dragging a member far OUT re-hugs the box (never a stranded empty
  container); nested (depth>1) containers re-hug too.
- **Edge-pin:** select a node → `.vnm-edge-handle` grabs appear IMMEDIATELY (and
  vanish immediately on deselect — TEST-002 regression tests guard this); drag a
  handle to another border → pin sticks, the other end keeps auto-distributing,
  reload persists, ⟲ Reset clears; pin-then-resize re-clamps (no detach).
- **Sidecar robustness at the CLI:** feed `vnm render --layout` a stale/reordered/
  parallel-edge `layout.json` → correct edge pinned or pin dropped gracefully,
  exit 0, never a crash.
- **Fake-DOM unit tests need a real `closest()`/parent-chain contract** to reach
  `target.closest(...)` interaction branches — a bare `target:{}` silently bypasses
  them; and never let an incidental render call (e.g. a no-op `importLayout()`)
  mask show/hide timing — assert visibility with NO intervening call.

## Deployment checks
Library, not a service: `npm run build` clean, `npm pack` ships `dist/` + types +
the `vnm` shebang bin, and the built `.` entry imports cleanly in Node.

## Done bar
Build clean AND all unit AND all e2e green, PLUS hands-on exploration of the
actual change (not just green tests).
