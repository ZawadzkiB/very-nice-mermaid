# Code review — `interactive-editing` — round 06 (verify fix-round 4 — TEST-002)

_Small delta: phase-④ test round 03 delivered REV-006's real-browser closure and
found **TEST-002** (edge-pin handles not refreshed on select/deselect); fix-round 4
fixed it. This round verifies that fix. REV-001..008 stay `verified`._

## Gates (re-run independently)
- `npm run build` — **pass**. `npm run typecheck` — **pass** (v0.4.0).
- `npm test` — **301 / 301** (300 + 1: the new select-shows / deselect-hides unit test).
- `npm run test:e2e` — **62 / 62** (47 → 62: phase-④ added the REV-006 real-browser
  suite + the two TEST-002 regressions). No `test.fail()` remains in `e2e/` (the one
  grep hit is a comment).
- Runtime NUL-free; delta confined to `selectNode`/`deselect` + tests.

## Fix verification (focus points)

### 1. Correctness + perf of `computePorts()` on select/deselect — **fine**
`selectNode()` calls `positionEdgeHandles(computePorts())` right after
`positionHandles()`; `deselect()` calls it right after `hideHandles()` — mirroring the
resize-handle pattern, shipped in the serialized runtime automatically. **Not a hot
path:** select/deselect fire on discrete pointer events (a click that selects, a
pointerdown that starts a pan/group), not per frame. `computePorts()` is **already**
invoked on every `renderEdges()` — i.e. every `pointermove` frame during drag / resize
/ group / anchor — so one call per select/deselect is negligible against the existing
per-frame cost. It is O(E·logE) over edges (grouping + per-group sort), the same work
already done each frame; no diagram-size scaling regression.

### 2. Deselect side-effects / null selection — **safe**
On deselect, `selected` is `null` before `positionEdgeHandles(computePorts())` runs.
In `positionEdgeHandles`, every handle takes the `nodeId !== selected` branch (a
node-id string is never `=== null`) → `display:none; continue;`, so all handles hide
and the `positions[nodeId]!` / `sizes[nodeId]!` reads (only in the selected branch) are
never reached — no null-deref, no stray positioning.

### 3. De-annotated e2e genuinely assert immediate visibility — **yes**
The two `test.fail()` repros are now normal passing regression tests:
`:914` clicks A and asserts `.vnm-edge-handle[0][source]` `toBeVisible` with **no**
intervening drag/import; `:928` shows a handle, clicks empty canvas, and asserts
`toBeHidden` immediately. Backed at unit level by the updated FR7 pin test (the masking
no-op `importLayout()` was **removed** — `:290` now asserts `display==="block"`
directly after the select dispatch) and a dedicated test (`:322`) asserting
plain-select-shows + deselect-hides with no intervening render.

### 4. Nothing else regressed — **confirmed**
Delta is confined to the two runtime functions + the tests; removing the masking no-op
is safe (the transform-identity is set in the test's `mount()` helper, not the removed
call); 301 unit + 62 e2e green.

## Cross-track closure consistency
- **REV-006 is now fully closed.** The real-browser residual I handed to phase ④ in
  round 05 is delivered and green: `e2e/interactive-editing.spec.ts` now drives, via
  **real** pointer events, FR6 group-drag (`:773` grab title band → members move + box
  follows + persists), FR7 edge-pin mechanics (`:946` pin + reload + Reset) + both-ends
  (`:1033`) + pin-then-resize re-clamp (`:1072`), nested subgraphs depth>1 (`:1129`),
  and CLI-level REV-007 robustness **including explicit parallel-edge pin tests**
  (`:1277`, `:1307`) — which fully retire the round-05 parallel-swap question.
- **TEST-002** (test track) is fixed and guarded (unit `:322` + e2e `:913`); it was the
  defect the REV-006 e2e surfaced. Review track: all 8 REV verified; the only new item
  is the nit below.

## Findings

| id | sev | pri | status | title |
|----|-----|-----|--------|-------|
| REV-009 | nit | P3 | new | Stale e2e comments claim the select-nudge is needed to reveal handles (contradicts the TEST-002 fix) |

### REV-009 — stale e2e comments — **nit / P3** — AGENT-FIXABLE
After the fix, two comments in `e2e/interactive-editing.spec.ts` still describe the
pre-fix "nudge workaround" as current, contradicting the fix and the accurate header at
`:901-904`: `:935` ("shown via the nudge workaround") and `:964-965` ("nudge it to
force the handle overlay to actually render … a plain select alone does not reveal
it"). The tests pass and are correct (the nudge now only moves the node; the dedicated
regression tests assert immediate visibility), but the comments mislead — and since
TEST-002 was itself caused by a masking no-op, leaving comments that describe the
masked behavior invites reintroducing a workaround. **Fix:** update the two comments
(and optionally reveal via a plain select in the deselect test).

## Phase ④ (focused re-test round 04)
The REV-006 real-browser suite + TEST-002 regressions are in place and green; a focused
re-test can confirm the full TEST-002 loop is closed (select reveals / deselect hides,
no stale floating dot, no console errors) — already covered by `:913-943`, so no new
exercise is strictly required beyond a green re-run.

## Verdict
**clean** — TEST-002 fix is correct, null-safe, not a hot path, and guarded at unit +
e2e; REV-006 fully closed cross-track; all 8 prior findings verified; the only open item
is REV-009 (nit, non-blocking). Build/typecheck green, 301 unit + 62 e2e pass.
Advancing to phase ④ focused re-test.
