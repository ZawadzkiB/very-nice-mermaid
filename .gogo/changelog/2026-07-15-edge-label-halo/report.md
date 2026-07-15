# edge-label-halo — v0.6.4 (2026-07-15)

**Edge labels no longer break the line they sit on.**

## What changed
Every labelled edge on a flowchart / class / state diagram used to look broken: the
label was anchored dead-centre **on** the edge line, and then an **opaque, text-width
background plate** was painted over the line in a later draw layer — blanking a
text-width stretch of an otherwise-continuous line (worst on long labels like
"author rules"). It hit the shared label renderer, so **sequence diagrams** showed the
same halo masking the lifelines behind message labels.

**v0.6.4 lifts each routed-edge label off its own line** (a deterministic perpendicular
offset — the "graphviz" behaviour), so the line now reads **continuous** and the label
sits cleanly beside/above it. Sequence labels (which already ride above their arrow) were
tightened onto the shared minimal plate.

## Key outcomes
- **The line stays continuous** under every label on flowchart/class/state — verified on
  the user's real `architecture.mmd` (labels `chat`, `reason`, `author rules`,
  `stream context`, `proxy chat auth`, `REST`, `findings`) at clean+sketch × light+dark,
  plus the gallery diagrams.
- **No regressions:** node positions and edge paths are untouched — **only `labelPos`
  moves**. No label overlaps a node or another label; off-line labels stay in-frame; the
  v0.6.2 `fail`/`retry` anti-parallel stagger still holds; the `dom-runtime-parity`
  byte-guard is green.
- **One choke point:** a single `resolveLabelLineOffsets` pass folded **first** into
  `finishEdges`, so the existing FR6 / label-vs-node / label-vs-edge de-collision passes
  run on the offset centres and stay coherent — mirrored byte-for-byte in the DOM runtime
  twin.

## Decisions (one line each)
- **D1 → perpendicular offset (option d).** The only fix that makes the line continuous;
  tighten-only left a visible break.
- **D2 → sequence tightened** to the shared `labelPlateSize`; thin dashed-lifeline
  crossing accepted (standard).
- **D3 → deferred** the `--no-label-halo` / `--label-padding` CLI levers (the default fix
  removes the need).
- **As-built refinement:** offset magnitude = the plate's half-extent *facing* the line
  (half-**width** for vertical runs, not a fixed half-height) — required so wide labels on
  the common TB/TD vertical edges actually clear the line.

## Review / test verdict
- **Review:** CLEAN / APPROVE (0 blockers, 0 majors). REV-001 (offset-axis cubic gate)
  fixed; REV-002 (byte-identical plate-formula nit) deferred.
- **Test:** ALL GREEN — 405/405 unit (incl. 37 `dom-runtime-parity`), 85/85 e2e,
  byte-deterministic renders, plus hands-on real-PNG visual verification. TEST-001 was a
  test-only path-correlation fix.

## Files (headline)
`src/geometry/index.ts` (new `resolveLabelLineOffsets` + `homeSegment`) ·
`src/layout/index.ts` (`offsetLabelsOffLine` first in `finishEdges` + `labelPlateCorners`
→ `contentBounds`) · `src/render/dom/runtime.ts` (byte-for-byte twin) ·
`src/native/sequence/svg.ts` (tightened `messageLabel`) · version 0.6.3 → **0.6.4** ·
regenerated docs/examples/heroes.

## Audit trail
Full detail in [`.gogo/work/feature-edge-label-halo/`](../../work/feature-edge-label-halo/):
[report.md](../../work/feature-edge-label-halo/report/report.md) ·
[plan.md](../../work/feature-edge-label-halo/plan.md) ·
[decisions.md](../../work/feature-edge-label-halo/decisions.md) ·
[review-01.md](../../work/feature-edge-label-halo/review-01.md) ·
[test-01.md](../../work/feature-edge-label-halo/test-01.md).
Before → after diagram: `edge-label-halo-flow.mmd` + `before/edge-label-halo-flow.mmd`.
