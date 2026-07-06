# Test — `interactive-editing` — round 03 (v0.4.0 — FR6/FR7, closes REV-006's residual)

_Snapshot of `test/issues.json` (the contract). Since round 02: UAT round 1 added
FR6 (subgraph auto-contain + draggable group, D6=C) and FR7 (per-anchor edge
pin, D7=A), shipped as v0.4.0 (implement rounds 4-5, review rounds 04-05 clean).
Review handed this round the mandatory real-browser closure of REV-006's
residual — this round delivers that, and it surfaces a genuine defect that
reopens it._

## Gates (ran fresh, not just trusted from review-05)
- `npm run build` — **pass** (tsup, v0.4.0). `npm run typecheck` — **pass**.
- `npm test` — **300 / 300 pass** (26 files) — matches the expected count.
- `npm run test:e2e` — **62 / 62 pass** (47 baseline + **15 new**), real
  Chromium via `@playwright/test`. Ran the full e2e suite **twice**
  back-to-back — stable, no flake. (2 of the 15 new tests are deliberate
  `test.fail()` defect-repro tests — see Findings; they report as passing
  because they fail *as expected*, documenting TEST-002 without turning the
  suite red.)

## What was exercised

### 1. FR7 edge-pin — REAL pointer events (the mandatory closure)
Selected a node, located the actual rendered `.vnm-edge-handle` (not a
synthetic target), dragged it with real `mouse.move/down/move/up` + pointer
capture to a different border, and verified: the pinned end's live path
genuinely re-anchors there (byte-checked against the node's own world-frame
box, not just "path changed"); the **other** end and **sibling edges** keep
auto-distributing; the pin **persists** across reload (read straight out of
`localStorage`'s `vnm-layout:*` entry — the exact `{side,offset,from,to}`
shape `exportLayout()` writes); and **Reset layout clears it**, returning to
the pristine pre-edit route. Also pinned **both ends** of one edge across two
independent drags (source on A, target on B) and confirmed each is keyed
independently by edge index.

While building this, it surfaced **TEST-002** (see Findings) — a real
hit-testing/render-timing defect a fake DOM cannot catch, exactly the risk
REV-006 flagged. The pin **mechanics** themselves (once a handle is actually
visible) are all correct; the defect is in the surrounding **select/deselect
-> handle visibility** wiring.

### 2. FR6 group-drag — REAL pointer events (the mandatory closure)
On a "Warehouse" subgraph (3 members: stock/pick/qc; reproducing the UAT
screenshot's exact scenario) — grabbed the container's **title band** with a
real drag: all 3 members moved by the identical world delta, non-members
(intake/ship) did **not** move, the box followed rigidly (same size, shifted
by the same delta), touching edges re-routed live, and it **persisted** across
reload. Grabbing the **open interior** (a real gap between stock and
pick/qc, verified empty and >10px from any border) **panned the canvas**
instead — confirmed via the world transform changing while no member moved.
Grabbing a **member card** moved just that card (the box re-hugged, others
stayed put) — including dragging it **far outside** the box's original
bounds, and the box genuinely grew (area +30%+) to keep fully enclosing it at
its new position, **never stranded** — this is the literal UAT screenshot
defect, now fixed and verified hands-on.

### 3. Pin-then-resize re-clamp
Pinned an edge end to A's right border at a large offset (near the
bottom-right corner), then shrank A's height via its own resize handle to
well under that offset. The pin's Y **re-clamped** to stay strictly within
the shrunk top/bottom bounds — the edge never detaches past the new border.

### 4. Nested subgraphs (depth > 1)
Built a genuine 2-deep nesting ("Warehouse" inside "Distribution Center") and
dragged a depth-2 member ("shelve"). **Both** containers re-hugged: neither
box was stale, both changed size/position, both still fully enclose the
moved member, and the outer box still encloses the inner one afterward. Save
SVG of the edited (post-drag) nested diagram is valid XML containing both
subgraph titles and **2** `stroke-dasharray="4 4"` boxes (both containers
genuinely drawn); Save PNG downloads a valid, correctly-signed file.

### 5. `layout.json` robustness at the CLI level (REV-007)
Ran the actual built `vnm` binary (not a unit-level function call) with
hand-built `--layout` sidecars:
- A **stale out-of-range** anchor index → output byte-identical to no
  `--layout` at all (silently, safely dropped).
- An anchor whose `from`/`to` **no longer exist** → same, dropped, no crash.
- A **stale index carrying the correct identity** (simulating an edge
  reorder) → re-maps to the actual edge (verified by reading the rendered
  SVG's node `<rect>` + edge `<path>` coordinates directly — the pin lands on
  the edge whose `from`/`to` match, not the edge at the stale index).
- **Parallel edges** (two `A-->B`): a pin keyed by the matching in-range
  index+identity lands on that exact edge, not its twin; two **out-of-range**
  identity-only pins for the same parallel pair re-map deterministically to
  the two distinct edges without colliding on one. All exit 0, all valid XML.

### 6. Regression sweep of rounds 01-02 territory
Re-ran (not just trusted) the full existing suite: resize (both corners, min
clamp, class/state renderers), hub perimeter distribution, Save SVG/PNG
(basic + subgraph/every-shape), reset-layout (restores computed layout, pan/
zoom untouched, persist-after-reset still works), and the sequence negative
case — all still green, **extended** this round to also assert **zero**
`.vnm-subgraph` and `.vnm-edge-handle` elements exist for a sequence diagram
(FR6/FR7 have no surface there by construction — confirmed by reading
`seq-runtime.ts`, which contains neither code path at all).

