# Test — round 2 (fix snapshot)

Rendered from `test/issues.json`. Round 1 exercised all four tiers hands-on (CLI SVG/PNG,
library sync+async, real-Chromium interactive) and found two fixable issues; this round
records their disposition after the in-context fix.

| id | severity | status | disposition |
|---|---|---|---|
| TEST-001 | minor (P2) | **fixed** | State `[*]` start/end pseudo-markers now stay CLEAN circles in the interactive + exported (Save SVG/PNG) sketch view — a sketch-gated `PositionedNode.stateMarker` set by `layoutState`, drawn as a solid dot / ringed circle by the runtime (live + `toSvgString`). The tester's own RED e2e regression now passes. |
| TEST-002 | nit (P3) | **wontfix** | Accepted — invalid `style` is compile-catchable (typed `RenderStyle` union); the CLI validates the untyped string boundary. Runtime-validating every library entry is disproportionate. |

Two additional observations the tester noted are **out of scope** (pre-existing, reproduce in
clean mode, orthogonal to sketch): cross-diagram `localStorage` layout keying, and the
interactive runtime not carrying class UML relation markers. Left for separate follow-up.

## Verification (post-fix)
- build ✅ · typecheck ✅
- unit **339/339** green (incl. a new state-marker `toSvgString` guard)
- e2e **73/73** green — the full `e2e/` suite incl. `e2e/sketch.spec.ts` **11/11** (the
  TEST-001 regression flipped from RED to GREEN) and the pre-existing 62 unchanged.

**Verdict: GREEN — all four tiers verified hands-on; advancing to ⑤ report.**
