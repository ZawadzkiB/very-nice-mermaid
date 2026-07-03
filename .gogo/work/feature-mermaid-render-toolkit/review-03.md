# Review round 3 — mermaid-render-toolkit (focused re-review of the round-4 test-fix diff)

## Verdict: **APPROVE**

No open blockers or majors. All four test-fix commits verified good; the two
policy findings (D5/D6) honored exactly; no round-1/round-2 finding reopened;
the REV-001/REV-002 sanitization and REV-006 comma-rgb fixes still hold. One new
**nit** filed (REV-007, test-coverage gap) — non-blocking, agent-fixable.

Scope: the 4 round-4 commits and their blast radius only (round 2 already
APPROVED the rest). Green gates: `npm run build`, `npm run typecheck`,
`npm test` (109 unit, was 99), `npm run test:e2e` (10/10, was 8) — all clean.

## Per-fix verification

| Fix | Commit | Status | Verified |
|---|---|---|---|
| TEST-001 multi-rank routing | 2aa0eb9 | **verified** | See below |
| TEST-002 toolbar click guard | 5d466e7 | **verified** | See below |
| TEST-003 edges behind cards | (D5) | **wontfix** | Accepted as-is per D5; no code change — correct |
| TEST-004 zero-node CLI exit | c51ce39 | **verified** | See below |
| TEST-005 ASCII corner glyphs | d69c14a | **verified** | See below |
| REV-006 comma-form rgb()/hsl() | 429e832 | **verified** | Security suite green (below) |

### TEST-001 — route multi-rank edges around intervening nodes  (VERIFIED)
- **Avoids boxes, does not move the problem.** Independent Liang–Barsky scan over
  every shipped fixture: **0** edge segments cut a non-endpoint node, **0** NaN,
  **0** zero-length segments. The state-machine `errored→loading` "retry"
  back-edge now runs its horizontal leg at **y=217** (above the `success` diamond,
  whose center is y=278.5); the old bad path that sliced the diamond
  (`…L 104 278.5…`) is gone. Skip-level `A→B→C, A→C` detours to lane x=94 around B.
- **Border-anchoring intact.** First/last segments still leave/enter perpendicular
  to the border: `elbowThrough` sets `verticalFirst` from `exitVertical` on the
  first joint and `!entryVertical` on the last; endpoints remain `sidePoint(...)`
  anchors.
- **Threshold not off-by-one.** `edgeWaypoints` returns `[]` for dagre point
  count `<= 3` (adjacent edges keep the naive elbow) and threads `slice(1,-1)`
  only for a real detour (`> 3`). Confirmed adjacent-only fixtures render
  identically and the multigraph named-edge setup (`e${i}`, `multigraph:true`)
  pre-dates this diff, so the by-name lookup is sound.
- **Degenerate/NaN-safe.** `snapWaypoints` snaps within 2u to an anchor axis;
  `simplify` drops duplicate/collinear points; `roundedPath`'s `along()` guards
  divide-by-zero (`dist || 1`). Fancy (curved) waypoint paths verified NaN-free
  (3 waypoint edges in state-machine).
- **Parity (the key risk).** The inline `runtime.ts` copy
  (`snapWaypoints/elbowThrough/pathRounded/simplify/nAt`) matches `src/geometry`
  line-for-line for the elbow path. `test/dom-runtime-parity.test.ts` was extended
  with a real **waypoint** edge (`A→B→C, A→C`) that asserts `ac.waypoints.length>0`
  and that the live runtime's `d` for **every** edge equals `routeEdge(...)`
  threading the same waypoints — so drift in the NEW code path is caught. Ran it:
  green. (Caveat → REV-007: the parity test only instantiates the *light/elbow*
  theme, so the *curved* waypoint branch is uncovered — code verified equivalent
  today, but unguarded.)
- **Determinism (FR2).** No `Math.random`/`Date`/`performance.now` anywhere in
  `src/`. dagre's edge points are deterministic; state-machine SVG rendered twice
  is byte-identical (sha `6a49e81…`). `applyPositions` reuses the stored waypoints
  so sidecar/repositioned renders and the live drag stay in parity.

