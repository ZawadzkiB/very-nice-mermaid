# Test round 6 — D12 (API Gateway fan de-knot)

**Scope:** test ONLY the D12 change (heading-order shared-border ports). Rounds
1-5 already tested green; review round 6 APPROVED D12 (0 blockers/majors, 1 nit
REV-009 fixed this round on the review side). This round re-confirms the
suites, then exercises D12 hands-on at every level the plan's done-bar requires
(static render, interactive runtime, live drag, e2e).

## Suites (re-run to confirm, not taken on faith)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run build` | success (ESM + `.d.ts`, tsup) |
| `npm test` | **388 passed / 29 files** — incl. all 3 D12 guards: `geometry.test.ts` bends-order unit, `layout.test.ts` API-fan no-inversion integration ("orders the API Gateway fan by heading so its outgoing edges don't knot"), and `dom-runtime-parity.test.ts`'s REV-009 STATE re-route byte-parity guard |
| `npm run test:e2e` | **79 passed / 79** (after 2 in-round test-file fixes — see Issues) |
| Determinism | `scratchpad/repro.mmd` → SVG rendered twice, byte-identical |

## Hands-on: the knot is gone (static)

Rendered `scratchpad/repro.mmd` to PNG (`--theme light`) and inspected the API
Gateway region. Traced all three of its outgoing edges' raw path coordinates:

| Edge | Exit x (API's bottom border, left→right) | Behaviour |
|---|---|---|
| `feed` → V1 (Schema check) | 653.5 | peels **left** |
| `alt path` → K2 (Route message) | 683.5 | drops **straight down** (label sits on a clean vertical, no jog) |
| `API` → HUB (Aggregator hub) | 713.5 | peels **right**, around the Kukuvara subgraph |

Exit order (653.5 < 683.5 < 713.5) is monotonic with each edge's heading — no
inversion, no crossing under the node. Visually confirmed via a cropped
close-up (three lines fan out cleanly, `alt path` lands square on `Route
message` with the label clear of all three lines). This matches the accepted
D12 fix exactly ("feed peels left, alt path drops straight down, API→hub peels
right").

## Hands-on: interactive parity + live drag (highest-value check — not blocked)

Built (`npm run build`), exported `scratchpad/repro.mmd` to interactive HTML,
and drove it with the bundled Playwright MCP. `file://` navigation is blocked
by the MCP (documented, pre-existing) — served the export over a local static
HTTP server (`python3 -m http.server`, project-established workaround from
round 2) instead of skipping the check.

- **On load:** the interactive render is visually identical to the static PNG
  (same fan-out, no pop/reshuffle). Console: 1 message total, the known benign
  `favicon.ico` 404 — **0 app-level console errors**.
- **Drag test:** dragged the **API Gateway** node with real `page.mouse`
  down/move(12 steps)/up events (not `element.click()`) to a new position
  (~150px left, ~200px down from its start). Re-read all edge paths + node
  `style.left/top` afterward:
  - `feed` now exits API's **left** border (V1 is now to the left) and enters
    V1 from V1's right side — a full side re-assignment, handled cleanly.
  - `alt path` and `API→HUB` both exit API's **bottom** border; heading order
    still holds (`alt path` heading x=679.5 < `HUB` heading x=802 ⇒ `alt path`
    keeps the left port, `HUB` the right) — verified no inversion, no crossing,
    by tracing both paths' segments.
  - Screenshot confirms a clean fan post-drag, matching the numeric trace.
  - Console after drag: still just the benign favicon 404 — **0 app-level
    errors**.

Nothing was blocked this round — the `file://` limitation was worked around
(local HTTP server), consistent with prior rounds; this is **not** a
needs-user-decision item.

## Regenerated examples (D12 + pre-existing FR4 drift)

Eyeballed `examples/png/{flowchart,class,state}-{clean,sketch}-light.png`:

- **flowchart:** clean, no overlaps, no stray crossings.
- **class:** clean (D12 is a no-op here — no waypoints/detour edges in this
  fixture).
- **state:** clean; zoomed the Loading↔Error region — **confirmed** the
  "fail"/"retry" labels sit clearly off their lines with a visible gap on both
  the clean and sketch renders (the disclosed bonus from D12's state
  byte-parity work).

All six read as clean or improved; no new defects.

## Issues found this round

Two **e2e failures on first run**, both root-caused as **pre-existing and
unrelated to D12** (verified by temporarily disabling D12's `bends` parameter
at both `computePerimeterPorts` call sites in `src/layout/index.ts`, rebuilding,
and re-rendering the failing fixture — byte-identical output with D12 on or
off, then immediately reverted; typecheck+build re-confirmed clean). Both were
stale test-file assertions left over from the FR7 arc→gap glyph pivot
(implement round 7 / review round 5) that no e2e round had exercised before
D12's UAT finding. Fixed in-round (test-file-only, no product code touched),
following the same precedent as TEST-002/TEST-003 in earlier rounds:

- **TEST-005** (minor, fixed): `e2e/interactions.spec.ts` still asserted the
  pre-pivot `Q` bridge-hop glyph; updated to the current gap-glyph (`L .. M
  ..`) pattern.
- **TEST-006** (minor, fixed): `e2e/bridges-and-labels.spec.ts` assumed its
  `CROSSING_DSL` fixture forces exactly one crossing; the shipped layout (grown
  across several FR9/hub-spread rounds) now genuinely produces two independent
  crossings for that fixture. Updated the assertion from `toBe(1)` to `toBe(2)`
  with the coordinate trace recorded inline. Flagged (not a blocker):
  `test-strategy.md` line 78 still says "(1 hop)" for this fixture — worth a
  one-line correction at the next knowledge sync; out of the tester's scope to
  edit directly.

Re-ran `npm run test:e2e` after both fixes: **79/79 pass**.

### Carried forward, NOT re-tested this round (out of D12 scope)

- **TEST-004** (major, `open`, unchanged from round 4): the FR9
  extreme-drag lane-convergence limitation (dragging Ingress to world
  (138,320) can collapse the mid-channel bundle back to 20/20px). Per this
  round's explicit scope — "test ONLY the D12 change" and the task's own
  framing that "Box-1 (Ingress-out fan) endpoint limitation + extreme-drag
  re-merge are pre-existing disclosed limitations from earlier rounds" (the
  D11 UAT decision moved past this without picking A/B and pivoted to gaps +
  label work instead) — this round did not re-drive that repro. Status is left
  exactly as round 4 recorded it: **open**, unverified. This is surfaced here
  rather than silently dropped so the routing decision (fix / formally
  wontfix+document / re-test later) is made explicitly, not by omission.

## Verdict

**D12 (this round's scope): GREEN.** Build, typecheck, unit (388/29, incl. all
3 D12 guards), and e2e (79/79, after fixing 2 in-round pre-existing test-file
staleness issues unrelated to D12) are all green. Every hands-on check that
applies to D12 ran — nothing was blocked: static render confirms the knot is
gone; the interactive runtime matches the static render on load (no pop); a
real live drag of API Gateway re-routes cleanly with zero crossings and zero
console errors; examples regenerated and eyeballed clean, including the
disclosed state label bonus. Determinism holds.

**Overall done-bar:** not unconditionally all-green — `test/issues.json` still
carries **TEST-004** as `open` (major), a pre-D12 FR9 limitation this round
deliberately did not re-test per its explicit D12-only scope. If the
orchestrator's intent is "D12 is the last gate before ⑤ report → UAT," this
round's result supports that. If TEST-004 needs a final disposition
(fix / formally accept as a documented limitation via a decision record / defer
further) before advancing, that call belongs at the routing step, not silently
resolved here.
