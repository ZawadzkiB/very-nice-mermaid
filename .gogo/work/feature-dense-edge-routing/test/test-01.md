# Test round 1 — `dense-edge-routing` (v0.6.5)

**Date:** 2026-07-15
**Branch:** release/v0.6.5
**Verdict: ALL GREEN — advance to ⑤ report.**

No findings. `test/issues.json` round 1 has an empty `issues` array.

## 1. Regression suite

- `npm test` → **29 files / 413 tests, all green** (incl. `dom-runtime-parity`,
  `state-svg`, `class-svg`, `render-svg` snapshots).
- `npm run typecheck` → clean.
- `node dist/cli/index.js --version` → `0.6.5`.

## 2. `git diff --stat` churn sweep

Full diff is exactly:
- 4 version-bump files: `package.json`, `src/cli/run.ts`, `test/cli.test.ts`, `docs/_config.yml`
- 18 `docs/interactive/*.html` twins — every `class-*` / `flowchart-*` / `state-*`
  file (clean+sketch × light/dark/fancy) is **exactly +97** lines; the 6
  `sequence-*.html` files (own routing, out of scope) are untouched.
- Source: `src/geometry/index.ts` (+157), `src/layout/index.ts` (+2),
  `src/render/dom/runtime.ts` (+122).
- Tests: `test/dom-runtime-parity.test.ts` (+68), `test/geometry.test.ts` (+131).
- **Zero** churn to `test/__snapshots__/*.snap`, `examples/`, `assets/` (confirmed
  via `git status --porcelain` on all three — empty).

Spot-checked the `docs/interactive/flowchart-clean-light.html` diff line-by-line:
it is 100% inlined `vnmRuntime` JS **source** (the new `deskewer` cross-side rule
and `separateConvergentJogs2` function body, plus the one new call-site wire-in) —
grepped the diff for `d="[ML]` and found zero matches, i.e. no rendered-SVG path
data changed inside the exported HTML.

## 3. Determinism (2x re-render)

- Rendered `architecture.mmd` to SVG 3 times (`--style clean --theme light`) —
  `diff` byte-identical across all 3.
- `npm run examples` run twice (16 renders × png+svg across 4 diagrams / 2 styles
  / 2 themes each time) — `diff -rq` between the two output sets: **identical**.
  `git status` after both runs: no diff (examples were already at their
  post-implementation deterministic state).

## 4. Mandatory visual verification (hard acceptance bar)

Rendered `architecture.mmd` (the repro fixture) via
`node dist/cli/index.js render <file> -f png --style clean --theme {light,dark} --scale 3`,
then multimodally read the PNGs, cropping the RULES and MCP regions with
python3+PIL for a close look, in **both** themes.

**(1) RULES convergence — RESOLVED.** The four edges into `Rules · Sets · Runs`
(REST from Veris console, MCP---RULES, "stream context" from BE, "findings" to
BE) now land on **four visually distinct y-levels** — a clean staircase, each
crossbar at its own height, stepping down toward the border with the REST edge's
jog nearest the border and the BE-pair's jogs progressively higher/further back.
There is **no single-y knot** — every jog is legible as its own entry. Confirmed
identical in light and dark (only palette differs).
Crops: `/tmp/rules-light-crop.png`, `/tmp/rules-dark-crop.png`.

**(2) MCP skewer — RESOLVED (subtle, as flagged in the plan).** `MCP surface`'s
in-edge (`author rules`, from AGENT) now takes a visible dogleg jog just above
the `Validation Engine` container border before entering MCP's top, landing at a
port distinctly **left** of where the out-edge (`MCP---RULES`) exits the bottom.
Pixel-measured on the light PNG (scale 3, so /3 for pre-scale units): in-port
lands at scaled x≈1160 (pre-scale ≈387), out-port continues at scaled x≈1215
(pre-scale ≈405) — a ~15-18px pre-scale offset, matching the plan's instrumented
385.25/400.25 (a PORT_STEP/2 nudge). This reads as de-skewered: a viewer can see
the line is NOT a single straight pass-through — there's a clear jog and the
in/out no longer align. Confirmed identical in light and dark.
Crops: `/tmp/mcp-tight-light.png`, `/tmp/mcp-tight-dark.png`.

**(3) Defect #3 — present, as expected/deferred, NOT flagged as a regression.**
The long `stream context` (BE→RULES) and `findings` (RULES→BE) verticals still
run straight through the `Validation Engine` container's interior, passing
directly beside/through the MCP surface node's column, in both light and dark.
This is exactly the documented, deferred defect (subgraph-aware routing, out of
scope for v0.6.5) — confirmed present, not regressed, not flagged.
Crop: `/tmp/defect3-light.png`.

## 5. Preserved invariants

- **v0.6.2 anti-parallel `fail`/`retry` stagger** (state diagram): green —
  `test/geometry.test.ts` "separateAntiParallelJogs de-cramps a collinear
  anti-parallel elbow pair (v0.6.2)" and `test/dom-runtime-parity.test.ts`
  "STATE anti-parallel de-cramp: Loading↔Error jogs stagger ≥ JOG_GAP, and the
  twin reproduces it (v0.6.2)" both pass.
- **v0.6.4 label off-line offsets**: green — `test/geometry.test.ts`
  "resolveLabelLineOffsets lifts a label off its home line (option d, v0.6.4)"
  passes.
- Confirmed the new `separateConvergentJogs` pass does not touch the v0.6.2
  2-edge anti-parallel case (disjoint keys, dedicated no-op test green).

## 6. Hands-on / browser note

Did not drive the bundled `gogo-playwright` MCP browser for this round. Per the
plan (and the orchestrator's brief), this is a pure static-geometry change to the
elbow-routing pipeline with no new interactive-only surface; static-PNG rendering
at the exact repro fixture plus the `dom-runtime-parity` unit guard (which
already proves the interactive/exported `vnmRuntime` twin is byte-identical to
the shared geometry for both new passes) is the plan-designated sufficient
verification level for this feature. This is **not** logged as a blocked
hands-on check / needs-user-decision — it's an intentional scope choice
documented in plan.md's Tests section ("Visual (mandatory): re-render
`architecture.mmd` ... SVG + PNG").

## Verdict

- Build: clean. Unit: 413/413 green. Typecheck: clean.
- Regression sweep: churn scoped exactly to plan-expected files; zero snapshot/
  examples/assets churn.
- Determinism: byte-identical across repeat renders (SVG direct + examples).
- Visual hard bar: RULES knot resolved (staircase fan) / MCP de-skewered (visible
  offset) / defect #3 present-as-deferred — all three confirmed in light AND dark.
- Preserved invariants (v0.6.2 stagger, v0.6.4 label offsets): green.

**ALL GREEN → advance to ⑤ report.**
