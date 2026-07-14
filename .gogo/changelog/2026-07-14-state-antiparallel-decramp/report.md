# state-antiparallel-decramp - State anti-parallel jog de-cramp (v0.6.2)

- **shipped:** 2026-07-14
- **members:** 1 (`state-antiparallel-decramp`)
- **version:** 0.6.1 -> 0.6.2
- **verdict:** review APPROVE, test PASS - shipped exactly as planned

## What shipped

The v0.6.1 light-contrast fix exposed an old routing tangle: on the state diagram the `fail` (Loading->Error) and `retry` (Error->Loading) arrows both made their horizontal jog at the **identical mid-y**, collapsing into one merged crossbar with the up/down arrowheads crammed ~3px apart. This release adds one small, tightly-gated geometry pass, `separateAntiParallelJogs`, that runs inside `finishEdges` (right after `separateLanes`) and staggers the two jogs of a genuine collinear anti-parallel elbow pair >= 26px (`JOG_GAP`) apart, each biased toward its own target. The state diagram's `fail`/`retry` now read as **two clearly-separated arrows**, comparably clean to the `clean-fancy` reference - and every diagram that already routes cleanly stays byte-identical. The pass is mirrored byte-for-byte in the interactive runtime twin (`src/render/dom/runtime.ts`) at both call sites (live view + Save-SVG export), guarded by `dom-runtime-parity`.

Key outcomes:
- The de-cramp fires only on a real `A->B`/`B->A` bundle whose interior jog segments are collinear (`|Δalong| < 1`); it is elbow-only, deterministic, and idempotent (a spread pair is no longer collinear, so it never re-fires).
- Regression sweep verified at byte level: only the 4 state-elbow SVG/PNG variants changed; flowchart/class/sequence, `state-*-fancy`, and README heroes are byte-identical.
- The `dom-runtime-parity` guard's `expectedPaths` helper was upgraded to route through the real `finishEdges` (was a partial re-route), turning the twin-drift guard into a true mirror of the shared pipeline.

## Decisions (one line each)

- **D1 - elbow-only fix, or also de-tangle curved (fancy)?** -> **A, elbow-only.** `light`/`dark`/sketch use `edge.style: "elbow"`; `fancy` uses `curved` and already separates cleanly. Curving clean/sketch would erase the elbow-vs-curved distinction that defines those styles. Stated fallback (curve just the anti-parallel pair) was **not needed** - the elbow-stagger met the visual bar on all four variants.
- **Placement** -> inside `finishEdges`, after `separateLanes`, so the pass reads fully-routed geometry and one call site covers flowchart + native state/class.

## Review / Test verdict

**Review:** APPROVE in one round - no blockers or majors; one non-blocking latent-invariant nit (REV-001: a staggered jog could in principle form a new near-collinear overlap with an unrelated third edge), empirically confirmed not observed across the full gallery. **Test:** PASS in one round - the hard visual bar was met on all four elbow variants (no curve fallback), 401 unit + 85 e2e green (a new bite-verified `e2e/state.spec.ts` guard added), byte-level regression sweep clean, two independent regenerations byte-identical (deterministic), and the live interactive twin reproduced the identical stagger with zero console errors.

## Known follow-ups

- **REV-001** (latent, not observed): the pass does not re-run `separateLanes` after staggering; if a future diagram ever exhibits a new near-collinear overlap, the fix is one more `separateLanes` pass after the de-cramp.
- **Curved/fancy anti-parallel de-tangle** - out of scope by D1->A (fancy already separates cleanly); would be a separate, larger bezier change if ever wanted.
- Two incidental, pre-existing, out-of-scope tester notes (sketch PNG export ignoring `--scale`; a session-local Playwright-MCP CDP hiccup) - neither caused by nor blocking this feature.

## Full audit trail

The complete as-built report, per-file changes table, decisions detail, and review/test rounds live in the work folder:
[`.gogo/work/feature-state-antiparallel-decramp/`](../../work/feature-state-antiparallel-decramp/) - see `report/report.md`, `decisions.md`, `review/issues.json`, `test/issues.json`.
