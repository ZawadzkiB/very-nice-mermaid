# Review round 03 — flowchart-render-legibility (focused re-review of round-2 fixes)

- **Scope:** FOCUSED verification of the four round-2 findings only (REV-002 major,
  REV-003 minor, REV-004/REV-005 nits) — NOT a whole-feature re-review. Base:
  `git diff master` (working tree, branch `fix/flowchart-render-legibility`).
- **Gates:** `npm run build` green (incl. DTS) · `npx vitest run` green
  (**374 passed / 29 files**) · `dom-runtime-parity` byte guard green (32 tests).

## Verdict: **APPROVE** (no open blockers/majors)

REV-002 (major), REV-003 (minor) and REV-005 (nit) are each genuinely resolved and
independently verified; REV-004's WONTFIX disposition is confirmed reasonable (and the
REV-002 tightening slightly *reduces* its latent-clip surface); REV-001 stays WONTFIX
with its only functional tail closed by REV-002. No new findings.

---

## Findings status this round

| id | sev | pri | status | title |
|----|-----|-----|--------|-------|
| REV-001 | nit | P3 | wontfix | Shared `PORT_STEP`/`PORT_SPREAD_FRAC` bump ripples into class/state spread (label-plate tail closed by REV-002) |
| REV-002 | major | P1 | **verified** | FR6 not enforced for class/state (tight de-collision vs looser drawn plate) → **FIXED** |
| REV-003 | minor | P2 | **verified** | `renderSvgAsync` dropped `opts.bridges` for class/state → **FIXED** |
| REV-004 | nit | P3 | wontfix | Bounds/viewBox exclude label plates → potential perimeter clip (not observed) |
| REV-005 | nit | P3 | **verified** | Two crossings <2·radius on one segment splice a backward-L hop → **FIXED** |

---

## REV-002 (major) — VERIFIED RESOLVED

Both native sinks now draw the shared tight plate:
`src/native/class/svg.ts:158` and `src/native/state/svg.ts:108` `edgeLabel` call
`labelPlateSize(label, theme)!` (the FR3/FR6 size `0.6·size+6 / lines·lh+2`) — the exact
size that `deCollideLabels`/`plateSizeOf` use — instead of the old `0.62·size+10 / +4`.

- **Diff is minimal + in-scope.** The only change to each `svg.ts` is the `labelPlateSize`
  import + the two-line formula swap (verified against `git diff master`). Nothing else
  touched; sequence `edgeLabel` confirmed UNCHANGED (still `0.62·size+10`, out of scope).
- **De-collision assumption now holds.** Because the drawn plate == the de-collision plate
  for all three D5 tiers, the earlier failing case (two long class labels cleared to a 6px
  gap by `resolveLabelCollisions` but overlapping ~4.86px on x as *drawn*) now clears — the
  drawn plate is the tight plate.
- **Guards assert the REAL emitted rect** (not `labelPlateSize` on both sides — the exact
  false-confidence pattern round 2 flagged). The class/state tests regex the rendered SVG
  for the `<rect …/><text…>extends|start<` pair and assert its `width/height ==
  labelPlateSize` (`toBeCloseTo(…, 6)`). A revert to `0.62·size+10` would fail them; both
  PASS.
- **Snapshot delta is exactly the plate shrink.** `extends`: w `70.76→64.8` (`=7·14·0.6+6`),
  h `22→20` (`=18+2`). The anchor shifts also present (e.g. `191.25→188.25`, `181.25→175.25`)
  are the *already-accepted* round-1 REV-001 `PORT_STEP` ripple, not new; viewBox, cards and
  markers are unchanged.
- **PNGs clean.** Regenerated `examples/png/class-clean-light.png` +
  `state-clean-light.png` show no label clipping (`fetch`/`2xx`/`fail`/`retry` fully legible;
  inheritance triangles cleanly separated). The width basis uses `size` at 0.6 while text
  draws at `size − 1`, so the tighter plate still clears real labels.
- **No import cycle.** `src/layout/index.ts` imports nothing from `native/*`, so
  `native/{class,state}/svg.ts → layout/index.js` is a clean downward edge. Build (incl.
  DTS) is green and the CLI `child_process` tests run the path at runtime with no init-order
  break.

## REV-003 (minor) — VERIFIED RESOLVED

`src/render/route.ts` `renderSvgAsync` now forwards `{ theme, bridges: opts.bridges }` into
`layoutClass` (line 67) and `layoutState` (line 69); `renderHtmlAsync` threads it too
(lines 89, 91). No remaining class/state layout call on the async surface drops the option;
sequence is correctly excluded and flowchart delegates to the sync `renderSvg` (already
threaded). `renderSvgAsync(classOrStateDsl, { bridges:false })` now honors the opt-out, and
`undefined` still resolves ON-for-elbow via `?? true` (no snapshot churn).

## REV-005 (nit) — VERIFIED RESOLVED

`geometry.bridgedPath` (`src/geometry/index.ts:550-563`) and the runtime twin
(`src/render/dom/runtime.ts:1210-1222`) are byte-identical in the hop-skip: both init
`lastHopDist = -Infinity`, skip when `h.dist − lastHopDist < 2·BRIDGE_RADIUS` (geometry) /
`< 10` (runtime, `2·5=10`), update `lastHopDist` only on a *placed* hop, emit
`L …−5  Q …·2  …+5`, sort `segHops` by `p.dist − q.dist`, and both `applyEdgeBridges` push
`dist: dEntry = hypot(x − s1)` identically — so a multi-hop segment cannot break byte-parity.
New geometry test *"collapses two crossings closer than 2·radius on one segment to a single
hop (REV-005)"* PASSES; `dom-runtime-parity` (32 tests) green.

## REV-004 (nit) — WONTFIX confirmed reasonable

`contentBounds` still builds the viewBox from node boxes + raw edge points only. The clip
remains **unobserved** across the corpus + repro (`BOUNDS_PADDING=20` absorbs the nudge), and
the REV-002 tightening *shrinks* the class/state plate (64.8 vs 70.76 / 20 vs 22), slightly
**reducing** the perimeter-clip surface for those tiers. Folding label-plate extents into
`contentBounds`/`boundsAbs` would churn every viewBox and needs a parity mirror — a sound
trade to defer for a non-observed clip. No code expected this round.

---

## Gates

- `npm run build` — success (ESM + DTS).
- `npx vitest run` — **374 passed / 29 files** (was 371 in round 2; +3 from the new
  REV-002 class/state guards and the REV-005 geometry test).
- `dom-runtime-parity` — 32 tests green (byte guard intact).

**New findings this round: none.**
