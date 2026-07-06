# Code review — `interactive-editing` — round 05 (verify fix-round 3)

_Re-review of fix-round 3 against the living list. REV-006/007/008 were `fixed`
(fixed_in_round 4); this round verifies each. REV-001..005 stay `verified`._

## Gates (re-run independently)
- `npm run build` — **pass**. `npm run typecheck` — **pass** (v0.4.0).
- `npm test` — **300 / 300** (291 + 9: FR7 pointer-driven pins, nested re-hug,
  pin-then-resize, 4 import-validation).
- `npm run test:e2e` — **47 / 47** (no regression).
- All source twins NUL-free. No tracked snapshot regressed. Fix diff confined to the
  three findings (layout/runtime/model anchors + tests + README) — no collateral.

## Fix verification

| id | sev | status | verified? |
|----|-----|--------|-----------|
| REV-006 | major | verified (unit scope) — **real-browser e2e handed to phase ④** | yes* |
| REV-007 | minor | verified | yes |
| REV-008 | minor | verified | yes |

### REV-006 — FR7 pointer-path now covered; real-browser e2e is phase ④'s — **VERIFIED (unit scope)**
`test/interactive-subgraph-drag.test.ts` now dispatches pointer events whose **target
IS the runtime's actual `.vnm-edge-handle` element** (live `dataset.ei/end`), so the
previously-uncovered FR7 wiring genuinely runs: `onPointerDown`'s
`closest('.vnm-edge-handle')` branch, `onPointerMove`'s `anchor` branch,
`anchorFromPointer`, and both `positionEdgeHandles` show/hide branches. Test 1 selects
A, reveals its source handles (target handle on the unselected B stays hidden), drags
edge 0's source from the bottom to the right border, and asserts the pin lands
`{source:{side:right,offset:0}, from:A, to:B}`, siblings + the other end stay auto, the
**live path start moves to A's right border**, and `resetLayout()` clears it. Test 2
pins both ends across two drags. FR6 group-drag was already unit-covered the same way.

**Decision (explicit, per the coordinator's ask):** I mark REV-006 **verified for the
review track (code + unit scope)** and **hand the residual to phase ④, which owns
closure.** The TEST-002 crux — a **real-browser** e2e that hit-tests the small handle
over/near a card (z-index / `pointer-events` / pointer-capture), which a fake DOM
cannot exercise — is **not** delivered here and is a **mandatory phase-④ must-exercise**
for both FR7 edge-pin and FR6 group-drag. If phase ④ finds a hit-test/capture defect or
skips the e2e, it must raise a TEST finding (reopening this concern in the test track).
The developer's `fixed` note ("UNIT SCOPE fixed; e2e-pending-phase-4") is honest, and
the split is acceptable — the interaction geometry is byte-parity-guarded and the
handler logic is now exercised; only the real-DOM layering remains.

### REV-007 — index-keyed anchors validated + re-mapped on import — **VERIFIED**
`resolveAnchorOverrides` (src/layout/index.ts, static/CLI) and the runtime
`importLayout` re-map are **char-equivalent**: prefer the stored index when `from/to`
still match; else re-map to the **first still-unclaimed** edge with that `from/to`;
drop out-of-range / edge-gone / duplicate. I specifically checked the developer's
parallel-edge concern: two parallel `A→B` pins **cannot silently swap** — an unchanged
diagram keeps each pin at its stored index; a `claimed` set prevents two pins landing
on one edge; and ascending `Object.keys` + lowest-unclaimed `findIndex` makes the
re-map order-preserving (first-saved → first-in-new-order). `from/to` are **optional
and documented backward-compatible** (pre-REV-007 sidecars validated by bounds only;
index-only imports still work). Tests: drop-out-of-range + reorder re-map, runtime
**and** static.

### REV-008 — nested + pin-then-resize combos guarded — **VERIFIED**
Nested-subgraph re-hug is byte-parity-guarded (light+fancy; `Outer` nests `Inner`,
depth > 1; drag an `Inner` member; `toSvgString()` == `renderSvgFromModel` + XML valid;
`Outer` box encloses `Inner`, with `>=/<=` correctly allowing a coincident border).
Pin-then-resize re-clamp is byte-parity-guarded (pin offset 40, shrink the side; the
render re-clamps to `halfH − 6`, strictly on-border, no detach; `toSvgString()` ==
`renderSvg`).

## Developer's specific questions (answered)
- **Parallel/duplicate edges can't swap silently** — confirmed by inspection of both
  re-map twins (stored-index-preferred + `claimed`-set collision guard +
  order-preserving ascending re-map). The only theoretical ambiguity (two
  indistinguishable parallel edges literally reordering) is inherent to any
  from/to-keyed scheme and is resolved deterministically by insertion order. A
  dedicated parallel-pin test would be a nice-to-have but the logic is sound and the
  general reorder re-map is tested — not a finding.
- **`from/to` on the layout.json shape** — **additive and backward-compatible** both
  ways: old readers ignore the fields; new readers fall back to bounds-only validation
  when they're absent; documented in README + JSDoc. No new breaking change.

## Phase ④ must-exercise (hands-on, priority order)
1. **FR7 edge-pin (REAL browser):** select a node → grab a `.vnm-edge-handle` → drag to
   another border → anchor sticks (path start/end changes), other end auto, reload
   keeps it, **Reset** clears it. **(Closes REV-006's residual — mandatory.)**
2. **FR6 group-drag (REAL browser):** grab the container border/title, drag → members
   move + box re-hugs + persists; open-interior pans; member-card grab moves just the
   card. **(REV-006 residual — mandatory.)**
3. Pin-then-resize re-clamp; nested-subgraph re-hug + Save SVG/PNG; import a
   stale/out-of-range/reordered `layout.json` (incl. a parallel-edge pin) → correct
   edge pinned, no crash; no console errors / no network throughout.

## Verdict
**clean** (review track) — all 8 findings `verified`; 0 open blockers/majors.
Build/typecheck green, 300 unit + 47 e2e pass. Advancing to phase ④, which **owns**
REV-006's real-browser e2e closure (items 1–2 above are mandatory there).
