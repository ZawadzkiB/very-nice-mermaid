# Test round 03 — flowchart-render-legibility (FR9 edge-lane separation, UAT round 1)

- **Feature:** FR9 — `separateLanes`, a deterministic post-layout pass (wired FIRST in
  `finishEdges`, before FR6 label de-collision, before FR7 bridges) that offsets bundles of
  near-parallel/near-collinear merged edge runs into distinct lanes (`LANE_GAP=26`,
  `LANE_MIN_OVERLAP=40`, `LANE_MIN_BUNDLE=3`), cascading the offset through the connected
  elbow segments so paths stay orthogonal + connected. Plus the two UAT-round-1 residual
  fixes: `resolveLabelNodeCollisions` (label-vs-node) and `PORT_STEP` 26→30 + a
  border-filling spread cap (hub fan-in). Mirrored byte-for-byte in `src/render/dom/runtime.ts`.
  Flowchart + state + class; sequence excluded; clean elbow style only.
- **Scope tested:** `src/geometry/index.ts` (`separateLanes`, `shiftLabelOnSeg`,
  `resolveLabelNodeCollisions`), `src/layout/index.ts` (`finishEdges` wiring, `PORT_STEP=30`),
  `src/render/dom/runtime.ts` (byte-parity twin) — per `plan.md`'s FR9 section, Tests table,
  and BDD scenarios; re-verifying the 3 UAT-round-1 boxed bundles are fixed; hands-on against
  `scratchpad/repro.mmd` (the acceptance repro) across static PNG/SVG, the interactive HTML
  export (incl. a live drag re-route), and a sample of `fixtures/*.mmd`. FR1-FR8 + TEST-001
  were verified in depth in rounds 1-2 and are **not** re-verified from scratch here — only
  confirmed via the full suite runs (no regression).

## Verdict: **ISSUES FOUND — done-bar NOT fully met** (one new major finding, fixable)

Build, typecheck, all **383 unit tests / 29 files**, and all **79 e2e tests** are green — no
regressions on the FR1-FR8 baseline. Hands-on exploration (fully run, nothing blocked)
confirms the **primary FR9 acceptance target (box 2, the mid-channel) and box 3 (hub fan-in)
are genuinely fixed** in the static/initial render, and both UAT-round-1 residual issues
(label-vs-node, hub fan-in spread) are confirmed fixed by direct geometry measurement. Box 1
(Ingress-out fan) shows only a marginal, honestly-disclosed residual improvement (a node-width-
bound limitation the plan itself flagged, not a new defect).

However, deep hands-on interaction testing (dragging a node, per the plan's own Tests-table
requirement "lines stay separated after a drag re-route") found a **new major issue,
TEST-004**: after certain live node repositions, the FR9 lane-separation pass **fails to
(fully) re-engage**, and the mid-channel bundle collapses back to ~20px gaps — the *exact*
pre-fix defect the user has now bounced on twice. This is reproduced deterministically via
both the live browser runtime and a direct call into the shared library code (not guessed),
so it is a real algorithmic gap, not a browser/parity artifact.

---

## What was exercised, level by level

### 1. Build / typecheck / unit (required green before exploring)
| Command | Result |
|---|---|
| `npm run typecheck` | **PASS** — clean |
| `npm run build` | **PASS** — tsup ESM + DTS, clean |
| `npm test` (vitest) | **PASS** — **383/383 tests, 29/29 files**, ~22s — matches the expected count exactly |

### 2. e2e (Playwright, hands-on REQUIRED)
Chromium was already installed. `npm run test:e2e` — **79/79 passed**, 0 failures, no
regressions on the FR1-FR8/FR6/FR7 baseline (73 pre-existing + 6 `bridges-and-labels.spec.ts`
from round 2).

### 3. Hands-on browser exploration (gogo-playwright MCP)
`file://` navigation is blocked by the MCP (same wrinkle as rounds 1-2) — worked around
identically with a local `python3 -m http.server` serving
`scratchpad/test-out-round3/repro.html` (exported via
`node dist/cli/index.js render scratchpad/repro.mmd -f html --theme light`).