### 7. Zero console errors / zero network
Every test that tracks console/page errors asserts `[]`; the dedicated
zero-network test (drag, resize, zoom, pan, Save SVG, Save PNG) still reports
zero requests. No new network path from FR6/FR7 (group-drag and anchor pins
are pure DOM/localStorage operations).

## New / extended e2e tests (`e2e/interactive-editing.spec.ts`, +15)
- **FR6** (3): title-band group-drag + persistence; open-interior pans;
  member-card solo drag + re-hug-when-dragged-far (the UAT defect).
- **TEST-002 defect repros** (2, `test.fail()`): plain-select doesn't reveal
  handles; deselect doesn't hide them.
- **FR7 mechanics** (3): pin + siblings-stay-auto + persist + reset; both-ends
  pinned independently; pin-then-resize re-clamp.
- **Nested subgraphs** (2): depth>1 re-hug of both containers; Save SVG/PNG of
  the nested diagram.
- **CLI `layout.json` robustness** (5): stale index, ghost from/to, reorder
  re-map, parallel-edge direct pin, parallel-edge out-of-range re-map — all via
  `execFileSync` against the real built CLI, no browser.
- Extended the existing sequence negative-case test with `.vnm-subgraph` /
  `.vnm-edge-handle` zero-count assertions.

## Visual exploration ("does it feel right")
Screenshots reviewed directly:
- **Warehouse group-drag** — clean, intuitive: grabbing the title band moves
  the whole cluster as one unit, non-members stay anchored, looks exactly
  like "moving the box." Dragging a member far outside makes the box visibly
  stretch to chase it — confirms the UAT defect is genuinely fixed, not just
  numerically.
- **Edge-pin handles** — the 3 blue filled circles (auto-anchored, clustered
  on A's bottom border in a TD layout) are visually distinct from the white
  resize-corner squares; a reasonable, legible hit target at this zoom level.
- **Pin applied** — dragging one handle to a side that does **not** face its
  target produces a slightly circuitous route (the edge has to double back to
  reach a target that's actually below-left while pinned on the right). This
  is inherent to a manual override — not a defect — but worth a UX note: a
  first-time user pinning to an "unnatural" side will see a less direct path
  than auto-distribute would have chosen.
- **TEST-002, visually** — a floating blue dot plainly remains on screen after
  its owning node is deselected (no outline, but the dot persists) — an
  unambiguous, real glitch, not a testing artifact.
- **Nested subgraphs** — my test fixture's linear TD chain rendered very tall
  and narrow, squeezing both container titles close together and making the
  two boxes hard to visually tell apart at a glance (though the automated
  bounding-box assertions confirmed both are numerically distinct and correct
  throughout). This is a test-fixture-authoring limitation on my part (a
  single-file vertical chain has little width to work with), not a product
  defect — a real nested diagram with branching would show the two boxes far
  more clearly.

## Findings

| id | sev | priority | status | area |
|----|-----|----------|--------|------|
| TEST-001 | minor | P2 | verified | plan/D2 accuracy (closed round 02) |
| TEST-002 | major | P1 | new | edge-handle visibility vs. selection (reopens REV-006) |

### TEST-002 — edge-handle visibility does not track selection (reopens REV-006)
`selectNode()` (src/render/dom/runtime.ts, ~line 1251) calls only
`positionHandles()` (resize corners) — never `positionEdgeHandles()` /
`renderEdges()` — so a plain select-click never reveals the node's edge
handles; they only appear once some unrelated action (a drag, a resize, Reset,
`importLayout`) happens to call `renderEdges()`. The mirror bug: `deselect()`
calls only `hideHandles()`, never refreshing edge handles, so a
previously-shown handle **lingers indefinitely** after its node is deselected
— confirmed through subsequent pans/zooms, since panning alone never calls
`renderEdges()` either. Diagnosed precisely via a live-DOM `style.display`
probe (not inference) and confirmed visually via screenshots (a floating dot
after deselect). This is exactly the hit-testing/render-layering defect class
REV-006 anticipated only a real browser could catch — the unit-level fake-DOM
test papers over it with a no-op `importLayout()` call right after its
simulated click, which is precisely the missing render pass in production.
**Severity major**: FR7's headline discovery flow ("select a node → see grab
handles → drag one") silently does not work on the first try for a real user,
and the stale-handle side effect is a latent mis-click risk. **Agent-fixable**:
mirror the resize-handle pattern — have `selectNode()`/`deselect()` also call
`positionEdgeHandles(computePorts())` (or `renderEdges()`) right alongside
`positionHandles()`/`hideHandles()`. Two `test.fail()`-annotated repro tests
are already in `e2e/interactive-editing.spec.ts` (`TEST-002` describe block);
they will start *unexpectedly passing* once fixed — that flip is the
regression-closing signal, at which point remove the annotations. See
`test/issues.json` for the full write-up.

## Verdict
**issues — 1 major (TEST-002), agent-fixable, not needing a user decision.**
Build/typecheck/unit/e2e all green (300 unit + 62 e2e, including 15 new tests
delivering the mandatory real-browser closure the review asked for), and
every mechanic FR6/FR7 promise — auto-contain, group-drag, per-anchor pin,
persistence, reset-clears, pin-then-resize re-clamp, nested re-hug, CLI
`layout.json` robustness including the parallel-edge case — is now verified
hands-on and holds correctly. The one blocker to a clean round is TEST-002: a
real interaction-timing bug in the select/deselect ↔ edge-handle-visibility
wiring, found and evidenced exactly the way REV-006 warned a real browser
would need to. Recommend: route back to phase ② implement with
`--issues test/issues.json` (small, well-scoped fix — no user decision
needed), then ③ re-review, then ④ re-test (round 04) to close TEST-002 and
confirm the two `test.fail()` repro tests flip to unexpectedly-passing.
