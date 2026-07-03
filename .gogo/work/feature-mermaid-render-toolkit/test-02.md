# Test round 2 — mermaid-render-toolkit (focused re-test)

## Verdict: **PASS** — all 4 round-1 findings confirmed fixed hands-on; no regressions; no new findings

This was a focused re-test, not a from-scratch exploration: confirm that round 1's
2 majors + 2 minor/nit findings (TEST-001, TEST-002, TEST-004, TEST-005) actually
hold when driven by a human/browser/CLI, plus a light regression sweep. All four
are confirmed fixed with fresh evidence and flipped to a terminal `verified`
status in `test/issues.json`. TEST-003 (wontfix, edges-under-cards) was left
untouched per instruction. No new issues were found.

## Done-bar check (`test-strategy.md`: "Build clean AND all unit AND all e2e
green, PLUS hands-on exploration of the actual change")

| Bar | Status |
|---|---|
| Build clean | PASS — `npm run build` clean (tsup, all 3 entries + .d.ts) |
| Typecheck clean | PASS — `npm run typecheck` clean, no output |
| Unit green | PASS — 109/109 (`npm test`, 9 files) — matches the post-fix implement round exactly |
| e2e green | PASS — 10/10 (`npm run test:e2e`, chromium) — includes the TEST-002 regression test now passing |
| Hands-on confirmation | PASS — real browser (Playwright MCP, CDP-level pointer events) + real CLI invocations for every fixed finding, plus a light regression sweep |

```
npm run build      -> clean (dist/cli/index.js 190KB, dist/index.js 186KB, dist/element.js 169KB + .d.ts)
npm run typecheck  -> clean, no output
npm test           -> 9 test files, 109 tests, all passed (4.83s)
npm run test:e2e   -> 10 passed (3.1s), chromium
```

## Per-finding confirmation

### TEST-001 (major) — edges cut through nodes — **FIXED, CONFIRMED VISUALLY**

The headline fix. Rendered `fixtures/state-machine.mmd` to both SVG
(`node dist/cli/index.js render fixtures/state-machine.mmd -o sm.svg`) and
interactive HTML (`-f html -o sm.html`) and opened both in a real Chromium
browser via the Playwright MCP.

- **Static SVG** (`test/screenshots/r2-01-statemachine-fixed-svg.png`): the
  `retry` back-edge (Errored/Response-OK loop -> Loading) now routes at
  y=217 — clear above the "Response OK?" diamond (which starts at y=247) —
  instead of straight through its center (y=278.5) as in round 1. The `give up`
  edge (Errored -> Idle) swings out to x=327.5, clear to the right of every
  node. The `retry` label reads fully **"retry"**, not clipped to "etry".
- **Interactive HTML** (`test/screenshots/r2-02-statemachine-fixed-interactive.png`):
  same routing, confirmed in the live DOM renderer (nodes render as rounded
  cards per the documented interactive style, not raw diamond/parallelogram
  silhouettes — that's REV-004's existing documented behaviour, not a bug).
  Inspecting the routed edge `d` attributes directly in the DOM
  (`svg.vnm-edges path[marker-end]`) confirms the interactive renderer and the
  static SVG compute byte-identical waypoints for the `retry`/`give up` edges —
  parity holds.
- **Automated overlap scan** (`test/artifacts/r2-overlap-scan.mjs`, same
  bounding-box methodology as round 1): re-rendered and scanned
  `state-machine.svg`, `cycle.svg`, `graph-35.svg` (round 1's 35-node
  adversarial skip-edge graph), `graph-100.svg`, and `nested-subgraphs.svg`.
  **0 overlaps in all five** — down from round 1's 3 / 1 / 17 / 0 / 0
  respectively.
- **Subgraph spot-check** (`test/screenshots/r2-04-nested-subgraphs-spotcheck.png`):
  visually clean — nested cluster boxes ("Processing pipeline" containing
  "Transform stage"), no crossings, no overlaps.

**Verdict: fix holds. The plan's core "beautiful non-overlapping diagrams"
premise now holds for cycles and skip-level edges, confirmed in the project's
own bundled fixture.**

### TEST-002 (major) — toolbar buttons don't respond to real clicks — **FIXED, CONFIRMED**

Drove the interactive HTML export with real pointer events (Playwright MCP's
CDP-level mouse clicks — the same mechanism as `page.locator(...).click()`,
not `element.click()`):

| Action | Before | After | Result |
|---|---|---|---|
| Click zoom-in (+) | `scale(2.4955)` | `scale(2.99459)` | changed |
| Click zoom-out (−) | `scale(2.99459)` | `scale(2.4955)` | changed |
| Click zoom-in again, then fit (⤢) | `scale(2.4955)` | `scale(1.30631)` | reset to a genuinely different fit-computed value, not a no-op |

Screenshot of a zoomed state via a real click:
`test/screenshots/r2-03-statemachine-zoomed-toolbar-click.png`.

