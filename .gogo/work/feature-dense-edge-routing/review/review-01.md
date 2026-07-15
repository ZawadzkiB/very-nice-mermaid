# Review round 01 — dense-edge-routing (v0.6.5)

**Reviewer:** fresh-eyes staff review (③). **Branch:** `release/v0.6.5`.
**Scope reviewed:** working-tree diff vs `master` — `separateConvergentJogs` (defect #1,
new gated elbow-only pass in `finishEdges`) + the `computePerimeterPorts` deskewer
(defect #2), both mirrored in the `vnmRuntime` twin; version bump 0.6.4→0.6.5.
Subgraph-aware routing (#3) is DEFERRED by the accepted plan — its absence is not flagged.

## Verdict: APPROVE — advance to ④ test

No open blockers or majors. Two non-blocking findings (1 minor, 1 nit), both AGENT-FIXABLE
and both safe to defer or fold into ④. Typecheck green; full suite **413/413 green**
(~25s); byte-identity for clean diagrams **verified** (zero snapshot/example/gallery/hero
churn; interactive HTML changed only in the inlined runtime *source*, zero rendered-SVG
markup lines). The two as-built passes are byte-identical in output across the twins and
the three documented as-built deviations are sound.

## What I verified (and how)

- **Typecheck + tests.** `npm run typecheck` clean; `npm test` → 29 files / 413 tests pass.
  New unit tests (`test/geometry.test.ts`) assert the exact fan (S1=118, S2=144, S3=170,
  mean=170, all ≤ mean so no lane crosses the border), idempotency, no-op on a 2-edge
  bundle / already-spread / curved, and disjointness from the v0.6.2 anti-parallel case;
  deskewer tests assert the ±15 nudge toward the far node, no-op on a straight A→B→C
  pass, and no-op on a lone-top-only node.
- **Byte-identity / gating (FR4).** `git diff --stat` shows **no** `.snap`, example,
  gallery, or hero output changed. A per-file scan of all 18 `docs/interactive/*.html`
  found **0** changed rendered-SVG markup lines — every change is inlined runtime JS
  source. This corroborates the CONVERGE_MIN=3 gate (zero ≥3 collinear border bundles in
  the corpus) and the far-node deskewer gate (0 corpus firings).
- **Twin output-parity (the project's #1 trap).** Compared the geometry pass and its
  `runtime.ts` twin line-by-line: identical `JOG_GAP=26`, `CONVERGE_MIN=3`, `PORT_STEP=30`,
  `PORT_MARGIN=6`; identical border-run pick (`len-3` target / `1` source) and interior
  guard (`i>=1 && i+2>len`); `n`≡`nAt` (both `Math.round(v*100)/100`); `toPath`≡`pathPoly`
  (elbow); identical bucket key `node|V|H|toward|round(along)`; identical sort keys
  (`far`, then `edge`) and the closed-form lane `mean + (s − (k−1)/2 − toward·(k−1)/2)·JOG_GAP`;
  identical deskewer (far-node heading, opposite-sign gate, room gate). `moveLane`/
  `shiftLabelOnSeg` are the shared helpers already parity-tested for anti-parallel.
- **Parity fixture genuinely exercises both passes through the REAL `finishEdges`.** The
  new `dom-runtime-parity` case builds a dense flowchart, asserts ≥3 distinct RULES-top
  jog levels (proves convergence fired — pre-pass they collapse to one crossbar) and
  MCP in.x ≠ out.x (proves the deskewer fired), then compares the live runtime's edge
  paths to `expectedPaths`, which routes through `finishEdges` (now including
  `separateConvergentJogs`). Not a partial re-route — the correct guard.
- **Determinism / cross-twin ordering.** Bucket keys always contain `|`, so both the
  geometry `Map` and the runtime plain-object iterate in insertion order (never numeric-
  index order); insertion order is the shared `edges`/`edgeEls` order. Sort by `far` is
  offset-invariant within a bucket (all members shift by the same per-axis constant),
  and dagre integer coords make `n()` rounding exact — no ULP tie flip. No RNG/clock.
- **Preserved invariants.** `separateAntiParallelJogs` (v0.6.2) is untouched byte-for-byte;
  label offsets (v0.6.4) and all state/class parity fixtures stay green.
- **`|` delimiter safety.** Parser restricts node ids to `[A-Za-z0-9_]+` (src/parser/index.ts
  214/220/272/372/388), so the bucket keys cannot collide across nodes — the claimed
  invariant holds.

## As-built deviations — judged sound

1. **Gate ≥3 (`CONVERGE_MIN`), not ≥2.** Correct: fires on the real knot (RULES 4-edge,
   BE 3-edge) with zero fixture churn; 2-edge cross-pairs stay with anti-parallel.
2. **Anchor away from the border, not literal centre.** Correct and necessary — a
   symmetric centre would push the border-nearest lane across the border (RULES border at
   1220). The translated fan keeps the nearest lane on the mean and opens outward; the
   unit test pins the exact values.
3. **Deskewer keys on far-node direction, not port heading.** Correct — dagre runs both
   MCP edges straight down its column, so the immediate bend is a false 'aligned'; the
   far-node gate fires on the true skewer and no-ops on a genuine straight pass (0 corpus
   firings). Signature dropped the planned `EdgePorts` arg and recovers the side from
   routed geometry instead — a reasonable, robust simplification, matched in the twin.

## Findings

| id | sev | pri | title |
|----|-----|-----|-------|
| REV-001 | minor | P2 | Dead `pair` field in geometry's `separateConvergentJogs` Rec (absent from the runtime twin) |
| REV-002 | nit | P3 | "No edge is moved twice / provably disjoint" is slightly overstated (verified benign) |

### REV-001 (minor) — dead `pair` field, twin asymmetry
`src/geometry/index.ts` declares `pair: string` on the convergence `Rec` (1159), computes
it per edge (1192), stores it (1200), and threads it through jogOf's `Omit<Rec,"edge"|"pair">`
return type (1165) — but never reads it. The runtime twin's `Rec` (runtime.ts:1520) omits
it. Dead code, and a source-shape divergence between the parity twins (output-equivalent,
so parity holds). Fix: delete the field, its computation, and the `|"pair"` in the Omit.

### REV-002 (nit) — the double-move invariant is overstated but verified safe
The comment (geometry 1141-1143) and plan claim the pass is 'provably disjoint' from the
anti-parallel pass. Node-PAIR and node-SIDE keys are not mutually exclusive, so a source
endpoint's interior run (i=1) could be moved by both. Verified benign: convergent's
absolute `moveLane` overwrites, the path rebuilds from final points, it is deterministic
and byte-identical across both twins, and it never fires on the corpus (0 convergent
firings; on architecture.mmd anti-parallel does not touch the RULES bundle). Soften the
wording (or add a defensive skip). No behavioural change required.

## Not issues (checked, clean)
- No user input / injection / traversal surface; passes are pure numeric geometry.
- No secrets, no logging, no silent failure (geometry passes correctly no-op on
  non-elbow / degenerate / missing-box inputs, consistent with the shipped passes).
- Performance: O(E) bucketing + small per-bucket sort, once per `finishEdges` — fine.
- Version bump complete: `package.json`, `src/cli/run.ts`, `docs/_config.yml`, and the
  `test/cli.test.ts` `--version` assertion all → 0.6.5.
