# very-nice-mermaid — v0.1.0 (initial release)

**Shipped 2026-07-03.** Turned an empty repo into **`very-nice-mermaid`**: a
framework-agnostic Mermaid **flowchart** renderer that keeps the DSL and replaces
everything after it with an **own parser + dagre auto-layout + hand-written
renderers** — no `mermaid.js` runtime, no headless browser. It ships as an npm
**library** (interactive `mount()` + a `<very-nice-mermaid>` web component) and a
**`vnm` CLI** that outputs **interactive HTML / SVG / PNG / ASCII**, with
**light / dark / fancy** themes plus user-defined themes.

## What was built
- **Parser** — a hand-written tokenizer + flowchart grammar (all v1 shapes, edge
  kinds, labels, `&` chaining, nested subgraphs, `classDef`/`class`/`style`) with
  lenient/strict modes and line/col diagnostics.
- **Layout & geometry** — a dagre adapter that threads dagre's own multi-rank
  **waypoints** so edges route *around* nodes, with border-anchored orthogonal /
  curved routing shared by every renderer.
- **Renderers** — pure `renderSvg` / `renderAscii`, an interactive DOM runtime
  (drag-to-reroute, pan/zoom/fit, minimap, persisted layout), a **zero-network**
  self-contained HTML export, and PNG via the optional native `@resvg/resvg-js`.
- **Surfaces** — the `vnm` CLI (format inference, stdin/stdout, theming, `--layout`)
  and the self-registering web component.
- **Quality** — 110 unit + 36 CLI-integration + 19 Playwright browser tests, a
  GitHub Actions CI matrix (Node 20/22 + e2e), and published docs (README quick
  start, gallery, `theme.example.json`, MIT LICENSE).

## Key decisions
- **Own parser, not embedded mermaid.js** — small bundle, runs in Node + browser,
  full control of output quality (the whole point).
- **Flowchart family only in v1** — depth over breadth; the model/renderer seam is
  ready for sequence/state/class later.
- **PNG via resvg, not a headless browser** — native, CI-friendly, optional dep.
- **Single npm package** with subpath exports (`.` / `./element`) + `vnm` bin.
- **Zero-node input is an error** — rendering nothing is a silent failure, so the
  CLI exits non-zero even in lenient mode.

## Review & test verdict
**Green.** Review (3 rounds) caught and fixed a **stored-XSS** and a **CSS
zero-network** leak via unsanitized style values (re-verified against the live
exploits and 18+ bypass attempts — none survived); hands-on testing (2 rounds,
real Chromium) caught and fixed **edges routing through node boxes** (overlap scan
21 → 0) and **dead toolbar buttons**. All findings resolved; final suite fully
green.

## Diagrams
- **flow** — DSL → parse → layout(dagre) → SVG/ASCII/DOM → html/png/element/CLI.
- **class** — the shipped modules & types (`DiagramModel`, `PositionedModel`/`RoutedEdge`, geometry, renderers, exports).
- **sequence** — the interactive runtime: mount → drag node → live re-route → persist/restore.

## Full audit trail
Everything — the accepted plan, all review/test rounds, the per-file changes
table, and every decision — lives in
[`.gogo/work/feature-mermaid-render-toolkit/`](../../work/feature-mermaid-render-toolkit/)
(`plan.md`, `report/report.md`, `review-0N.md`, `test-0N.md`, `decisions.md`).
