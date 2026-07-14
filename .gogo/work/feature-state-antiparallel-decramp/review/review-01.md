# Review — round 1 · feature `state-antiparallel-decramp` (v0.6.2)

- **Branch:** `release/v0.6.2` (working tree, uncommitted)
- **Reviewer posture:** fresh eyes, adversarial, did NOT write this code
- **Date:** 2026-07-14
- **Scope reviewed:** `src/geometry/index.ts` (`separateAntiParallelJogs` + `JOG_GAP`),
  `src/layout/index.ts` (wiring in `finishEdges`), `src/render/dom/runtime.ts`
  (runtime twin + both call sites), `src/cli/run.ts` + `package.json` (0.6.1→0.6.2),
  `test/geometry.test.ts`, `test/dom-runtime-parity.test.ts`, `test/cli.test.ts`,
  regenerated assets (state elbow variants).

## Verdict: **APPROVE** — no open blockers or majors

The change does exactly what `plan.md` (FR1–FR5), `decisions.md` (D1→A, elbow-only),
and the hard visual bar in `state.md` require, and nothing more. One latent,
verified-not-observed nit (REV-001) is logged for the audit trail; it does not gate ship.

---

## What I verified (and how)

### 1. Twin byte-parity (FR4) — PASS
The runtime `separateAntiParallelJogs` is output-equivalent to the geometry one:
- **Constants:** `JOG_GAP = 26` both sides (`= LANE_GAP`); interior-jog detection
  `i>=1 && i+2<len` with the same `0.5`/`1` thresholds; collinear tolerance `<1`
  (geometry `every(<1)` ≡ runtime `none(>=1)`); `1e-6` no-move guard.
- **Primitives:** `n` ≡ `nAt` (`Math.round(v*100)/100`), `toPath(pts,"elbow")` ≡
  `pathPoly(pts)` (identical `M x y L …` formatting — the established `separateLanes`
  parity), `moveLane` and `shiftLabelOnSeg` are line-for-line identical (the runtime's
  local `moveLane` matches geometry's; `shiftLabelOnSeg`'s literal `26` == `LANE_GAP`).
- **Floating-point order identical:** geometry `jogs.reduce((s,j)=>s+j.seg.along,0)`
  and runtime `let sum=0; for(const j of jogs) sum+=j.seg.along` both fold the
  **post-sort** jogs array in the same order → same mean → same lanes.
- **Group iteration order equivalent:** geometry `Map` iterates insertion order;
  runtime `for…in` over a plain object iterates non-integer keys in insertion order —
  and every key contains a `"|"` (node ids are `[A-Za-z0-9_]+`), so keys are never
  integer-like and never collide with prototype names. Group processing is
  disjoint-per-pair anyway, so order can't affect output.
- **`from`/`to` threading is an equivalence, not a divergence:** geometry reads
  `edges[i].from/.to` (`RoutedEdge extends DiagramEdge`); the runtime passes the
  parallel `edgeEls` array, and both `routed` (renderEdges) and `routesB` (buildSvg)
  are built via `edgeEls.map((e,i)=>…)`, so index `i` aligns.
- **Tie-break (`x.target - y.target || x.edge - y.edge`)** depends on edge-index
  consistency between the two spaces — the SAME pre-existing invariant `separateLanes`
  already relies on (its sort uses `s.edge`), which the `dom-runtime-parity` guard has
  been enforcing. Not a new risk.
- **Guard executed for real:** the extended `dom-runtime-parity` test drives a genuine
  anti-parallel state fixture (`Loading↔Error` + the `Loading→Ready` no-op sibling) and
  byte-compares `toSvgString()` to the static SVG; `expectedPaths` now routes through
  the REAL `finishEdges` (a faithful mirror, not a partial re-route). **Ran it: green.**

### 2. Surgical gate / no regression (FR3) — PASS
- Single edge → group size `<2` → skip. Non-reversed fan (`A→B`, `A→C`) → distinct
  keys, each group size 1 → skip. Already-apart pair → collinear check (`<1`) fails →
  skip. Curved → early `return`. All covered by `test/geometry.test.ts` no-op cases.
