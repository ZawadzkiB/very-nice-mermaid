# Test round 1 — feature `hybrid-diagram-engine`

## Verdict: **FAIL** (blocked on 1 blocker + 3 major findings; route back to ② implement)

Build, unit, and e2e suites are all green, and every native/fallback tier
renders *something* through the CLI with correct, well-implemented FR5
diagnostics. But hands-on exploration — the whole point of this round —
surfaced a blocker in the library's actual browser-facing surface (the
`<very-nice-mermaid>` element and the public `mount()`/`renderSvg()`/
`renderHtml()` API never route non-flowchart DSL through the type router at
all) plus three major aesthetic/correctness bugs in the native renderers'
visual output. The CLI path alone looks good and is well-diagnosed; the
library path does not currently deliver this feature outside the CLI.

---

## 0. Baseline suites (all green)

| Check | Result |
|---|---|
| `npm run build` | ✅ clean (tsup, ESM+DTS, ~256KB CLI bundle) |
| `npm run typecheck` | ✅ clean |
| `npm test` | ✅ **227/227** unit tests pass (22 files) |
| `npm run test:e2e` | ✅ **33/33** Playwright/Chromium tests pass |

No regressions. This matches the reported round-4 state exactly.

---

## A. Native tier — hands-on + aesthetic verdict

Rendered `fixtures/ci-pipeline.mmd` (flowchart), `fixtures/order-sequence.mmd`
(sequence), `fixtures/shop-class.mmd` (class), `fixtures/order-state.mmd`
(state) to HTML + SVG at light/dark/fancy via the built CLI, opened each in a
real Chromium (Playwright MCP), and interacted by hand.

### Flowchart — **looks good** ✅
Screenshots: `test/screenshots/flowchart-{light,dark,fancy}.png`.
Clean rounded cards, soft palette, orthogonal elbow routing in light/dark,
tastefully curved+glowing edges in fancy. Good contrast in all three themes,
legible labels, flush arrowheads, working minimap. Genuinely nicer than plain
mermaid-cli output.
**Interactivity:** dragged a node (`flowchart-drag-reroute.png`) — edges
re-routed live and stayed border-anchored on both ends. Zero console errors.
Layout persistence across reload confirmed (localStorage) — this is a real
feature, not a bug, though it means a node dragged under the fixed toolbar
stays there until the layout is reset/cleared.

### Sequence — **looks good** ✅
Screenshots: `test/screenshots/sequence-light-static-svg.png`,
`sequence-fancy-static-svg.png`, `sequence-html-initial.png`.
Clean lifelines, correct solid/dashed distinction, legible self-message loop
box, repeated top/bottom actor boxes (standard convention). Good theme
contrast.
**Interactivity:** fit-to-view, wheel-zoom, pan, and minimap all confirmed
working (`sequence-zoomed-out.png`, `sequence-fit-to-view.png`), zero console
errors — matches the passing e2e suite.

### Class — **needs work** ⚠️ (structure/theming good; one major rendering bug)
Screenshots: `class-light-static-svg.png`, `class-light-static-svg-zoom.png`
(zoomed, shows the bug clearly), `class-dark-static-svg.png`,
`class-drag-reroute.png`.
Compartmented cards (name / fields / methods with divider lines) and typed UML
markers (hollow triangle = inheritance, hollow diamond = aggregation, filled
diamond = composition, dashed = dependency) all render correctly in the
**static SVG** — this part looks genuinely good and matches the plan's promise.
**Bug (TEST-002, major):** the composition diamond for `Dog *-- Collar : has`
sits at a shared edge-routing trunk where `has`/`visits`/`uses` all fan out
from `Dog`, visually implying all three relations are compositions when only
one is. See the zoomed screenshot — impossible to miss once zoomed in.
**Interactive HTML** uses generic flowchart cards with no compartment
dividers and a single generic arrowhead for every relation type (a
pre-acknowledged, documented tradeoff — "rich UML markers are static-SVG-only"
— confirmed here, not a new finding).
**Interactivity:** dragged the `Vet` node — relation edge re-routed and stayed
attached, zero console errors.

