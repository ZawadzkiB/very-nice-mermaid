# Test round 04 — flowchart-render-legibility (focused re-test: TEST-004 fix verification)

- **Scope:** focused re-test of ONLY the TEST-004 fix (per-edge lane dedup +
  `LANE_PASSES` 1→4 in `src/geometry/index.ts` and the byte-identical twin in
  `src/render/dom/runtime.ts`), on top of the already-verified FR1-FR8 + FR9
  baseline (test round 3 confirmed box 2 mid-channel and box 3 hub-fan fixed;
  box 1 Ingress-out fan is a disclosed residual). Not a full re-verification of
  FR1-FR9 from scratch — confirmed via full suite runs (no regression) plus a
  targeted hands-on re-drive of the exact round-3 failure.

## Verdict: **ISSUES FOUND — done-bar NOT met.** TEST-004 is **REOPENED**, not verified.

Build, typecheck, all **384/384 unit tests** (29/29 files, matching the expected
count exactly — includes the new drag-reposition regression test in
`layout.test.ts` + the FR9 lane fixture in `dom-runtime-parity.test.ts`), and all
**79/79 e2e tests** are green — no regressions on the FR1-FR9 baseline.
Determinism holds, fixtures are unchanged, box 1 and box 3 are unaffected.

However, **the core TEST-004 hands-on check — reproducing the exact round-3
failure and confirming it's gone — FAILED.** The shipped fix genuinely improves
robustness for small/moderate node repositions (confirmed via the new unit
test's own 4 deltas), but re-driving the **exact round-3 repro** (drag Ingress
to world `(138, 320)`, the coordinates `test-03.md` itself used) shows the
mid-channel bundle **still collapses to the pre-fix 20px gap**, reproduced two
independent ways: round-3's own unmodified debug harness, and a real
`page.mouse` drag in the live interactive browser runtime. Root-caused (not
guessed) to an order-dependent side effect of the fix's own per-edge dedup rule.

---

## What was exercised, level by level

### 1. Build / typecheck / unit (required green before exploring)
| Command | Result |
|---|---|
| `npm run typecheck` | **PASS** — clean |
| `npm run build` | **PASS** — tsup ESM + DTS, clean |
| `npm test` (vitest) | **PASS** — **384/384 tests, 29/29 files** — matches the expected count exactly (383 + 1 new drag-reposition test) |

Confirmed the shipped `LANE_PASSES = 4` (was 1) and the per-edge dedup
(`bundleEdges` set, "at most ONE segment per edge in a bundle") are present and
byte-identical in both `src/geometry/index.ts` and `src/render/dom/runtime.ts`.

### 2. e2e (Playwright, hands-on REQUIRED)
`npm run test:e2e` — **79/79 passed**, 0 failures, no regressions.

### 3. Hands-on: TEST-004 re-verification (the key check)

**Step 1 — confirm the shipped regression test's own deltas don't exercise the
real failure.** Read `test/layout.test.ts`'s new test ("stays separated after a
node drag — applyPositions re-lanes to a stable fixpoint (TEST-004)"): it tries
4 *relative* deltas from IN's base position `(188.5, 29)`:
`[40,0],[0,30],[-30,20],[60,-10]` → IN lands at `(228.5,29)`, `(188.5,59)`,
`(158.5,49)`, `(248.5,19)` — all within ~60px of the start, nowhere near the
round-3 repro's actual failing position. Verified via
`scratchpad/test-out-round4/verify-shipped-test-deltas.mts`: all 4 hold
`worstMidGap = 26` — but this is an easy case, not the reported one.

**Step 2 — re-run round-3's OWN unmodified reproduction harness** against the
now-fixed `src/`: `npx tsx scratchpad/test-out-round3/debug-lanes.mts` (no
edits, same file test round 3 wrote). Result — **unchanged from round 3**:
```
=== DRAGGED (IN -> 138,320, open space) ===
edge 2 [batch load] ... vertical run x=397.25 y=[174,320]
edge 3 [feed]        ... vertical run x=437.25 y=[80,200]
edge 10 [ (IN->HUB) ]... vertical run x=417.25 y=[80,226]
```
Gaps: `397.25→417.25 = 20`, `417.25→437.25 = 20` — **identical to the pre-fix
round-3 numbers.** Re-applying `separateLanes` a second time (also in the
script) does not converge further — same stuck state.

