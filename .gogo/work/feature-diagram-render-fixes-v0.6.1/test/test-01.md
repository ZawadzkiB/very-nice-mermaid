# Test round 01 — feature `diagram-render-fixes-v0.6.1`

**Date:** 2026-07-13
**Tester:** gogo-tester (phase ④)
**Verdict: GREEN — done-bar met.** Build + typecheck + unit + e2e all green, and every
hands-on/visual check the plan named was exercised (none blocked). Zero issues found;
`test/issues.json` is `{"issues": []}`.

## What was exercised, and results

### 1. Suites (build → typecheck → unit → e2e)

| Suite | Command | Result |
|---|---|---|
| Build | `npm run build` | Clean (tsup, ESM + `.d.ts`, no errors) |
| Typecheck | `npm run typecheck` | Clean (`tsc --noEmit`, 0 errors, incl. the new e2e spec) |
| Unit | `npm test` | **397/397 passed** (29 files) — confirms implement's claimed count |
| e2e | `npm run test:e2e` | **84/84 passed** (79 pre-existing + 5 new, see §4) |

`npx playwright install chromium` succeeded (browsers already present on this machine,
confirmed via `npx playwright --version` → 1.61.1); the e2e suite was **not** blocked.

### 2. Visual / hands-on verification (the real spec — pixels)

Rendered every named diagram fresh via `node dist/cli/index.js render ...` and compared
byte-for-byte against the working-tree's regenerated assets, then eyeballed each PNG
(before via `git show HEAD:<path>` vs. after the working tree) with the Read tool:

- **Issue 1a (`idle→Loading` arrowhead, `fixtures/state-machine.mmd --theme dark --style
  clean`):** Fresh render is **byte-identical** (md5) to `assets/example-dark.png`.
  Before/after comparison confirms the fix: the OLD image has a visible sideways
  doubling-back stub + arrowhead artifact at Loading's top-left corner; the NEW image
  shows a clean vertical arrow descending straight into Loading's top. **Confirmed
  fixed, visually an improvement.**
- **Issue 1b (`give up` label):** Same diagram/render. OLD image has "give up" sitting
  directly on/beside the `errored→idle` vertical run (reads as touching/bisected per the
  plan's diagnosis); NEW image has the label clearly lifted clear of the parallel lines,
  reading as one word. **Confirmed fixed.**
- **Issue 2 (`examples/src/flowchart.mmd --theme light --style clean`, Report-failure /
  Done edges):** Fresh render byte-identical to `docs/assets/flowchart-clean-light.png`.
  Before/after: OLD image's `Ship to prod→Done` and `Report failure→Done` arrowheads are
  faint/low-contrast and enter Done at an off diagonal; NEW image has clearly visible,
  darker arrowheads entering Done's left/right border cleanly perpendicular (this
  observation led to e2e coverage — see §4). **Confirmed fixed.**
- **Issue 3 (`examples/src/state.mmd --theme light`, `clean` + `sketch`, fail/retry/Error
  region):** Fresh renders byte-identical to `docs/assets/state-clean-light.png` and
  `state-sketch-light.png`. Before/after: both show materially improved edge/arrowhead
  contrast against the near-white background (`#8a93a6`→`#69728a`), most pronounced in
  `sketch·light` where the old thin wobbly strokes were faint and the new strokes are
  clearly legible. Geometry unchanged (colour-only), as designed. **Confirmed fixed.**
- **Determinism:** re-rendered `state-machine.mmd` (dark/clean) and `flowchart.mmd`
  (light/clean) a second time each — both **byte-identical (md5)** to the first render.
  No clock/RNG leakage.

### 3. Regression sweep

- `git diff --stat` on the working tree's already-regenerated assets (63 files) reviewed
  in full. **`assets/example-fancy.png` does not appear in the diff at all** — confirmed
  byte-identical to HEAD via md5. **No `*-fancy.png` appears anywhere in `docs/assets/`
  or `examples/`** — only the pre-generated `docs/interactive/*-fancy.html` files
  changed, and inspecting `git diff docs/interactive/class-clean-fancy.html` confirms
  that diff is confined to the **embedded `vnmRuntime` script text** (the new
  `perpendicularizeEntry2` helper + FR3 parallel branch, added because `runtime.ts`
  changed) — **zero rendered-SVG/pixel content changed** for any fancy diagram.
- Class + sequence PNGs changed **only** in light theme (no dark equivalents in the
  diff) — matches FR1 being light-only. Inspected the raw SVG diffs for
  `class-clean-light.svg` and `sequence-clean-light.svg`: every changed line is **only**
  the hex `#8a93a6`→`#69728a` substitution — zero coordinate/path bytes changed,
  confirming FR1 is genuinely colour-only for the non-flowchart tiers.
- `docs/assets/flowchart-clean-dark.png` and `flowchart-sketch-dark.png` **did** change
  (geometry, not just colour) — expected, since FR2 applies to dark too (the plan calls
  this out as "a bonus of the same bug class"). Before/after pixel comparison confirms
  the dark flowchart's `Ship to prod→Done` and `Report failure→Done` arrowheads moved
  from an off-diagonal entry to a clean horizontal perpendicular entry — an improvement,
  not a regression.