### State — **needs work** ⚠️ (clean rendering; one major occlusion bug)
Screenshots: `state-light-static-svg.png`, `state-light-zoom-antiparallel.png`
(zoomed, shows the bug), `state-drag-reroute.png`.
Rounded state cards, correct filled-disc start / ringed-circle end pseudo-state
markers in the static SVG, clean elbow routing for the acyclic part of the
graph.
**Bug (TEST-003, major) — confirms and scopes the review's flagged concern
precisely:** `Running --> Paused : pause` and `Paused --> Running : resume`
route on the *identical* path. This isn't just "overlapping" — one transition
is **completely invisible**: only "resume" is visible; "pause" (and its
arrowhead + label) is fully occluded. A viewer cannot tell `Running -->
Paused` exists at all.
**Interactive HTML** renders `[*]` start/end pseudo-states as blank empty
pill/oval cards (no filled-disc/ringed-circle marker) — same documented
"generic cards, rich markers static-SVG-only" tradeoff, now confirmed to also
apply to state pseudo-states, not just class relation markers.
**Interactivity:** dragged `Paused` — transition edges re-routed and stayed
attached, zero console errors.

---

## B. Fallback tier + FR5 diagnostics (the user's explicit ask)

Rendered `pie`, `gantt`, `erDiagram`, `gitGraph`, `mindmap`, `kanban`,
`timeline` fixtures via the CLI to SVG/HTML.

| Type | Renders? | Diagnostic | Notes |
|---|---|---|---|
| pie | ✅ correct pie, exit 0 | `fallback-tier info` | legend text clipped (`Engine`/`Marke`/`Suppo`) — minor, jsdom text-measurement gap |
| gantt | ⚠️ **blank/invalid**, exit 0 | `render-degraded warn ... approximate` | viewBox `0 0 0 196`; 8 browser console errors (negative `<rect>` width) |
| erDiagram | ⚠️ **blank**, exit 0 | same `warn ... approximate` | viewBox `-8 -8 28136 32` — collapsed to an invisible sliver |
| gitGraph | ⚠️ **degenerate**, exit 0 | same | viewBox `-8 -8 60320 32` |
| kanban | ⚠️ **blank**, exit 0 | same | viewBox `-10 -10 113212 36` |
| timeline | ⚠️ **degenerate**, exit 0 | same | viewBox `-50 -50 112508 116` |
| mindmap | ✅ **hard-fails cleanly**, exit 1 | `render-failed error ... Could not create canvas of type 2d ... needs a browser` | exactly the transparent-diagnostics behavior the user asked for |

**FR5 mechanics all confirmed working correctly:**
- `--quiet` mutes the `info` fallback-tier notice but keeps the `warn`/`error` lines. ✅
- `--strict` escalates a `render-degraded` (gantt) to exit 1; leaves a clean
  render (pie) at exit 0. ✅
- `-f md` on a non-ASCII type reports `capability-unavailable ... capability=ascii`
  for both native (class/state) and fallback (pie/gantt) types. ✅ (but see
  TEST-005 — inconsistent exit code between tiers for the same diagnostic)
- All stderr diagnostics are structured and greppable (`code severity tier
  message`); confirmed no raw jsdom stack traces leak through (REV-002 stays fixed).

**Finding (TEST-004, major):** the `warn`-level "geometry is approximate"
wording is a severe understatement for 5 of 6 non-pie types — these aren't
imprecise, they're blank/unusable, and the same broken SVG gets baked into
`-f html` too (confirmed: opening the CLI-exported `fb-gantt.html` in a real
browser reproduces the identical blank page + 8 console errors — the CLI's
HTML output is not re-rendered fresh in the browser for degraded fallback
types, contrary to the "browser-first" framing).

