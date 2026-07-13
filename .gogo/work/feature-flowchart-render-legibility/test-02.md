# Test round 02 — flowchart-render-legibility (FR6 label de-collision + FR7 edge bridges)

- **Feature:** re-planned additive scope on top of shipped FR1-FR5 — **FR6**
  (`resolveLabelCollisions`, shared all-pairs edge-label plate de-collision)
  and **FR7** (`applyEdgeBridges`/`segmentsCross`, D2 arc-hop bridges at genuine
  edge crossings, D3 overpass tie-break, D4 per-style `bridges` toggle),
  scoped to flowchart + state + class (D5, sequence excluded), mirrored
  byte-for-byte in the static SVG and the inlined DOM runtime.
- **Scope tested:** `src/geometry/index.ts` (`resolveLabelCollisions`,
  `applyEdgeBridges`, `segmentsCross`), `src/layout/index.ts`
  (`finishEdges`/`applyBridges`), `src/render/svg.ts`, `src/cli/run.ts`
  (`--no-bridges`), `src/render/dom/runtime.ts` (+ `payload.ts`),
  `src/native/{class,state}/{layout,svg}.ts` (REV-002 tight-plate parity) —
  per `plan.md`'s Tests table and BDD scenarios; re-verifying round-1's
  **TEST-001** (open, major) is genuinely fixed; hands-on against
  `scratchpad/repro.mmd`, a purpose-built crossing fixture, and
  `fixtures/state-machine.mmd` / `shop-class.mmd` / `order-state.mmd`.

## Verdict: **GREEN — done-bar MET**

Build, typecheck, all **374 unit tests / 29 files** (incl. the byte-parity
guard, 32 `dom-runtime-parity` tests), and all **79 e2e tests** (73 pre-existing
+ 6 new FR6/FR7 tests added this round) are green. Hands-on browser +
PNG + determinism exploration (fully run, nothing blocked) **confirms TEST-001
is fixed** — verdict flipped to `verified` — and found one new issue
(**TEST-003**, minor), a stale e2e assertion invalidated by FR7's own intended
behaviour, which was fixed in-round as a test-file-only change. No open
blockers.

---

## What was exercised, level by level

### 1. Build / typecheck / unit (required green before exploring)
| Command | Result |
|---|---|
| `npm run typecheck` | **PASS** — clean, no errors |
| `npm run build` | **PASS** — tsup ESM + DTS build clean (`dist/index.js`, `dist/cli/index.js`, `dist/element.js`) |
| `npm test` (vitest) | **PASS** — **374/374 tests, 29/29 files**, ~21s |

Matches the expected count from `review-03.md` (374 passed / 29 files, incl.
the REV-002 class/state drawn-plate guards + the REV-005 geometry test). The
`dom-runtime-parity` suite (32 tests) — the byte-parity guard between the
static SVG and the inlined DOM runtime after FR6+FR7, clean **and** sketch —
is green.

### 2. e2e (Playwright, hands-on REQUIRED)
Chromium was already installed (`~/Library/Caches/ms-playwright`), so no
install step was needed.

**First run: 72/73 passed, 1 failure** —
`e2e/interactions.spec.ts:145 "the fancy theme routes curved edges; light
routes orthogonal elbows"`. Root-caused (not guessed) by rendering
`fixtures/state-machine.mmd` (the fixture this test drives) via
`renderSvgAsync` and inspecting each edge's `d`: **2 of 7 edges carry a `Q`
bridge-hop bump**, matching the round-2 brief's own note that
`state-machine.mmd` "is expected to have 2 crossings". The old assertion
(`no C or Q in an elbow path`) predates FR7 and is now stale — FR7's D2 arc
hop deliberately splices a small `Q` into the hopping edge's `d` at a genuine
crossing, and D4 defaults bridges ON for this diagram's theme (light = clean
elbow). This is filed as **TEST-003** (new, minor) and fixed in-round
(test-file-only, no product code touched) — see Issues below.

