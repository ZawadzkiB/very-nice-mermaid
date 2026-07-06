# Code review — `interactive-editing` — round 04 (FR6/FR7 delta — v0.4.0)

_Targeted review of the UAT-round-1 delta (D6=C subgraph auto-contain **and**
draggable group; D7=A per-anchor edge pin). Round-01..03 findings (REV-001..005)
stay `verified`; this round scores the new FR6/FR7 code + coverage._

## Gates (re-run independently)
- `npm run build` — **pass**. `npm run typecheck` — **pass** (v0.4.0).
- `npm test` — **291 / 291** (281 + 10 FR6/FR7 unit/parity tests).
- `npm run test:e2e` — **47 / 47** (no regression).
- All twins NUL-free (`geometry`, `runtime`, `dom/index`, `layout`, `model` = 0).
- No tracked snapshot modified — the developer's "layout() now recomputes tighter
  subgraph boxes, no snapshot regresses" claim holds (no flowchart SVG snapshot
  contains a subgraph rect).

## What I verified in the delta
- **Shared geometry, three-path parity.** `subgraphBox` / `computeSubgraphBoxes`
  (recursive, cycle-guarded, `n()`-rounded, `SUBGRAPH_PADDING`/`TITLE_BAND`) is used
  in `layout()` (:115), `applyPositions()` (:235), and mirrored in the runtime
  (`sgBoxFrom`/`subgraphWorldBox`/`subgraphAbsBox`; `resolve()` at runtime:158 is
  **char-identical** to geometry `resolveMemberNodes`). `computePerimeterPorts`'
  `overrides` branch (pinned end used verbatim, excluded from the auto-spread) is
  mirrored in runtime `computePorts` (:675). FR6 re-hug and FR7 pin are
  **byte-parity-guarded** (`toSvgString()` == `renderSvgFromModel`, light + fancy).
- **FR6 group-drag interaction — unit-covered.** `test/interactive-subgraph-drag.test.ts`
  uses an **event-capable** fake DOM to dispatch real `pointerdown/move/up` and drive
  the runtime handlers: it asserts the container title-band grab moves every member by
  the delta, the box re-hugs, non-members stay put, and that an **open-interior** grab
  pans instead. So the `subgraphHit` band/interior logic + group-move wiring are
  genuinely exercised (not just importLayout injection).
- **FR6 group-drag interaction (code-correct).** `onPointerDown` precedence is sound
  (toolbar → edge-handle → resize-handle → card → subgraph border → pan): a member
  card on top of the border wins its own node-drag; the open interior pans;
  `subgraphHit` picks the smallest nested container; pointer capture set/released.
- **FR7 pin clamping (focus 4 — safe).** `anchorFromPointer` clamps at pin time and
  `anchor()`/`sidePoint` re-clamps at render, so a pinned offset that later exceeds a
  **shrunk** side re-clamps onto the border — the edge does not detach. Verified in
  code (untested — see REV-008).
- **resetLayout clears pins (focus 5).** `resetLayout()` restores computed
  positions/sizes AND deletes every `anchorsOv` entry, then `removeItem`; round-01's
  no-race pattern intact; the FR7 parity test asserts reset returns to auto-distribute.
- **Model surface (focus 7 — no new break).** `RoutedEdge.ports` unchanged from
  v0.3.0 (already noted breaking in README); `LayoutData.anchors`/`layout.json`
  anchors are **additive/optional** → no new breaking model shape, no new README
  breaking note needed (see REV-007 for a robustness note, not a breaking one).
- **Sequence unaffected (focus 6).** No subgraph/anchor code on the sequence path;
  `DeferredHandle` guards `resetLayout`/`toSvgString` with `"… in r"`; e2e sequence
  sessions + the "sequence has no reset control, no errors" e2e pass.
- **Determinism / zero-network.** No `Date.now`/`Math.random` in the new paths; the
  runtime zero-network e2e passes; export-html guards green.

## Findings

| id | sev | pri | status | title |
|----|-----|-----|--------|-------|
| REV-006 | major | P1 | new | FR7 edge-pin has **no pointer-event coverage**; neither FR6 nor FR7 has a real-browser e2e (TEST-002) |
| REV-007 | minor | P2 | new | `layout.json` anchors keyed by edge **index**, no import validation (fragile vs id-keyed positions) |
| REV-008 | minor | P2 | new | Parity/unit guard omits **nested-subgraph** and **pin-then-resize** combos |

