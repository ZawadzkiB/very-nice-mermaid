# very-nice-mermaid - v0.5.0 · sketch style

**Shipped 2026-07-09.** Diagrams can now render **hand-drawn**. A new
`--style clean|sketch` axis gives every native diagram an Excalidraw-like look:
**wobbly multi-stroke outlines**, **open `V` arrowheads**, and a **bundled handwriting
font**, while staying **orthogonal to the color theme** (`light`/`dark`/`fancy`), so
sketch composes with any palette. It works across **every native tier** (flowchart,
sequence, class, state) and **every output** (SVG / PNG / HTML / interactive), is
**fully deterministic** (seeded, no RNG, so snapshots and static↔runtime parity hold),
and is **self-contained** (the font embeds as base64, zero network). Clean output is
byte-unchanged; sketch is strictly additive.

## What was changed / done

- **A `--style` axis (D1)** - `--style`/`-s` on the CLI and a `<very-nice-mermaid sketch>`
  attribute, threaded through `renderSvg`/`renderHtml`/`renderPng`, the payload builder,
  the async router and `mount()`. Style is a **render option, not a theme token**, so the
  theme sets and their snapshots stay untouched and sketch × any theme just works.
- **A tiny deterministic rough engine (`src/rough/`, D4/D5)** - an FNV-1a → `mulberry32`
  seeded PRNG turns a stable key (node/edge id) into bowed quadratic strokes: soft rough
  fill + N outline strokes, sketchy polyline edges, open arrowheads. No
  `Date.now`/`Math.random`, so the same input renders byte-identically. Our own generator,
  **not `rough.js`**, so it stays small and inlinable.
- **A bundled handwriting font (D3)** - **Kalam Regular** (OFL 1.1) embedded as a base64
  `@font-face` data URI; registered with resvg so PNG picks it up. Portable and offline.
- **Every native tier (D6=B)** - flowchart, sequence, class, and state all draw the
  sketch look from one shared SVG helper. Class keeps its **UML head markers** on
  hand-drawn lines; state `[*]` pseudo-states stay **clean** solid dots. The interactive
  DOM runtime inlines a **byte-identical mirror** of `src/rough`, so dragging re-renders
  live rough outlines and `toSvgString()` matches the static SVG (the parity guard was
  extended to cover sketch).
- **Honest degradation** - only the mermaid.js fallback tier keeps its own look; that is
  surfaced (CLI note + a library/element `console.warn`), never a silent skip.

## Decisions

- **Style is a separate `--style` axis, not a "sketch theme" (D1=A)** - composes with any
  palette and with `edge.style`.
- **Full rough, not a light hand-drawn feel (D2=A)** - multi-stroke wobble + open
  arrowheads, the authentic Excalidraw look the user asked for.
- **Bundle + embed an OFL font (D3=A)** - Kalam base64; portable and resvg-registerable
  for PNG.
- **Deterministic, seeded roughness (D4=A)** - mandatory for snapshots + the static↔runtime
  parity guard.
- **Our own tiny generator, not `rough.js` (D5=A)** - no new runtime dep; inlinable into
  the serialized runtime for parity.
- **Expanded to all native tiers, not flowchart-only (D6=B)** - the user chose full FR6
  coverage at the mid-run gate.

## Review & test verdict

**Review APPROVED** and **tests GREEN.** The reviewer verified the two hard constraints
(determinism; runtime↔`src/rough` byte-parity) and raised 3 minor items: 2 fixed
(solid dotted-edge arrowheads; a library/element fallback `console.warn`), 1 accepted
(the font ships in the browser core, the D3 zero-network tradeoff). Testing exercised all
four tiers hands-on - CLI SVG/PNG, library sync+async, and the interactive UI in real
Chromium (drag re-routing, Save SVG/PNG, zero-network) - fixing one issue (state `[*]`
markers now stay clean) and accepting one (invalid `style` falls back to clean; typed
union + CLI validation guard it). Final suite: **unit 339/339 · e2e 73/73** (incl.
`e2e/sketch.spec.ts` 11/11).

**Follow-ups (not shipped):** true hachure line-fill (shipped a soft rough fill, FR2's
allowed alternative); an optional lazy sketch subpath to tree-shake the ~30 KB font from
clean-only bundles; an optional invalid-`style` warning in the library.

## Diagrams

The as-built UML set (open the interactive viewer):
- **flow** - the sketch pipeline: `--style` axis → `src/rough` + Kalam font → the
  flowchart / native / runtime renderers → SVG/PNG/HTML.
- **class** - structure: `src/rough` as source of truth, mirrored into `vnmRuntime` and
  reused by the native `sketch-svg` helper; the embedded font.
- **sequence** - a `--style sketch` render call end to end (PNG via resvg, HTML via the
  inlined runtime).

No before/after set: plan ① drew no as-is baseline; the "before" is simply today's clean
renderer, and sketch is strictly additive.

## Full audit trail

The complete detail - plan, decisions, per-round review/test snapshots, the per-file
changes table, and the as-built report - lives in
[`.gogo/work/feature-sketch-style/`](../../work/feature-sketch-style/)
(`report/report.md`, `decisions.md`, `review/`, `test/`).