**After the TEST-003 fix: 73/73 passed.**

**Added new coverage** (`e2e/bridges-and-labels.spec.ts`, 6 tests, per the
plan's Tests table e2e row — "HTML export of the repro: labels legible with a
gap, crossings show hops, 0 console errors"):
- FR6: "batch load"/"feed" plates from two different edges never overlap
  (AABB check against real `getBoundingClientRect()` geometry), 0 console
  errors — and holds across dark/fancy themes too.
- FR7: a diagram with exactly one genuine crossing renders exactly one bridge
  hop, 0 console errors.
- FR7: dragging the shared node (real `page.mouse.move/down/move/up`, not
  `.click()`) re-routes live and keeps exactly one clean hop — no stale/
  duplicate bridge after the reroute.
- D4: `--no-bridges` removes the hop entirely for the identical diagram
  (extended `e2e/helpers.ts`'s `exportHtmlFromDsl` with an `extraArgs`
  parameter to thread the flag through the CLI export).
- D5: a sequence diagram with crossing message lines gets zero bridge glyphs.

**Final e2e run: 79/79 passed** (73 + 6 new).

Test-file changes this round (no product code touched):
- `e2e/interactions.spec.ts` — narrowed the stale elbow-path assertion (TEST-003).
- `e2e/helpers.ts` — added an `extraArgs` parameter to `exportHtmlFromDsl` so
  e2e specs can thread arbitrary CLI flags (used for `--no-bridges`).
- `e2e/bridges-and-labels.spec.ts` — new, 6 tests (above).

### 3. Hands-on browser exploration (gogo-playwright MCP)
The MCP's `browser_navigate` blocks `file://` directly (same wrinkle test-01
hit) — worked around identically with a local `python3 -m http.server`
(functionally equivalent to the Playwright test suite's own `file://`
convention, which the actual e2e suite above uses directly).

**FR6 (TEST-001 re-verification).** Rendered `scratchpad/repro.mmd` to HTML
(`node dist/cli/index.js render scratchpad/repro.mmd -f html --theme light`),
navigated with the MCP, and read the real rendered geometry via
`browser_evaluate`:
- "batch load" plate: `x 517.55..635.80, y 287.44..313.72`
- "feed" plate: `x 603.22..655.25, y 321.60..347.88`
- AABB check: x-ranges overlap, but **y-ranges do NOT** (gap of **7.88px**) →
  **zero intersection**. Full-page screenshot confirms both labels sit on
  clearly separate rows with a visible gap, both fully legible — see
  `scratchpad/test-out-round2/repro-html-full.png`.
- Console: 0 real errors (`browser_console_messages` showed only a benign
  `favicon.ico` 404 from the ad hoc local HTTP server, not an app-level error).

**FR7 (bridge hops).** Rendered a purpose-built crossing fixture
(`X-->M, Y-->M, M-->P, M-->Q, X-->Q, Y-->P`) — reliably produces exactly one
unavoidable crossing:
- `browser_evaluate` over `svg.vnm-edges path[marker-end]` found **exactly 1**
  path with a `Q` command (index 4 of 6) — matches "exactly 1 crossing".
- Screenshot (`scratchpad/test-out-round2/crossing-html-full.png`) shows a
  clean, small semicircular arc bump right at the crossing — D2 arc hop, not
  malformed, doesn't cover a node or label.
- `fixtures/state-machine.mmd` (interactive HTML export): **exactly 2** paths
  (of 7) carry a `Q` — matches the round-2 brief's "expected to have 2
  crossings". 0 console errors. Screenshot:
  `scratchpad/test-out-round2/state-machine-html-full.png`.

