# Test — `interactive-editing` — round 01

_Snapshot of `test/issues.json` (the contract). Phase ④: run the suites, then drive
the real behaviour in a real Chromium — FR1 resize, FR2 perimeter-distributed
connectors, FR3 in-browser Save SVG/PNG, FR4 persistence, FR5 parity._

## Gates (ran fresh, not just trusted from the hand-off)
- `npm run build` — **pass** (tsup, 0.3.0).
- `npm run typecheck` — **pass** (`tsc --noEmit`).
- `npm test` — **280 / 280 pass** (25 files). Unchanged from review round 02.
- `npm run test:e2e` — **44 / 44 pass** (33 pre-existing + **11 new**), real
  Chromium via the project's own `@playwright/test` harness, driving the
  standalone HTML a real `vnm render -o out.html` produces (file://, no dev
  server). Ran the new spec **twice** back-to-back plus once more inside the
  full suite — stable, no flake.

## Tool used for the browser level
The project ships a full `@playwright/test` e2e harness (`e2e/*.spec.ts`,
`playwright.config.ts`, Chromium already installed at
`~/Library/Caches/ms-playwright`) that the existing 33 tests already drive with
**real pointer events** (`page.mouse.move/down/move/up`, pointer capture) rather
than `element.click()`. I used this as the primary driver — it gives
pixel-precise control over where a mouse-down lands (essential for grabbing a
specific 10×10px resize handle) and is the project's own established, reproducible
mechanism (`testing-tools.md`: "Playwright (Chromium)" is the tool of record).
For hands-on visual judgment ("does it look right") I additionally captured
screenshots via `page.screenshot()` in a throwaway spec and read them directly
(hub diagram before/after resize, a subgraph+shapes export, resize handles on a
selected diamond) — see **Visual exploration** below. No degradation was needed;
both Node/build tooling and the browser were fully available.

## What was exercised

### FR3 — Save SVG / Save PNG, for real, in a real browser
- **Save PNG rasterize** (the thing jsdom cannot do): clicked the toolbar "PNG"
  button with a real pointer down/up → `page.waitForEvent("download")` fires →
  downloaded file starts with the exact PNG magic number
  (`89 50 4E 47 0D 0A 1A 0A`) and IHDR width/height are both > 0 → **no**
  console errors, **no** `SecurityError` (the data-URI-SVG → `<img>` → canvas →
  `toDataURL` path is not tainted). Filename ends in `.png`.
- **Save SVG**: downloaded file is well-formed XML (`fast-xml-parser`'s
  `XMLValidator`), starts with `<svg`, sensible `.svg` filename, no console
  errors.
