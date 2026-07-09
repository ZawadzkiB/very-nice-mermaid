# Test — round 1 (sketch style, v0.5.0)

Delegated to the tester agent. Suites first, then hands-on exploration of the
sketch-specific surface (CLI, library API, and the interactive UI via the
Playwright MCP), plus a new e2e spec.

## Suites (must be green before exploring)

| Suite | Result |
|---|---|
| `npm run build` (tsup) | ✅ clean |
| `npm run typecheck` (tsc --noEmit) | ✅ clean (incl. the new e2e spec) |
| `npm test` (vitest, unit) | ✅ **338 / 338 passed** (29 files) |
| `npm run test:e2e` (Playwright, pre-existing 62 specs) | ✅ **62 / 62 passed** |
| `npm run test:e2e` (incl. new `e2e/sketch.spec.ts`, 11 specs) | **72 / 73 passed**, 1 intentional fail (TEST-001 regression guard, see below) |

Chromium was already installed (`npx playwright install chromium` not
needed). One environment blocker was hit and self-resolved: the bundled
`gogo-playwright` MCP browser was locked by a stale orphaned Chrome process
(profile `mcp-chrome-56271fe`, running since the previous Saturday, unrelated
to this session) — killed it (`kill 57587`) and the browser launched cleanly.
No user decision needed; noting it per the "surface, don't silently skip"
rule since it briefly looked like a hard blocker.

## CLI hands-on (built `dist/cli/index.js`)

Rendered all 4 native tiers (flowchart / sequence / class / state) to SVG and
PNG with `--style sketch`:

- **Valid XML**: all 4 SVGs pass `xml.dom.minidom` parsing.
- **Rough strokes**: 92–226 ` Q ` quadratic bows per file (double-stroke wobble).
- **Font embedded**: `@font-face` + `Kalam` present in all 4, zero network refs.
- **Arrowheads**: flowchart/sequence/state sketch SVGs carry **0** `marker-end`
  (open hand-drawn V paths instead); **class** keeps **2** `marker-end` refs to
  its UML markers (`vnm-cls-*`) — semantics preserved as documented.
- **Determinism**: re-rendered flowchart + class sketch SVGs — **byte-identical**
  (`diff` clean) across two runs.
- **`--style bogus`**: `error: unknown style 'bogus'; use clean|sketch`, exit 1. ✅
- **`--style sketch` on a fallback type** (`pie`): prints
  `vnm: note [style] --style sketch is not supported for the mermaid.js
  fallback tier; this diagram renders in its normal style`, still renders,
  exit 0. ✅
- **PNG rasterization**: all 4 PNGs have valid magic bytes and were visually
  inspected (resvg renders Kalam correctly — hand-drawn shapes + handwriting
  labels; class keeps its hollow-triangle "extends" marker; state keeps its
  solid start dot + ringed end circle in the **static** PNG). Screenshots taken.

## Library API hands-on (`dist/index.js`, not just the CLI)

- `renderSvg(dsl, { style: "sketch" })` (sync, flowchart) → rough strokes + Kalam. ✅
- `renderSvgAsync(seqDsl, { style: "sketch" })` (native sequence tier) → rough. ✅
- `renderSvgAsync`/`renderHtmlAsync` on a fallback type (`pie`) with
  `style: "sketch"` → both **console.warn** the same fallback-tier note the CLI
  prints (REV-003 fix confirmed at the library layer, not just the CLI). ✅
- `renderSvg(dsl, { style: "bogus" })` → **silently renders clean, no error/warning**
  (CLI validates and errors; the library does not) — filed as **TEST-002**.

## UI hands-on — interactive sketch HTML, real Chromium (Playwright MCP)

Rendered `ci-pipeline.mmd` (flowchart), `order-sequence.mmd`, `shop-class.mmd`,
`order-state.mmd` to standalone sketch HTML and drove them in a real browser
(served over a local static server, since the MCP browser blocks `file://`).

- **Flowchart**: hand-drawn wavy shapes, Kalam labels, open arrowheads —
  matches the CLI PNG. Screenshot taken.
- **Drag a node** ("Push to main"): edge paths changed (multi-subpath ` Q `
  strokes re-computed), the node followed the drag, wobble stayed attached,
  arrowhead stayed open. Zero console errors (only a harmless `favicon.ico`
  404 from the local test server, not present in a real `file://` open).
