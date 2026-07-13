# diagram-render-fixes-v0.6.1

- **shipped:** 2026-07-13
- **type:** render/theme bug fixes (no API change)
- **branch:** `docs/regenerate-0.6.0`

Three render issues spotted on the v0.6.0 gallery/README turned out to be live renderer bugs, not stale images (the images were proven byte-identical to a fresh render). They collapsed into two root causes and shipped as three small, low-risk fixes, then the committed galleries and README heroes were regenerated deterministically:

- **FR1 - light-theme edge contrast (Issues 2 + 3).** One theme token: light `colors.edge` `#8a93a6` -> `#69728a` (~4.5:1 on the `#f7f8fb` background, matching the dark theme's legibility). Colour-only, so dark/fancy and every layout stay byte-identical. This was the shared cause of both the merged state-light thumbnails and the invisible Report-failure arrowheads.
- **FR2 - perpendicular final approach (Issue 1a).** New shared helper `perpendicularizeEntry()` swaps the last elbow corner when a route's closing segment runs parallel to the entered border (the "doubling-back" stub), so the arrowhead points into the node. Applied to both the naive-elbow branch and `elbowThrough`, covering every side - and as a bonus it also fixed the flowchart `prod->Done` / `fail->Done` side-entries. Routes that already enter perpendicular are left byte-identical.
- **FR3 - label off a parallel run (Issue 1b).** `resolveLabelEdgeCollisions` now also escapes a foreign parallel run that bisects a label by sliding the label along its own axis, lifting the `give up` label clear of the line while keeping it on its own edge.

Both geometry fixes are mirrored byte-for-byte in the interactive-export DOM runtime twin (`src/render/dom/runtime.ts`), locked by a `dom-runtime-parity` test. Two provenance additions rounded it out: `scripts/generate-heroes.mjs` (`npm run heroes`, D5) so the four hand-rendered README heroes now regenerate deterministically, and a reconstructed `fixtures/cache-lookup.mmd` (D6) as the committed source for the `example-sketch` hero.

## Key outcomes

- All three user-reported v0.6.0 render defects fixed at the renderer level (not by re-exporting stale images).
- Interactive HTML export stays in lockstep with the static renderer (byte-parity twin + a dedicated parity test).
- README heroes are now scripted (`npm run heroes`) and every committed gallery/hero asset was regenerated deterministically; `example-fancy` and all `*-fancy` assets were left untouched.

## Decisions (one-liners)

- **D1/D2 - Issues 2+3 = contrast, not geometry.** A light-vs-dark discrepancy on identical geometry is logically forced to be contrast; darken to dark-parity (`#69728a`) for the lowest-risk, uniformly-better fix.
- **D3 - fix both Issue 1a and 1b** in shared geometry plus the runtime twin (the label sits on a line even in high-contrast dark - a real placement bug).
- **D5 - add `generate-heroes.mjs`** to close the hand-rendered-hero provenance gap.
- **D6 (escalated, user-resolved) - `example-sketch` is a cache-lookup flowchart, not the state machine** the plan assumed; reconstruct it as `fixtures/cache-lookup.mmd` (verified pixel-perfect) to keep the hero and truly resolve provenance.

## Review / test verdict

Review **APPROVE** (fresh-eyes, 1 round, 3 non-blocking findings - 2 fixed: parity-test coverage + doc/test, 1 deferred nit REV-003); test **GREEN** with 397/397 unit + 84/84 e2e, all three issues verified against real pixels and the interactive twin driven in a real browser, zero regressions, deterministic 2x re-render.

## Known limitation / follow-up

REV-003 (deferred): the FR3 parallel-escape does not clamp the label slide to the label's own-run extent, so a long co-extensive bisecting run could over-slide the label - not observed in any real diagram; carried forward as the existing `flowchart-render-legibility` REV-008 own-run-clamp follow-up.

## Full audit trail

The complete detail - plan, per-file changes table, decisions rationale (D1-D6), review round, test round, and the as-built diagram bundle - lives in [`.gogo/work/feature-diagram-render-fixes-v0.6.1/`](../../work/feature-diagram-render-fixes-v0.6.1/) (`report/report.md`, `decisions.md`, `review/`, `test/`).

## Diagrams

- **flow** (`diagram-render-fixes-v0.6.1-flow.mmd`) - the render-edge pipeline with the shipped fix sites (FR1 theme token, FR2 `perpendicularizeEntry()`, FR3 parallel-escape), the byte-parity runtime twin, and the new hero script + fixture. A `before/` set captures the same pipeline with the three defects at their code sites for side-by-side compare.
- **sequence** (`diagram-render-fixes-v0.6.1-sequence.mmd`) - the render call path through the fix points and its mirror in the interactive-export twin.