**Step 3 — confirm live in the browser runtime (gogo-playwright MCP).** Exported
`scratchpad/repro.mmd` to interactive HTML
(`node dist/cli/index.js render scratchpad/repro.mmd -f html --theme light`),
served over a local `python3 -m http.server` (file:// still blocked by the MCP,
same as rounds 1-3). Reset to the base layout via the toolbar's Reset (⟲)
button, read the world transform (`translate(60px,117.953px) scale(1.31387)`),
computed the exact screen pixel for world-center `(138,320)`, and performed a
**real** `page.mouse.down()` → 8-step `page.mouse.move()` → `page.mouse.up()`
drag (not a synthetic click/dispatch) from Ingress's center to that target.
Confirmed the node landed dead-on: DOM `left/top = "91.5001px"/"299.001px"`
(= center `138,320`, exact). Console: only the known benign `favicon.ico` 404
from the ad hoc HTTP server, **0 app-level errors**.

Read the edge `d` attributes post-drag:
```
batch load:  ... L 393.25 335 L 393.25 186 ...   (vertical run x=393.25)
feed:        ... L 433.25 212 ...                (vertical run x=433.25)
IN->HUB:     M 138 341 L 138 92 L 413.25 92 L 413.25 238 ...  (vertical run x=413.25)
```
Gaps: `393.25→413.25 = 20`, `413.25→433.25 = 20` — **same qualitative collapse**
as the direct-library reproduction (the ~4px constant offset vs. the Node
script is expected — real browser font metrics vs. the Node measurement module
differ slightly; the *gap*, which is what matters, is identical). A full-page
screenshot (`scratchpad/test-out-round4/repro-dragged-138-320-full.png`) and a
cropped close-up (`crop-midchannel-dragged.png`) visually confirm the
'batch load'/'feed'/IN→HUB lines are merged and hard to individually trace —
the exact qualitative defect this whole feature exists to fix.

**Step 4 — root-cause the discrepancy (not guessed).** Wrote
`scratchpad/test-out-round4/trace-bundles.mts`, which replays `separateLanes`'s
exact sort/bundle/dedup logic against the final post-drag edge list to see why
no bundle formed. Finding: sorted by x, the interior vertical segments near the
mid-channel are (in order) IN→HUB's *other*, structurally unrelated segment at
`x=376` (y=[226,422]), then `batch load` at `x=397.25` (21.25px away → bundles
with it), then IN→HUB's *true* mid-channel segment at `x=417.25` (20px from
`batch load` → near, but **already excluded from the bundle array** by the
"at most one segment per edge" dedup rule, since IN→HUB already has a member at
`x=376` — the segment is marked `used` but never added to `bundle`), then
`feed` at `x=437.25` — 40px from `batch load` (not `< LANE_GAP`) and unable to
bridge via the excluded `x=417.25` segment. Net: the 3-run bundle that should
form (`batch load` / IN→HUB-mid / `feed`) splits into a 2-member bundle (below
`LANE_MIN_BUNDLE=3`) that gets skipped entirely, leaving the three lines exactly
where raw geometry put them — 20px apart. **This is a genuine, newly-diagnosed
side effect of the TEST-004 fix's own dedup mechanism** (an edge whose two
segments are relevant to two *different* bundles gets arbitrarily locked to
whichever bundle claims it first in sort order), not merely "the fix didn't go
far enough."

**Step 5 — characterize scope** (not just the one coordinate). Tested a spread
of IN repositions via `scratchpad/test-out-round4/verify-lanes.mts`:

| IN target (world) | worst mid-channel gap | holds ≥26px? |
|---|---|---|
| (undragged) | 26.0 | yes |
| (138, 320) — **the round-3 repro** | 15-20* | **NO — fails** |
| (138, 90) — round-3's "small nudge" | 26.0 | yes (matches round 3's own note) |
| (307, 212) | 20.0 | **NO — fails** |
| (400, 400) | 6.0 | **NO — fails, worse** |
| (50, 500) | 26.5 | yes |

*(15 vs. the browser's 20 differ only because my broader `worstMidGap` helper
also picks up the anchor-touching Box-1 fan segments right at IN's new border,
a distinct/disclosed area; the apples-to-apples mid-channel-only gap is 20/20
in both the Node script and the browser, matching exactly.)*