**Confirmed the true browser path is fine when reached correctly:** feeding
the same gantt DSL directly into the `<very-nice-mermaid>` custom element
(fresh mermaid.render() against a live DOM, no jsdom) renders a correct,
legible gantt chart with zero console errors — see
`fallback-gantt-browser-element.png`. This proves the underlying mermaid
rendering is fine in a real browser; the CLI/jsdom path is what's degraded.
(This ALSO exposed TEST-001 below — see next section.)

---

## C. Cross-cutting

- **Format inference:** confirmed `-o file.svg`/`.png`/`.md` infers format
  without `-f`. ✅
- **4 formats × native + fallback:** svg/html/png/md all produced correctly
  for sequence (native) and pie (fallback); PNG pixel dimensions scale with
  `--scale`. ✅
- **Silent-misparse fix (a pie no longer renders as garbage flowchart):**
  **confirmed fixed on the CLI path** (pie/gantt/er/etc. all correctly route
  to the mermaid fallback engine, never garbage-flowcharted) — **but NOT
  fixed on the library/browser path** (see TEST-001: the exact same bug
  reproduces through the `<very-nice-mermaid>` element and `mount()`/
  `renderSvg()`/`renderHtml()` for ANY raw DSL string, native or fallback).
- **Theme switching:** confirmed across light/dark/fancy for all 4 native
  types via the CLI-rendered HTML; the existing e2e suite already covers live
  `theme` attribute switching on the custom element for flowchart.
- **Adversarial:**
  - Empty input → `error: no diagram found (input produced 0 nodes)`, exit 1. ✅ clear.
  - Fully non-mermaid gibberish text → lenient mode does best-effort
    flowchart parsing with `unexpected-token`/`missing-header` warnings, exit
    0; `--strict` escalates to exit 1. This is pre-existing v1 lenient-parser
    behavior (not part of this feature) and is not silent — warnings are
    visible on stderr. Not filed as a new issue.
  - Hostile label (`<script>` in a class relation label) — rendered inert as
    plain escaped text in the real browser DOM; confirmed via
    `document.querySelector('.vnm-node script')` returns null and the
    injected `window.__vnm_xss` flag was never set. No breakout. ✅
  - 50+ node flowchart (60 nodes, 81 edges) — rendered in 75ms, all 60 node
    cards present, fit-to-view and minimap scale correctly, zero console
    errors (`big-flowchart-60nodes.png`, `big-flowchart-fit.png`). ✅ no perf
    concern at this scale.

### TEST-001 — the round's most important finding (blocker)
While probing the fallback tier's true browser path (above), built minimal
pages embedding `dist/element.js` with `<very-nice-mermaid>` containing raw
DSL text for a sequence diagram, an ER diagram, a state diagram, and a gantt
chart — **no CLI involved**. All four rendered wrong:
- sequence/ER/gantt → one disconnected flowchart card per keyword/line, zero
  edges (`element-sequence-rawdsl.png`, `element-er-rawdsl.png`,
  `fallback-gantt-browser-element.png`).
- state → a *plausible-looking but wrong* diagram: transition labels
  (pause/resume/stop/fault) all vanish, the `[*]` start/end pseudo-states are
  dropped entirely, and a fake orphan "stateDiagram" node appears from the
  header keyword (`element-state-rawdsl.png`).

Root cause (confirmed by reading `src/render/dom/index.ts`,
`src/render/prepare.ts`, `src/render/svg.ts`, `src/element.ts`): `mount()`,
`renderSvg()`, `renderHtml()`, `renderAscii()`/`renderMarkdown()` only
special-case an **already-constructed** `SequenceLayout`/`ClassLayout`/
`StateLayout` object; for a raw DSL **string** they all fall through to
`prepare()` → `parse()`, the v1 flowchart-only parser — `classify()` (the
whole point of FR1) is never called. Only `src/cli/run.ts` actually
orchestrates classify → dispatch → native-read/layout or fallback-render.
Every e2e class/sequence/state spec drives HTML **pre-computed by the CLI**
(`exportHtml()` shells out to `vnm render`), so none of them exercise
`mount()`/the custom element with a raw non-flowchart DSL string — which is
exactly why this gap has stayed invisible to the test suite until now.

