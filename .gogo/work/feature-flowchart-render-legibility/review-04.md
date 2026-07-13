# Review round 4 — flowchart-render-legibility (FR9 edge-lane separation + 2 UAT-1 fixes)

**Scope:** the FR9 offset `separateLanes` pass + the two UAT-round-1 fixes (label-vs-node
de-collision, hub fan-in `PORT_STEP`/border-fill cap), on top of the shipped-green FR1–FR8.
Prior reviews (rounds 1–3) approved FR1–FR8; those are **not** re-reviewed.

**Reviewed against:** `git diff master` (whole branch is uncommitted working tree), `plan.md`
(FR9 + Approach E), `decisions.md` (D6–D10, **note the D10 reversal**), `uat.md` round 1,
`code-review-standards.md`, `coding-rules.md`, `non-functional-requirements.md`.

**Gates (run this round):**
- `npm run typecheck` — clean.
- `npx vitest run` — **378 passed / 29 files** (incl. `dom-runtime-parity` with the new
  clean+sketch FR9 lane fixtures + the drag-re-route parity case).
- `npm run build` — success (ESM + DTS).

---

## Verdict: **APPROVE** — no open blockers or majors

Two new findings, both below the changes bar: **REV-006** (nit, docs/audit trail) and
**REV-007** (minor, test coverage). Neither blocks the merge; both are AGENT-FIXABLE and can
land in a follow-up sweep.

---

## What I verified clean (the focus areas)

### 1. Byte-parity of the runtime twins (highest risk) — PASS
The inlined `separateLanes` / `shiftLabelOnSeg` / `resolveLabelNodeCollisions` twins in
`src/render/dom/runtime.ts` are byte-identical to `src/geometry`:
- Same constants: `LANE_GAP=26`, `LANE_MIN_OVERLAP=40`, `LANE_MIN_BUNDLE=3`, `LANE_PASSES=1`,
  `PORT_LABEL_PAD=6`, 4 label-node passes.
- Same interior-segment detection `for i=1; i+2<len` and same axis test
  (`|dx|<0.5 && |dy|>1`).
- Same greedy transitive bundling, same sort keys (`along → edge → i`), same mean-centred
  lane targets `n(center + (slot-(k-1)/2)*LANE_GAP)`.
- `nAt` ≡ geometry `n` ≡ layout `round` = `Math.round(v*100)/100` (2dp); `pathPoly(points)` ≡
  `toPath(points,"elbow")`.
- Same run order in both `renderEdges` (live) and `buildSvg` (Save-SVG): **lanes → label-vs-label
  → label-vs-node → bridges**, matching static `finishEdges`.
- The path-rebuild loop differs only in iteration container (`Set` vs numeric-keyed object) —
  irrelevant, because each edge's path is rebuilt independently from its own final points
  (order-invariant output).

The `labelPoly`/`labelBezier` 2dp rounding change is a genuine parity fix, not a regression:
`routeBoxes` now returns `withShift(labelPoly(pts))` = `nAt(midpoint)+shift`, exactly matching
geometry's `lp(labelPoint())` = `n(midpoint)+shift`. It touches a **runtime-only** function, so
it cannot alter the static snapshots/examples (those flow through `geometry.labelPoint`, already
rounded). For an edge with no `labelShift` it is idempotent (`nAt(nAt(mid)) = nAt(mid)`), and for
a shifted label it makes the runtime *match* the static formula exactly — it can only tighten
parity. The clean **and** sketch FR9 lane-fixture parity tests both pass.

### 2. `separateLanes` determinism + safety — PASS
- Fixed iteration order (`along → edge → i`), `used[]` greedy bundling, no RNG/clock →
  deterministic; both twins identical.
- **Idempotent:** after a spread, adjacent lanes are exactly `LANE_GAP` apart, so the
  `|along diff| < LANE_GAP` bundle test is false on a re-run → no re-qualify, no drift.
  `LANE_PASSES=1` is a single, sufficient pass for the detected bundles.
- **No anchor detaches:** the `i>=1 && i+2<len` window excludes the first (`points[0..1]`) and
  last (`points[len-2..len-1]`) segments, so `points[0]`/`points[len-1]` (the node anchors) are
  never moved.
- **Orthogonality preserved:** `simplify()` (geometry) / `simplify()` (runtime) strips collinear
  middles, so a routed elbow strictly alternates H/V — an interior vertical segment's two
  neighbours are always horizontal, and moving both of its endpoints in x only stretches those
  neighbours (their y is unchanged). The elbow stays orthogonal + connected. The label shift
  stays on-axis (`shiftLabelOnSeg` moves only the perpendicular coord).

