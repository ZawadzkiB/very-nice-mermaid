# Adjustments - feature `flowchart-render-legibility`

Log of changes / clarifications requested during planning.

## 2026-07-12 - re-plan (D1=A scope expansion, from the test gate)

The accepted plan (FR1–FR5) shipped + verified green. At the test gate the tester found
**TEST-001** (major, open): two *different* edges' label plates ("batch load"/"feed" in
`scratchpad/repro.mmd`) overlap and clip each other. The user chose **D1=A (fix now)** and
**expanded scope**. Plan updated **additively** (FR1–FR5 kept as a "Done (baseline)" note):

- **+FR6 - Label reserved-space de-collision** (fixes TEST-001): a new shared, deterministic
  all-pairs pass (`resolveLabelCollisions`) so no two edge-label plates overlap; generalizes
  the existing same-pair-only `computeLabelShifts`; mirrored byte-for-byte in the runtime twin.
- **+FR7 - Edge-crossing bridges / line-jumps**: a new shared post-layout pass
  (`applyEdgeBridges` + `segmentsCross`) that splices a hop arc into one edge's `d` at each
  crossing, for the flowchart family (flowchart + state + class); **sequence excluded**;
  clean elbow edges first.
- **+FR8 - Parity/determinism/churn** (extends FR5): both passes deterministic; byte-parity
  guard stays green; snapshots + `examples/` regenerated; lane-routing stays deferred.
- **Determination:** no `activity` diagram type exists in the code (or in mermaid) - it maps
  to flowchart (+ state); all flowchart-family tiers share the geometry, sequence does not.
- **New OPEN forks for re-acceptance:** D2 (hop glyph), D3 (which line hops), D4 (default-on/
  clean-elbow vs opt-in/all-styles), D5 (line-work tier scope). Recommendations logged.
- **Charts:** intended-design `charts/flow.mmd` updated + `charts/bridges.mmd` added;
  `charts/before/` kept.
- **Routing:** awaiting **re-acceptance**; on re-accept the SAME work item reruns ②→⑤.

## 2026-07-12 - UAT round 1 re-plan (+FR9 edge-lane separation, from the UAT gate)

FR1–FR8 shipped + verified green (report ⑤, `awaiting-uat`). At the UAT gate the user **rejected**
with a **new, distinct** defect (`uat.md` round 1 + `uat-round1-annotated.png`, 3 red boxes):
long **near-parallel edge runs merge in a shared channel** so an individual line can't be traced
("those line are merging together I do not know which line is which… keep those line separate").
Code-grounded + **measured** on `scratchpad/repro.mmd` via `layout()`: the merged runs sit **one
`PORT_STEP` apart** - the middle channel is `batch load`(x≈397) · `IN→HUB`(x≈417) · `feed`(x≈437),
three vertical runs **20px apart over 120px overlap**; Ingress-out and HUB-in are 26px combs. This
is the **deferred lane-routing** the accepted plan's *Out of scope* + report *Follow-ups*
explicitly parked ("full lane/bus orthogonal routing so long parallel approaches never run
merged"); it is **not** FR7 (`segmentsCross` returns `null` for parallel/collinear), FR6 (labels),
or FR4 (endpoint spread only). Plan updated **additively** (FR1–FR8 kept as the Done baseline):

- **+FR9 - Edge-lane separation** (fixes the merged-runs defect): a new shared, deterministic
  post-layout pass (`separateLanes`) run **first inside `finishEdges`** (before `deCollideLabels`
  → before `applyBridges`) that bundles near-parallel/near-collinear runs sharing a channel and
  offsets them to distinct lanes ≥ `LANE_GAP`, **cascading** each offset through the connected
  elbow so paths stay orthogonal + connected; endpoint fan bundles wider than their node get a
  **staggered-depth comb**. Reaches flowchart + state + class via `finishEdges` (D5, unchanged);
  **sequence excluded**; **mirrored byte-for-byte** in the `runtime.ts` twin; clean elbow only
  (curved/sketch deferred, per the FR7 gate).
- **Moved** "Full lane/bus orthogonal routing" from Out of scope **into scope** (as the *scoped*
  FR9); a fully-general "every segment pair anywhere" router stays deferred.
- **FR8** superseded: lane-routing is no longer "stays deferred".
- **Honest note:** this is the substantial routing rework the first plan deferred - the
  elbow-connectivity cascade + deterministic convergence are the hard parts, and the endpoint
  fans are bounded by node width (need combs → jogs / possible new crossings / bounds pressure).
  Expect a heavier ②→③ loop than FR6/FR7 and a full re-snapshot.
- **New OPEN forks D6–D9** (decisions.md): D6 approach (scoped post-pass vs full router), D7
  aggressiveness (`LANE_GAP`/split threshold), D8 scope (3 boxes vs everywhere), D9 endpoint
  combs vs widen-only floor (the "worth-it?" call). Recommendations logged per fork.
- **Charts:** intended-design `charts/flow.mmd` updated (FR9 slotted into the pipeline) +
  `charts/lanes.mmd` added (the FR9 bundle→lane→comb flow); manifest updated; `charts/before/`
  kept.
- **Routing:** `state.md` stays `waiting-for-user`; awaiting **re-acceptance** (orchestrator owns
  the gate). On re-accept the SAME work item reruns ②→⑤ back to `awaiting-uat` (`uat=1`).
