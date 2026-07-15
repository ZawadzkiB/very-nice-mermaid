# Review round 01 — subgraph-aware-routing (v0.6.6)

**Reviewer:** fresh-eyes staff review (③). **Branch:** `release/v0.6.6`.
**Scope reviewed:** working-tree diff vs `master` — the new gated, elbow-only post-route
pass `avoidSubgraphs` (defect #3, D1=A) + `computeAvoidContainers` + the `AvoidContainer`
type in `src/geometry/index.ts`, threaded through `finishEdges`/`layout()`/`applyPositions()`,
mirrored byte-for-byte in the `vnmRuntime` twin (`renderEdges` + `buildSvg`, via
`avoidContainersFrom`); the `dom-runtime-parity` reference fix (L188-196); new unit tests;
version bump 0.6.5→0.6.6 across the four sites. Generated assets (dist/, docs/interactive,
examples/, assets/) were out of scope per the orchestrator.

## Verdict: APPROVE — advance to ④ test

No open blockers or majors. Two non-blocking findings (1 minor, 1 nit), both AGENT-FIXABLE
and both pure test/doc additions (no product-code change). Typecheck green; the two affected
files run **107/107 green** (`test/geometry.test.ts` 66 + `test/dom-runtime-parity.test.ts`
41, incl. the STATE re-route parity case). The pass is byte-parity across both twins, the
gate is provably narrow (D2=A honoured — `computePerimeterPorts` untouched), and the design
decisions D1=A / D2=A are faithfully implemented.

## What I verified (and how)

- **Typecheck + tests.** `npx tsc --noEmit` exit 0. `vitest run` on the two changed test
  files → 107 pass, including the new `avoidSubgraphs` unit suite and the new architecture
  `avoidSubgraphs` parity cases (fires-check + `toSvgString()==renderSvg` light AND dark).
- **Twin OUTPUT-parity (this repo's #1 trap).** Compared `avoidSubgraphs` / `lowerReentry`
  in `src/geometry` against the inlined twin in `src/render/dom/runtime.ts` line-by-line:
  identical constants (MARGIN=28, MIN_CROSS=120, APPROACH=30); identical elbow-only + empty
  guard; identical interior-run rule (`i>=1 && i+2<len`, `<0.5`/`>1` axis thresholds);
  identical both-in skip (`from∈c && to∈c`) and idempotency approach-guard
  (`(i===1 && from∈c) || (i===len-3 && to∈c)`); identical strictly-inside cross-span gate
  (`along<=perpLo || along>=perpHi`) and `>=MIN_CROSS` parallel-overlap gate; identical
  nearest-side `<=` tie-break + MARGIN math; identical longest-run `best` selection
  (`runLen > best.runLen`, strict → first-found wins); identical moveLane (shared helper in
  geometry, byte-equal local arrow in the twin) and lowerReentry. `n`≡`nAt` (both
  `Math.round(v*100)/100`); `toPath(...,"elbow")`≡`pathPoly` (both `M x y L x y …`);
  `shiftLabelOnSeg` proximity uses `LANE_GAP`(=26) in geometry and the literal `26` in the
  twin — equal. `from`/`to` are threaded differently (geometry reads `e.from`; the twin reads
  the index-aligned `pairs[ei]`=`edgeEls[ei]`) with indices aligned — the sanctioned pattern.
- **Container-obstacle parity.** `computeAvoidContainers` (box via `computeSubgraphBoxes` →
  `subgraphBox`, members via `resolveMemberNodes`, skip-empty) mirrors `avoidContainersFrom`
  (box via `subgraphWorldBox`/`subgraphAbsBox` → `sgBoxFrom`, members via `subgraphMembers`,
  skip-empty), both iterating `subgraphs` in the same order → identical container array. The
  box derivation is the same one already parity-guarded for subgraph-rect rendering.
- **Parity reference is faithful, not bypassing (focus area 4).** `expectedPaths` now builds
  `computeAvoidContainers(model.subgraphs, boxes)` in the SAME offset-removed world space as
  `boxes` and passes it (not `[]`) into the REAL `finishEdges` — so the guard actually covers
  the new pass. The `genuinely fires` test asserts a >200px BE→RULES interior vertical run
  sits outside ENGINE's [left,right] (a real check, not a tautology).
- **Gate precision / no-regression.** Traced the gate on the synthetic pierce and reasoned it
  fires only on a true interior pierce (strictly-inside cross-span + >=120 parallel overlap);
  an entry sliver (<=~40px) and both-in edges (both subgraph heroes) no-op. Orchestrator
  corpus scan confirms the ONLY firing is architecture.mmd e5/e6 with all snapshots
  byte-identical — consistent with the code.
- **Idempotency & determinism.** No RNG/clock. Second-pass no-op holds by two independent
  mechanisms: the pushed trunk's `along` (=side=perpHi+MARGIN) fails the cross-span gate, and
  the lowered re-entry residual is caught by the `i===len-3 && to∈c` approach-guard regardless
  of length (unit test `is idempotent` confirms points + path stable). moveLane changes only
  the perpendicular coord and lowerReentry only the parallel coord, so the elbow stays
  orthogonal + anchored (same invariant as separateLanes).
- **State/class no divergence (checked a live drift risk).** `mountState`/`mountClass` reuse
  `vnmRuntime`, which now unconditionally calls `avoidSubgraphs(...avoidContainersFrom(...))`.
  Confirmed both state and class layouts set `subgraphs: []` (native/state/layout.ts:68,
  native/class/layout.ts:58) → `avoidContainersFrom` yields no containers → the runtime pass
  no-ops, matching the static `finishEdges` (no 5th arg). The `order-state` parity case passes.
- **Threading.** `finishEdges` runs `avoidSubgraphs` FIRST (before `separateLanes`) in both
  geometry and both twin call sites (renderEdges before `foldLabelShifts`; buildSvg likewise).
  `native/state` passes no 5th arg (default `[]`) → no-op. `applyPositions` recomputes
  containers from moved boxes (FR5).

## Findings

| id | sev | status | title |
|----|-----|--------|-------|
| REV-001 | minor | open | Horizontal (LR) re-route branch ships entirely untested — plan claims both axes |
| REV-002 | nit | open | Drag/reposition path re-runs avoidSubgraphs but no test fires it under repositioning |

Both AGENT-FIXABLE, both pure test/doc additions. Neither blocks merge; fold into ④ test.

- **REV-001 (minor).** `avoidSubgraphs` advertises both axes, but every test + the only corpus
  firing is TB (vertical). The `isHorz`-fires path — moveLane's `vertical=false` branch and
  lowerReentry's x-branch, in geometry AND the twin — never executes. Symmetric to the verified
  vertical branch and byte-parity across twins, so low risk, but an unexercised twin branch the
  plan claims works warrants a guard. Fix: add an LR pierce unit test (and optionally an
  `flowchart LR` parity fixture that fires the pass).

- **REV-002 (nit).** plan.md promises drag coverage ("dragging RULES/BE re-runs the live pass …
  extends the subgraph-drag e2e coverage"); the diff adds none, and existing drag e2e runs on
  fixtures where the pass no-ops. The drag path is the same mirrored, deterministic, idempotent
  pass, so risk is low — but the named coverage should exist or the plan line be softened.

## Notes (verified benign — not filed)

- `computeAvoidContainers` recomputes `computeSubgraphBoxes` in `layout()`/`applyPositions()`
  where a subgraph-box map was already computed nearby — a negligible, deterministic recompute
  that also matches the runtime (which recomputes via `subgraphWorldBox`). Not worth a change.
- The lowered re-entry leaves a short horizontal approach that grazes the container interior
  near the endpoint — this is the accepted D2=A tradeoff (top-entry + low connector), explicitly
  documented in the plan, not a defect.
