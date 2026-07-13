# flowchart-render-legibility

- **shipped:** 2026-07-13
- **type:** rendering fix (flowchart / state / class legibility)
- **members:** `flowchart-render-legibility` (single)
- **audit trail:** [.gogo/work/feature-flowchart-render-legibility/](../../work/feature-flowchart-render-legibility/)

## What shipped

Flowchart, state, and class diagrams now render so that **no legible text gets covered
and every line stays traceable**. Six reported legibility defects were fixed in the
shared geometry layer and mirrored byte-for-byte in the inlined interactive runtime, so
the interactive HTML export is pixel-identical to the static SVG:

1. **Edges painting over titles/labels** -> an explicit **5-layer draw order** (subgraph
   boxes -> edges -> edge-labels -> subgraph titles -> nodes) plus an **opaque
   subgraph-title plate** so nothing legible is ever occluded.
2. **Bunched fan-in arrowheads** -> **wider perimeter spread** with a border-filling cap,
   so a busy hub uses almost the whole node width instead of crowding at the centre.
3. **Two edge labels overlapping** -> **reserved-space de-collision** (all-pairs AABB push
   along the axis of least penetration).
4. **Near-parallel edge runs you couldn't tell apart** -> **lane separation**
   (`separateLanes`) shoves merged bundles onto their own channels.
5. **A label sitting on the lines / crossings you couldn't read** -> three-way label
   de-collision (label-vs-label, label-vs-node, label-vs-edge) **plus a pen-up gap cut
   into the under-line at each crossing**, so the break itself shows which line passes over.
6. **A node's outgoing fan knotting under it** -> **heading-order fan ports**: ports are
   ordered by where each edge actually heads (its first/last routing bend) rather than the
   far node's centre, so a sideways-routed edge takes the port on that side instead of
   crossing a straight sibling.

Everything is deterministic (no clock/RNG) and byte-parity-guarded across both renderers,
so snapshots stay stable and the interactive export always matches the static image.

The crossing-gap behaviour is toggleable per render style (`bridges` option / CLI
`--no-bridges`): on for clean elbow edges, off for curved and sketch styles.

## Key decisions

- **Scope grew at the test gate (D1):** an in-test label-overlap finding (TEST-001)
  expanded the feature from the original occlusion/fan fixes into full label de-collision
  and crossing marks.
- **Crossing glyph pivoted arc -> gap (D11):** the plan drew a small overpass arc; the
  user asked for "just a space" instead - a pen-up gap in the more-vertical line.
- **Lane separation approach settled on the compact offset (D10):** a source-spread
  (`edgesep`-style) attempt looked worse and was reverted; the compact `separateLanes`
  offset is the shipped approach.
- **API-fan de-knot via heading-order ports (D12):** ordering ports by destination centre
  crossed a detoured edge over a straight sibling; ordering by actual heading fixed it.
- **Line-work scope (D5):** flowchart + state + class (they share the geometry); the
  sequence renderer is excluded (its own routing).
- **Accept and ship (D13):** the user verified the fix and accepted the two remaining items
  (left/right side attachment, extreme-drag re-merge) as explicit follow-ups.

## Review / test verdict

**Review: APPROVE** (6 rounds) - round 2 caught one real correctness gap the author's
tests had masked (REV-002: native class/state drew the old looser label plate while the
tight one was de-collided) and a coverage nit (REV-009) fixed in-round; every new runtime
twin was byte-parity-verified adversarially.

**Test: GREEN** (6 rounds) - **388 unit + 79 e2e**, determinism and flowchart *and* state
byte-parity confirmed, plus hands-on in a real browser (static PNG trace, byte-match on
load, live-drag re-route, 0 console errors).

## Known follow-ups (deferred, not defects)

- **Left/right side edge attachment** - route some edges out node sides so wide fans
  breathe (a larger routing change; fresh plan when picked up).
- **Extreme-drag lane re-merge (TEST-004)** - hauling a node far out of its layout can
  re-merge separated lanes; endpoint fans are node-width-bound. Needs the deferred
  staggered-depth comb; dispositioned `wontfix` / documented follow-up at D13.
- **Curved and sketch crossing gaps** - v1 gaps only on clean elbow edges.

## Diagrams

- **flow** (`flowchart-render-legibility-flow.mmd`) - the shipped post-layout pipeline:
  `finishEdges` running lanes -> three-way label de-collision -> crossing gaps,
  heading-order ports, the 5-layer emit, both renderers held in byte-parity. A `before/`
  set carries the pre-fix single-pass baseline (compare mode).
- **sequence** (`flowchart-render-legibility-sequence.mmd`) - the render interaction:
  caller -> `layout`/`finishEdges` -> geometry -> static SVG, with the runtime twin
  re-running the same passes for the interactive export.

Full detail - every review/test round, the per-file change table, and the decision log -
lives in the linked work folder.
