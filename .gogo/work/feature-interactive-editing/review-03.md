# Code review — `interactive-editing` — round 03 (reset-layout delta)

_Targeted re-review of the fix-round-2 delta only: the **reset-layout control**
added for D5=A (resolving phase-④ TEST-001 — the plan's D2 had cited an "existing
reset-layout control" that did not exist). Round-02's 5 findings stay `verified`;
this round checks the new delta against the review focus + standards._

## Gates (re-run independently)
- `npm run build` — **pass**. `npm run typecheck` — **pass**.
- `npm test` — **281 / 281** (280 + 1 new reset-layout unit test).
- `npm run test:e2e` — **45 / 45** (44 + 1 new reset-layout e2e); reset e2e, runtime
  zero-network, and no-console-error sessions all green.
- Both serialized twins NUL-free (`geometry` = 0, `runtime` = 0, `dom/index` = 0).
- Plan contract corrected: `plan.md` D2 no longer cites a non-existent control; it
  now describes the real ⟲ reset-layout control (checklist item 8 + 2 Tests rows).

## Review-focus verification

### 1. Does resetLayout() restore the COMPUTED layout (not the persisted one)? — **YES**
`resetLayout()` (runtime.ts:1040-1057) restores each node's `positions[id]` from
`model.nodes[].x/y` and `sizes[id]` from `baseSizes[id]`. Critically, both sources
are **immutable after mount**: `baseSizes` is written once at init (runtime.ts:89)
and never reassigned; `model.nodes[].x/y/width/height` are never mutated anywhere
(verified by grep — the only writes are to the separate mutable `positions`/`sizes`
maps). `loadPersisted()` → `importLayout()` mutates only `positions`/`sizes`, never
`model.nodes`/`baseSizes`. So even when a page boots with a persisted (dragged +
resized) layout, reset returns to the **dagre-computed** layout, not the persisted
one. The new unit test (dom-runtime-parity.test.ts:468-505) proves exactly this: it
seeds localStorage with a moved+resized A, asserts the mount booted **edited**, then
asserts `resetLayout()` yields a layout byte-equal to a **fresh un-edited mount**
(positions match, sizes undefined, edges re-spread from computed boxes).

### 2. Debounced-persist cancel — any resurrection race? — **NO**
`resetLayout()` clears the pending timer (`clearTimeout` + `persistTimer = null`,
runtime.ts:1045-1048) **before** `localStorage.removeItem` (1049-1055), and the
subsequent `renderAll()` schedules no new persist. The reset button lives in the
toolbar, and `onPointerDown` bails on any `.vnm-toolbar` target, so clicking Reset
cannot start a drag/resize whose pointerup would re-`schedulePersist()`. Even if the
400 ms debounce had already fired (storage written) before the click, `removeItem`
then clears it. A reload therefore reads no entry and stays reset — confirmed by both
the unit test (`KEY in store === false`) and the e2e (reload keeps computed layout).

### 3. DeferredHandle delegation + `"in r"` guard for sequence — **CORRECT**
`DeferredHandle.resetLayout()` (dom/index.ts) delegates via `if (r && "resetLayout"
in r) r.resetLayout()` — a settled sequence shell lacks the method, so it is a silent
no-op, no throw; same pattern as `exportLayout`/`toSvgString`/`getPositions`.
`DeferredHandle` now `implements RuntimeHandle` with both new methods, and typecheck
passes. The e2e sequence sessions (no console errors) confirm no runtime throw.

### 4. Zero-network + parity guards still green, no serialized-runtime drift — **YES**
The reset-layout code adds no external resource (`⟲` glyph, `localStorage.removeItem`
— no `url(`/`src=`). All export-html zero-network guards, the `toSvgString`
byte-parity, and the shape/subgraph parity tests pass within the 281 unit run, and
the runtime zero-network e2e passes. The `computePorts`/`raySide`/`routeBoxes` diff
seen in `git diff HEAD` is round-1/2 work already verified in rounds 01–02, not new;
REV-005's `|` delimiter remains in lockstep in both twins.

### 5. Standards pass on the delta — **CLEAN**
Deterministic (no `Date.now`/`Math.random` in the new path); no silent failures (the
`removeItem` try/catch mirrors the existing `persistNow`/`loadPersisted` storage
idiom); matches surrounding code style with lockstep comments; the toolbar ⟲ button
is placed with fit/zoom, before Save SVG/PNG, as reported; README + plan.md + charts
updated so docs and contract match the code.

## Findings
No new review findings this round. The 5 prior findings remain **verified** and were
re-confirmed unregressed by the delta:

| id | sev | status |
|----|-----|--------|
| REV-001 | major | verified |
| REV-002 | minor | verified |
| REV-003 | minor | verified |
| REV-004 | nit | verified |
| REV-005 | nit | verified |

## Notes for phase ④ (re-test)
The reset-layout unit + e2e already cover the happy path (drag+resize → reset →
computed restored → reload sticks, no console errors) and were run green here. Re-test
can simply confirm the full TEST-001 loop is closed; no additional exercise required
beyond the existing suite.

## Verdict
**clean** — reset-layout delta is correct and well-covered; 0 open blockers/majors,
all prior findings verified. Build/typecheck green, 281 unit + 45 e2e pass, the D2/D5
plan contract now matches the shipped control. Advancing to phase ④ (re-test).
