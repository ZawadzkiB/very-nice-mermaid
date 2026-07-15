# Decisions — feature `subgraph-aware-routing`

Forks that needed a human call. gogo appends each as `D<n>` with options and a
recommendation, then records your answer as a `RESOLVED` block. This is the
audit trail that lets the pipeline pause and resume safely.

## D1 — v0.6.6 approach & scope: scoped container-avoid re-route, or full obstacle routing?
- **Phase:** plan
- **Question:** How much of subgraph-aware routing does v0.6.6 ship? Defect #3 —
  long `BE↔RULES` edges route straight through the `Validation Engine (ENGINE)`
  container. The fully-correct fix (obstacle-aware routing) is large and touches the
  core router for every diagram.
- **Options:**
  - A. **Scoped container-avoid re-route** (option a + gate d) — a new gated
    `avoidSubgraphs` pass that pushes an offending edge's long interior trunk outside
    the crossed container and re-enters near its real endpoint. Verified to fire ONLY
    on `architecture.mmd`'s two edges across the whole corpus → both subgraph heroes
    byte-identical. Fixes the reported diagram; does not handle diagonal / nested /
    multi-obstacle cases (documented limitations).
  - B. **Full obstacle-aware orthogonal routing** (option b) — feed container boxes as
    obstacles into the router; route around them. Most correct, but large scope and
    HIGH regression risk (changes routing for every diagram; broad snapshot/hero churn;
    full twin re-mirror).
- **gogo recommends:** **A** — smallest change, provably zero corpus churn.
- **Status:** RESOLVED (user, 2026-07-15) → **A (scoped `avoidSubgraphs` re-route).** Fix the reported mixed-membership crossing; defer full obstacle routing. Documented limitations (diagonal/nested/multi-obstacle) accepted.

## D2 — interior re-entry strategy for the endpoint inside the container
- **Phase:** plan
- **Question:** After pushing the trunk outside the container, how does the edge reach
  the endpoint that IS inside (e.g. `RULES` at the container bottom)?
- **Options:**
  - A. **Keep top-entry, lower the re-entry connector** near the endpoint — the
    interior residual is a short approach just above the endpoint. Simplest;
    prototype-validated; does NOT touch `computePerimeterPorts` (the most
    parity-mirrored function). Minor: a short interior connector remains near the
    endpoint.
  - B. **Also re-port the endpoint** — switch its `computePerimeterPorts` border side
    to the container-facing side (e.g. enter `RULES` from the right/bottom). Cleaner
    approach line, but touches the heavily parity-mirrored port function → bigger risk
    and surface.
- **gogo recommends:** **A** — cleanest risk/scope trade.
- **Status:** RESOLVED (user, 2026-07-15) → **A (keep top-entry, low re-entry connector).** Do NOT touch `computePerimeterPorts`. B is a follow-up if the connector reads poorly.

## D3 — pre-existing parser membership bug surfaced during ④ test (microservices 'Core services' subgraph never renders)
- **Phase:** test
- **Question:** `fixtures/microservices.mmd`'s `Core services` container renders no box because the DSL references its member nodes (`gw --> auth & catalog & cart`) *before* the `subgraph` block declares them, so `ensureNode` (`src/parser/index.ts`) never attaches them to the subgraph's `children` → `model.subgraphs[0].children == []`. Should v0.6.6 do anything about it?
- **Options:**
  - A. **Nothing in v0.6.6; open a separate defect (optional).** It is byte-identical to `master` (fixture + `src/parser` both untouched by this diff — verified), NOT a regression from this feature, and the plan explicitly puts "container box computation, padding, or membership rules" **out of scope**. v0.6.6's no-regression bar still holds (microservices renders byte-identically to v0.6.5), and the genuine both-in no-op proof is supplied by `nested-subgraphs` (containers=2, real members, fired=0). Fix later as its own parser ticket (re-parent a node on first subgraph-scoped mention, not just first creation).
  - B. Fix the parser membership order now — expands scope into the parser, risks touching membership rules the plan excluded, and changes visual behaviour for any reference-then-declare diagram.
- **gogo recommends:** **A** — out of scope for v0.6.6, non-blocking, pre-existing; surface to the user as an optional separate defect.
- **Status:** SURFACED (non-blocking) → proceeding to ⑤ report on Option A's basis. **User to decide** whether to open a separate parser-defect ticket (this does NOT gate v0.6.6). Recorded as test finding TEST-001.

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