- Confirmed in the asset diff: `Loading→Ready` (`M 84 276 L 84 306 L 46 306 L 46 336`)
  is **byte-identical**; only `fail`/`retry` moved.
- Group key is collision-safe (`"|"` delimiter can't occur in a node id; the key always
  contains `"|"` so it can never equal `__proto__`/`constructor`).

### 3. Determinism / idempotence (FR5) — PASS
No clock/RNG. A spread pair sits `JOG_GAP=26` apart → not collinear (`<1` tol) → never
re-fires. `test/geometry.test.ts` asserts a second and third application is byte-stable.

### 4. Direction-correctness (FR2) — PASS
Sort by target-side perpendicular coord ascending, lanes centred on the bundle mean:
`retry` (target Loading y=276) → y=293 (up), `fail` (target Error y=336) → y=319 (down).
Matches the plan's worked example and the emitted SVG. No tie in the real case (targets
differ); a hypothetical tie is broken deterministically and identically in both twins.

### 5. Anchors (FR1) — PASS
Only `points[seg.i]` and `points[seg.i+1]` are mutated; `points[0]`/`points[last]` are
never touched. Asserted in the unit test and confirmed in the SVG (border anchors
114/276, 147/336, 177/336, 144/276 unchanged; the two jog endpoints moved together, so
the crossbar stayed horizontal and the elbow orthogonal).

### 6. Tests, build, conventions — PASS
- `npm run typecheck`: clean (reports `very-nice-mermaid@0.6.2`).
- `npx vitest run`: **401/401 green.**
- Version bump consistent across `package.json`, `src/cli/run.ts`, `test/cli.test.ts`.
- New code matches surrounding idiom exactly — the pair-grouping is the same
  `computeLabelShifts` idiom, all `@link` JSDoc targets resolve, the test's hardcoded
  `26 - 1e-6` matches the existing `separateLanes` test convention (neither gap const is
  exported). No dead/mocked code.

### 7. Regression posture — sanity-checked, consistent
- Assets: only the four state-elbow PNG/SVG changed geometry; heroes
  (`assets/example-*.png`) absent from the diff (byte-identical).
- Interactive HTML: flowchart/class/`state-*-fancy` diffs are **runtime-blob-only**
  (`+74`, 0 payload deletions — verified); only the four state-elbow HTMLs also carry a
  changed baked `__vnm_payload` (`+76/-1`). Exactly the expected footprint.

### 8. Hard VISUAL acceptance bar (`state.md`, D1) — MET
Eyeballed the regenerated `examples/png/state-clean-light.png`: `fail` and `retry` now
render as two clearly separated staircases (fail jogs low into Error, retry jogs high
into Loading), distinct arrowheads, no merged crossbar — as clean as the `fancy`
reference. No need to escalate to option B (curving the pair).

---

## Findings

| id | severity | status | title |
|----|----------|--------|-------|
| REV-001 | nit | open | Post-pass runs after `separateLanes` with no re-run — a staggered jog could in principle create a new near-collinear overlap with an unrelated third edge (latent, **not observed**; state corpus is clean). NEEDS-USER-DECISION, no change needed to ship. |

## Considered and dismissed (not filed — unverified/intended, to avoid padding)
- **Duplicate same-direction bundle (`A→B`, `A→B`) would also be de-crammed.** Intended
  — the plan explicitly scopes to an "anti-parallel *or duplicate* bundle"; and such
  full-overlap runs are already separated by `separateLanes` (overlap ≫ 40) before this
  pass, so they arrive `≥26` apart → not collinear → skipped. Beneficial, not a defect.
- **Test hardcodes `26` rather than importing `JOG_GAP`.** `JOG_GAP`/`LANE_GAP` are
  module-private and the existing `separateLanes` test hardcodes `26 - 1e-6` the same
  way — matches convention, not a deviation.

**Verdict: APPROVE** (no open blockers/majors) — advance to the test phase.