**Drag interaction (live re-route).** In the crossing diagram's interactive
HTML export, dragged node **M** via a real pointer sequence
(`page.mouse.move → down → move(steps) → up` equivalent through the MCP's
`browser_drag`, which drives Playwright's real mouse down/move/up under the
hood — not a synthetic `.click()`) to a new location. After the drag:
- Node M's `getBoundingClientRect()` confirmed the move landed.
- Edge `d` strings re-computed: still exactly **2** paths with a `Q` hop
  (the crossing topology changed shape with M's new position, but bridging
  stayed correct and singular per crossing — no stale hop, no duplicate).
- 0 console errors throughout.
- Screenshot: `scratchpad/test-out-round2/crossing-after-drag.png` — two
  clean arc bumps visible, neither malformed nor overlapping a node/label.
(This hands-on finding is now also permanently covered by the automated
`e2e/bridges-and-labels.spec.ts` drag test above.)

### 4. Hands-on visual (PNG), pixel-picky per project standard
`scratchpad/repro.mmd` rendered to PNG across all **6 theme x style combos**
(light/dark/fancy x clean/sketch) — all render cleanly:
- **FR1-FR5 (original defects)** stay fixed in every combo: subgraph titles
  legible and clear of crossing edges, the 6-edge hub fan-in shows
  individually distinguishable arrowheads, no edge paints over a label.
- **TEST-001 (batch load / feed)** confirmed fixed in every combo — both
  labels on separate rows with a visible gap, fully legible, in light, dark,
  fancy, and both clean/sketch styles.
- No crossing exists in this particular diagram (dagre routes it without one),
  so no bridge is expected here — consistent with the round-2 brief's note
  that "bridges will only appear where a crossing is genuinely unavoidable".

Files: `scratchpad/test-out-round2/repro-{light,dark,fancy}-{clean,sketch}.png`.

**Crossing diagram → PNG** (`scratchpad/test-out-round2/crossing-default.png`):
eyeballed the hop arc — a clean, small "overpass" bump right at the crossing
point, not covering a node or a label. Matches the interactive HTML result.

**`--no-bridges` removes all hops** — rendered the crossing diagram to SVG
twice (`-f svg`, once default, once `--no-bridges`) and grepped for `" Q "`:
- default: **1**
- `--no-bridges`: **0**

**Curved (fancy) and sketch show no EXTRA hops by default (D4).** A raw `" Q "`
grep isn't meaningful on its own for these styles since curved beziers and
sketch's rough-stroke rendering both use `Q` commands natively for their own
curve/wobble math (fancy: 8 `Q`s from the bezier routing itself; sketch: 104
`Q`s from the hand-drawn stroke perturbation) — so instead **diffed default
output against explicit `--no-bridges` output**:
- fancy default vs fancy `--no-bridges`: **byte-identical** → bridges are
  already effectively OFF by default for fancy.
- sketch default vs sketch `--no-bridges`: **byte-identical** → bridges are
  already effectively OFF by default for sketch.
- light/clean default vs light/clean `--no-bridges`: **differ** (1 Q vs 0 Q)
  → bridges are ON by default for clean elbow, as designed.