This means the library's actual public/browser-facing surface — one of only
two `package.json` `exports` entries (`./element`) — does not currently
deliver this feature at all outside the CLI. Full detail + proposed fix in
`test/issues.json` (TEST-001).

---

## Done-bar assessment (per `test-strategy.md`)

> Build clean AND all unit AND all e2e green, PLUS hands-on exploration of the
> actual change (not just green tests) AND it must look right.

- Build + unit + e2e green: ✅
- Hands-on exploration: ✅ done, thoroughly, at every tier
- "Looks right" / beats mermaid-cli: **partially** — flowchart and sequence
  clearly do; class and state have the right idea (compartments, typed
  markers, pseudo-state glyphs) undercut by two major rendering bugs
  (TEST-002, TEST-003); the fallback tier's CLI/jsdom path is meaningfully
  worse than advertised for 5 of 6 non-pie types (TEST-004)
- **Blocking:** TEST-001 means the feature isn't actually reachable through
  the library's own public API/custom element for anything but flowchart —
  this alone fails the done-bar regardless of the CLI's quality.

**Overall: FAIL.** Route back to ② implement with `test/issues.json`
(1 blocker, 3 major, 1 needs-user-decision minor).

---

## Findings summary

| id | severity | priority | status | one-line |
|---|---|---|---|---|
| TEST-001 | blocker | P0 | new | library API + custom element never route non-flowchart DSL through classify() — silent garbage flowchart, exactly the bug FR1 promised to fix |
| TEST-002 | major | P1 | new | class composition diamond bleeds onto sibling relations at a shared edge trunk |
| TEST-003 | major | P1 | new | state anti-parallel transitions fully occlude one another (not just overlap) |
| TEST-004 | major | P1 | new | fallback CLI/jsdom degradation is blank/invalid for 5 of 6 non-pie types, understated as "approximate"; also baked into `-f html` |
| TEST-005 | minor | P2 | new (needs-user-decision) | ascii-unavailable exits non-zero by default for fallback tier but not native tier, for the same warn-severity diagnostic |

Known items (not re-filed, per instructions):
- REV-005/006/007 (state name misclassify / class underscore split / U+200B
  sequence label) — not specifically exercised this round (fixtures didn't
  hit those exact patterns); left as-is in `review/issues.json`.
- Interactive DOM using generic cards for class/state (rich UML markers +
  pseudo-state glyphs are static-SVG-only) — confirmed present for both class
  relation markers and state pseudo-state glyphs; matches the documented
  tradeoff, not filed as new.
- D7 (jsdom as a full runtime dependency, deferred to pre-publish polish) —
  unchanged, not in this round's scope.

## Screenshots (all under `test/screenshots/`)
`flowchart-{light,dark,fancy}.png`, `flowchart-drag-reroute.png`,
`sequence-light-static-svg.png`, `sequence-fancy-static-svg.png`,
`sequence-html-initial.png`, `sequence-zoomed-out.png`,
`sequence-fit-to-view.png`, `class-light-static-svg.png`,
`class-light-static-svg-zoom.png`, `class-dark-static-svg.png`,
`class-drag-reroute.png`, `state-light-static-svg.png`,
`state-light-zoom-antiparallel.png`, `state-drag-reroute.png`,
`fallback-pie.png`, `fallback-gantt.png`, `fallback-er.png`,
`fallback-kanban-jsdom.png`, `fallback-gantt-browser-element.png`,
`element-sequence-rawdsl.png`, `element-er-rawdsl.png`,
`element-state-rawdsl.png`, `big-flowchart-60nodes.png`,
`big-flowchart-fit.png`.
