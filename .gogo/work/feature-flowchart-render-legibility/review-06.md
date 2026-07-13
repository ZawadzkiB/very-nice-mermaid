# Review round 6 — flowchart-render-legibility (D12: heading-order port de-knot of the API Gateway fan)

**Scope:** ONLY the D12 change — ordering a shared border's ports by each edge's **actual heading**
(its first interior dagre bend at the source end, its last at the target end) instead of the far
node's centre, with a centre fallback for straight (bend-less) edges. Rounds 1–5 approved FR1–FR9 +
the crossing-gaps / label-vs-edge pivot; those are **not** re-reviewed.

**The 5 changed sites reviewed (current code):**
1. `src/geometry/index.ts` `computePerimeterPorts` — new optional 5th param `bends`; `srcHead`/`tgtHead`
   drive the `along` sort key (`raySide` / which side is UNCHANGED).
2. `src/layout/index.ts` — two call sites pass bends: `layout()` pre-extracts `waypointsList` (dagre-space)
   and reuses it; the repositioned/anchored `applyPositions()` passes `e.waypoints ?? []`.
3. `src/native/state/layout.ts:100` — the pseudo-state shrink re-route passes `e.waypoints ?? []`.
4. `src/render/dom/runtime.ts` `computePorts` — the runtime twin mirrors it from `e.waypoints`.
5. `test/dom-runtime-parity.test.ts` `expectedPaths` — now passes **world-space** bends; +2 new guards
   (`test/geometry.test.ts:176`, `test/layout.test.ts:276`).

**Reviewed against:** `git diff master` (whole branch is uncommitted), `plan.md` (FR9), `decisions.md`
**D12**, `state.md` (implement r8), `code-review-standards.md`.

**Gates (re-run this round):**
- `npx tsc --noEmit` — clean.
- `npm test` — **387 passed / 29 files** (incl. `dom-runtime-parity` clean+sketch, +2 new D12 guards).
- `npm run build` — success (ESM + DTS).
- Determinism — `render scratchpad/repro.mmd -f svg` byte-identical ×2 (`33f6deb…`); no `Date`/`Math.random`/`performance.now` in any changed file.

---

## Verdict: **APPROVE** — no open blockers or majors

One new finding, well below the changes bar: **REV-009** (nit — a coverage gap on the state
re-route wiring, verified clean). No prior finding is reopened by D12.

---

## What I verified clean (adversarially)

### 1. Byte-parity of the twin — PASS (the highest-risk surface)
Geometry `computePerimeterPorts` and runtime `computePorts` compute `srcHead`/`tgtHead`/`along` by the
**identical** rule — `wp && wp.length ? wp[0] : to` (source) and `… ? wp[wp.length-1] : from` (target),
then `along = axisX(side) ? head.x : head.y`; same sort comparator `along || edgeIndex || role`; same
`step = min(30, (borderLen − 12)/(k−1))`; same `(slot − (k−1)/2)·step`. The only difference is where
`wp` comes from — geometry's `bends` param vs the runtime's serialized `e.waypoints`.
- **Coordinate-space argument holds.** Geometry works in dagre-space (`round(nd.x)` box centres,
  `edgeWaypoints` = `round(p.x)` interior bends); the runtime works in offset-removed space (positions
  AND waypoints both minus `bounds.min`, `runtime.ts:133`/`:380`). Because every box centre AND every
  waypoint in a border group is on the SAME side, all `along` values in a group shift by a **single
  per-axis constant** between the two spaces — order-preserving — and the emitted `offset` depends only
  on `slot`/`k`/`borderLen` (offset-invariant). I tried to break it on a group mixing a bend-based
  `along` (waypoint) and a centre-based `along` (bend-less sibling): both shift by the same constant, so
  the mix cannot flip order. All coordinates are **integers** (rounded centres/bends minus an integer
  `bounds.min` = `min(ints) − 20`), so `a.along − b.along` is exact — no ULP tie flip is possible.
- **A committed test actually exercises the reorder in BOTH directions.** The `reproDsl`
  (`dom-runtime-parity.test.ts:633`, `toSvgString()==renderSvgFromModel`) genuinely reorders **4
  source-side** ports and **2 target-side** ports into HUB under D12 (verified by diffing ports
  with-vs-without bends) — so the twin's `tgtHead` path is byte-parity-guarded, not just `srcHead`.

### 2. The three geometry call sites use bends in the SAME space as their boxes — PASS
- `layout()` main: `waypointsList` (dagre-space `edgeWaypoints`) with `nodeBoxes` (dagre-space `round(nd.x)`). ✓
- `applyPositions()`: `e.waypoints` and node boxes are the same space (both dagre-space at initial layout;
  on a drag the stale waypoints + moved box match the runtime, which ALSO keeps waypoints while dragging —
  parity preserved, and the drag parity fixtures at `:407`/`:662`/`:810` cover it). ✓
