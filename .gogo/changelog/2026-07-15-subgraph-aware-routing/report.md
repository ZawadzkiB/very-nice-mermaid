# subgraph-aware-routing — v0.6.6 (2026-07-15)

**Edges no longer route straight through unrelated subgraph containers.**

## What changed
On dense diagrams, a long edge could route as a straight vertical **through** a
`subgraph` container it doesn't belong to. On `architecture.mmd`, the `BE↔RULES`
edges (`stream context`, `findings`) ran ~400px straight down *inside* the
`Validation Engine` box, impaling past `MCP surface` and `Veris console`. Root cause:
container boxes are computed **post-layout** (`computeSubgraphBoxes`) and were never
fed into the router - it had no obstacle model. The reported case is a
**mixed-membership** crossing (`RULES` is a legit member of the container; `BE` is
outside).

**v0.6.6 adds a single gated, elbow-only `avoidSubgraphs` pass** (run first in
`finishEdges`): for an edge whose long interior trunk pierces a container that does
**not hold both endpoints**, it pushes the trunk just **outside the nearest side**
(margin 28) and drops a short re-entry connector near the interior endpoint (approach
30) - using the edge's own anchor, so `computePerimeterPorts` is **untouched**.

## Key outcomes (verified on real renders, light + dark)
- **`architecture.mmd`:** `BE↔RULES` now route **down the outside** of the
  `Validation Engine` container and re-enter near `RULES` at the bottom - the container
  interior reads **clean**, no impaling verticals. Re-entry connector is short/clean.
  (Independently eyeballed at the ENGINE region.)
- **No regression (paramount):** the `microservices` and `nested-subgraphs` heroes are
  **byte-identical**; **zero** churn to SVG snapshots, `examples/`, and all gallery
  assets (git diff vs the v0.6.5 base is empty). The gate fires on **only**
  `architecture.mmd`'s two edges corpus-wide, idempotent everywhere.
- Prior invariants intact: v0.6.2 anti-parallel stagger, v0.6.4 label offsets, v0.6.5
  convergence + deskewer, FR7 bridges.

## Scope decisions (one line each)
- **D1 → scoped `avoidSubgraphs` re-route** (not full obstacle-aware routing). Fixes the
  reported case with provably zero corpus churn; documented limitations (diagonal /
  nested / multi-obstacle crossings) deferred to a future feature.
- **D2 → low re-entry connector** (keep the endpoint's port; do **not** touch the
  heavily parity-mirrored `computePerimeterPorts`).
- **D3 (surfaced, non-blocking):** `microservices.mmd`'s "Core services" subgraph box
  never renders - a **pre-existing parser bug** (nodes referenced in a top-level edge
  before the `subgraph` declares them; byte-identical to `master`). **Out of scope, not a
  v0.6.6 regression** - optionally its own parser-defect ticket.

## Review / test verdict
- **Review:** APPROVE (0 blockers/majors). REV-001/REV-002 were test-coverage gaps
  (LR-twin branch + drag-parity) - both fixed → verified, twin byte-parity checked
  line-by-line.
- **Test:** PASS (visual bar met) - **426** unit + **85** e2e green, typecheck clean,
  `--version` → 0.6.6, deterministic; live Playwright drag of `BE`/`RULES` keeps trunks
  outside the re-hugged container.

## Files (headline)
`src/geometry/index.ts` (new `avoidSubgraphs` + `lowerReentry` + `computeAvoidContainers`) ·
`src/layout/index.ts` (`finishEdges` container param + wiring) ·
`src/render/dom/runtime.ts` (byte-for-byte twin, both routing paths) ·
`test/geometry.test.ts` + `test/dom-runtime-parity.test.ts` · version 0.6.5 → **0.6.6** ·
regenerated docs (interactive HTMLs re-embed the twin source; **zero rendered-path change**).

## Deferred / follow-up
- **Full obstacle-aware routing** (diagonal / nested / multi-obstacle container crossings) - own feature.
- **Parser bug** (D3): forward-referenced subgraph members never attach - own ticket.

## Audit trail
Full detail in [`.gogo/work/feature-subgraph-aware-routing/`](../../work/feature-subgraph-aware-routing/):
[report.md](../../work/feature-subgraph-aware-routing/report/report.md) ·
[plan.md](../../work/feature-subgraph-aware-routing/plan.md) ·
[decisions.md](../../work/feature-subgraph-aware-routing/decisions.md).
Before → after: `subgraph-aware-routing-flow.mmd` + `before/subgraph-aware-routing-flow.mmd`.