- **Subgraph + every node shape** (the case unit-level `dom-runtime-parity`
  can assert byte-parity for but can't rasterize): built a one-off diagram —
  a titled subgraph ("Cluster One") containing rectangle → rounded →
  subroutine → circle → hexagon → parallelogram → parallelogram-alt, then
  stadium → diamond → cylinder outside it — via a new `exportHtmlFromDsl()`
  helper (CLI-rendered standalone HTML, not the committed fixture corpus, so it
  doesn't get swept into the parser/layout unit-test corpus). Save SVG: valid
  XML, contains the subgraph title, its dashed border
  (`stroke-dasharray="4 4"`), an `<ellipse>` (circle) and `<polygon>`
  (hexagon/parallelogram) — proving the download really rasterizes/serializes
  the harder shapes, not just the rect/diamond/stadium/cylinder set. Save PNG:
  valid signature + non-zero dimensions, no errors.

### FR1 — Resize, real pointer events (pointer capture)
No unit test drives the actual grab math (`onPointerDown`/`onPointerMove`'s
`rsx`/`rsy` corner-pinning arithmetic) — `dom-runtime-parity.test.ts` simulates
a resize via `handle.importLayout(...)` directly, bypassing the drag entirely.
This phase is the *only* place that code path gets exercised:
- Selected a node with a real click (down+up, no movement — matches
  `selectNode`'s slop guard), confirmed all 4 `.vnm-resize-handle`s appear.
- Dragged the **bottom-right** handle by a known screen delta: card width/height
  grew by exactly `screenDelta / currentScale` (read the live `.vnm-world`
  zoom-to-fit scale and predicted the exact new size), the **opposite
  (top-left) corner stayed pinned** (`left`/`top` unchanged), and the connected
  edge's `d` attribute changed (re-routed live).
- Dragged the **top-left** handle too (a second corner, to catch a sign error
  the bottom-right-only case can't) — grew correctly with the **opposite
  (bottom-right) corner pinned** this time (`left+width` / `top+height`
  constant).
- **Min-size clamp**: dragged the same handle by a huge negative delta (−5000px)
  — card clamped to exactly 24×24 (the `MIN_SIZE` constant), never negative,
  never zero.
- **Persistence (FR4)**: after resizing, waited past the 400ms persist debounce,
  reloaded the page — size **and** position were byte-identical before/after
  reload (localStorage round-trip).
- **Also verified on class and state diagrams** (FR1 says "applies to
  flowchart, class, state"): resized the central "Dog" class node (5 relations)
  and the "Running" state — both grew and re-routed their edges correctly.
  Sequence diagrams render no `.vnm-node` cards at all (SVG-only), so resize
  naturally doesn't apply there — consistent with "sequence out of scope."

### FR2 — Perimeter-distributed connectors, hub node
Built an 8-edge hub (4 incoming from NW/N/NE/W, 4 outgoing to E/SW/S/SE) via
`exportHtmlFromDsl`. In the live DOM: for every edge touching the hub, found the
path endpoint nearest the hub's center (`SVGPathElement.getPointAtLength`, same
untransformed world-coordinate space as the card's own `style.left/top/width/
height` — no pan/zoom conversion needed) and asserted (a) no two of the 8
anchors sit within 1.5px of each other (not literally clustered at one point),
and (b) the anchors' spread along both X and Y exceeds 30% of the hub's own
width/height (not pinched onto one tiny segment). Then **resized the hub live**
and re-checked both properties — anchors recompute and stay distributed after
an edit, matching the plan's e2e row. Screenshot below shows this visually.

### Zero-network at runtime (NFR)
On the standalone export, attached a `page.on("request", ...)` listener
*after* initial load, then dragged a node, selected + resized another,
wheel-zoomed, panned, and clicked **both** Save SVG and Save PNG (the case the
review hand-off specifically flagged — a `data:` URI `<img>`/canvas rasterize
must not trip any network path). **Zero requests** were observed across the
whole session.

### Combo journey (drag + resize + export together)
On a subgraph-bearing fixture (`microservices.mmd`, dark theme): dragged one
node, selected + resized a different node, then Save SVG (validated as XML)
then Save PNG (validated PNG signature) of the **edited** diagram — all
succeeded, **zero console errors** across the whole session.

## New / extended e2e tests
- `e2e/helpers.ts` — added `exportHtmlFromDsl(dsl, theme, name)`: renders raw
  ad-hoc DSL through the built CLI to a standalone HTML artifact, without
  adding it to the committed `fixtures/` corpus (which the parser/layout unit
  tests glob over) — needed for the hub and subgraph+shapes diagrams that exist
  purely to drive the browser.
- `e2e/interactive-editing.spec.ts` (new, 11 tests): Save SVG/PNG real
  rasterize (2), Save SVG/PNG on subgraph+every-shape (2), resize bottom-right +
  min-clamp + persistence (1), resize top-left corner sign check (1), resize on
  class + state renderers (2), hub perimeter distribution + live recompute (1),
  zero-network through Save PNG (1), full drag+resize+export combo (1).

## Visual exploration ("does it look right")
Screenshots taken via `page.screenshot()` and reviewed directly:
- **Hub before/after resize** — 8 edges legibly fan around the circle; the 3
  edges approaching from directly above land close together near the top
  (geometrically correct — they *do* approach from nearly the same direction),
  the West edge correctly lands on the right side of the circle, and the 4
  outgoing edges spread cleanly across the bottom. After growing the circle via
  its resize handle, all 8 anchors visibly recompute onto the larger boundary,
  still spread, still legible. No edge cuts through the hub or another node.
- **Subgraph + every shape** (fancy/dark theme) — structurally correct (dashed
  cluster box, all 10 shapes present, minimap matches) — the LR fixture's
  default fit-to-view zoom made the labels too small to eyeball at this
  resolution; shape/element correctness was instead confirmed by the exact SVG
  content assertions above (more reliable than eyeballing a thumbnail).
- **Resize handles on a selected diamond node** — 4 small square handles sit
  cleanly at the diamond's bounding-box corners with a clear blue selection
  outline; visually unambiguous and plausible to grab with a mouse.

## Findings

| id | sev | priority | status | area |
|----|-----|----------|--------|------|
| TEST-001 | minor | P2 | new | plan/D2 accuracy — no real "reset layout" control exists |

### TEST-001 — D2's cited "existing reset-layout control" does not exist
`plan.md`'s D2 justifies skipping a re-layout after resize by saying "the
existing reset-layout control returns to the computed layout." No such control
exists anywhere: the only "reset" in the codebase is `resetView()`
(`src/render/dom/runtime.ts:811-816`), which resets **pan/zoom only**
(`scale=1; tx=0; ty=0`) and never touches `positions`/`sizes`. Confirmed by
reading the toolbar in a live browser (5 buttons: fit/zoom-in/zoom-out/Save
SVG/Save PNG — no reset-layout button) and by grepping `src/` for any other
reset affordance (none). Not a new regression — drag has had no "undo" since
v2 — but the plan's own risk-acceptance for D2 rests on a control that isn't
there. **Needs a user decision**: either (a) add a small "reset layout"
control (agent-fixable — the runtime already tracks pre-edit `baseSizes`
internally), or (b) correct the plan text and accept the gap for v0.3.0. See
`test/issues.json` (`TEST-001`) for the full write-up.

## UX observation (not a defect, worth flagging)
The 4 resize handles are sized in **world units** (`HANDLE = 10`), so their
on-screen size shrinks with the zoom-to-fit scale on a large/dense diagram —
worked fine at the diagram sizes exercised here (10-11 nodes, default 1280×720
viewport), but wasn't stress-tested on a much larger diagram where the handles
could become fiddly to grab precisely. No bug observed; flagging for awareness
only.

## Verdict
**Not clean — 1 minor, non-blocking finding.** Build/typecheck/unit/e2e all
green (280 unit + 44 e2e, including 11 new tests exercising exactly what the
review hand-off asked for), hands-on exploration confirms FR1–FR5 genuinely
work in a real browser (resize, perimeter distribution incl. a hub, in-browser
SVG/PNG rasterize including the harder shape/subgraph case, persistence,
zero-network — all real, not simulated), and no console errors were observed
anywhere across ~15 distinct interaction sessions. The one finding (TEST-001)
doesn't violate any FR and isn't a functional break — it's a planning-accuracy
gap (D2's cited mitigation doesn't exist) that needs a product-scope call, not
a code fix in the usual sense. Recommend: surface TEST-001 to the user for a
decision (add the control vs. correct the plan text), and otherwise treat the
done-bar (build + unit + e2e green + hands-on done) as met.
