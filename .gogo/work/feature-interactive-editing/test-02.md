# Test — `interactive-editing` — round 02 (verify the reset-layout fix, close TEST-001)

_Snapshot of `test/issues.json` (the contract). Round 01 raised 1 minor finding
(TEST-001: `plan.md`'s D2 cited an "existing reset-layout control" that did not
exist). Fix-round 2 added a real one (D5=A) and review round 03 verified the
delta clean. This round re-tests the fix hands-on, in a real browser, and closes
the loop._

## Gates (ran fresh, not just trusted from review-03)
- `npm run build` — **pass**. `npm run typecheck` — **pass**.
- `npm test` — **281 / 281 pass** (25 files) — matches the expected count (280 +
  1 new reset-layout unit test).
- `npm run test:e2e` — **47 / 47 pass** — 45 from round 01 (33 pre-existing + 11
  round-01 new + the developer's 1 new reset-layout happy-path test) **+ 2 new
  gap-fill tests** added this round (see below). Ran the full suite twice
  back-to-back — stable, no flake.

## Scope this round
Kept proportional per the coordinator's brief: the happy path (drag+resize →
persist → click Reset → restored → reload stays reset) is already covered by
the developer's new e2e test, re-run and confirmed green. This round targeted
specifically the three things that test weren't covering, plus a general
sanity pass:

### 1. Reset does NOT touch pan/zoom (only the arrangement)
New e2e test: zoomed and panned away from the initial fit-to-view transform,
then dragged + resized a node, then clicked ⟲. Read `.vnm-world`'s CSS
`transform` immediately before the edit and again immediately after the reset —
**byte-identical**. Confirms `resetLayout()`'s restraint (it only rewrites
`positions`/`sizes` + calls `renderAll()`, which re-applies the *current*
transform via `applyTransform()`; it never calls `resetView()`), exactly as
`review-03.md` described from reading the source — now proven by driving it.

### 2. A NEW edit made after Reset still persists (the gap the existing tests didn't cover)
Same test, continued: after confirming the reset + transform check, dragged the
node **again** (a fresh edit, post-reset) and reloaded the page. The reloaded
position matched the **new** edit, not the reset (computed) state — proving
`resetLayout()` clearing the debounce timer and calling
`localStorage.removeItem()` does not leave the persistence pipeline
permanently disabled afterward; `schedulePersist()` on the next drag/resize
still fires and writes normally. This was the one path review flagged as
plausible-but-unverified (a "resurrection race" was checked for the *reset
itself*, but not whether persistence keeps working *after*).

### 3. Sequence diagrams — no broken reset behaviour
Sequence diagrams mount through `seqRuntime` (`src/render/dom/seq-runtime.ts`),
a completely separate toolbar-building code path from `vnmRuntime` — confirmed
by reading it: its toolbar only ever builds fit/zoom-in/zoom-out (3 buttons),
no Reset-layout button was added there, and `SeqRuntimeHandle` has no
`resetLayout` method at all (nor `exportLayout`/`sizes`, consistent with
sequence being out of scope for FR1). `DeferredHandle.resetLayout()`'s `"in r"`
guard therefore silently no-ops for a settled sequence handle, never throws.
New e2e test on `order-sequence.mmd`: asserted the toolbar has **exactly 3**
buttons and **zero** `button[title="Reset layout"]` / `.vnm-resize-handle`
elements, then drove real pan + wheel-zoom + fit-to-view — **zero console
errors, zero network requests**. So it's the "hidden" case, not a visible
no-op button — cleaner than what was asked for.

### 4. Zero console errors / zero network, throughout
Every test in this round (and re-run from round 01) tracks console
errors/pageerrors and asserts `[]`; the dedicated zero-network test (drag,
resize, zoom, pan, Save SVG, Save PNG) still reports zero requests. No new
network path was introduced by Reset (it's a synchronous `localStorage`
call, no CSS `url(`/`src=`), consistent with review-03's guard check.

## Visual confirmation
Screenshots (pristine → edited → after-reset) on `ci-pipeline.mmd`:
- **Pristine**: toolbar reads `[⤢] [+] [−] [⟲] [SVG] [PNG]` — Reset grouped with
  fit/zoom, before the Save buttons, exactly as reported.
- **Edited**: "Push to main" dragged + resized larger, now visibly overlapping
  "Install deps" below it (expected — a manual resize doesn't re-run layout, a
  known/accepted tradeoff from D2, not a defect).
- **After reset**: node instantly back to its original size/position/route,
  pixel-identical to the pristine screenshot; selection outline persists (the
  node stays selected) but the geometry is fully restored.

## New / extended e2e tests this round
`e2e/interactive-editing.spec.ts` (+2 tests, 47 total):
- "Reset layout does not touch pan/zoom, and a new edit made after reset
  persists again" — closes gaps #1 and #2 above.
- "a sequence diagram's toolbar has no reset-layout control, and
  panning/zooming it produces no console errors or network requests" — closes
  gap #3.

## Findings this round
None new. **TEST-001 → verified** (see `test/issues.json`): the reset-layout
control now exists, restores the dagre-computed layout (not the persisted
one), leaves pan/zoom untouched, doesn't disable persistence afterward, and is
a safe no-op for sequence — all confirmed hands-on in a real browser, not just
by reading the source. `plan.md`'s D2 now describes a control that is
genuinely real.

| id | sev | status | verified? |
|----|-----|--------|-----------|
| TEST-001 | minor | verified | yes |

## Verdict
**green** — 0 open/new issues remain in `test/issues.json`. Build + typecheck +
281 unit + 47 e2e all green (re-run fresh, not assumed); hands-on exploration
this round specifically closed the three gaps the happy-path test didn't cover
(pan/zoom untouched, persistence survives past a reset, sequence stays
error-free), on top of round 01's full FR1–FR5 hands-on coverage which still
holds (re-run, unregressed). Done bar met. Advancing to phase ⑤ (report /
knowledge).