### 3. `PORT_STEP` 30 + border-filling cap — PASS (no anchor floats off a node)
`step = min(30, (borderLen − 2·PORT_MARGIN)/(k−1))`. The extreme offset is
`(k−1)/2 · step ≤ borderLen/2 − PORT_MARGIN`. `sidePoint()` **unconditionally** applies
`clampOffset(offset, anchorBound(shape,…))`, so for a rect the extreme lands *exactly* on
`cap` (= `anchorBound`) — no overshoot — and for rounded/stadium/tapered shapes it clamps
inward (as before `PORT_SPREAD_FRAC` was removed). The runtime `computePorts` twin is
byte-identical (`Math.min(30, (borderLen − 2*6)/(k−1))`). The FR4 fan test (5-edge hub,
min gap ≥ 24) passes.

### 4. Label-vs-node (UAT issue 1) — PASS, deterministic + parity-safe
`resolveLabelNodeCollisions` pushes a plate off a node by the exact least-penetration overlap
(+ `PORT_LABEL_PAD`), away from the node centre, fixed plate×node order, fixed tie (+y then +x),
4 bounded passes, no RNG — byte-identical in both twins. It de-collides from the **rounded**
centre and only writes back on a real shift (same parity contract as FR6). The
`layout.test.ts` assertions confirm the whole pipeline (`layout()` = lanes → label-label →
label-node → bridges) leaves **no plate overlapping any node box AND no two plates overlapping**
across every fixture + the repro (so the label-node push does not re-introduce a label-label
collision in the corpus). "gRPC stream" is pushed clear *below* Ingress.

### 5. Regression surface — PASS on the corpus
`edgeThroughNodeCount == 0` across all 9 fixtures (runs `layout()`, i.e. post-FR9). No new
node overlaps, bounds still enclose the moved runs (`finishEdges` runs *before* `contentBounds`,
so `edges.flatMap(points)` are the re-laned points). Scope holds: sequence untouched,
`measure.ts` unchanged, FR9 gated to clean elbow only. **Caveat → REV-007:** `separateLanes`
is a no-op on every shipped fixture, so this invariant never actually exercises a lane move.

---

## New findings

### REV-006 — nit (docs / audit trail) · AGENT-FIXABLE · open
`decisions.md` D10 still records the **rejected** path: "RESOLVED → B (space at the source)" and
"`separateLanes` (the offset prototype) is **shelved (exported, unwired)**." The shipped code
does the opposite — the offset `separateLanes` is **wired first** into `finishEdges` (and its
runtime twin), with no dagre `edgesep` space-at-source change. The reversal is recorded only in
`state.md` ("D10 reversal … reverted to the OFFSET (separateLanes). Offset is the settled FR9
approach.") and matches `plan.md` FR9/Approach E. D10 never got a reversal sub-block, so a reader
following it verbatim would treat wired code as dead. Fix = append a D10 reversal RESOLVED block.
No product-code change. (Code is the source of truth; the *code matches the task brief + plan* —
only the decisions log is stale.)

### REV-007 — minor (tests) · AGENT-FIXABLE · open
FR9's actual segment moves have **no automated geometry regression guard**. Verified: the
"no edge cuts a non-endpoint node" invariant (`edgeThroughNodeCount`, `layout.test.ts:138`)
iterates only `fixtures/*.mmd`, and a fresh-build probe shows `separateLanes` fires on **none**
of them (0 bundles of ≥3 near-parallel interior runs). The only shape that re-lanes is the inline
`reproDsl`, checked in `dom-runtime-parity` for byte-parity + `lanes.size ≥ 3`, and in
`layout.test.ts` for plate-vs-node clearance — but **neither asserts the polyline stays
orthogonal/connected or that a moved run doesn't cut a node**, which the plan's Tests table
explicitly requires. Since a lane move shifts an interior run by up to ±`LANE_GAP`, that's a real
(if design-mitigated, eye-verified) coverage gap. Fix = run `reproDsl` through
`edgeThroughNodeCount` + assert H/V alternation and unchanged anchors + idempotency.

---

## Prior findings (rounds 1–3) — unchanged
- **REV-001** (nit) wontfix — shared-geometry anchor-spread ripple; round 5's `PORT_STEP`
  30 + border-fill cap is the same accepted class, still non-breaking (clamp retained).
- **REV-002** (major) verified — native class/state draw `labelPlateSize`; unaffected by FR9.
- **REV-003** (minor) verified — `route.ts` threads `bridges` into class/state async paths.
- **REV-004** (nit) wontfix — viewBox excludes label plates; FR9 points ARE enclosed
  (`finishEdges` before `contentBounds`); label-node push shares the same unobserved risk.
- **REV-005** (nit) verified — `bridgedPath` multi-hop skip byte-identical in both twins.

---

**Verdict: APPROVE**
