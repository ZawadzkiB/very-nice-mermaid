# Test round 1 — mermaid-render-toolkit

## Verdict: **PASS with findings** (2 major, not blocking ship; recommended before wider release)

The shipped artifact works end-to-end at every level (CLI all 4 formats, library
API, web component, interactive browser controls). Baseline suites are fully
green exactly as reported after review round 2. Hands-on exploration beyond the
existing suites found **2 major** bugs (one geometry/rendering, one interactive
UI) that are real and reproducible — including in the project's own bundled
`state-machine.mmd` fixture — plus 3 minor/nit polish items. Neither major
finding crashes anything or fails a documented contract outright; both undermine
the plan's core promises (beautiful non-overlapping diagrams; a working
fit-to-view control) for a real, common use case (any flowchart with a cycle or
a skip-level edge; any user who clicks a toolbar button with a real mouse). See
`test/issues.json` (TEST-001..TEST-005) for full detail.

## Done-bar check (`test-strategy.md`: "Build clean AND all unit AND all e2e
green, PLUS hands-on exploration of the actual change")

| Bar | Status |
|---|---|
| Build clean | ✅ `npm run build` — clean, no warnings |
| Typecheck clean | ✅ `npm run typecheck` — clean |
| Unit green | ✅ 99/99 (`npm test`, 9 files) — matches prior state exactly |
| e2e green (as shipped) | ✅ 8/8 (`npm run test:e2e`) — matches prior state exactly |
| e2e green (after my additions) | ⚠️ 9/10 — I added 2 tests during hands-on exploration (see below); 1 fails **by design**, locking in TEST-002 as a durable regression test, not a suite-health problem |
| Hands-on exploration | ✅ CLI (all 4 formats × 6 fixtures + adversarial), interactive browser (Playwright MCP, real mouse/pointer events), look-right pass, adversarial edge cases — see below |

## 1. Baseline suite (exact numbers)

```
npm run build      → clean (tsup: dist/index.js 178KB, dist/element.js 163KB, dist/cli/index.js 183KB + .d.ts)
npm run typecheck  → clean, no output
npm test           → 9 test files, 99 tests, all passed (4.44s)
npm run test:e2e   → 8 tests, all passed (2.3s) — chromium 1228 already installed, no reinstall needed
```

All four match or exceed the prior state (99 unit / 8 e2e) — nothing regressed
going into this round.

## 2. CLI hands-on (all 4 formats, real invocations)

Entry point confirmed: `dist/cli/index.js` (`vnm render <file|-> ...`).

- **All 6 shipped fixtures** (`auth-flow`, `ci-pipeline`, `microservices`,
  `nested-subgraphs`, `shapes-gallery`, `state-machine`) rendered to **html,
  svg, md** with exit 0 and non-trivial output sizes (1.4KB–29KB). Artifacts:
  `test/artifacts/*.{html,svg,md}`.
- **SVG well-formedness**: all 6 validated as well-formed XML via
  `fast-xml-parser`'s `XMLValidator`. Structurally sound: elbow paths (`L`
  segments), edge-label plates (`<rect>` behind `<text>`), correct shape
  primitives (`<polygon>` for diamond/hexagon, `<path>` with `C` for
  stadium/pill, `<ellipse>` for circle).
- **PNG**: `ci-pipeline.mmd` → PNG magic bytes `89 50 4E 47 0D 0A 1A 0A` ✅
  correct. `--scale 2` doubles IHDR dimensions exactly (616×924 → 1232×1848,
  ratio 2.000). Optional `@resvg/resvg-js` dep present and working.
- **Themes**: `light` / `dark` / `fancy` on `microservices.mmd` produce
  visibly distinct fill palettes (confirmed via `grep`'d `fill="#…"` sets, all
  disjoint) and `fancy` correctly emits curved bezier paths (`C …`) where
  `light` emits straight elbow `L` segments — confirms FR9's per-theme edge
  style.
