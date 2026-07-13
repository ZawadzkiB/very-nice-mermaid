# Test round 01 — flowchart-render-legibility

- **Feature:** flowchart render legibility (5-layer draw order, opaque subgraph
  title plate, tighter label plate, wider fan-in spread; static SVG + inlined
  DOM runtime).
- **Scope tested:** `src/geometry/index.ts`, `src/layout/index.ts`,
  `src/render/svg.ts`, `src/render/dom/runtime.ts` per `plan.md`'s Tests table
  and BDD scenarios; hands-on against `scratchpad/repro.mmd` (the acceptance
  signal fixture: titled subgraph with a top-member edge + a 6-edge hub fan-in).

## Verdict: **issues found — done-bar NOT met**

Build, typecheck, all 346 unit tests, and all 73 e2e tests are green. Hands-on
browser + PNG exploration (fully run, nothing blocked) found **one real,
reproducible legibility defect** (TEST-001, major) not covered by FR1-FR4, and
one pre-existing e2e regression (TEST-002) that was a test-selector-only issue,
already fixed in this round. Because TEST-001 is `open`, the phase routes back
to **② implement**.

---

## What was exercised, level by level

### 1. Build / typecheck / unit (required green before exploring)
| Command | Result |
|---|---|
| `npm run typecheck` | **PASS** — clean, no errors |
| `npm run build` | **PASS** — tsup ESM + DTS build clean (`dist/index.js`, `dist/cli/index.js`, `dist/element.js`) |
| `npm test` (vitest) | **PASS** — **346/346 tests, 29/29 files**, 23.75s |

Confirmed the FR-specific assertions this feature added are present and green:
- `test/render-svg.test.ts` — "layered draw order + opaque subgraph title
  (FR1/FR2)": every edge path emitted before any edge label/subgraph title;
  title on opaque plate; node groups painted last.
- `test/geometry.test.ts` — "fan-in spread keeps N incident arrowheads
  distinguishable (FR4)" (widened `PORT_STEP` 20→26); "titled subgraph reserves
  a taller title band (FR2)" (`SUBGRAPH_TITLE_BAND` 22, up from 18).
- `test/layout.test.ts` — tightened label-plate formula (`0.6·chars+6 /
  lines·lh+2`).
- `test/dom-runtime-parity.test.ts` (30 tests) — static SVG and inlined DOM
  runtime byte-parity across light/dark/fancy, including the titled-subgraph
  path — **all green**.
- `test/interactive-ports.test.ts` — updated for the new `g.vnm-edge-layer`
  DOM nesting — green.