- `native/state/layout.ts`: `positioned.edges` waypoints and the shrunk `boxes` share the layout's
  dagre-space; only pseudo widths shrink (centre kept), so `raySide`/grouping are unchanged. ✓

### 3. Backward-compat: straight edges fall back to centre → committed corpus byte-identical — PASS
I ran `computePerimeterPorts` **with** bends vs **without** across every committed flowchart/class/state
source (3 themes each) and diffed the resulting ports:
- **Flowchart** (examples/src + 5 flowchart fixtures): 171 edge-instances, **42 carrying detour bends**,
  **0 port differences**. D12 is a proven no-op on the committed flowchart corpus.
- **Class** (examples/src/class, fixtures/shop-class): **0 detour-waypoint edges** — D12 falls back to
  centre-order byte-for-byte. This confirms the class snapshot/example delta (source spread ±10→±15) is
  the **pre-existing FR4 `PORT_STEP` accumulation**, NOT D12.
- **State**: the inline `state-svg` snapshot MODEL is linear (no fan-in, 0 waypoints) → D12 no-op → the
  state snapshot is unchanged by D12; `examples/src/state.mmd` also carries 0 waypoint edges → the state
  example is unchanged by D12. The only genuinely-reordering state input is `order-state` (see REV-009),
  which drives **no golden snapshot**. Hence `npm test` needing no `-u` is consistent: **no committed
  snapshot changed due to D12.**

### 4. Determinism + target-side (`wp[last]`) does not regress the approved hub fan-in — PASS
- Pure geometry, no clock/RNG; repro SVG byte-identical ×2.
- The approved hub fan-in (into HUB) reorders under D12 on the repro, and its static↔runtime parity is
  the very thing the committed `reproDsl` parity test asserts (green). On the committed corpus the hub
  fan-ins are byte-unchanged (0 diffs above).
- **State fan-in byte-parity spot-check:** rendered `order-state` static (`renderStateSvg`) vs live
  (`mountState` in jsdom) → **identical relative edge geometry** through the reordered fan-in (light).

### 5. New guards genuinely bite — PASS
- `geometry.test.ts:176` directly contrasts centre-order (`L<M<R`) vs a bend on the centre edge
  (heads furthest right → rightmost port; `R` drops to middle) — a crisp regression guard that fails on
  a revert to centre-order.
- `layout.test.ts:276` lays out the real repro and asserts the API fan's source order is monotonic with
  each edge's actual first heading-x (no source-side inversion ⇒ no knot).

---

## New finding

### REV-009 — nit (state re-route D12 wiring lacks a dedicated committed byte-parity guard) · AGENT-FIXABLE · open
D12 adds a third static call site feeding bends into `computePerimeterPorts`
(`native/state/layout.ts:100`). Class is a proven no-op (0 waypoints) and the inline state snapshot is a
no-op (no fan-in), but `order-state` genuinely reorders 2 transitions into the end pseudo-state under
D12 — and that state re-route path is only exercised by CLI/e2e tests that do **not** byte-compare static
vs runtime; the committed `dom-runtime-parity` state cases use a linear no-fan-in model. **Verified
currently clean** (order-state static == live runtime relative geometry), and the twin *logic* is guarded
transitively (shared `computePorts`; the flowchart `reproDsl` test drives both source- and target-side
reorders). So this is a coverage gap on the state wiring/serialization branch, not a demonstrated defect
— but it is exactly the serialized-twin-drift class the project's standards call out. Fix: add a state
fan-in case to `dom-runtime-parity.test.ts` that byte-compares the mounted state runtime to
`renderStateSvg`.

---

## Prior findings — status this round (all unaffected by D12)
- **REV-001** (nit) wontfix — shared-geometry ripple; D12 changes only the ordering KEY, not `PORT_STEP`;
  class ripple confirmed pre-existing (0 class waypoints).
- **REV-002** (major) verified — native class/state still draw the shared `labelPlateSize`; D12 touches no label sink.
- **REV-003** (minor) verified — `route.ts` still threads `bridges`; D12 adds no new render option / layout call site.
- **REV-004** (nit) wontfix — viewBox excludes label plates; D12 moves no plate.
- **REV-005** (nit) verified — `gappedPath` same-segment overlap skip untouched; new crossings still flow through the guarded path.
- **REV-006** (nit) verified — decisions.md D10 reversal intact; the new D12 entry matches the shipped code.
- **REV-007** (minor) verified — FR9 orthogonality/edge-through-node guards green; the re-laning reproDsl now doubles as the D12 integration surface.
- **REV-008** (nit) open — out of D12 scope; label-vs-edge clamp limitation neither improved nor worsened.

---

**Verdict: APPROVE**
