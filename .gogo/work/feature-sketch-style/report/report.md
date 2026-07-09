# Report - feature `sketch-style`

- **feature:** Sketch style - an Excalidraw-like hand-drawn rendering mode as a `--style` axis composing with themes
- **status:** awaiting-uat
- **completed:** 2026-07-09
- **branch / commits:** master (v0.4.1 → **v0.5.0**); not yet committed

## Run status / gaps
All phases completed - plan ✅ · implement ✅ (3 rounds) · review ✅ (APPROVED) · test ✅ (green) · report ✅.
No open issues: every review/test finding is resolved or explicitly accepted (REV-001 accepted; REV-002, REV-003, TEST-001 fixed; TEST-002 accepted as works-as-designed). Two orthogonal, pre-existing observations noted by the tester are logged as follow-ups (not sketch bugs).

## Summary
**Shipped a hand-drawn "sketch" rendering mode** - wobbly multi-stroke shape outlines, open `V` arrowheads, and a bundled handwriting font - as a **new `--style clean|sketch` axis** that is **orthogonal to the color theme** (`light`/`dark`/`fancy`) and works across **every native diagram tier** (flowchart, sequence, class, state) and **every output** (SVG / PNG / HTML / interactive). It is **fully deterministic** (seeded, no RNG) and **self-contained** (the font embeds as base64 - zero network). The user asked for "new shapes, new arrows, not only colors" (the Excalidraw look); this delivers exactly that.

## Planned vs shipped
Shipped the full accepted plan (FR1–FR6) **plus** the expanded tier scope the user chose mid-run.

- **As planned:** the `--style` axis (D1), full rough multi-stroke look (D2), bundled OFL font embedded + resvg-registered (D3), deterministic seeded roughness (D4), our own tiny rough generator not `rough.js` (D5), and everywhere + static↔runtime parity (FR6).
- **Deviations (all noted, all deliberate):**
  - **Style threads as a render *option*, not a theme token** - keeps the theme token sets (and their snapshots) untouched; still composes with any theme.
  - **Soft rough fill, not hachure lines** - FR2 explicitly allowed "(or soft solid)"; reads as authentic hand-drawn.
  - **Font family is the real "Kalam"** (not an alias) - required so resvg resolves the registered woff2 by its internal name for PNG.
  - **Tier scope expanded to ALL native tiers** - the user chose this at the D6 gate (see below), beyond a flowchart-only first cut.

## Implementation
The feature is a thin, orthogonal axis over a small deterministic geometry engine, wired through every renderer.