### TEST-002 — toolbar click guard  (VERIFIED)
`onPointerDown` early-returns on `target.closest('.vnm-toolbar')` before setting
pan mode / `setPointerCapture`. Guard is correctly scoped: `.vnm-minimap` is a
**sibling** with class `vnm-minimap` and its own `stopPropagation` handler, so the
guard cannot swallow it; background pan (target = viewport/world) and node drag
(target inside `.vnm-node`) both fall through unaffected. e2e regression
"fit-to-view actually resets the transform after a real mouse click" now **passes**,
and "minimap drag recenters the main view" passes — locking in that the minimap
path is untouched. 10/10 e2e green.

### TEST-004 — zero-node CLI error  (VERIFIED, matches decision D6)
- CLI: fully non-mermaid symbol-soup and empty input → **exit 1** with
  `error: no diagram found (input produced 0 nodes)` on **stderr**; **stdout empty**
  (0 bytes, no partial file — the check runs after layout, before any write).
- Valid file with an unknown construct (`click A callback`, ≥1 node) → **exit 0**,
  SVG on stdout, `ignored-statement` warning on stderr. Lenient posture preserved.
- **Library unchanged:** `parse()`+`layout()` on garbage returns the empty model
  (`nodes: 0`) **without throwing** — programmatic callers decide.
- Note (not a defect): D6 deliberately keys off *zero renderable nodes*, so
  word-salvage prose ("this is not mermaid…" → nodes `this`,`random`) still exits 0.
  That is the accepted D6 scope (unknown/partial input stays lenient), not a gap.

### TEST-005 — ASCII corner glyphs  (VERIFIED)
`ci-pipeline` markdown now renders with **0** `┼` glyphs and **51** corner glyphs
(`┌┐└┘`) with legible arrowheads; the old `┼│Lint passes?` artifact is now a clean
`┌│` corner. `Grid.corner()` upgrades to `┼` only when a *different* edge already
occupies the cell, and the genuine two-edge crossing test still asserts `┼`.

## No reopened findings / security posture
- Ran the targeted security suite (`onmouseover|url(|rgb|unsafe|classDef|zero-network|external`):
  **12/12 pass** — REV-001 attribute-breakout, REV-002 `url()` zero-network, and
  REV-006 comma-form `rgb()/hsl()` all hold.
- The waypoint/model additions carry **no injection surface**: `RoutedEdge.waypoints`
  are dagre-derived **numbers** rounded to 2dp (`round(p.x)`), never user strings;
  they reach only path-`d` arithmetic, not any attribute/text sink.

## New finding this round

| ID | Severity | Priority | Status | Tag | Title |
|---|---|---|---|---|---|
| REV-007 | nit | P3 | new | agent-fixable | Curved/fancy waypoint path (roundedPath/pathRounded) added by the TEST-001 fix is not covered by the REV-003 DOM-runtime parity guard |

**REV-007** — The parity test that REV-003 established to catch inline-runtime
drift only exercises the *light/elbow* theme; the round-4 diff added a
*curved*-style waypoint path (`geometry.roundedPath` ↔ `runtime.pathRounded`,
plus `labelPoint('elbow')` ↔ `labelPoly`) that is production-reachable under the
fancy theme yet unguarded. No drift exists today (implementations verified
equivalent; fancy waypoint output NaN-free) — a future-drift/coverage gap, not a
present defect. Fix: add a fancy-theme parity case (or parametrize the existing
two over `['light','fancy']`). Non-blocking.

## Gate summary
- `npm run build` — clean · `npm run typecheck` — clean
- `npm test` — 109 passed (9 files) · `npm run test:e2e` — 10 passed
- Determinism spot-check — state-machine SVG byte-identical across runs

**Verdict: APPROVE** — no open/new blockers or majors; the single new finding is
a nit. Advance.
