# Decisions — feature `dense-edge-routing`

Forks that needed a human call. gogo appends each as `D<n>` with options and a
recommendation, then records your answer as a `RESOLVED` block. This is the
audit trail that lets the pipeline pause and resume safely.

## D1 — v0.6.5 scope: include defect #3 (subgraph-aware routing) or defer?
- **Phase:** plan
- **Question:** Defect #3 — long `BE↔RULES` edges route straight through the
  unrelated `Validation Engine (ENGINE)` container. Do we fix it in v0.6.5 or defer
  it to its own feature?
- **Options:**
  - A. **Defer #3** — ship #1 + #2 now; open subgraph-aware routing as a follow-up.
  - B. **Include #3** — add container-obstacle awareness to routing in v0.6.5.
- **gogo recommends:** **A** — deserves its own feature.
- **Status:** RESOLVED (user, 2026-07-15) → **A (defer #3).** Ship #1 + #2 now; subgraph-aware routing is a separate future feature.

## D2 — defect #2 (MCP skewer): include the nudge or accept it?
- **Phase:** plan
- **Question:** The `MCP surface` skewer is cosmetic — the line is occluded behind
  the opaque node (nodes paint over edges), so it's the *aligned in/out illusion*,
  not a literal line across the fill. The fix touches `computePerimeterPorts`, the
  most heavily parity-mirrored function. Include it in v0.6.5 or defer?
- **Options:**
  - A. **Include #2** — small cross-side port nudge (tractable, low-medium risk);
    v0.6.5 = #1 + #2.
  - B. **Defer #2** — ship only #1; treat the pass-through as acceptable/standard.
- **gogo recommends:** **A** — narrow gated rule, composes with #1.
- **Status:** RESOLVED (user, 2026-07-15) → **A (include #2).** v0.6.5 = #1 + #2.

## D3 — convergence fix (#1): new pass or re-key the existing anti-parallel pass?
- **Phase:** plan
- **Question:** Implement #1 as a new `separateConvergentJogs` that composes with
  v0.6.2's `separateAntiParallelJogs`, or re-key the existing pass from node-pair to
  node-side?
- **Options:**
  - A. **New composing pass** — `separateConvergentJogs` groups by (node, side);
    `separateAntiParallelJogs` stays byte-identical.
  - B. **Re-key the existing pass** — change v0.6.2's grouping to node-side.
- **gogo recommends:** **A** — separate pass, disjoint keys.
- **Status:** RESOLVED (user follows recommendation, 2026-07-15) → **A (new `separateConvergentJogs` pass).** v0.6.2 anti-parallel pass stays byte-identical.

<!-- Template for each decision — copy and fill:

## D<n> — <short title>
- **Phase:** <plan | implement | review | test>
- **Question:** <the fork, stated plainly>
- **Options:**
  - A. <option> — <trade-off>
  - B. <option> — <trade-off>
- **gogo recommends:** <A / B> — <one-line why>
- **Status:** OPEN        # OPEN | RESOLVED

### RESOLVED (user, <YYYY-MM-DD>)
<the decision, in the user's terms>
-->
