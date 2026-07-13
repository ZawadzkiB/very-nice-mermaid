# Decisions - feature `<slug>`

Forks that needed a human call. gogo appends each as `D<n>` with options and a
recommendation, then records your answer as a `RESOLVED` block. This is the
audit trail that lets the pipeline pause and resume safely.

<!-- Template for each decision - copy and fill:

## D1 - <short title>
- **Phase:** <plan | implement | review | test>
- **Question:** <the fork, stated plainly>
- **Options:**
  - A. <option> - <trade-off>
  - B. <option> - <trade-off>
- **gogo recommends:** <A / B> - <one-line why>
- **Status:** RESOLVED (see re-acceptance block below)        # OPEN | RESOLVED

### RESOLVED (user, <YYYY-MM-DD>)
<the decision, in the user's terms>
-->

## D1 - TEST-001: label-vs-label overlap - fix in this pass or defer as follow-up?
- **Phase:** test (round 1)
- **Question:** The tester found a 4th legibility defect (TEST-001, major): two *different*
  edges' label plates ("batch load" / "feed" in `scratchpad/repro.mmd`) overlap and clip
  each other (~24.8px overlap; the "d" in "load" is hidden). It is **distinct from the 3
  reported defects** (edge-over-title, edge-over-label, fan-in bunching - all fixed +
  verified green), is **pre-existing** (reproduces on the as-built and is *not* a regression -
  the tightened FR3 plates actually reduce it), and lives in shared layout geometry (both
  renderers). It sits adjacent to what the plan **explicitly deferred**: "full lane/bus
  orthogonal routing so long parallel approaches never run merged." Do we expand this pass to
  fix it, or ship the accepted plan and file it as a follow-up?
- **Options:**
  - A. **Fix now, in this pass** - add a deterministic label-de-collision (detect AABB overlap
    between edge-label plates and nudge to distinct lanes), mirrored in the static SVG + the
    inlined DOM runtime (parity), plus a new "no two label plates intersect" unit assertion;
    then re-run review → test. *Trade-off:* keeps the diagram fully legible (matches the
    feature's "no overlaps" goal + a pixel-perfect bar), but is a **new cross-cutting mechanism
    outside the accepted plan**, extends the loop ~1-2 rounds, and re-touches shared geometry
    (regression surface + re-snapshot).
  - B. **Ship the 3 fixes now, file TEST-001 as a separate follow-up** - the accepted plan is
    fully delivered and green (build/typecheck/346 unit/73 e2e + hands-on). *Trade-off:* honors
    the accepted scope and keeps a clean, low-risk landing; a known (pre-existing, non-regression)
    label-vs-label overlap remains for dense near-parallel diagrams until the follow-up.
- **gogo recommends:** **A** - this is a legibility feature and a clipped label contradicts its
  "no overlaps" goal; a targeted, deterministic, parity-mirrored de-collision is a reasonable
  extension and matches your stated pixel-perfection preference. (B is the clean, in-scope
  alternative if you'd rather ship the verified win now and design the label-lane fix as its
  own scoped pass.)
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-12) → A (fix now), with expanded direction
The user chose to fix it now and broadened the ask into two mechanisms:
1. **Reserved-space margins** - give labels/lines/arrows a small padding ("reserved space")
   so nothing else may render there; when items (esp. near-parallel lines/arrows or labels)
   would collide, move them apart by that distance. (Generalizes the TEST-001 label fix.)
2. **Edge-crossing bridges / line-jumps** - where two lines cross, draw a small bridge/hop
   ("special graphics showing some bridge under next line") so one line reads as passing over
   the other and each stays distinguishable (see the attached image: hop arcs at crossings).
3. **Scope note from the user:** the line/crossing legibility issue is in **flow and activity**
   diagrams; **sequence** diagrams' lines + arrows already look OK (sequence only had
   text-over-line issues). So the crossing/bridge work targets flowchart (+ activity, pending
   the analyst confirming which diagram type that maps to in this codebase); sequence is out.

Verbatim intent: "add some small few pixels padding or margins for lines arrows texts etc …
reserved space … lines arrows and other need to be moved in distance … if it comes to parallel
lines or arrows if this will be cross maybe we just need some special graphics showing some
bridge under next line so we still know which line is which … we have issue with lines only in
flow and activity diagrams, sequence diagrams … lines and arrows was looking ok there."