- **Custom theme JSON**: built `test/artifacts/ocean-theme.json` (partial
  token set matching README's `defineTheme` shape) and rendered with
  `--theme ./ocean-theme.json` — colors overridden correctly (`#04283b`,
  `#0b3b57`, `#39c0ed`, `#eaf6ff`) and `edge.style:"curved"` honored (curved
  paths appear).
- **`--strict`**: a DSL with an ignored `%%{init}%%` directive → without
  `--strict`: warning on stderr, exit 0; with `--strict`: same diagnostic
  promoted to `error`, exit 1. ✅ matches FR1/FR10 exactly.
- **Malformed DSL**: an unterminated `subgraph` and a fully non-Mermaid
  "garbage" file both degrade leniently (warnings, exit 0) and only become
  errors (exit 1) under `--strict` — this is the documented lenient-by-default
  contract, not a bug, but see **TEST-004** for a UX nuance worth a decision.
- **stdin/stdout**: `cat fixtures/state-machine.mmd | node dist/cli/index.js
  render - -f md` ✅ works; `render file.mmd -f md` with no `-o` ✅ writes to
  stdout.
- **Format inference**: `-o out.svg` / `-o out.png` with no `-f` flag ✅
  correctly inferred (verified via `file` command and PNG magic bytes).
- **100-node adversarial graph** (`test/artifacts/graph-100.mmd`, LR chain +
  skip-edges): SVG in **69ms**, PNG in **404ms**, no crash, 0 overlapping node
  pairs (automated bbox scan). **35-node graph**: SVG in 54ms; 17 overlapping
  node/edge pairs detected by the same scan — see TEST-001.
- **Hostile style value** (light XSS sanity check per task): `style A
  fill:#fff" onmouseover="alert(document.domain)` → dropped by the round-2
  sanitizer with an `unsafe-style-value` warning, exit 0, **no injected
  handler** in the output SVG. Round-2 fix (REV-001/REV-002) holds. ✅

## 3. Interactive browser testing (Playwright MCP, real pointer/mouse events)

Served `dist/` + this feature's `test/` dir via `npx http-server . -p 8934`
(the bundled Playwright MCP in this environment blocks `file:` navigation, so
http was required — the shipped e2e suite itself still uses `file://` directly
via Chromium, which is unaffected and still passes). Harnesses built under
`test/artifacts/`: `demo-light.html` / `demo-dark.html` / `demo-fancy.html` /
`demo-statemachine.html` (CLI-exported standalone HTML), `element-harness.html`
(inlined `dist/element.js`, mirroring `e2e/helpers.ts`), `mount-harness.html`
(real ESM `import { mount } from "/dist/index.js"` over http — embedding
`dist/index.js` inline like the element harness does breaks, because
`renderHtml()`'s bundled JS contains a literal `</script>` string that
prematurely closes an inline `<script>` tag; not a product bug, just a note for
anyone building a similar harness).

**Console**: zero genuine product console errors across the entire session.
The only two messages seen all session were a harmless static-server favicon
404, and one `Unexpected end of input` from my own first (fixed) harness
construction mistake described above.

Verified hands-on, with concrete evidence:

- **Drag re-routes edges live, stays attached to the border**: dragged
  `.vnm-node` first element in `demo-light.html`; edge `d` attribute changed
  from `M 309 62 L 309 122` to `M 357.09 124.39 L 367.3 124.39 L 367.3 143 L
  377.5 143`, correctly re-anchored to the node's new `style.left/top`. ✅
- **Layout persistence (localStorage)**: dragged a node, reloaded the exact
  same URL — dragged position **persisted exactly** across reload (screenshot
  `03-reload-check.png` shows the same overlap as `02-after-drag-node.png`).
  Also verified independently via the `mount()` harness with a custom
  `persist: "vnm-harness-layout"` key: value written to localStorage within
  the documented 400ms debounce, survives a real `page.reload()`.
- **`exportLayout()` / `importLayout()` round trip**: via `mount-harness.html`
  — dragged a node, `exportLayout()`, dragged it elsewhere, `importLayout()`
  the earlier snapshot — position restored **exactly** (`114.532px` →
  `71.3466px` → `114.532px`). ✅ matches README's documented API.
- **Wheel zoom at cursor**: confirmed mathematically, not just "value
  changed" — computed the world-space point under the cursor from the
  transform before/after zooming in (`(400,300)` screen → world `(141.24,
  200.15)` before, `(141.22, 200.14)` after) — **matches to within rounding**,
  proving the zoom is correctly centered on the cursor, not just any zoom.
- **Background pan**: click-drag on empty canvas moved `translate()` by
  exactly the mouse delta (100,70 px mouse → +100,+70 px translate). ✅
- **Minimap**: renders nodes + a **viewport rectangle** (confirmed via
  `drawMinimap()` source and visually). Both **click-to-recenter** and
  **drag-to-recenter** on the minimap canvas correctly change the main view's
  transform (verified transform changes both times). ✅
- **Fit-to-view / zoom-in / zoom-out toolbar buttons**: ❌ **do NOT respond to
  real mouse clicks** — see **TEST-002** (major). A raw DOM `.click()` works;
  a real simulated click (or an actual user's mouse) does nothing, because the
  viewport's own pan-handler captures the pointer first. The existing e2e test
  for this couldn't catch it because its assertion (`toContain("scale(")`) is
  true whether or not the click did anything.
- **Custom element**: mounts from inline text-content DSL (`element-harness.html`,
  screenshot `05-custom-element-light.png`) with zero console errors. Setting
  the `theme` attribute to `"dark"` live re-renders with a new background
  (`rgb(247,248,251)` → `rgb(15,17,23)`), node count preserved (4 nodes before
  and after) — screenshot `06-custom-element-dark.png`.
- **Node overlap hides the connecting edge (z-order)**: see **TEST-003**
  (minor) — dragging a node to overlap its connected neighbor visually hides
  the short edge segment underneath the opaque card, since the SVG edge layer
  paints before (behind) the node-card divs in `.vnm-world`'s DOM order.

### Screenshots (`test/screenshots/`)

| File | What it shows |
|---|---|
| `01-light-theme-ci-pipeline.png` | ci-pipeline.mmd, light theme, initial mount — clean elbow routing, edge label plates, correct `Report failure` red styling via classDef |
| `02-after-drag-node.png` | Same diagram after dragging "Push to main" close to "Install deps" — demonstrates TEST-003 (edge hidden behind overlapping card) |
| `03-reload-check.png` | Same page reloaded — confirms drag position persisted via localStorage |
| `04-after-fit-click.png` | After a real-mouse-click on the fit-to-view button from a panned state — view is unchanged, demonstrating TEST-002 |
| `05-custom-element-light.png` | `<very-nice-mermaid>` custom element, inline DSL, light theme |
| `06-custom-element-dark.png` | Same element after `theme="dark"` attribute change — live re-render |
| `07-fancy-theme-ci-pipeline.png` | ci-pipeline.mmd, fancy theme — curved edges, glow effects, strong dark-mode contrast |
| `08-statemachine-interactive-edge-overlap-bug.png` | state-machine.mmd in the interactive DOM renderer — demonstrates TEST-001 at its most visible: the "retry" edge label is clipped to "etry" by the "Response OK?" card, with multiple edges crossing its interior |

Other rendered evidence lives in `test/artifacts/` (all CLI outputs, the
adversarial `.mmd` inputs, `state-machine.png`/`cycle.png`/`skiplevel.png` for
TEST-001, `hostile.svg` for the XSS sanity check, `ocean-theme.json` for the
custom-theme test).

## 4. Look-right / aesthetic pass

**What looks good**: `nested-subgraphs.mmd` renders excellently — correct
nested cluster boxes with titles, all shape primitives distinct and legible
(parallelogram, cylinder, diamond, stadium, circle all correctly silhouetted in
SVG/PNG), edge label plates cleanly "punch through" the line via a background
gap, mono/sans typography is clean and readable, the `fancy` theme's curved
edges + glow effects look genuinely polished (screenshot `07`), dark theme has
good contrast. The minimap, toolbar, and overall visual language match the
xplan-inspired aesthetic goals well for straight-line/branching (acyclic)
flowcharts.

**What doesn't**: any flowchart with a cycle or a skip-level edge routes at
least one edge straight through an intervening node — confirmed in the
project's own `state-machine.mmd` fixture (not just a contrived case), visible
in static SVG, PNG, the interactive DOM renderer, and (in a related but
distinct way) the ASCII renderer. See **TEST-001** and **TEST-005**.

## 5. Adversarial / edge cases

| Case | Result |
|---|---|
| Empty input | ✅ exit 0, empty 0×0 SVG, no crash |
| Single node | ✅ exit 0, renders fine |
| Cycle (A→B→C→A) | ⚠️ renders, no crash, but back-edge crosses node B — TEST-001 |
| Long label (100+ chars) | ✅ node box grows to fit (857px wide), no overflow/clipping |
| Unicode (emoji 🚀, CJK 部署完成, accented Café Ñandú, Arabic مرحبا) | ✅ all render correctly in SVG and ASCII/MD, exit 0, no mangling |
| 100-node graph | ✅ 69ms SVG / 404ms PNG, 0 overlaps, no crash |
| 35-node graph w/ skip-edges | ⚠️ renders, no crash, but 17 overlap pairs — TEST-001 |
| Non-Mermaid garbage input | ✅ (by design) lenient degrade, exit 0 w/ warnings — TEST-004 notes a UX nuance |

## 6. e2e additions this round

Extended `e2e/exported-html.spec.ts` (a genuine coverage gap found via
hands-on exploration, per the task's invitation to add tests for gaps like
minimap-recenter / layout round-trip):

- **`minimap drag recenters the main view`** — new, **passes**. Fills a real
  gap (only "minimap is drawn to scale" existed before; recentering itself was
  untested).
- **`fit-to-view actually resets the transform after a real mouse click`** —
  new, **fails** on the current build. This is intentional: it is the
  regression test for TEST-002, using a real mouse click (not `element.click()`)
  and panning away first so the assertion can actually distinguish "button
  works" from "button does nothing" — the gap the existing weaker test missed.
  Once TEST-002 is fixed, this test should turn green with no other change.

Current e2e count after these additions: **9 passed, 1 failed (by design)**,
10 total — up from the shipped 8.

## Findings summary (see `test/issues.json` for full detail)

| ID | Severity | Priority | Tag | Title |
|---|---|---|---|---|
| TEST-001 | major | P1 | agent-fixable | Multi-rank/back edges cross through intervening nodes (reproducible in state-machine.mmd) |
| TEST-002 | major | P1 | agent-fixable | Toolbar fit/zoom buttons don't respond to real mouse clicks (pointer-capture hijack) |
| TEST-003 | minor | P2 | needs-user-decision | Edges paint behind node cards — overlap hides the connecting edge |
| TEST-004 | nit | P3 | needs-user-decision | Fully non-Mermaid input still exits 0 by design — confirm this is the intended posture |
| TEST-005 | minor | P3 | agent-fixable (verify-after) | ASCII renderer shows box-drawing/arrowhead artifacts near crossings — likely same root cause as TEST-001 |

No blocker-severity findings. Both major findings are real bugs worth fixing
before a wider release, but neither crashes the tool, breaks a documented
contract, or fails the existing test suite as originally written — they were
only surfaced by hands-on exploration beyond the green baseline, which is
exactly what this phase is for.