**Box 2 (mid-channel, the primary FR9 target).** Measured the three vertical runs' real `d`
attribute coordinates via `browser_evaluate`:
- `batch load` @ x=387.25, `IN→HUB` @ x=413.25, `feed` @ x=439.25 (repro's initial render,
  read from the HTML export's `.vnm-edge-layer path` elements).
- Adjacent gaps: **26px, 26px** — up from the pre-fix **20px** (uat.md round 1 measurement) —
  matches `LANE_GAP=26` exactly (confirmed against `src/geometry/index.ts:631`). y-overlap
  ≈68px, well over `LANE_MIN_OVERLAP=40`.
- **Each line is now individually traceable** in the initial render — confirmed both by
  measurement and by eye (screenshot below).

**Box 3 (hub fan-in).** The 6 `Aggregator hub` incoming edges' arrival x-coordinates:
362.25, 390.65, 419.05, 447.45, 475.85, 504.25 — gaps of **28.4px** each, spanning **142px**
of the hub's **154px** width (92% — "spread across nearly the full node width", matching the
UAT issue 2 fix). Formula-verified: `step = min(30, (154−2·6)/5) = 28.4` — matches
`PORT_STEP=30` + the border-filling cap exactly (`src/geometry/index.ts:89`).

**Box 1 (Ingress-out fan) — the requested honest judgment call.** Ingress's 4 outgoing anchors
sit at x=144, 171, 198, 225 (world units) — gaps of **27px** each, spanning **81px** of
Ingress's **93px** width. This is barely different from the **pre-fix 26px** measured in
uat.md round 1 (`x = 150·176·202·228`) — the `PORT_STEP` 26→30 widening has almost no effect
here because Ingress's node width (93px) clamps the achievable step to ~27px regardless (per
the plan's own note: "Ingress ≈90px already holds 4 lanes at 26px"). Visually (see
`crop-box1-tight.png`), the stubs ARE more individually distinguishable than the original —
each has a small comb-like jog with a tiny FR7 arc-hop bridge marking where they cross, and
the leftmost ("REST admin") peels away almost immediately — but for the first ~15-25px right
at the node border, the four stubs remain closely bunched. **My honest read: this is a real,
disclosed residual limitation** (the plan explicitly shipped the offset/lane approach without
the comb-stagger endpoint mechanism this round — see decisions.md D10's reversal), not a new
defect this round introduced, and it does not fully resolve the user's original box-1
complaint the way boxes 2 and 3 do. I'd flag this back to the user at UAT as a known,
disclosed trade-off (accept as "good enough" vs. ask for a follow-up comb-stagger), not
silently rubber-stamp it as fully fixed.

**UAT issue 1 (label-vs-node, "gRPC stream" clear of Ingress) — CONFIRMED fixed.** Measured
both rects' real `getBoundingClientRect()`: Ingress bottom=199.41, "gRPC stream" plate
top=207.30 — a ~7.9px gap, **zero AABB overlap** (x-ranges overlap by 80.7px, but y-ranges do
not overlap at all).

**Live drag re-route — this is where I found the new issue.** Dragged the `Ingress` node with
a real Playwright `dragTo` (real mouse down/move/up, not a synthetic click) to open canvas
space. Console: only the known benign `favicon.ico` 404 from the ad hoc HTTP server, 0
app-level errors. Re-measured the mid-channel bundle after the drag:
- Post-drag: `batch load` x≈393.25, `IN→HUB` x≈413.25, `feed` x≈433.25 → gaps of **20px, 20px**
  — the lanes **collapsed back to the pre-fix gap width**.
- Root-caused (not guessed) via a direct-library debug harness
  (`scratchpad/test-out-round3/debug-lanes.mts`, using `tsx` to call `layout()`/
  `applyPositions()`/`separateLanes` straight from `src/`, not the compiled bundle) — see
  **TEST-004** below for the full detail.

### 4. Hands-on visual (PNG), pixel-picky per project standard
`scratchpad/repro.mmd` rendered to PNG across all **6 theme × style combos**
(`scratchpad/test-out-round3/png/repro-{light,dark,fancy}-{clean,sketch}.png`):
- **light-clean / dark-clean:** identical structure to the HTML export findings above — box 2
  and box 3 read as separated and legible; box 1 shows the same marginal improvement.
- **fancy-clean (curved) / sketch (both themes):** the mid-channel bundle remains visually
  close/merged — **this is expected, documented plan scope** ("Gated by the same style rule
  as FR7 — clean elbow only; curved (beziers) and sketch stay deferred"), not a regression.
  Verified the `batch load`/`feed` labels still do NOT overlap each other even here (FR6 is
  always-on regardless of the lanes/bridges style gate) — see
  `png/crop-fancy-midchannel.png`.
- **No new defects found scanning the whole diagram** in any combo: no edge cuts through a
  node box, no line/arrow/label/shape collisions, no malformed/kinked paths, all labels
  legible.

### 5. Determinism
Rendered `scratchpad/repro.mmd` to SVG twice in a row (light/clean, fancy, sketch) and diffed
byte-for-byte: **all 3 IDENTICAL**. No `Date.now()`/RNG artifacts.

### 6. Broader corpus (no-churn check)
Rendered `fixtures/state-machine.mmd`, `fixtures/order-state.mmd`, `fixtures/shop-class.mmd`,
`fixtures/microservices.mmd` to PNG — all render cleanly, no visual churn or lane-separation
artifacts (consistent with review-04.md's REV-007 note that `separateLanes` is a no-op on
every shipped fixture — none of them actually contain a qualifying 3-run bundle).

### 7. Examples regenerated
`git status` shows `examples/png/*.png` and `examples/svg/*.svg` (flowchart/class/state,
clean+sketch, light+dark) already modified in the working tree. Re-ran `npm run examples`
explicitly — produced the exact same set of modified files with no further diff, confirming
the checked-in examples are current and match the shipped code (deterministic, idempotent).

---

## This round's new finding

### TEST-004 — FR9 lane separation can fail to re-engage after a live node drag, reverting to the pre-fix merged-line defect (major, P1, fixable)

**Description.** The plan's own Tests table requires: *"Lines stay separated after dragging a
node (live re-route)"* and the BDD scenario states *"no two of those runs sit within
LANE_GAP of each other... And each line is individually traceable... And no node has moved"*
— this must hold after interactive edits, not just on the initial render. I found a
realistic, non-adversarial counter-example.

**Reproduction (two independent methods, same result):**
1. **Live browser** (`gogo-playwright` MCP): open the interactive HTML export of
   `scratchpad/repro.mmd`, drag the `Ingress` node (real `dragTo`, real pointer events) down
   into open canvas space (e.g. to world position ≈(138,320) — nowhere near any other node or
   subgraph). Read the edge `d` attributes: the `batch load`/`IN→HUB`/`feed` mid-channel
   collapses from the correct 26px lane spacing to **20px**, matching the *exact* pre-fix
   defect gap width from `uat.md` round 1.
2. **Direct library call** (deterministic, no browser needed —
   `scratchpad/test-out-round3/debug-lanes.mts`, run via `npx tsx`): imports `layout` +
   `applyPositions` from `src/layout/index.ts` directly (not the compiled bundle) and inspects
   the real `edge.points` arrays.
   - **Original (undragged):** `batch load` x=391.25 (y=[80,174]), `IN→HUB` x=417.25
     (y=[106,226]), `feed` x=443.25 (y=[80,200]) → gaps **26, 26** — correct.
   - **After `applyPositions({ IN: { x: 138, y: 320 } })`** (an ordinary "move it out of the
     way" edit, not an edge case): `batch load` x=397.25 (y=[174,320]), `IN→HUB` x=417.25
     (y=[80,226]), `feed` x=437.25 (y=[80,200]) → gaps **20, 20** — the fix silently doesn't
     apply.
   - Calling `separateLanes` a **second time** on this already-processed result *partially*
     shifts things (`batch load`→393.94, `feed`→445.94) but still does **not** converge to
     clean 26px lanes in one more pass — confirming genuine **under-convergence**, not just an
     "this bundle legitimately doesn't qualify" case. `LANE_PASSES=1` (the single bounded
     relaxation pass, `src/geometry/index.ts:637`) is evidently insufficient for some
     post-reposition geometries.
   - A smaller, more modest drag (`IN → {138, 90}`, a ~70px nudge) does **not** trigger the
     bug — lanes stay correctly at 26px. So this is not "any drag breaks it" — it's geometry-
     dependent, but reachable via ordinary editing, not a contrived adversarial input.
   - **A plausible contributing factor** (not fully proven, worth the fix author's attention):
     hand-tracing the bundle-detection loop (`src/geometry/index.ts:687-726`) against the
     post-drag segment list shows the `IN→HUB` edge can contribute **two different segments**
     (its two separate vertical runs, at differing `along` values) to the **same** bundle
     transitively. Spreading two segments of the *same* edge apart doesn't help legibility
     (they're already unambiguous by continuity) and may be diluting or destabilizing the
     bundle's mean/slot computation for the three genuinely-different edges that need it.
   - Box 3 (hub fan-in, anchor-spread based via `computePerimeterPorts`, not the lane-bundle
     mechanism) is **not** affected by this — confirmed it stays correctly spread even under
     the same drag.
   - Both the static and live-runtime reproductions show the same *qualitative* collapse
     (byte-parity itself is not violated — both twins fail the same way), so this is a shared
     `separateLanes` algorithm gap, not a runtime-twin drift.

**Evidence files:** `scratchpad/test-out-round3/debug-lanes.mts` (reproduction harness),
`scratchpad/test-out-round3/repro-dragged-medium.png` +
`scratchpad/test-out-round3/crop-dragged-midchannel.png` (visual confirmation — the collapsed,
crossing/tangled mid-channel after an ordinary drag), `drag-layout-medium.json` /
`drag-layout-small.json` (the layout.json overrides used for the CLI-side static
reproduction).

**Proposed solution.** This is a convergence/tuning bug in the already-accepted approach
(D6-D9 already settled the design), not a new scope question — agent-fixable. Suggested
directions for the implementer to evaluate: (a) raise `LANE_PASSES` from 1 to a small bounded
number (e.g. 3-4) and confirm the pass now converges (re-run `separateLanes` to a fixpoint,
same pattern as the already-accepted "bounded relaxation passes" design intent); (b) exclude a
single edge from contributing more than one segment to the same bundle (or handle same-edge
multi-membership explicitly), since two segments of one edge are never a legibility problem
for each other; (c) add a new unit test that captures this exact regression — call
`layout()` then `applyPositions()` with an `IN` reposition matching the one here, and assert
the mid-channel gap stays ≥ `LANE_GAP` (this closes the coverage gap review-04.md's REV-007
already flagged: *"neither asserts the polyline stays orthogonal/connected... which the
plan's Tests table explicitly requires"* — REV-007 was about a different aspect of the same
underlying under-tested surface).

**Severity:** major. **Priority:** P1. **Fixable:** yes, agent-fixable (implementation-level
convergence/tuning fix within the already-accepted D6-D9 approach, not a new design fork).

**Why not blocker:** the static/initial render — the primary deliverable, and what the user's
UAT screenshots actually evaluate — is genuinely and thoroughly fixed (boxes 2 and 3 verified
by direct measurement across all 6 theme/style combos, determinism holds). This regression is
specific to the interactive live-drag path and does not corrupt data, crash, or break
byte-parity. But it directly contradicts an explicit Tests-table requirement, and — given this
feature has already bounced UAT twice on exactly "lines merging together" — a live edit that
can silently un-fix the very problem being fixed is a real risk I'm not comfortable
downgrading further.

---

## Prior issues (rounds 1-2) — not re-opened, no regression found
| id | severity | status | note |
|---|---|---|---|
| TEST-001 | major | verified (round 2) | Not re-tested from scratch this round per the brief; full suite green confirms no regression. |
| TEST-002 | minor | fixed (round 1) | Unrelated to this round, not re-touched. |
| TEST-003 | minor | fixed (round 2) | Unrelated to this round, not re-touched; the FR7 bridge-hop e2e coverage it added stayed green (79/79). |

---

## Done-bar check (`test-strategy.md`: build clean AND all unit AND all e2e green, PLUS
hands-on exploration)

| Bar | Status |
|---|---|
| Build clean | done |
| Typecheck clean | done |
| All unit green | done — 383/383, 29/29 files |
| All e2e green | done — 79/79, no regressions |
| Hands-on exploration done | done — nothing blocked. Browser (MCP over local HTTP) + CLI PNG across 6 theme/style combos + drag re-route + corpus + determinism, all console-clean |
| No open/new blocking issues | **NOT met** — TEST-004 (major, new, fixable) found this round |

**Verdict: done-bar NOT met.** No hands-on/e2e check was blocked — everything that needed to
run, ran, including the drag-re-route check the plan's own Tests table calls for. That check
is exactly what surfaced TEST-004. Box 2 (primary FR9 target) and box 3 are genuinely fixed in
the static render; box 1 is an honestly-disclosed residual limitation, not a new defect, and
worth surfacing to the user as a judgment call rather than silently accepting. TEST-004 is a
real, reproducible (two independent methods), agent-fixable major issue that should go back
through ②implement → ③review → ④test before this feature is ready for UAT re-submission.