**Routing:** this is a scope fork → back to **① plan** (gogo-analyst re-plans against the code),
then user re-accepts, then ②→③→④→⑤ rerun. TEST-001 stays open, folded into the re-plan.

---

## D2 - FR7 hop glyph: arc bump vs gap/notch
- **Phase:** plan (re-plan)
- **Question:** How should a crossing "bridge" be drawn on the line that hops?
- **Options:**
  - A. **Arc bump** - a small semicircular hop (short `A`/`Q` in the edge `d`) over the
    crossed line. Reads unambiguously as a bridge (matches the user's reference image),
    background-independent, clean on orthogonal elbow paths.
  - B. **Gap/notch** - erase a short gap in the *under*-line at the crossing. Simpler on
    curved/rough strokes, but background-dependent (fails on textured/transparent bg) and
    reads less clearly as a bridge.
- **gogo recommends:** **A (arc bump)** - matches the user's "bridge under next line"
  intent and is background-safe; it is also the natural fit for the flowchart family's
  orthogonal elbow paths.
- **Status:** RESOLVED (see re-acceptance block below)

## D3 - FR7 which line hops (deterministic rule)
- **Phase:** plan (re-plan)
- **Question:** At a crossing, which of the two edges draws the hop? Must be deterministic
  (no RNG/clock) so both renderers agree and snapshots are stable.
- **Options:**
  - A. **More-horizontal edge hops** (the crossing's more-horizontal segment bumps over the
    more-vertical one - reads like a road overpass), ties broken by edge index.
  - B. **By edge index only** (e.g. the higher-index edge always hops) - trivially
    deterministic but visually arbitrary (a mostly-vertical line may hop over a horizontal
    one, reading oddly).
- **gogo recommends:** **A** - the overpass reading is the most legible and is still fully
  deterministic (index tiebreak).
- **Status:** RESOLVED (see re-acceptance block below)

## D4 - FR7 default-on vs opt-in, and which styles are covered in v1
- **Phase:** plan (re-plan)
- **Question:** Ship bridges as one always-on default behaviour or behind a flag, and cover
  which edge styles now? Bridges change every crossing diagram's snapshots + `examples/`.
- **Options:**
  - A. **Default-on for clean elbow edges; curved & sketch crossings left as-is in v1**
    (a scoped follow-up). Simplest (no new flag to thread through CLI/API/theme/runtime/
    parity), bounded churn, no regression to curved/sketch.
  - B. **Opt-in flag** (`--bridges` / render option) - zero churn for existing renders, but
    adds a new dimension across every surface + the parity guard.
  - C. **Default-on for ALL styles now** (incl. curved beziers + sketch rough strokes) -
    most complete, but arc-splicing a bezier / rough polyline is materially harder and
    higher-risk this pass.
- **gogo recommends:** **A** - matches "simplest solution that fully works" and the user's
  "fix now": one deterministic default + a one-time re-snapshot, curved/sketch deferred as a
  clean follow-up rather than rushed.
- **Status:** RESOLVED (see re-acceptance block below)

## D5 - FR6/FR7 line-work scope: which tiers ("activity" mapping)
- **Phase:** plan (re-plan)
- **Question:** The user said "flow and activity". There is **no `activity` diagram type**
  in this code (nor in mermaid's `detectType`); activity diagrams are authored as
  **flowcharts** or **state** diagrams. Flowchart, class, and state all route edges through
  the **shared geometry**; sequence has its own routing. How wide is the LINE work?
- **Options:**
  - A. **Flowchart + state + class** (everything that shares the geometry = "flow +
    activity" in this codebase); **sequence excluded**; lane-routing stays deferred (bridges
    instead). FR6 reaches all three for free; FR7 reaches all three via the shared post-pass.
  - B. **Flowchart-only** - narrowest; state/class keep the existing (same-pair-only) label
    handling and no bridges.
- **gogo recommends:** **A** - it is the faithful reading of "flow + activity" given the
  code, and costs little extra because the mechanism is shared; sequence remains out per the
  user.
- **Status:** RESOLVED

---

### RESOLVED — re-acceptance (user, 2026-07-12): plan re-accepted with D2–D5 as below
The user re-accepted the additive re-plan (FR6 + FR7 + FR8) and resolved the forks:
- **D2 = A** — hop glyph is an **arc bump** (matches the reference image; background-safe).
- **D3 = A** — the **more-horizontal edge hops** at a crossing (overpass reading), ties broken
  by edge index (deterministic).
- **D4 = per-style config toggle** (a refinement of A/B, in the user's words: "make elbows a
  style config … so we can turn them on or disable per style"). Concretely: bridges become a
  **`bridges` render option** (API `SvgRenderOptions.bridges?: boolean` + a CLI
  `--bridges/--no-bridges` flag, carried into the runtime payload), with a **per-style
  default — ON for clean elbow edges, OFF for curved (fancy) and sketch** (arc-splicing
  beziers/rough strokes stays the deferred hard case) — and always user-overridable. FR6
  label de-collision is **always-on** regardless of the toggle.
- **D5 = A** — LINE work covers **flowchart + state + class** (all share the geometry);
  **sequence excluded**; lane-routing stays deferred.

Verbatim (D4): "maybe lets make elbows a style config for now? so we can turn them on or
disable per style?" → interpreted + locked as the `bridges` option above.

**Routing:** re-accepted → `state.md` `plan-accepted`; the SAME work item reruns ②→⑤.

---

## D6 - FR9 approach depth: scoped post-layout pass vs a fuller orthogonal router
- **Phase:** plan (UAT round 1 re-plan)
- **Question:** How do we separate the merged parallel runs (the 3 boxes)? A scoped post-layout
  lane pass over the routed elbow polylines, or a fuller per-edge orthogonal router?
- **Options:**
  - A. **Scoped post-layout `separateLanes` pass** (Approach E) - bundle near-parallel/collinear
    runs, offset to lanes ≥ `LANE_GAP`, cascade the offset through the connected elbow, comb the
    endpoint fans. Reuses the FR6/FR7 shape (pure fn over the routed set + byte-parity twin),
    keeps every node fixed. *Trade-off:* the cascade + deterministic convergence are real work,
    but bounded and low-blast-radius on node positions.
  - B. **Fuller orthogonal edge router** with global lane assignment across corridors - the
    complete, general fix. *Trade-off:* effectively a new renderer + a full parity twin + total
    re-snapshot; high risk, out of proportion to the reported defect.
- **gogo recommends:** **A** - "simplest solution that fully works"; the scoped pass reaches all
  three annotated boxes while keeping every node position stable and reusing the shipped
  post-pass + parity pattern. (B is the deferred general router - see D8.)
- **Status:** OPEN

## D7 - FR9 aggressiveness: `LANE_GAP` and the split threshold
- **Phase:** plan (UAT round 1 re-plan)
- **Question:** How wide is a lane, and when does a bundle qualify to be split? Measured gaps
  today are 20-26px (one `PORT_STEP`).
- **Options:**
  - A. **`LANE_GAP ≈ 14-16px` + split when ≥3 runs share a channel within the gap AND overlap
    ≥ `LANE_MIN_OVERLAP ≈ 40px`** - moderate: only genuinely-merged runs move, so tidy diagrams
    don't churn; a 1.5px stroke reads clearly in a 14-16px lane.
  - B. **Aggressive (`LANE_GAP ≈ 24-28px`, split any 2 runs within the gap)** - maximum
    separation, but pushes bounds outward, forces more endpoint combs, and re-snapshots more
    diagrams.
  - C. **Gentle (`LANE_GAP ≈ 10px`, split only ≥4 runs)** - minimal churn, but the middle
    channel may still read tight.
- **gogo recommends:** **A** - clears the reported 20px merge with a legible gap while limiting
  churn; `LANE_GAP`/`LANE_MIN_OVERLAP` are tunable constants if the eye-check wants more/less.
- **Status:** OPEN

## D8 - FR9 scope: the 3 boxed bundles vs an everywhere guarantee
- **Phase:** plan (UAT round 1 re-plan)
- **Question:** Does FR9 guarantee separation only for the endpoint fan bundles + shared
  mid-channels (the reported cases), or for **every** near-parallel segment pair anywhere?
- **Options:**
  - A. **Scoped** - endpoint fans + shared mid-channels (the 3 boxes). Fixes the reported defect;
    a rare interior parallel run elsewhere may still read tight.
  - B. **Global** - "no two segments within N px anywhere". Complete, but that is the fuller
    router of D6=B (a new corridor/lane model), higher risk.
- **gogo recommends:** **A** - it fixes exactly what the user boxed; the global guarantee is the
  deferred router (D6=B). Ships the win without over-reaching.
- **Status:** OPEN

## D9 - FR9 endpoint bundles: comb-stagger vs widen-only floor (is the rework worth it?)
- **Phase:** plan (UAT round 1 re-plan)
- **Question:** The endpoint fans (boxes 1 & 3) are bounded by node width, so pure lane widening
  can't separate them. Do we add the **staggered-depth comb** (each edge turns at a different
  depth), or accept a lighter **widen-only** floor and defer the combs? This is also the honest
  "is the substantial routing rework worth it, or take a small win?" call.
- **Options:**
  - A. **Widen mid-channels + comb-stagger the endpoint fans that exceed node width** - the only
    way to actually separate boxes 1 & 3. *Trade-off:* adds jogs (more visual steps), can create
    new crossings (FR7 bridges them - hence lanes run before bridges), pushes bounds (watch
    REV-004); a heavier implement/review loop.
  - B. **Widen-only floor** (bump `LANE_GAP`/`PORT_STEP`/`ranksep`, no cascade, no combs) - much
    cheaper, low risk; but the endpoint fans (bounded by node width) barely improve, so boxes 1 &
    3 stay tight - a partial win.
- **gogo recommends:** **A** - the user explicitly boxed the endpoint fans and asked to "keep
  those lines separate"; combs are the only mechanism that actually does it. But **B is the
  legitimate fallback** if, at re-acceptance, the added complexity/churn isn't judged worth it
  vs. the mid-channel win alone - an honest scope-vs-cost call for the user to make.
- **Status:** OPEN

---

<!-- The analyst leaves D6-D9 OPEN; the orchestrator records the user's resolutions at
     re-acceptance (the same step it appends the uat.md round-1 Verdict second line and flips
     state.md to plan-accepted). -->
### RESOLVED — UAT round 1 re-acceptance (user, 2026-07-13): "Full fix — all 3 boxes"
- **D6 = A** — **scoped post-layout `separateLanes` pass** (not a full orthogonal router). Reuses
  the FR6/FR7 shape (pure fn over the routed set + byte-parity twin); every node position fixed.
- **D7 = A** — **`LANE_GAP ≈ 14-16px`**, split when **≥3 runs** share a channel within the gap
  **AND** overlap **≥ `LANE_MIN_OVERLAP ≈ 40px`** (tunable constants; clears the measured 20px
  merge without churning tidy diagrams).
- **D8 = A** — **scoped** to the endpoint fans + shared mid-channels (the 3 boxed bundles);
  the global everywhere-guarantee stays the deferred router.
- **D9 = A** — **widen mid-channels + comb-stagger the endpoint fans that exceed node width**
  (boxes 1 & 3). The user explicitly boxed all three regions and chose the full fix over the
  lighter widen-only floor, accepting the heavier loop (comb jogs, possible new crossings that
  FR7 bridges, wider bounds — watch REV-004) as worth separating every line.

**Routing:** re-accepted → the SAME work item reruns ②→⑤ to build FR9 on the FR1-FR8 baseline.

---

## D10 - FR9 approach: routed-segment lane-offset (jogs) vs space-at-source
- **Phase:** implement (UAT round 1, FR9)
- **Question:** The accepted D6=A/D9=A approach (offset routed elbow segments into lanes + cascade
  + comb) was prototyped (`separateLanes`, `scratchpad/demo/5-fr9.png`). It DOES spread the merged
  mid-channel bundle (box 2 lines become separable), but moving a shared mid-segment makes the
  connecting horizontals **jog and cross** in the transition zone — busier, not clean — and the
  node-width-bound endpoint fans (boxes 1 & 3) still need the harder comb-stagger. This is exactly
  the cascade complexity the analyst flagged. How should FR9 proceed?
- **Options:**
  - A. **Keep refining the lane-offset + add the comb** (accepted path). Fully separates every
    run incl. boxes 1 & 3. *Trade-off:* the mid-segment offsets inherently add jogs/new crossings
    (FR7 then bridges them), and it's genuine multi-round work with uncertain visual polish +
    byte-parity twin cost.
  - B. **Gentler "space at the source"** - widen where edges are born (bump `PORT_STEP`/perimeter
    spread + dagre `nodesep`/`edgesep`/`ranksep`) so parallel runs start and stay farther apart,
    with NO segment-offset jogs. *Trade-off:* cleaner + lower risk, but coarser (moves the whole
    layout) and the node-width-bound fans (boxes 1 & 3) barely improve.
  - C. **Ship the mid-channel spread as-is** (jogs and all) - lines are separable but the
    transition zones read busier. *Trade-off:* fast, but contradicts the pixel-perfection bar.
- **gogo recommends:** honestly, **a hybrid** — B as the base (space parallel runs apart at the
  source, cleanly, no jogs) plus a *light* mid-channel nudge, and treat the full comb (A) as a
  follow-up only if the source-spacing doesn't read cleanly enough. Given the offset approach's
  jogs, the elegant win is more separation *without* re-routing segments.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-13) → B (space at the source)
The offset-the-routed-segments approach jogged; the user chose the cleaner **"space at the
source"**: widen where edges are born (dagre `edgesep`/`nodesep`/`ranksep` + perimeter spread)
so parallel runs start and stay farther apart with NO segment-offset jogs, plus a light
mid-channel nudge. `separateLanes` (the offset prototype) is shelved (exported, unwired) - it
may return as a bounded follow-up if source-spacing leaves a residual merge. The endpoint fans
(boxes 1 & 3) improve as far as node width allows (no comb this pass).

### REVERSED (user, 2026-07-13): D10=B rejected on sight → the OFFSET (separateLanes) ships
The "space at the source" (dagre `edgesep=30`) was implemented and rendered, but on seeing it the
user found the **global spread WORSE** than the compact offset ("this one 6-edgesep30 looks much
much worse than 5-fr9"). Reverted: `edgesep` removed; the offset **`separateLanes` is the shipped
FR9** — wired FIRST into `finishEdges`, mirrored byte-for-byte in the runtime twin. The user was
then "almost ok" on the offset with 2 residual issues, both fixed this round: (1) a label-vs-node
de-collision (`resolveLabelNodeCollisions` — "gRPC stream" cleared off Ingress); (2) a wider hub
fan-in (`PORT_STEP` 26→30 + border-filling cap). So the effective D10 outcome is **the offset, not B**.

---

## D11 - FR9 endpoint-run limitation: ship the compact-offset win, or add the comb-stagger?
- **Phase:** implement/test (UAT round 1, FR9)
- **Question:** The all-pairs lane push (robust, order-independent) fixes the STATIC render + all
  REALISTIC node drags (0 merges for |dx|<=40,dy<=40). But the compact offset **cannot move an
  endpoint-attached run** (one whose segment touches a node border) without detaching the anchor —
  so **box 1 (the Ingress-out fan)** stays ~26px-bunched, and **dragging a node far out of position**
  (e.g. Ingress → deep into the diagram, the tester's (138,320)) can transiently re-merge two of
  its own outgoing lines (measured 15px). Both are the SAME limitation; the only mechanism that
  fixes them is the **staggered-depth comb** the user deferred at D9→D10 (kept the compact offset).
- **Options:**
  - A. **Ship the compact-offset win; document the endpoint limitation.** Static render + realistic
    drags fixed (mid-channel 26px, hub spread, labels clear). Box 1 + extreme-drag re-merge remain a
    known, disclosed limitation. Proceed to ⑤ report → UAT. Lowest risk; the primary defect (the
    rendered diagram) is fixed.
  - B. **Add the comb-stagger now.** Tackle endpoint fans (box 1) + extreme-drag cases with the
    staggered-depth comb. Fixes the remaining cases, but it is the substantial routing work with the
    jog/new-crossing risk seen in the earlier offset prototype, plus more implement/review/test
    rounds + a byte-parity twin.
- **gogo recommends:** **A** - the user's actual reported defect (the static rendered diagram) is
  fixed for the mid-channel + hub; box 1 is node-width-bound and the extreme-drag re-merge only
  happens when a node is hauled far out of its layout. The comb is a materially bigger, riskier lift.
  But this is a genuine quality-vs-cost call for the user, who has (rightly) pushed on pixel-perfection.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-13) → neither A nor B: iterate the visual (gaps, not bridges)
The user did not accept "ship as-is" nor "add comb"; instead gave new direction (see
uat-d11-gap-reference.png + uat-d11-annotated.png):
1. **Crossing GAPS instead of bridge arcs (FR7 pivot).** "instead of bridges/elbows lets make it
   look like this so just a space, this will also show which line is which" — at a crossing, break
   the UNDER line with a small gap (the reference shows the vertical line gapped where the horizontal
   crosses). This is the D2 "gap/notch" option (previously deferred for arc). Now chosen.
2. **Label over lines + too close (gRPC stream).** Its opaque plate covers 3 lines in 2 places (6
   crossings) and sits too close to Ingress. Need label-vs-EDGE avoidance + more node clearance.
3. **Left/right side attachment (suggestion).** "we can use arrows to join from left or right to the
   shapes so it will give more space" — bigger routing change; treated as a FOLLOW-UP, not this pass.
Box-1 comb (D11=B) is not pursued now; the compact offset FR9 stays. This is an FR7-glyph pivot +
a label refinement, delegated to the developer.

### RESOLVED (user, 2026-07-13) → D12: de-knot the API Gateway outgoing fan (heading-order ports)
User: "this one looks almost perfect only this one place marked on image" (uat-d12-annotated) — boxed
the **API Gateway outgoing fan**. Root-caused (not guessed): API's 3 bottom edges are ordered by
**destination centre**, but dagre steers the API→HUB edge *right* (to x≈806, around the Kukuvara
subgraph) while its destination centre (HUB, cx≈437) says "middle port" — so it left the middle port
and **crossed** the straight-down alt-path→K2 edge = the little knot under the node.
- **Fix (contained, principled):** order a shared border's ports by each edge's **actual heading** —
  its first interior dagre bend at the source end, its last at the target end — instead of the far
  node's centre. Straight edges (no bends) fall back to the centre, so any diagram without detours
  is byte-identical. New optional `bends` param on `computePerimeterPorts`; wired from `layout()`
  (both call sites), `native/state/layout.ts` (pseudo-reroute), and mirrored byte-for-byte in the
  runtime twin (`computePorts` reads `e.waypoints`).
- **Result:** API→HUB now takes the rightmost port and peels away; alt-path→K2 drops straight down
  the middle port (perfectly aligned, no jog); feed→V1 takes the left port. No crossing. Verified:
  API knot gone (by eye, 3× zoom); flowchart/class/state examples regenerated + eyeballed (state's
  fail/retry labels also came off their lines — a bonus); 387 unit green (+2 guards: geometry unit
  + layout integration); deterministic; **flowchart byte-parity** (FR9 fixture) + **state byte-parity**
  (live mountState vs static renderStateSvg, identical relative geometry) both confirmed.
- **Still deferred (unchanged):** left/right side edge attachment (the user's own "more space"
  suggestion) — a larger routing change, explicitly a follow-up, not this pass.
- **Status:** RESOLVED (implemented; pending fresh-eyes review round 6 + test)

### RESOLVED (user, 2026-07-13) → D13: accept & ship (after D12 green)
After D12 (API-fan de-knot) came back GREEN (388 unit + 79 e2e + hands-on, byte-parity flowchart+state,
determinism), the user was asked to verify + pick the next step. **User chose "Accept & ship."**
- **Disposition of the two open items:** both accepted as **documented follow-ups**, not this feature:
  1. **TEST-004** (extreme-drag lane re-merge / endpoint-fan comb-stagger) → `wontfix` (follow-up). Only
     manifests when a node is hauled far out of layout; all user-reported defects are fixed.
  2. **Left/right side edge attachment** (the user's own "more space" idea) → follow-up (larger routing change).
- **Result:** ⑤ report refreshed to the full as-built (FR1-FR9 + gap pivot + D12); `state.md` → phase=done,
  status=**awaiting-uat**. The user runs **`/gogo:done`** to ship to the changelog. Nothing committed (gogo
  defers commits to the user).
- **Status:** RESOLVED
