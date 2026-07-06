# UAT — feature `interactive-editing`

<!-- The UAT gate log — the plan-gate symmetry at the END of the pipeline.
  Phase ⑤ (report) no longer ends at `done`; it ends at status: awaiting-uat, and you verify the work.
  There are exactly two ways forward, and both are recorded here (append-only, newest round at the bottom):

  1. ACCEPT — running `/gogo:done` IS the acceptance (no extra confirmation question, mirroring how
     accepting a plan unlocks `/gogo:go`). `/gogo:done` first appends the one-line accept verdict below,
     then ships as usual.
  2. ISSUES / QUESTIONS — you describe what's wrong or ask a question instead of shipping. The
     orchestrator hands your input to `gogo-analyst`, which analyses it against the current plan.md +
     decisions.md + THE CODE (code = source of truth) and appends an issues round below; adjustments.md
     logs the plan delta and plan.md is updated. You RE-ACCEPT the adjusted plan, then `/gogo:go` reruns
     ②→⑤ — the SAME work item, never a new one — landing back at awaiting-uat.

  Each round is numbered sequentially (round N). state.md's `iterations:` line gains `uat=N`, counting the
  re-plan loop-backs.
-->

## UAT round 1 — 2026-07-05

**Input (verbatim):**
> im still not able to move background warehous and still im not able to move arrows connections lines

_(a screenshot accompanied the report: the user has dragged `Stock check` and `Pick & pack`
OUT of the dashed "Warehouse" subgraph box, which stayed behind as an empty container — it
neither follows its children nor resizes to contain them; edges take long detours.)_

**Analysis (against plan.md + decisions.md + the code — code is source of truth):**

The report shipped v0.3.0 = node **resize** + **auto-distributed perimeter connectors** (D1=A)
+ **browser SVG/PNG export** + a **reset-layout** control. Neither complaint is a regression;
both name capabilities that v0.3.0 never touched. Verified in the runtime:

- **Subgraph containers are static backgrounds.** `src/render/dom/runtime.ts:129-151` draws each
  `model.subgraphs` entry once as an SVG `<rect>` at its layout-computed `x/y/width/height`, then
  never touches it again. It carries no `.vnm-node`/`data-id`, so `onPointerDown` (`:871`) never
  treats it as a draggable card — a pointerdown on the box area falls through to `mode = "pan"`
  (`:880-886`), which is why "the background warehouse won't move". And the drag handler
  (`onPointerMove` `mode==="drag"`, `:898-903`) only updates the dragged node's `positions[…]`,
  re-routes edges and redraws the minimap — it **never** recomputes any subgraph rect. So a child
  dragged out of the box leaves the box stranded and empty, exactly as the screenshot shows. The
  container's `children` (node ids) *are* available at runtime (`model.subgraphs[].children` is
  serialized through `serializeModel` → `buildPayload`; model `Subgraph.children`,
  `src/model/index.ts:92-98`), so a "follow / resize-to-contain" behaviour is feasible with data
  already present — it is simply not implemented. Subgraph behaviour is unchanged since the v2
  drag feature; **v0.3.0's plan says nothing about subgraphs** (they appear only in FR3/parity as
  something the SVG/PNG export must render correctly, tested at report.md:73).

- **Edges are auto-routed only, and the edge layer is physically non-interactive.** The whole SVG
  edge layer is `pointer-events:none` (`runtime.ts:118`), so an edge/arrow can't even receive a
  pointerdown. `computePorts()` (`:497`) + `routeBoxes()` (`:583`) recompute every edge's anchors
  and path from live node positions on every frame; dagre's detour waypoints are carried through
  **fixed** (`:179-181`) and there is no user-editable waypoint or per-anchor override anywhere.
  This is precisely **D1=A** as accepted ("auto-distribute around the perimeter; manual per-anchor
  drag deferred / out of scope") and the plan's Out-of-scope line "manual per-anchor drag +
  manual edge waypoint editing". The report even names it a v0.4 candidate (report.md:96). So
  "can't move the arrows/connection lines" is the **intended** behaviour of the accepted plan — but
  the user is now asking for the deferred capability, which grows scope only if they re-accept.

**Disposition (per point):**

- **Point 1a — "can't move the background warehouse" (drag the subgraph box itself)** —
  **works-as-designed** in the plan's letter (subgraph dragging was never promised in any FR; the
  box is a static background, unchanged since v2), **AND new-scope** for the literal ask (dragging
  a subgraph as a group is a capability this item never contained). See fork **D6**.

- **Point 1b — the container is left stranded/empty and never follows or resizes to its children**
  — **fix-needed (FR-quality gap).** Not in the plan's letter, but it is the emergent defect the
  screenshot actually shows: with resize/drag now first-class, a container that ignores its own
  children reads as broken and undercuts the feature's "genuinely editable" promise. Cheap to fix
  (children data already at runtime; deterministic; parity-guardable). Recommended as new **FR6**,
  pending re-acceptance. The *how* is fork **D6** (auto-contain vs draggable-group vs both).

- **Point 2 — "can't move the arrows / connection lines"** — **works-as-designed** (auto-distribute
  is D1=A, explicitly chosen and user-confirmed 2026-07-04; the edge layer is intentionally
  non-interactive) **+ new-scope** (manual per-anchor drag / waypoint editing is D1's deferred
  option B and the plan's Out-of-scope, a stated v0.4 candidate). Proposed as new **FR7** with a
  recommended minimal shape (per-anchor drag), pending re-acceptance. The *how* is fork **D7**.

**Proposed plan delta (see plan.md "UAT round 1 additions", adjustments.md logs the same):**
- **FR6 (new, pending):** subgraph containers stop being inert — they track their children so a
  container is never stranded empty. Minimal recommended shape = **auto-contain** (recompute each
  subgraph's bbox from its children's live positions/sizes + padding + title band, live on
  drag/resize/reset, honored in the static SVG for parity). Fork **D6** decides auto-contain vs a
  draggable group vs both.
- **FR7 (new, pending):** the interactive view lets the user place an edge where they want. Minimal
  recommended shape = **manual per-anchor drag** (grab an endpoint anchor → pin its `{side,offset}`
  override, overriding auto-distribute for that end only; persists via the layout sidecar; reset
  clears it; honored in the static SVG for parity). Fork **D7** decides anchor-drag vs waypoints vs
  both. This is a genuine scope increase (edge hit-testing — the layer is currently
  `pointer-events:none` — an override in the model + persistence + parity + reset integration).

**Verdict:** re-planned — awaiting re-acceptance → re-accepted (user, 2026-07-05) with D6=C, D7=A → /gogo:go reruns ②→⑤

## UAT round 2 — accepted (user, 2026-07-05) — via /gogo:done

Round 1's fixes verified by the user on the v0.4.0 demo (subgraph group-drag + auto-contain,
edge-endpoint pinning). Running `/gogo:done` is the acceptance; shipping to
`.gogo/changelog/2026-07-05-interactive-editing/`.
