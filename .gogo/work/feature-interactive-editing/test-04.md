# Test — `interactive-editing` — round 04 (closure round — verify TEST-002 fix)

_Focused closure round. Fix-round 4 fixed TEST-002 (mirrored the resize-handle
pattern: `selectNode()`/`deselect()` now call `positionEdgeHandles(computePorts())`
alongside `positionHandles()`/`hideHandles()`); review round 06 verified it clean
(null-safe on deselect, no perf concern since select/deselect are discrete
events and `computePorts()` already runs per-frame during drags). This round
confirms the fix hands-on and closes the loop._

## Gates (re-run fresh)
- `npm run build` — **pass**. `npm run typecheck` — **pass** (v0.4.0).
- `npm test` — **301 / 301 pass** (26 files) — matches the expected count
  (300 + 1 new unit test asserting select-shows/deselect-hides with no
  intervening render, per the developer's fix_summary).
- `npm run test:e2e` — **62 / 62 pass** — same count as round 03, but the two
  `TEST-002` tests are now **genuine passing assertions**, not `test.fail()`
  expected-failures (confirmed: `grep -n "test.fail" e2e/interactive-editing.spec.ts`
  returns zero live annotations — only a historical mention in a comment). Ran
  the full e2e suite **twice** back-to-back — stable, no flake.

## Hands-on confirmation (real browser, beyond the automated suite)
Drove a fresh page directly (not just re-running the persisted spec) to see
the fix with no scaffolding in the way:
- **Click a node → edge handles appear immediately.** Read the handle's live
  `style.display` right after a single plain pointerdown+pointerup (no wait,
  no follow-up action): `block` — immediate, no nudge/drag/resize needed.
- **Click away → handles vanish immediately, no floating dot.** Read the same
  handle's `style.display` right after clicking empty canvas: `none` at once.
  No lingering dot through a subsequent pan (unlike round 03's finding).
- **Pin still works end-to-end**: selected A, dragged its edge-0 source handle
  to a new border, confirmed the live path re-anchored there, waited for the
  persist debounce and read the pin straight out of `localStorage`
  (`anchors` present), reloaded and confirmed the same pinned route survived,
  then clicked **Reset layout** and confirmed the path changed back (pin
  cleared). All exactly as round 03 verified, now on top of the immediate-
  visibility fix rather than the nudge workaround.
- **Zero console/page errors** throughout. **Zero network requests** during
  the interactive session itself — the only request captured across the whole
  script was the deliberate `page.reload()`'s own document fetch (a real
  navigation, not a runtime interaction; consistent with how prior rounds
  scope the zero-network NFR to the interactive session, not full reloads).

## REV-009 (nit, review round 06) — closed in this pass
Two stale comments in `e2e/interactive-editing.spec.ts` still described the
now-obsolete "nudge is needed to reveal handles" reasoning, contradicting both
the fix and the already-accurate header comment above the `TEST-002` describe
block:
- ~line 935: `// shown via the nudge workaround` → now
  `// shown immediately on select (the nudge only moves A)`.
- ~lines 964-965: `// select A, then nudge it to force the handle overlay to
  actually render (see TEST-002 above — a plain select alone does not reveal
  it)` → now describes the nudge's real (and only remaining) purpose: moving
  A off its pristine position so the pin-target math is exercised against a
  distinct point.
- Also tightened a third, adjacent comment (~line 957-960) that called the
  nudge a "workaround" in passing, for consistency with the two above.

A full `grep -n "nudge\|does not reveal\|force.*render\|workaround"` sweep
after the edit confirms every remaining mention accurately describes the
nudge as a deliberate position change, never as a visibility requirement.

**On ownership**: REV-009 is a review-track nit filed against a file I own
(`e2e/interactive-editing.spec.ts` is test-phase-owned), so I made the fix
directly per the coordinator's instruction. I did **not** write a `fixed`/
`verified` entry into `review/issues.json` myself — that living list's status
transitions are the review track's contract (produced by review, consumed by
implement), and I judged it cleaner for the reviewer to make that specific
state transition themselves at the next review touch-point than for the
tester to reach into another track's file. Recording the closure here, as the
coordinator offered as the fallback: **REV-009 is fixed** (comments corrected,
verified by the grep sweep above) and ready for review to mark verified in
`review/issues.json` at its next pass.

## Findings this round
None new. **TEST-002 → verified** (see `test/issues.json`): the fix holds
under fresh hands-on driving, not just the (also-passing) automated suite.

| id | sev | status | verified? |
|----|-----|--------|-----------|
| TEST-001 | minor | verified | yes (round 02) |
| TEST-002 | major | verified | yes (this round) |

## Verdict
**green** — 0 open/new issues remain in `test/issues.json`. Build + typecheck
+ 301 unit + 62 e2e all green (re-run fresh), TEST-002's fix confirmed both by
the de-annotated regression suite and by independent hands-on driving in a
real browser, and REV-009's stale comments are corrected. Every FR1-FR7
capability across all four test rounds — resize, perimeter distribution,
Save SVG/PNG (incl. subgraph/shapes/nested), persistence, reset-layout,
subgraph auto-contain + group-drag, and edge-anchor pinning — now has durable
real-browser e2e coverage with zero open findings. Done bar met. Advancing to
phase ⑤ (report/knowledge).