**Regression sanity** (confirm the fix didn't break anything else):
- **Background pan**: a real drag gesture on empty canvas (50,50px mouse
  delta) moved `.vnm-world`'s `translate()` by exactly `+50.0,+50.0px`.
- **Node drag**: dragged the "Idle" node onto "Ready" with a real drag
  gesture — its position updated and all connected edges (`Idle->Loading`,
  `Ready->Idle` "give up") re-computed their `d` attribute live to match the
  new position.
- **Layout persistence**: after the drag, a full page reload preserved the
  dragged node's exact position (`left:130.5px, top:176.963px`).
- **Minimap recenter**: a real click on the minimap canvas changed the main
  view's `translate()` (pan only, scale unchanged) — recenter still works.
- **Console**: zero errors/warnings across the entire session (checked after
  every interaction).

**Verdict: fix holds, no regression** — the toolbar early-return didn't
disturb pan/drag/minimap, and the existing e2e regression test for this
(`fit-to-view actually resets the transform after a real mouse click`) is
green in the full suite.

### TEST-004 (nit) — CLI zero-node error — **FIXED, CONFIRMED**

```
$ printf '!!!! ### ???\n@@@ >>> <<<\n' | node dist/cli/index.js render - -f svg
warning [missing-header] ...
warning [expected-node] ...
error: no diagram found (input produced 0 nodes)
$ echo "exit=$?"   # 1

$ printf '' | node dist/cli/index.js render - -f svg
error: no diagram found (input produced 0 nodes)   # exit 1

$ node dist/cli/index.js render unknown-construct.mmd -o out.svg   # has `click A callback`
warning [ignored-statement] 3:3 `click` is not supported in v1 and was ignored
$ echo "exit=$?"   # 0

$ node dist/cli/index.js render fixtures/ci-pipeline.mmd -o out.svg
$ echo "exit=$?"   # 0
```

Also re-confirmed the original round-1 "garbage" repro (English-word garbage
that word-salvages into 2 nodes, labelled "this"/"random") intentionally
**still exits 0** — by design, since it produces >=1 node and the new
zero-node check only fires when the model is truly empty. This is unchanged
behaviour, not a regression.

**Verdict: fix holds exactly as designed** (per decision D6).

### TEST-005 (minor) — ASCII corner glyphs — **FIXED, CONFIRMED**

Rendered several fixtures to `-f md` and eyeballed the box-drawing output:

| Fixture | `┼` count | Notes |
|---|---|---|
| `ci-pipeline.mmd` | 0 | 51 clean corner glyphs (┌┐└┘), no crossings artifact |
| `microservices.mmd` | 0 | clean |
| `auth-flow.mmd` | 1 | genuine crossing between two independent edge lanes, several cells from any node border — not jammed against one like the original bug |
| `state-machine.mmd` | 4 | all in the congested back-edge braid around "Response OK?" where multiple routed lanes legitimately cross in the coarser ASCII grid — consistent with "reserve `┼` for genuine two-edge crossings" |

**Verdict: fix holds** — elbow turns render as proper corners; `┼` now only
appears at genuine multi-edge crossings, never jammed against a node border.

### TEST-003 (minor, wontfix) — left untouched

Not reopened, per instruction. Still `wontfix` per decision D5.

## Light regression sweep

| Check | Result |
|---|---|
| All 4 formats (svg/html/png/md) for a normal fixture | PASS — `ci-pipeline.mmd` produced all 4, PNG is valid (616x924, RGBA) |
| 3 built-in themes visibly differ | PASS — light/dark fill palettes fully disjoint (`grep`'d `fill="#…"` sets) |
| Custom theme JSON | PASS — `ocean-theme.json`'s `#04283b` background applied correctly |
| Layout persistence across reload | PASS — dragged node position survived a full `page.reload()` exactly |
| Custom element mounts | PASS (via automated e2e — `custom-element.spec.ts` 2/2 green: mounts + live theme-attribute re-render) |
| Console errors | Zero, across the entire session |

## New findings

**None.** Everything tested this round confirmed fixed or unregressed.

## Screenshots (`test/screenshots/`)

| File | What it shows |
|---|---|
| `r2-01-statemachine-fixed-svg.png` | state-machine.mmd static SVG — the fixed "retry"/"give up" routing, the money shot for TEST-001 |
| `r2-02-statemachine-fixed-interactive.png` | Same fixture in the interactive DOM renderer — confirms parity with the static SVG |
| `r2-03-statemachine-zoomed-toolbar-click.png` | Zoomed-in state produced by a real click on the zoom-in toolbar button — TEST-002 |
| `r2-04-nested-subgraphs-spotcheck.png` | Subgraph fixture spot-check — clean nested clusters, no overlaps |

Other round-2 evidence lives in `test/artifacts/` (prefixed `r2-`): re-rendered
`state-machine.svg/.html/.md`, `ci-pipeline.md`, `auth-flow.md`, and the
`r2-overlap-scan.mjs` bounding-box scan script used for the automated overlap
checks.

## Summary

| ID | Severity | Round-1 status | Round-2 status |
|---|---|---|---|
| TEST-001 | major | fixed | **verified** (visually confirmed, 0 overlaps) |
| TEST-002 | major | fixed | **verified** (real clicks confirmed, no regression) |
| TEST-003 | minor | wontfix | wontfix (untouched) |
| TEST-004 | nit | fixed | **verified** (CLI exit codes confirmed) |
| TEST-005 | minor | fixed | **verified** (ASCII output confirmed) |

**Open issues: 0.** Done-bar met in full: build clean, typecheck clean, 109
unit + 10 e2e green, plus hands-on confirmation that every round-1 finding's
fix genuinely holds in the real browser/CLI, with zero regressions found in
the light sweep.
