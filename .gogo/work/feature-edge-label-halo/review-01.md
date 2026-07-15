# Review round 01 — `edge-label-halo` (v0.6.4)

**Reviewer:** fresh-eyes code review (phase ③) · **Date:** 2026-07-15 · **Branch:** release/v0.6.4
**Scope reviewed:** `git diff -- src test package.json docs/_config.yml` against the accepted plan
(D1=A perpendicular offset · D2=A tighten to shared plate · D3=A defer CLI levers).

## What the change does
Option-(d) perpendicular label offset for routed edges (flowchart/class/state): a new
`resolveLabelLineOffsets` + `homeSegment` + `LABEL_LINE_GAP=3` in `src/geometry/index.ts`, folded
FIRST into `finishEdges` via `offsetLabelsOffLine` (`src/layout/index.ts`) so the existing
de-collision chain runs on the offset centres. Mirrored byte-for-byte in the `vnmRuntime` twin at
both `renderEdges` (live) and `toSvgString` (Save-SVG). `labelPlateCorners` feeds `contentBounds`
(static) and `boundsAbs` (Save-SVG) so an off-line plate never clips. Sequence `messageLabel`
tightened to the shared plate formula (D2). Version bumped 0.6.3 → 0.6.4 across 4 sites.

## Verification performed
- **Build + tests:** `npm run build` clean; `npx vitest run` → **29 files / 401 tests passed**,
  including `dom-runtime-parity`. (evidence: /tmp/vnm_test.log)
- **Offset magnitude/direction (the flagged trap):** confirmed `dist = (horizontal ? p.h : p.w)/2 + gap`
  — a vertical home segment moves the plate RIGHT by **half its width** + gap (not the naive
  half-height), so a wide label fully clears a vertical run. Snapshot evidence: class `visits`
  (vertical 2-pt line) shifts right by 31.2 = 56.4/2 + 3; class `extends` (curved) lifts up by
  13.5 = 21/2 + 3.
- **Static ↔ runtime byte-parity:** `homeSegment` logic, `LABEL_LINE_GAP=3` vs literal `3`,
  `round` ≡ `nAt` (`Math.round(v*100)/100`), `labelPlateSize` ≡ `plateSizeOf` (`0.6·size+6`/`lh+2`),
  and the fold/writeback (`round(centre)+shift`) all match. Pass ORDER matches in all three
  pipelines, including a NEW final label-label pass added after node de-collision (justified: node
  de-collision can repack an offset label into a neighbour) — present and identical in `finishEdges`,
  `renderEdges`, and `toSvgString`.
- **Home-segment vs `labelPoint`:** matches for true-bezier curved (4-pt tangent proxy = B'(0.5)),
  2-pt lines, and >2-pt polylines. One divergence found for curved+waypoints (see REV-001).
- **Bounds:** `labelPlateCorners` included in `layout()`, `applyPositions()`, and the Save-SVG
  `boundsAbs` — both static sides and the parity twin.
- **Determinism:** no `Date.now`/`Math.random`/`performance.now` in the changed src.
- **Snapshot churn:** every `<path d=...>` (edge/node geometry) and every `viewBox`/`width`/`height`
  is byte-identical across the diff; only edge-label `<rect>`/`<text>` positions moved. Confirms the
  orchestrator's audit.
- **ESM boundary:** sequence `svg.ts` imports only type-only + browser-safe geometry/style/sketch
  modules; no Node built-in reaches the browser-safe core. (Note: it *inlines* the plate formula
  rather than importing `labelPlateSize` — see REV-002 — matching the existing flowchart sink.)
- **Reachability probe:** rendered fancy (curved) multi-rank labeled edges in TD/LR/RL; the router
  yields 6-point staircases whose mid segment `homeSegment` and `labelPoint` agree on, so REV-001 is
  latent (not currently mis-rendered).

## Findings

| id | sev | pri | file:line | summary | fix |
|----|-----|-----|-----------|---------|-----|
| REV-001 | minor | P2 | src/geometry/index.ts:58 (+ :391, :1421-1423; layout:148; runtime:1636) | Offset axis keys off theme `edgeStyle`, not `labelPoint`'s per-edge segment — a curved edge routed via waypoints to a 4-point elbow is misread as a bezier, so the perpendicular axis can be wrong. Parity-safe, latent (no 4-pt curved elbow reachable via current router). | AGENT-FIXABLE |
| REV-002 | nit | P3 | src/native/sequence/svg.ts:192-193 | Sequence re-inlines the `0.6·size+6`/`lines·lh+2` plate padding (4th copy) instead of sharing `labelPlateSize`. Convention-consistent, drift-low. | AGENT-FIXABLE |

No blockers. No majors. Both findings are non-blocking; REV-001 is a latent correctness/documented-invariant gap worth fixing before the offset meets a curved multi-rank labeled edge in the wild.

## Verdict
**APPROVE** — no open blockers or majors; CLEAN to advance to test (④). REV-001 (minor) and REV-002 (nit) recorded for implement to pick up.