### 2. e2e (Playwright, hands-on REQUIRED) — ran, found + fixed a regression
`npm run test:e2e` (chromium, pre-installed): **initially 70/73 passed, 3
failed**, all three in the pre-existing `e2e/sketch.spec.ts` (from the earlier
`sketch-style` feature — this feature's diff does not touch that file):
- `renders hand-drawn wavy node outlines and edges (not crisp rects)`
- `dragging a node re-routes its rough edges live and keeps the wobble`
- `class: renders hand-drawn card outlines without console errors`

**Root cause (verified via the gogo-playwright MCP, not guessed):** FR1's
5-layer draw-order restructure moved every edge/node `<path>` from a **direct
child** of `<svg class="vnm-edges">` into a nested `<g class="vnm-edge-layer">`
/ `<g class="vnm-node-layer">` (`src/render/dom/runtime.ts:197-212`). The 3
failing assertions used a direct-child CSS combinator
(`svg.vnm-edges > path...`), which now matches 0 elements. I rendered the
sketch-flowchart HTML export, navigated to it with the bundled Playwright MCP,
and confirmed by `evaluate()`: `svg.vnm-edges` has **0** direct-child `<path>`s
but **54** descendant `<path>`s (42 stroked) — the paths render correctly, just
one level deeper. A full-page screenshot confirmed the hand-drawn sketch
flowchart is visually correct (wobbly outlines, open arrowheads, everything
legible). This is a **test-selector staleness** issue, not a functional
regression — `review-01.md`'s dimension-6 pass ("the only consumer of the
former flat structure ... was updated") missed that `e2e/sketch.spec.ts` was
also a consumer.

**Fixed this round** (test-file-only, no product code touched — filed as
**TEST-002**, `status: fixed`): updated the 3 selectors in
`e2e/sketch.spec.ts` from `svg.vnm-edges > path...` to `svg.vnm-edges
path...` (descendant, matching the new intentional layer nesting). Re-ran:
**`npm run test:e2e` → 73/73 pass.**

**Then, the required hands-on exercise** of the subgraph+fan repro in a real
browser (served over local HTTP since the MCP navigate tool blocks `file://`
directly — worked around with `python3 -m http.server`, functionally
equivalent to the e2e suite's own `file://` convention):
- Rendered `scratchpad/repro.mmd` → interactive HTML
  (`node dist/cli/index.js render scratchpad/repro.mmd -f html -o ... --theme light`).
- `browser_navigate` to the export, `browser_console_messages` — **0 errors, 0
  warnings**.
- `browser_evaluate` read the exact rendered label-layer geometry (see
  TEST-001 below) and a full-page `browser_take_screenshot` visually confirmed:
  - subgraph titles ("Validation Engine Verische", "Kukuvara subsystem") sit
    legibly on their opaque plates, clear of every crossing/entering edge —
    **FR1/FR2 confirmed**.
  - the 6-edge hub fan-in at "Aggregator hub" shows 6 individually
    distinguishable arrowheads, clearly spread — **FR4 confirmed**.
  - **found TEST-001**: the "batch load" and "feed" edge-label plates overlap
    each other (not an edge-over-label case — two different edges' own labels
    collide because their routes run close/parallel).

No new e2e spec was added — the existing `interactions.spec.ts` /
`interactive-editing.spec.ts` subgraph coverage plus the hands-on browser pass
already exercised the changed behaviour; `e2e/sketch.spec.ts` was corrected in
place (see TEST-002).

### 3. Hands-on visual (PNG), pixel-picky per project standard
`node dist/cli/index.js render scratchpad/repro.mmd -f png -o ... --theme light`
(and `--theme dark`, `--theme fancy`, `--style sketch`) — all render cleanly,
no CLI errors.

Eyeballed every render against the three fixes:
- **Subgraph titles vs crossing edges** — legible in all 4 renders (light,
  dark, fancy, sketch). No edge visibly crosses through title text; matches
  `scratchpad/repro-after.png` (the pre-existing reference).
- **Hub arrowheads (6-edge fan-in)** — individually distinguishable in all 4
  renders; approaches visibly separated, not merged.
- **Edge labels vs lines** — no line paints over a label in any render.
- **Edge labels vs EACH OTHER** — **FAIL**: "batch load" and "feed" (two
  different edges' labels) overlap in every theme/style combination tested
  (light/dark/fancy/sketch) and in both the static PNG and the interactive
  HTML — see TEST-001. This reproduces identically in the pre-existing
  `scratchpad/repro-after.png` reference render too, i.e. it's a genuine
  pre-existing defect in the as-built code, not something this test round's
  `e2e/sketch.spec.ts` edit introduced.

Screenshots/renders saved under `scratchpad/test-out/` (not committed;
scratchpad is gitignored-equivalent working space): `repro.html`,
`repro-round1.png`, `repro-dark.png`, `repro-fancy.png`,
`repro-sketch-light.png`, `sketch-flowchart.html`, plus the MCP screenshots
(`repro-html-check.png`, `repro-label-overlap-zoom.png`,
`sketch-flowchart-check.png`).

---

## This round's issues

| id | severity | priority | status | title |
|---|---|---|---|---|
| TEST-001 | major | P1 | open | Two adjacent edge-label plates overlap ("batch load" / "feed"), clipping text |
| TEST-002 | minor | P2 | fixed | Pre-existing `e2e/sketch.spec.ts` had 3 stale direct-child selectors broken by the FR1 layer-group DOM restructure (fixed this round, test-file-only) |

Full detail (repro geometry, root cause, proposed fix direction) in
`test/issues.json`.

---

## Done-bar check (`test-strategy.md`: build clean AND all unit AND all e2e
green, PLUS hands-on exploration)

| Bar | Status |
|---|---|
| Build clean | ✅ |
| All unit green | ✅ 346/346 |
| All e2e green | ✅ 73/73 (after this round's TEST-002 test-file fix) |
| Hands-on exploration done | ✅ — nothing blocked; browser (via MCP over local HTTP) + CLI PNG across 3 themes + 2 styles, all console-clean |
| **No open/new issues** | ❌ — **TEST-001 is `open`** |

**Verdict: done-bar NOT met.** Every check that could run, ran (no blocked
hands-on/e2e checks this round — the only wrinkle was the MCP's `file://`
navigation block, worked around with a local static HTTP server, so nothing
was skipped). The blocker to advancing to ⑤ report is **TEST-001**, a real
product defect (fixable, not a user-decision fork) found by hands-on pixel
inspection of the acceptance-signal repro. Routes back to **② implement** with
`test/issues.json`.