- **Save SVG**: downloaded a valid-XML sketch SVG (234 ` Q ` bows, `@font-face`
  + `Kalam`, 0 `marker-end`) reflecting the post-drag layout. ✅
- **Save PNG**: downloaded a valid PNG (magic bytes correct, 2248×2466,
  visually correct hand-drawn render). No canvas-taint / SecurityError. ✅
- **Zero network at runtime**: only the initial HTML GET was observed —
  confirms the font is genuinely embedded, no CDN/font requests. ✅
- **Sequence / class / state interactive**: all render hand-drawn correctly,
  drag re-routes edges live (tested class + state), zero console errors.
- **Sketch vs. clean comparison**: re-rendered clean-mode HTML side by side —
  crisp rects / filled-triangle markers / sans-serif vs. sketch's wobbly
  double-stroke outlines / open arrowheads / Kalam. Visually confirmed distinct.
- **Found via exploration — TEST-001** (state pseudo-state markers): the
  interactive/exported-SVG view renders the `[*]` start and end pseudo-states
  as near-identical rough scribbled blobs, losing the clean solid-dot vs.
  ringed-circle distinction the static SVG/PNG renderer (`renderState()` in
  `src/native/state/svg.ts`) explicitly preserves. Confirmed both in the live
  DOM and in the "Save SVG" download (0 `<circle>` elements). See issue below.

### Two observations (NOT filed as sketch issues — pre-existing / orthogonal)
- **Cross-diagram localStorage sharing**: two exported HTML files for the
  *same* diagram topology (same node ids + direction) share the same
  persisted-layout `localStorage` key regardless of theme *or* style (the key
  is `hash(nodeIds + direction)`, unrelated to sketch). Tripped up my own
  clean-vs-sketch comparison (had to `localStorage.clear()` for a fair
  before/after) — this predates the sketch feature and would equally affect
  two clean exports in different themes, so it's out of this feature's scope.
- **Class UML relation markers in the interactive/HTML view**: the interactive
  runtime (`src/render/dom/runtime.ts`) never encoded the semantic UML markers
  (`vnm-cls-tri`/`vnm-cls-diamond-*`) that the static `renderClassSvg` uses —
  confirmed this is true in **both clean and sketch** interactive HTML (not a
  sketch regression). The as-built plan's "class relations keep their UML head
  markers" sentence is scoped to the static SVG renderers, so this isn't a
  broken promise, but it is a real, pre-existing UX gap worth a separate
  follow-up outside this feature.

## New / extended e2e tests

Added `e2e/sketch.spec.ts` (11 specs) + extended `e2e/helpers.ts` with
`exportHtmlStyled(fixture, style, theme, name)`:
- interactive sketch flowchart: wavy outlines, Kalam font, live drag re-route
  (with wobble retained), open arrowheads (0 `marker-end`), Save SVG content,
  full-session no-console-errors.
- sketch vs. clean markup comparison (orthogonal axis check).
- native-tier smoke: sequence / class / state render without console errors.
- **regression guard (TEST-001)**: state pseudo-state markers must stay clean
  `<circle>` elements in the interactive/exported SVG — **currently fails by
  design**, documenting the gap above; will flip green once fixed.

## Issues this round

| id | severity | priority | status | summary |
|---|---|---|---|---|
| TEST-001 | minor | P2 | open | State `[*]` start/end pseudo-markers render rough (scribbled) instead of clean in the interactive/exported-HTML sketch view — parity gap vs. the static SVG/PNG renderer. Agent-fixable. |
| TEST-002 | nit | P3 | open | Library API silently falls back to clean on an invalid `style` value (CLI errors clearly; the library does not). Agent-fixable. |

Both are **fixable** (well-scoped, no design/scope fork needed) — no
needs-user-decision issues this round.

## Verdict

**Issues found — not yet all-green.** Build + typecheck + unit (338/338) are
clean; the pre-existing e2e suite (62/62) is clean; every planned hands-on
check (CLI × 4 tiers × SVG/PNG, library API, interactive UI × 4 tiers incl.
drag + Save SVG/PNG + zero-network) was run — **no hands-on check was
blocked**. Two real, agent-fixable issues were found via hands-on exploration
and are now guarded by a new e2e regression test. Per the gogo-test routing
rule: loop back to ② implement with `--issues test/issues.json`, then ③
review, then re-test here (same living issues.json).