- No stray/unintended files appeared in `git status` beyond the implement-phase's
  expected output plus this round's new e2e spec.

### 4. Interactive HTML export parity (real browser, bundled Playwright MCP)

Served the repo over a local HTTP server (the MCP blocks `file://` navigation) and drove
both diagrams in a real Chromium via `mcp__gogo-playwright__browser_*` tools:

- **State machine** (`fixtures/state-machine.mmd --theme dark --style clean -f html`,
  rendered fresh since `docs/interactive/state-clean-dark.html` is built from the
  *different* `examples/src/state.mmd` gallery source, not the hero fixture): screenshot
  matches the static PNG exactly — idle→Loading arrow clean into the top, "give up"
  legible and clear. **Dragged the Idle node with real `page.mouse` pointer events** —
  edges re-routed live, the idle→Loading entry **stayed perpendicular after the
  re-route**, and "give up" stayed clear. Panned (background drag) and wheel-zoomed at
  cursor — both worked. Console: only a harmless `favicon.ico` 404 (expected for any
  static export with no favicon; not a defect), zero JS errors.
- **Flowchart** (`docs/interactive/flowchart-clean-light.html`, pre-generated by `npm run
  docs` from the correct `examples/src/flowchart.mmd` source): screenshot matches the
  static PNG — Report-failure/Done edges clearly traceable with visible arrowheads.
  Console: same harmless favicon 404 only.
- Both confirm the runtime twin (`src/render/dom/runtime.ts`) is genuinely in parity with
  the static renderer for FR2/FR3 in a **real** browser, not just the fake-DOM
  `dom-runtime-parity` unit guard.

### 5. e2e gap found and filled

Per the task brief's explicit prompt, checked `e2e/*.spec.ts` for a browser-level
assertion of the idle→Loading arrowhead direction or the give-up label position — found
**none** (FR2/FR3 had unit coverage in `test/geometry.test.ts` and fake-DOM byte-parity
in `test/dom-runtime-parity.test.ts`, but nothing drove a **real** rendered SVG in a
**real** browser for these exact shapes). Added
`e2e/render-fixes-v0.6.1.spec.ts` (5 new tests, following the project's
`getScreenCTM()`/`getPointAtLength()` + `labelPlateRect`-style conventions from
`bridges-and-labels.spec.ts`):

1. `idle→Loading` closes with a vertical segment descending into Loading's top
   (exported HTML, dark/clean) — measured via real DOM geometry, not string parsing.
2. Same, but **after a live drag re-route** (real pointer events) — proves the fix holds
   dynamically, not just in the baked static layout.
3. Flowchart `Done` side-entries (`Ship to prod`→Done, `Report failure`→Done) both close
   horizontally into the correct left/right border — extends FR2 coverage to Issue 2.
4. `give up` label's plate has **no second (foreign) edge** passing through it — only the
   label's own edge may (that's the harmless "reserved space" it sits on); dark/clean.
5. Same, light theme.

All 5 pass. Validated the coordinate-mapping approach live (via the MCP browser tools)
before committing it to the spec — confirmed `getPointAtLength`+`getScreenCTM` correctly
maps SVG path points to client space matching node `getBoundingClientRect()` (distance
~0.02px to Loading's measured top-center), and confirmed the per-edge hit breakdown for
the `give up` plate shows hits on exactly one edge (its own) and zero on all others,
including the `retry` edge the plan names as the near-parallel neighbour. Did not revert
the fix to bite-verify (would require touching `src/**`, out of scope for this phase) —
the unit-level `dom-runtime-parity` test already bite-verifies the underlying twin
branches (REV-001), and every number in the e2e assertions above was independently
measured live, not hardcoded.

Ran the full e2e suite after adding the spec: **84/84 green** (79 + 5).

## Files touched this round

- Added: `e2e/render-fixes-v0.6.1.spec.ts` (5 new tests)
- No product code (`src/**`) touched.

## Issues found

**None.** `test/issues.json` has an empty `issues: []` array. The three review-round
findings (REV-001 fixed, REV-002 fixed, REV-003 wontfix/deferred to the pre-existing
flowchart-render-legibility REV-008 follow-up) were not re-litigated per the task brief.

## Hands-on checks: none blocked

Every hands-on/visual/interactive check the plan and task brief named was run
successfully: CLI renders (4 diagrams × before/after pixel comparison), determinism
(2× re-render, byte-identical), regression sweep (git diff + SVG-diff inspection),
interactive HTML in a real browser (navigation, screenshot, drag, pan, zoom, console).
Nothing was skipped or blocked — no `needs-user-decision` issues were needed.

## Verdict against the done-bar

**Done-bar MET:** build clean AND unit (397/397) AND e2e (84/84) green, PLUS hands-on
exploration of the actual rendered output (not just green tests) — every one of the
plan's 5 acceptance-criteria checks (Issues 1a, 1b, 2, 3, regression sweep) plus the
interactive-HTML parity check were independently verified against real pixels and a
real browser, with before/after comparisons proving each change is an improvement, not
a regression. Recommend advancing to phase ⑤ report.