Confirms: geometry-dependent (as round 3 characterized), reachable via ordinary
editing, and — critically — **includes the primary reported repro**, so this is
not a fixed regression, it's the same user-facing bug, un-resolved.

### 4. No other regressions found
- **Determinism:** rendered `scratchpad/repro.mmd` to SVG twice each for
  light/fancy/sketch — all 3 pairs byte-**identical** (`diff` clean).
- **Static repro (undragged) still clean:** re-rendered to PNG — box 2
  mid-channel shows 3 clearly separated lines (26/26, matches round 3 exactly,
  no new `x≈499` drift), box 3 hub-fan shows 6 clearly distinct arrows into
  Aggregator hub, box 1 shows the same disclosed residual (not worse).
- **Fixtures no-churn:** re-rendered `fixtures/state-machine.mmd`,
  `order-state.mmd`, `shop-class.mmd`, `microservices.mmd` to PNG — all clean,
  no visual artifacts (also covered by the green snapshot tests in `npm test`).
- **Box 1 / box 3 unaffected by the drag:** box 3's 6 hub-incoming arrows stay
  visually distinct in the post-drag screenshot; box 1 is a separate,
  previously-disclosed residual, not touched by this finding.

---

## TEST-004 — REOPENED (major, P1)

**Outcome: still-failing, not verified.** The round-3 fix (per-edge dedup +
`LANE_PASSES` 1→4) is a real improvement — it holds for the mild repositions the
shipped unit test itself exercises — but it does **not** fix the originally
reported defect for the originally reported repro. Re-driving the exact
round-3 scenario (drag Ingress to world `(138,320)`) reproduces the identical
20px/20px collapse, confirmed via round-3's own unmodified harness AND a live
browser drag with 0 console errors. Root-caused to a new order-dependent
under-bundling gap introduced by the dedup rule itself (detailed above and in
`test/issues.json`). Status set back to `open` per the test-strategy routing
rule ("prior `fixed` issue still failing → back to `open`"); `retested_in_round: 4`
recorded for the audit trail. See `test/issues.json` for the full evidence and
a refined `proposed_solution` for the next implement round (including a
concrete ask: extend the shipped regression test with the *actual* round-3
repro coordinates, not just mild deltas, so this can't silently regress again).

**Evidence files (new this round):**
`scratchpad/test-out-round4/trace-bundles.mts` (root-cause bundle trace),
`scratchpad/test-out-round4/verify-lanes.mts` +
`verify-shipped-test-deltas.mts` (scope characterization + shipped-test-gap
demonstration), `scratchpad/test-out-round4/repro-dragged-138-320-full.png` +
`crop-midchannel-dragged.png` (live-browser visual confirmation),
`scratchpad/test-out-round4/repro-static-light.png` (clean static baseline,
no regression), `scratchpad/test-out-round4/determinism/*.svg` (byte-diff
determinism check), `scratchpad/test-out-round4/fixture-*.png` (no-churn
check).

---

## Prior issues — not re-opened, no regression found
| id | severity | status | note |
|---|---|---|---|
| TEST-001 | major | verified (round 2) | Not re-tested from scratch; full suite green confirms no regression. |
| TEST-002 | minor | fixed (round 1) | Unrelated, not re-touched. |
| TEST-003 | minor | fixed (round 2) | Unrelated, not re-touched; its e2e coverage stayed green (79/79). |

---

## Done-bar check (`test-strategy.md`: build clean AND all unit AND all e2e
green, PLUS hands-on exploration, PLUS no open/new blocking issues)

| Bar | Status |
|---|---|
| Build clean | done |
| Typecheck clean | done |
| All unit green | done — 384/384, 29/29 files |
| All e2e green | done — 79/79, no regressions |
| Hands-on exploration done | done — nothing blocked. Browser (MCP over local HTTP, real mouse drag) + direct src/ library calls + CLI PNG + determinism + fixtures, all console-clean |
| No open/new blocking issues | **NOT met** — TEST-004 (major) reopened this round, still failing on the primary repro |

**Verdict: done-bar NOT met.** TEST-004 must go back through
②implement → ③review → ④test before this feature is ready for UAT
re-submission. The next implement round should specifically avoid re-narrowing
the fix to just the deltas covered by the current unit test — the round-4
`proposed_solution` in `test/issues.json` includes a concrete ask to extend
that test with the actual reported repro coordinates.
