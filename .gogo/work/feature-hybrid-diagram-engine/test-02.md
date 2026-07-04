# Test round 2 — feature `hybrid-diagram-engine` (focused re-test)

## Verdict: **FAIL** (reopened 1 major + 1 new major finding; route back to ② implement)

Round 1's blocker (TEST-001) is **genuinely fixed and confirmed in a real
bundled browser** — this was the money check for this round and it holds.
Two of the three round-1 majors (TEST-002, TEST-004) and the minor (TEST-005)
are cleanly confirmed fixed. But re-testing TEST-003 (state anti-parallel
occlusion) surfaced that the round-5 fix only reaches the **static SVG/PNG**
renderer — the **live interactive path** (`mount()`, `mountAsync()`, the
`<very-nice-mermaid>` element, and the CLI's own `-f html` export) never
received it, so the exact original bug still reproduces there. That reopens
TEST-003. Re-testing also surfaced a new, narrower legibility regression in
the part that IS fixed (TEST-006: separated channels, overlapping labels).

---

## 0. Baseline suites (all green — matches expected 258 + 33)

| Check | Result |
|---|---|
| `npm run build` | clean (tsup, ESM+DTS: `dist/index.js` 259KB, `dist/element.js` 219KB, `dist/cli/index.js` 262KB) |
| `npm run typecheck` | clean |
| `npm test` | **258/258** unit tests pass (23 files, incl. `test/route.test.ts` 19 tests) |
| `npm run test:e2e` | **33/33** Playwright/Chromium tests pass |

No regressions in the suites themselves.

---

## 1. TEST-001 (blocker) — library routing in a REAL bundled browser — **CONFIRMED FIXED**

This was the mandated critical re-check: round 1's e2e only ever drove
CLI-precomputed HTML, so the Node/jsdom unit tests (`test/route.test.ts`)
proved the fix works where mermaid *can* resolve, but not that it survives a
real bundler's module graph.

**Method:** built a throwaway Vite harness (not part of the repo) at
`/private/tmp/.../scratchpad/vnm-lib-harness/` — `npm pack`ed the repo's
current `dist/` into a tarball, installed it as a real dependency (so mermaid
resolves through an actual bundler, not `file://`), and wrote a page that
imports `mountAsync` from the built `very-nice-mermaid` package and
`very-nice-mermaid/element` for the custom element side effect. Served via
`vite --port 5183` (not `file://`), driven with the `gogo-playwright` MCP.
One `vite.config.js` tweak was needed: exclude `@resvg/resvg-js` + `jsdom`
from Vite's dependency-optimizer scan (it eagerly crawls dynamic `import()`
targets and trips on resvg's native `.node` binary) — a standard consumer-side
fix for an optional/Node-only lazy dependency; it doesn't change what ships or
runs in the browser.

**Result — per type, native vs garbage:**

| DSL fed raw via `mountAsync` | Result |
|---|---|
| `sequenceDiagram` | **native**: 0 `.vnm-node` (correctly NOT flowchart cards), pan/zoom viewport, lifelines + message text (`User`/`API`/`DB`, `POST /orders`…), no fabricated `sequenceDiagram` header node |
| `classDiagram` | **native**: 5 `.vnm-node` compartment cards (`Animal` «abstract» + fields/methods, `Dog`, `Collar`, `Vet`, `Vaccine`), relation labels `extends`/`has`/`visits`/`uses`, no fabricated `classDiagram` header node |
| `stateDiagram-v2` | **native**: state cards (`Idle`/`Running`/`Paused`), transition labels `start`/`pause`/`resume`/`stop`, no fabricated `stateDiagram` header node |
| `pie` | **mermaid fallback**: real mermaid `<svg aria-roledescription="pie">`, legend + percentages (`Dogs`/`Cats`/`Birds`, `79%`/`17%`/`3%`), 0 `.vnm-node` |

Also drove the raw `<very-nice-mermaid>` element directly (not just
`mountAsync`) with a **hostile class DSL** (`<script>window.__vnm_xss=true</script>`
inside a member label): rendered inert — 0 `<script>` tags in the DOM, the
page-level flag stayed `false`, 0 console errors.

**Zero console errors across every case** (verified via a console mirror +
`window.__consoleErrorCount`).

Screenshots: `test/screenshots/round2-real-browser-lib-routing-all.png` (all
four side by side), `round2-real-browser-{sequence,class,state,pie}-native.png`.

**Verdict: CONFIRMED FIXED — holds in a genuine bundled-browser load.**
`test/issues.json` TEST-001 → `verified`.

---

## 2. TEST-002 (class composition diamond) — **CONFIRMED FIXED**

CLI-rendered `fixtures/shop-class.mmd` to SVG (light theme), inspected the raw
markup: `has`/`visits`/`uses` leave `Dog`'s bottom border at three **distinct**
x-offsets (207.5 / 227.5 / 247.5 — 20px apart), and
`marker-start="url(#vnm-cls-diamond-solid)"` appears **only** on `has`'s path.
`visits`/`uses` carry the plain open-arrow marker at their own (different) end.
Zoomed screenshot `test/screenshots/round2-class-static-svg-fan.png` confirms
visually — a single filled diamond sits on `has`'s own stub, not a shared
trunk; `visits`/`uses` no longer read as compositions.

**Verdict: CONFIRMED FIXED** (in the static SVG/PNG — the only surface that
draws relation-type markers at all; the interactive DOM's generic-arrow
tradeoff is pre-existing and unrelated). `test/issues.json` TEST-002 →
`verified`.

---

## 3. TEST-003 (state anti-parallel) — **REOPENED** (partial fix — static SVG only)

**Static SVG/PNG: genuinely fixed.** CLI-rendered `fixtures/order-state.mmd`
to SVG: `Idle<->Running` (`start`/`stop`) and `Running<->Paused`
(`pause`/`resume`) each route on two distinct, 20px-apart channels, both
arrowheads visible. Screenshot: `test/screenshots/round2-state-static-svg-antiparallel.png`.

**Interactive DOM / HTML export: still broken — the exact original bug.**
`src/render/dom/runtime.ts` (the self-contained, `.toString()`-serialized
router that `mount()`, `mountAsync()`, the `<very-nice-mermaid>` element, AND
the CLI's own `-f html` export all use for live rendering) never reads
`edge.ports` at all — its `routeEdgePath()`/`anchor()` recompute a single,
un-offset anchor per (node, side). Opened the CLI's own canonical
`vnm render fixtures/order-state.mmd -f html` in a real browser:

- `start` (Idle→Running) and `stop` (Running→Idle) render at the **same
  point** (label rects 1px apart) — only `stop` is visible.
- `resume` (Paused→Running) is visible; **`pause` (Running→Paused) is fully
  hidden** underneath it. Raw DOM dump: the two edges' `<path d="...">` are
  exact mirror-image duplicates of the same 4 points.

Screenshot: `test/screenshots/round2-state-interactive-html-antiparallel-occluded.png`
— visually indistinguishable from the round-1 bug report.

**Same root cause also hits the class fan case in the live view:** opened
`vnm render fixtures/shop-class.mmd -f html` — `has`/`visits`/`uses` from
`Dog` still all start at the identical point (239.5, 290), the shared-trunk
pattern TEST-002 was about (minus the diamond, which the interactive DOM
never draws — pre-existing, not new). Screenshot:
`test/screenshots/round2-class-interactive-html-fan-trunk.png`.

**Drag mechanism itself is fine:** dragged `Running` in the exported
`state.html` — all edges live-recompute, zero console errors
(`test/screenshots/round2-state-drag-reroute-regression.png`); only the
port-offset separation is missing from this code path.

**Verdict: REOPENED.** `test/issues.json` TEST-003 → `open`, with updated
evidence + a precise fix pointer (port the offset into `runtime.ts`, and add
a multi-edge-per-side case to `test/dom-runtime-parity.test.ts`, which
currently has none — exactly the gap that let this slip through).

---

## New finding: TEST-006 (major) — anti-parallel labels overlap in the (now-fixed) static SVG

While confirming TEST-003's static-SVG fix, found the channel separation
(±10 units, `PORT_STEP`=20) is narrower than a typical label's background
plate (27–70+ units), so the two plates overlap and the later-drawn one clips
the earlier one's text:

- `order-state.mmd`: `start` (rect 82.43–135.83) vs `stop` (106.77–151.49,
  drawn after) → rendered `start` reads as `"st"`. `pause` (36.05–89.45) vs
  `resume` (51.71–113.79) → `pause` reads as `"p"`.
- Flowchart repro (`A -->|go| B`, `B -->|back| A`): `go` (12.32–39.68) vs
  `back` (23.64–68.36, drawn after) → `go` reduced to an unreadable sliver.
  Screenshot: `test/screenshots/round2-flowchart-antiparallel-labels-overlap.png`
  (zoomed 4×) shows this unambiguously.
- The class **fan** case (TEST-002) is unaffected — dagre spreads a fan's
  distinct target nodes far enough apart that labels never collide (confirmed:
  `has`/`visits`/`uses` label rects have zero x-overlap).

Net effect: both transitions are now visibly distinct edges (a real
improvement over full occlusion), but one label's text is often unreadable.
Filed as `TEST-006` (new, major) with a precise repro + proposed fix (stagger
label placement or grow channel spacing when both edges carry a label).

---

## 4. TEST-004 (honest fallback failure, D9-A) — **CONFIRMED FIXED**

CLI-rendered fresh `gantt.mmd` and `er.mmd` fixtures to **both** `-f svg` and
`-f html`:

```
vnm: fallback-render-unavailable error fallback 'gantt' cannot be rendered
headlessly (jsdom): the layout is degenerate/blank. It renders correctly in
a browser / the library; use those for 'gantt'.
```

All 4 combinations: exit 1, **no output file written** (confirmed absent via
`ls`). `pie -f svg`/`-f html`: exit 0, files written correctly. A native type
(flowchart): exit 0, unaffected.

**Verdict: CONFIRMED FIXED.** `test/issues.json` TEST-004 → `verified`.

---

## 5. TEST-005 (ascii capability exit-code parity, D8-A) — **CONFIRMED FIXED**

| Command | Exit (default) | Exit (`--strict`) |
|---|---|---|
| `class -f md` (native) | 0 | 1 |
| `state -f md` (native) | 0 | 1 |
| `pie -f md` (fallback) | 0 | 1 |

All four print the matching `capability-unavailable warn ... capability=ascii`
diagnostic shape. Native and fallback tiers now behave identically.

**Verdict: CONFIRMED FIXED.** `test/issues.json` TEST-005 → `verified`.

---

## 6. Light regression sanity

- **Flowchart:** still renders (CLI `-f html`), drag mechanism confirmed
  working elsewhere in this round; anti-parallel flowchart edges **do** now
  separate onto distinct channels (confirmed: `A-->B`/`B-->A` render 20px
  apart) — same shared-geometry benefit as state — but inherit the same
  TEST-006 label-overlap gap when labeled.
- **Sequence:** exported HTML (`fixtures/order-sequence.mmd -f html`) mounts
  its pan/zoom viewport correctly; e2e suite (6 sequence specs, all green)
  already covers pan/zoom/fit/minimap in depth — no regression found.
- **Hostile `<script>` in a class member label:** confirmed inert in a real
  browser (see §1) — 0 `<script>` tags in the DOM, page flag never flipped,
  0 console errors.

---

## Done-bar assessment (per `test-strategy.md`)

> Build clean AND all unit AND all e2e green, PLUS hands-on exploration of the
> actual change (not just green tests) AND it must look right.

- Build + unit (258) + e2e (33) green: **yes**
- Hands-on exploration, including the mandated real-bundled-browser
  library-routing check: **yes, thorough**
- "Looks right": flowchart/sequence/class (static SVG) genuinely improved;
  **state's flagship anti-parallel fix and class's fan-trunk fix do not reach
  the primary interactive/HTML-export surface** (TEST-003 reopened), and the
  static-SVG fix that IS complete introduced a narrower label-legibility gap
  (TEST-006, new).
- **Blocking:** TEST-003 reopened (major) — the interactive rendering path
  (the one most users actually see and drag) still shows the original
  anti-parallel occlusion and fan-trunk convergence. TEST-006 is new (major).

**Overall: FAIL.** Route back to ② implement with `test/issues.json`
(2 open/new: TEST-003 reopened, TEST-006 new; both agent-fixable, both
pointing at the same `src/render/dom/runtime.ts` gap plus a label-placement
tweak).

---

## Findings summary (this round)

| id | severity | status | one-line |
|---|---|---|---|
| TEST-001 | blocker | **verified** | real-bundled-browser library routing confirmed — native shapes for sequence/class/state, mermaid fallback for pie, hostile script inert, 0 console errors |
| TEST-002 | major | **verified** | class composition diamond confirmed on its own edge (static SVG) |
| TEST-003 | major | **reopened (open)** | static SVG fixed; interactive DOM/HTML export still fully occludes anti-parallel edges + collapses fan trunks (runtime.ts never reads `edge.ports`) |
| TEST-004 | major | **verified** | fallback-render-unavailable error + non-zero exit + no file, for both svg and html; pie/native unaffected |
| TEST-005 | minor | **verified** | native + fallback ascii-unavailable exit codes now consistent (0 default / 1 `--strict`) |
| TEST-006 | major | **new** | static-SVG anti-parallel fix separates paths but adjacent labels' plates overlap, clipping text (`start`→`st`, `pause`→`p`, `go`→~unreadable) |

## Screenshots (all under `test/screenshots/`)
`round2-real-browser-lib-routing-all.png`,
`round2-real-browser-{sequence,class,state,pie}-native.png`,
`round2-class-static-svg-fan.png`, `round2-state-static-svg-antiparallel.png`,
`round2-state-interactive-html-antiparallel-occluded.png`,
`round2-class-interactive-html-fan-trunk.png`,
`round2-state-drag-reroute-regression.png`,
`round2-flowchart-antiparallel-labels-overlap.png`.