Source-verified (not guessed) why forcing `bridges: true` via the API has no
effect on the fancy/curved diagram: `src/layout/index.ts:40` hard-gates
`const enabled = theme.edgeStyle === "elbow" && (bridges ?? true)` — bridges
can only ever activate when `edgeStyle === "elbow"`, regardless of the
`bridges` option's value. This exactly matches the plan's own Out-of-scope
note ("Bridges on curved/bezier and sketch crossings ... a scoped follow-up,
not a regression to those styles") and the code's own comment ("OFF for
curved (its beziers this pass can't splice)") — **intentional v1 scope, not a
bug**, so not filed as an issue.

**Class + state fixtures (REV-002 verification).**
- `fixtures/shop-class.mmd` → PNG: all labels ("extends", "owns", "has",
  "visits", "uses") legible, cleanly separated, no overlap; class-card
  member/method plates render tight per the REV-002 fix.
  (`scratchpad/test-out-round2/shop-class.png`)
- `fixtures/order-state.mmd` → PNG: "start"/"stop"/"pause"/"resume"/"fault"
  all legible with clear separation; grepping the SVG confirms **exactly 1**
  `Q` bridge hop (matches "order-state.mmd is expected to have a crossing").
  A cropped zoom on the hop's exact coordinates
  (`scratchpad/test-out-round2/order-state-crop2.png`) shows a small, clean
  arc bump right where the Idle/Running loop crosses the Crashed→end path —
  not malformed, doesn't cover the end-state marker or a label.
  (`scratchpad/test-out-round2/order-state.png`)

### 5. Determinism
Rendered the same diagram to SVG twice in a row and diffed byte-for-byte:
| Diagram | Result |
|---|---|
| `scratchpad/repro.mmd` | **IDENTICAL** |
| crossing fixture (1 bridge hop) | **IDENTICAL** |
| `fixtures/order-state.mmd` (1 bridge hop) | **IDENTICAL** |

No `Date.now()`/RNG artifacts leak into output — FR8's determinism bar holds.

### 6. D5 scope guard (sequence excluded)
`fixtures/order-sequence.mmd` rendered with and without `--no-bridges`:
byte-identical output, **0** `Q` commands present — confirms the sequence
tier is completely untouched by the bridges mechanism, as D5 requires. Also
covered by the new automated e2e test (D5 describe block in
`e2e/bridges-and-labels.spec.ts`).

### 7. SVG validity
All generated SVGs (repro across 6 combos, crossing default/no-bridges/fancy/
sketch, state-machine, order-state, sequence) parsed successfully as
well-formed XML via `xml.dom.minidom` — no malformed markup from the bridge
splice or label nudge.

---

## This round's issues

| id | severity | priority | status | title |
|---|---|---|---|---|
| TEST-001 | major | P1 | **verified** | Two adjacent edge-label plates overlap ("batch load" / "feed") — re-tested, fix holds, closed |
| TEST-002 | minor | P2 | fixed (round 1) | Stale `e2e/sketch.spec.ts` direct-child selectors — unrelated to this round, not re-touched |
| TEST-003 | minor | P2 | **fixed (this round)** | Stale `e2e/interactions.spec.ts` "no C or Q" elbow assertion, invalidated by FR7's own intended bridge-hop behaviour — test-file-only fix |

Full detail (repro geometry, root cause, fix) in `test/issues.json`.

---

## Done-bar check (`test-strategy.md`: build clean AND all unit AND all e2e
green, PLUS hands-on exploration)

| Bar | Status |
|---|---|
| Build clean | done (ESM + DTS) |
| Typecheck clean | done |
| All unit green | done — 374/374, 29/29 files |
| All e2e green | done — 79/79 (73 pre-existing + 6 new FR6/FR7 tests) |
| Hands-on exploration done | done — nothing blocked. Browser (MCP over local HTTP) + Playwright test-runner (native file://) + CLI PNG across 6 theme/style combos + 2 native tiers (class/state) + determinism + D5 scope guard, all console-clean |
| No open/new blocking issues | done — TEST-001 verified closed; TEST-003 found + fixed in-round (test-file-only); no needs-user-decision items |

**Verdict: done-bar MET.** Every check that could run, ran — no blocked
hands-on/e2e checks this round (the only wrinkle was the MCP's `file://`
navigation block, worked around with a local static HTTP server exactly as in
round 1, so nothing was skipped or silently deferred). TEST-001 (the blocker
that routed round 1 back to implement) is confirmed fixed by direct
measurement of the rendered label-plate geometry, not just by reading the
fix summary. FR7's bridge hops render cleanly and deterministically at every
genuine crossing tested (flowchart, state), respect the D4 per-style default
(ON for clean elbow, OFF for fancy/sketch, `--no-bridges` overridable), and
D5's sequence exclusion holds. The byte-parity guard (`dom-runtime-parity`,
32 tests) stays green throughout. This feature is ready to advance to
⑤ report.
