# Project knowledge

**Purpose:** what this project is — architecture, domains, and the key decisions
the plan phase must respect.

<!-- gogo:meta
Mode: proxy
Source: [ ../../README.md, ../../src/index.ts ]
Confidence: high
Generated-by: /gogo:build (2026-07-03); refreshed by /gogo:report (2026-07-03)
-->
> Architecture, domains, key decisions. Source of truth: `README.md` + the public
> API in `src/index.ts`. Refreshed from the shipped code 2026-07-03.

## What this project is
**very-nice-mermaid** — a framework-agnostic **Mermaid flowchart** renderer. It
keeps Mermaid's DSL and replaces everything after it with an **own parser + dagre
auto-layout + hand-written renderers** — no `mermaid.js` runtime, no headless
browser. Ships as an npm **library** (interactive `mount()` + `<very-nice-mermaid>`
web component) and a **`vnm` CLI** that exports **HTML / SVG / PNG / ASCII**.

## Architecture
Single pipeline: **`DSL → parse → DiagramModel → layout(dagre) → PositionedModel →
renderers`**; every output format is a renderer over the same positioned model.
- `src/parser` — tokenizer + flowchart grammar → `DiagramModel` (+ line/col diagnostics)
- `src/layout` — dagre adapter; threads dagre's waypoints so edges route around nodes
- `src/geometry` — border anchoring, orthogonal-elbow / curved routing
- `src/theme` — token themes (`light`/`dark`/`fancy`, `defineTheme`)
- `src/render/svg` · `src/render/ascii` · `src/render/dom` (interactive `vnmRuntime`)
- `src/export/html` (self-contained page) · `src/export/png` (resvg, lazy)
- `src/element` (web component) · `src/cli` (`vnm render`)
- Entry points: `src/index.ts` (API), `src/element.ts`, `src/cli/index.ts`.

## Domains & glossary
- **DiagramModel** — parsed nodes/edges/subgraphs/classDefs + diagnostics (pre-layout).
- **PositionedModel / RoutedEdge** — post-dagre positions + routed edge paths (with waypoints).
- **Theme / TokenSet** — colors, radii, fonts, edge style (elbow|curved).
- **vnmRuntime** — the `.toString()`-serializable interactive renderer inlined into HTML exports.

## Key decisions
- Own parser, not embedded mermaid.js (D1); flowchart family only in v1 (D2);
  PNG via resvg not a browser (D3); single npm package (D4). Zero-node input is an
  error, not a silent empty render (D6). See the feature's `decisions.md`.

## v2 — hybrid engine (feature `hybrid-diagram-engine`, 2026-07-04)
The renderer is now **tiered**, dispatched by a `detectType` **router** (`src/mermaid/router`):
- **flowchart** → the v1 own-parser + dagre path (sync, no mermaid).
- **sequence / class / state** → **native re-skin** (`src/native/*`): mermaid renders once,
  we read its SVG into a typed model and re-render with our themes + interactivity (class/
  state reuse the flowchart `vnmRuntime` for full drag; class/state re-layout with our dagre).
- **everything else** (pie, gantt, ER, gitgraph, mindmap, kanban, …) → **mermaid.js fallback**
  (`src/mermaid/fallback`, render → SVG). Browser renders all; CLI/jsdom renders native+pie
  and **hard-fails the rest with a clear diagnostic** (`src/diagnostics`, FR5).
mermaid + jsdom are **lazy** so flowchart-only users pay nothing.

## gogo overrides
<!-- gogo-specific notes not in the linked source. Preserved across re-runs. -->
- Features shipped: `feature-mermaid-render-toolkit` (v1, flowchart-only) and
  `feature-hybrid-diagram-engine` (v2, all types). Each `report/report.md` is the
  definitive as-built account.

## v0.5.0 — sketch style (feature `sketch-style`, 2026-07-09)
A **drawing-style axis** orthogonal to the color theme: `--style clean|sketch`
(library `renderX({ style })`, element `sketch` attr). `sketch` renders an
**Excalidraw-like hand-drawn look** — wobbly multi-stroke outlines, open `V`
arrowheads, a bundled handwriting font — for flowchart + native sequence/class/
state, across SVG/PNG/HTML/interactive. Only the mermaid fallback tier keeps its
look (surfaced via a CLI note + library `console.warn`).
- `src/rough/` — a deterministic (seeded, no RNG) rough-path generator; inlined
  **byte-identically** into `vnmRuntime` (the recurring parity trap — see the
  `dom-runtime-parity` guard). `src/render/sketch-svg.ts` shares the marks with the
  native tiers; `src/render/sketch-font.ts` embeds the OFL **Kalam** woff2 as
  base64 (`@font-face`, zero network; resvg-registered for PNG).
- Clean mode is byte-unchanged (sketch is strictly additive `if (sketch)` forks).

## flowchart-render-legibility (2026-07-12)
Legibility pass on the flowchart family (flowchart + native state/class; sequence
has its own routing and is excluded from the line work). Two deterministic
**post-layout passes** in shared geometry, run via `layout.finishEdges()` and
mirrored byte-for-byte in `vnmRuntime`:
- **5-layer draw order** (boxes → edges → labels → titles → nodes) + opaque
  subgraph-title plate + tightened label plate + wider fan-in spread.
- **`resolveLabelCollisions`** — all-pairs edge-label plate de-collision (no two
  plates overlap); every tier's `edgeLabel` shares the one `labelPlateSize`.
- **`applyEdgeBridges`** — a small arc **hop** where two edge lines cross (the
  more-horizontal hops), so crossings stay traceable without moving nodes.
- **`bridges` option** — `renderX({ bridges })` / CLI `--no-bridges` / runtime
  payload; default ON for clean elbow, OFF for curved + sketch (deferred). Full
  lane/bus routing stays deferred (bridges deliver traceability instead).