### REV-006 — FR7 edge-pin interaction untested; no real-browser e2e for either — **major / P1** — AGENT-FIXABLE (phase ④)
_Corrected mid-review_: FR6 group-drag **is** covered — `test/interactive-subgraph-drag.test.ts`
dispatches real pointer events through an event-capable fake DOM and exercises
`subgraphHit` (border/title vs open-interior-pans), the group-move, and the box
re-hug. What remains uncovered: **FR7 edge-pin has zero pointer-event coverage** — the
`onPointerDown` edge-handle branch (`target.closest('.vnm-edge-handle')`), the
`onPointerMove` `anchor` branch, and `anchorFromPointer` are reached by no test. The
group-drag unit test dispatches with `target:{}` (no `.closest`), which deliberately
bypasses closest-based hit-testing and so can't reach the edge-handle branch; no e2e
grabs a `.vnm-edge-handle`. FR7's grab depends on real DOM hit-testing of a small
handle (z-index:7, pointer-events auto) layered over/near a card — exactly the
TEST-002 failure class — and it is unverified. Additionally, **neither FR6 nor FR7 has
a real-browser e2e**; the fake DOM can't catch z-index / pointer-events / capture bugs.
FR7 is a headline UAT complaint ("can't move the arrows"), so shipping its grab/drag
with no interaction coverage is not approvable. (Both features' geometry is
byte-parity-guarded and correct on review.) **Fix (phase ④):** a unit test that
resolves `closest('.vnm-edge-handle')` to the handle (drives the anchor branch) **and**
a real-browser e2e that grabs a `.vnm-edge-handle`, drags it, and asserts the anchor
moves + persists + Reset clears; plus a real-browser FR6 group-drag e2e for confidence.

### REV-007 — anchors keyed by edge index, no import guard — **minor / P2** — AGENT-FIXABLE
`LayoutData.anchors`/`layout.json` pins are keyed by edge index, unlike the id-keyed
`positions`/`sizes`. `importLayout` (runtime.ts:1369) and the CLI `--layout` path
(cli/run.ts:352 → applyPositions, layout/index.ts:214) copy them verbatim with no
bounds/endpoint check, so a layout.json whose diagram changed (edge added/removed/
reordered) silently pins a **different** edge, and stale out-of-range indices get
re-persisted (accumulate). Graceful (no crash), but a robustness step-down and a
sidecar footgun. **Fix:** drop out-of-range entries on import (ideally re-key by
`from|to|ordinal`); at minimum document that anchors are diagram-version-specific.

### REV-008 — nested-subgraph + pin-then-resize combos unguarded — **minor / P2** — AGENT-FIXABLE
Byte-parity covers single-level re-hug and a pin, but not a **nested** subgraph
(recursive resolve depth > 1 — char-identical in both twins so low drift risk, but
nested parents hug descendant *nodes* not child-container boxes, so a parent border
can coincide with its child's; worth pinning) nor a **pin-then-resize** that shrinks
the pinned side (the re-clamp is correct on review but untested). **Fix:** add both
to the deterministic parity/unit suite.

## What phase ④ should exercise hands-on (priority order)
1. **FR7 edge-pin (real pointer):** select a node → grab a `.vnm-edge-handle` on an
   incident edge → drag to another border → that end's anchor sticks (path start/end
   changes), the other end still auto-distributes, reload keeps the pin, **Reset
   layout** clears it. (Closes REV-006 primary.)
2. **FR6 group-drag (real browser):** grab the Warehouse dashed border / title band
   and drag → members move together, box re-hugs, edges re-route, reload keeps it; an
   open-interior drag pans; grabbing a member **card** moves just that card. (Unit-
   covered already; e2e for real-DOM confidence — REV-006 secondary.)
3. **Pin-then-resize:** pin an end, then resize that node smaller → the anchor
   re-clamps onto the shrunk border, edge stays attached. (REV-008b.)
4. **Nested subgraph:** a subgraph inside a subgraph re-hugs on a member drag; Save
   SVG/PNG valid. (REV-008a.)
5. **Sidecar robustness:** import a `layout.json` with a stale/out-of-range anchor
   index → no crash, no mis-pinned edge. (REV-007.)
6. **No console errors / no network** across all of the above.

## Verdict
**CHANGES** — 1 open major (REV-006: FR7 edge-pin has no real-pointer-event coverage,
and neither headline interaction has a real-browser e2e — against verified standard
TEST-002) + 2 minors. The FR6/FR7 code is correct on review, the geometry is
byte-parity-guarded, and FR6 group-drag now has unit pointer coverage; the gap is the
FR7 interaction test surface + real-browser confidence, squarely phase ④'s to close.
Build/typecheck green, 291 unit + 47 e2e pass. REV-001..005 remain verified.