- **`src/rough/` (new)** - the deterministic generator: an FNV-1a → `mulberry32` seeded PRNG produces bowed quadratic strokes from a stable key (node/edge id). `roughShape` (soft fill + N outline strokes), `roughPolyline` (edges), `openArrowhead` (open `V`), `ellipsePoints`. No `Date.now`/`Math.random` - same input → byte-identical output.
- **`src/render/sketch-font.ts` (new)** - the bundled **Kalam Regular** woff2 (OFL 1.1, `assets/fonts/`) as base64, with `sketchFontFaceCss()` (a self-contained `@font-face` data URI) + the family stack.
- **`src/render/sketch-svg.ts` (new)** - shared sketch emitters (`sketchRectSvg`/`sketchEllipseSvg`/`sketchLineSvg`/`sketchArrowSvg`/`sketchFontDefs`) so all three **native** static renderers draw the look identically from one source.
- **Flowchart** - `svg.ts` draws rough shapes/edges/open-arrowheads + embeds the `@font-face`; the **DOM runtime** (`runtime.ts`) inlines a **byte-identical mirror** of `src/rough` (it is `.toString()`-serialized into HTML, so it can't import) - transparent cards over live rough SVG outlines that re-render on drag, and a `toSvgString()` that byte-matches `renderSvg`. The `dom-runtime-parity` guard was extended to sketch.
- **Native tiers** - `sequence`/`class`/`state` SVG renderers gained a `style` param and draw via the shared helper (class keeps its **UML head markers** on hand-drawn lines; state `[*]` pseudo-state dots stay **clean**). Class/state interactive+HTML reuse the flowchart runtime (sketch for free via the payload); sequence embeds the sketch SVG in its pan/zoom shell.
- **Threading** - `renderSvg`/`renderHtml`/`renderPng`, `buildPayload`, the async router, `mount()`, the CLI (`--style`/`-s`), and the `<very-nice-mermaid sketch>` attribute. PNG registers the Kalam buffer with resvg. Only the **mermaid.js fallback tier** keeps its look - surfaced (CLI note + library `console.warn`), never a silent skip.

### Changes (as-built)

| File | Change | Note |
|---|---|---|
| `src/rough/index.ts` | added | deterministic rough generator (seeded, pure) |
| `src/render/sketch-font.ts` | added | bundled Kalam woff2 (base64 `@font-face`) |
| `src/render/sketch-svg.ts` | added | shared sketch SVG emitters for the native tiers |
| `assets/fonts/Kalam-Regular.woff2` · `OFL.txt` | added | the bundled OFL font + license |
| `src/theme/index.ts` | modified | `RenderStyle` type |
| `src/render/svg.ts` | modified | sketch shapes/edges/open-arrowheads + `@font-face` (flowchart) |
| `src/render/dom/runtime.ts` | modified | inlined rough mirror; transparent cards + live rough outlines; sketch `toSvgString`; solid dotted arrowheads (REV-002); clean state pseudo-markers (TEST-001) |
| `src/render/dom/payload.ts` | modified | `payload.sketch` (font) + `options.style` |
| `src/native/{sequence,class,state}/svg.ts` | modified | sketch via the shared helper |
| `src/native/sequence/interactive.ts` | modified | thread style into the seqRuntime shell |
| `src/render/route.ts` · `src/render/dom/index.ts` | modified | thread style through async renderers; fallback `console.warn` (REV-003) |
| `src/export/html.ts` · `src/export/png.ts` | modified | body font; resvg font registration + `sketchFontRegistration()` |
| `src/native/state/layout.ts` · `src/model/index.ts` | modified | `PositionedNode.stateMarker` for clean state markers (TEST-001) |
| `src/cli/run.ts` · `src/element.ts` · `src/index.ts` | modified | `--style`/`-s`, `sketch` attr, exports; v0.5.0 |
| `README.md` · `assets/example-sketch.png` | modified/added | docs + a sketch gallery shot |
| `test/rough` · `render-svg-sketch` · `render-native-sketch` · `dom-runtime-parity` · `export-html` · `cli` · `e2e/sketch.spec.ts` | added/extended | determinism, parity, per-tier, e2e |

## Decisions & rationale
See [decisions.md](../decisions.md).

| Decision | Choice | Reason |
|---|---|---|
| D1 - axis vs theme | **Separate `--style` axis** | composes with any palette + `edge.style`; more flexible than a bundled "sketch theme" |
| D2 - how hand-drawn | **Full rough** (multi-stroke wobble, open arrowheads) | the authentic Excalidraw look the user showed; confirmed at acceptance |
| D3 - font | **Bundle + embed an OFL font** (Kalam, base64) | portable, zero-network, and resvg can register it for PNG |
| D4 - roughness | **Deterministic, seeded** by id | snapshots + the static↔runtime parity guard require it |
| D5 - generator | **Own tiny generator** (`src/rough`), not `rough.js` | small, no new runtime dep, inlinable into the serialized runtime (parity) |
| D6 - tier scope | **All native tiers** (not flowchart-only) | user chose it at the gate; delivers full FR6 coverage in v0.5.0 |

## Review outcome
**APPROVED** (round 1). The reviewer verified the two hard constraints (determinism; runtime↔`src/rough` byte-parity) and found 3 minor/nit items: **REV-001** (font in the browser core - accepted, the D3 tradeoff), **REV-002** (dotted-edge arrowheads fragmented - **fixed**, always solid now), **REV-003** (fallback+sketch note was CLI-only - **fixed**, library/element `console.warn` too). See [review/issues.json](../review/issues.json) · [review-01.md](../review-01.md) · [review-02.md](../review-02.md).

## Test outcome
**GREEN.** Hands-on across all four tiers - CLI (SVG/PNG × determinism/arrowheads/font/`--style bogus`/fallback note), library (sync + async, fallback warn), and the interactive UI in real Chromium (drag re-routing, Save SVG/PNG, zero-network, clean-vs-sketch). Found **TEST-001** (state `[*]` markers rough in the interactive/exported view - **fixed**: they now stay clean solid-dot/ringed-circle) and **TEST-002** (library silently accepts an invalid `style` - **accepted**: typed union + the CLI validates the untyped boundary). Final suite: **unit 339/339 · e2e 73/73** (incl. `e2e/sketch.spec.ts` 11/11, the TEST-001 regression flipped green). See [test/issues.json](../test/issues.json) · [test-01.md](../test-01.md) · [test-02.md](../test-02.md).

## Diagrams
The as-built UML set - open [diagrams.html](./diagrams.html) (same folder):
- **flow** (`flow.mmd`) - the sketch pipeline: `--style` axis → `src/rough` + Kalam font → the flowchart/native/runtime renderers → SVG/PNG/HTML.
- **class** (`class.mmd`) - structure: `src/rough` as source of truth, mirrored into `vnmRuntime` and reused by the native `sketch-svg` helper; the embedded font.
- **sequence** (`sequence.mmd`) - a `--style sketch` render call end to end.

## Before / after comparison
No before (as-is) set was captured at plan ① (none drawn), so there is no side-by-side comparison - the as-built set above stands alone. The "before" is simply today's clean renderer; sketch is strictly additive (clean output is byte-unchanged).

## Knowledge updates
Updated the gogo-owned knowledge summaries (never the proxied upstreams):
- **`project-knowledge.md`** (proxy → `## gogo overrides`) - recorded the v0.5.0 `--style` sketch axis + `src/rough`/`sketch-font`/`sketch-svg`.
- **`tech-stack.md`** (proxy → `## gogo overrides`) - noted the bundled OFL font asset + the `-s/--style` CLI flag.
- **`code-review-standards.md`** (owned) - added the "ROUGH-PARITY" gotcha: the runtime inlines `src/rough`; keep the twin byte-identical (the parity guard covers it).

**Consider upstreaming** (your call, not done automatically): a line in the project `README`/CLAUDE about the `--style sketch` axis (the README gallery + CLI/API docs were updated in this feature).

## Follow-ups & known limitations
- **Hachure fill** - shipped a soft rough fill (FR2's allowed alternative); true hachure line-fill is a future enhancement.
- **Font in the browser core** (REV-001) - the ~22KB woff2 (~30KB base64) ships in the browser-safe core for all consumers (the D3 zero-network tradeoff). A lazy sketch subpath could tree-shake it for clean-only bundles.
- **Invalid `style` value** (TEST-002) - the library falls back to clean silently (typed union guards TS callers; the CLI validates). A defensive `normalizeStyle` warn is an easy add if wanted.
- **Pre-existing, orthogonal (not sketch bugs, noted by the tester):** interactive `localStorage` layout keys by node-ids+direction only (not style/theme); the interactive runtime never carries class UML relation markers.

## Summary (TL;DR)
- **Shipped:** a hand-drawn **`--style sketch`** axis (rough shapes, open arrowheads, bundled Kalam handwriting font) across flowchart + sequence/class/state, every output, deterministic and zero-network - composing with any theme. **v0.5.0.**
- **Review:** **APPROVED** - 3 minor/nit (2 fixed, 1 accepted); the determinism + static↔runtime byte-parity constraints verified.
- **Test:** **GREEN** - all four tiers exercised hands-on incl. real-browser drag/export; **unit 339 + e2e 73** green; 1 fixed (clean state markers), 1 accepted.
- **Follow-ups:** hachure fill, optional lazy font subpath, optional invalid-style warn - see above.
