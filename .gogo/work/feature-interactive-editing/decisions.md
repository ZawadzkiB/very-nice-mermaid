# Decisions — feature `interactive-editing`

Forks that needed a human call. gogo appends each as `D<n>` with options and a
recommendation, then records your answer as a `RESOLVED` block. This is the
audit trail that lets the pipeline pause and resume safely.

<!-- Template for each decision — copy and fill:

## D1 — <short title>
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

## D1 — Connection attachment points
- **Phase:** plan
- **Question:** How do edges attach to a shape when a node has many connections?
- **Options:**
  - A. **Auto-distribute around the perimeter** — edges fan out around the whole border, spaced; zero user effort; least code.
  - B. Manual per-anchor drag — full control, largest build + effort.
  - C. Both (auto + manual override) — best UX, largest build.
- **gogo recommends:** A — solves the readability problem (the user's actual complaint) with no manual work; B/C can be layered on later.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-04)
A — auto-distribute around the perimeter. Confirmed explicitly at plan acceptance (manual per-anchor drag stays deferred / out of scope for v0.3.0).

## D2 — Resize vs auto-layout
- **Phase:** plan
- **Question:** Does resizing a node re-run the layout?
- **Options:**
  - A. **No** — a resize is a manual edit and sticks; edges re-route to the new border; the existing reset-layout control returns to the computed layout.
  - B. Re-layout on resize — would clobber the user's manual size/positions.
- **gogo recommends:** A.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-04)
A — resize never re-runs layout; reset-layout returns to the computed layout. Resolved by plan acceptance.

## D3 — In-browser PNG export
- **Phase:** plan
- **Question:** How does the interactive view produce a PNG without a server?
- **Options:**
  - A. **`<canvas>`** — serialize the current model to SVG, load into an `Image`, draw to a canvas, `toBlob` → download. Browser-only, no deps.
  - B. Ship resvg to the browser — not viable (native Node addon).
- **gogo recommends:** A.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-04)
A — serialize the current model to SVG → Image → canvas → toBlob download. Resolved by plan acceptance.

## D4 — In-browser SVG source
- **Phase:** plan
- **Question:** What does "Save SVG" serialize?
- **Options:**
  - A. **Build our themed SVG from the live positioned model** (inlined serializer, parity with `src/render/svg.ts`) — the saved image equals `vnm render -f svg` of the edited state.
  - B. Scrape the live DOM (HTML cards + SVG edge layer) — cards are HTML `<div>`s, so a true SVG needs `<foreignObject>` (hacky, non-portable).
- **gogo recommends:** A — correct, portable, consistent with the CLI's SVG; cost is a bit more code in the serialized runtime (parity-guarded).
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-04)
A — build the themed SVG from the live positioned model (inlined serializer, parity with `src/render/svg.ts`). Resolved by plan acceptance.

## D5 — Reset-layout control (TEST-001)
- **Phase:** test
- **Question:** The plan's D2 ("resize does not re-run layout") cited "the existing reset-layout control" as the escape hatch — but no such control exists. `resetView()` only resets pan/zoom, never node positions/sizes. Not a new regression (drag has had no undo since v2), but the plan's stated mitigation is false. What do we do?
- **Options:**
  - A. **Add a real reset-layout control** — a toolbar button that discards manual positions + sizes and returns to the computed layout (clears the localStorage layout for the diagram). Small, agent-fixable; makes D2's mitigation true; goes back through ② fix → ③ re-review → ④ re-test.
  - B. Correct the plan text and accept the gap — no undo for manual edits in 0.3.0; cheapest, ships now.
- **gogo recommends:** A — it's the escape hatch the accepted plan already promised, it's small, and without it a user who mangles a layout has no recovery except hand-editing localStorage.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-05)
A — add a real reset-layout control: toolbar button that discards manual positions + sizes and returns to the computed layout (clears the stored layout for the diagram). Routed back through ② fix → ③ re-review → ④ re-test.

## D6 — Subgraph container behaviour (UAT round 1)
- **Phase:** plan (UAT re-plan)
- **Question:** The user "can't move the background warehouse", and dragging a child out of a subgraph leaves the dashed box stranded and empty (it neither follows nor resizes to its children). Today the box is a static background — drawn once at layout coords, never updated (`runtime.ts:129-151`, drag handler `:898-903`). What behaviour should the container have? (Its `children` node-ids are already available at runtime.)
- **Options:**
  - A. **Auto-contain / follow children** — on every drag/resize/reset, recompute each subgraph's bbox from its children's live positions + sizes (+ padding + title band) and update the rect; static SVG honors the same for parity. No new interaction surface; the empty-box defect disappears; but the box hugs its children — you can't park it over empty space (you "move" it by moving its members). Smallest, deterministic, parity-guardable. *(covers Point 1b; partially answers 1a)*
  - B. **Draggable group** — make the dashed box itself a drag target (hit-test the rect) that moves all its children with it, so you can reposition the whole cluster — the literal "move the warehouse". Larger: group hit-testing under the edge/card layers, group-move + persistence, and it still wants membership semantics (does dragging a child out un-group it?) and re-hug when it does — i.e. it usually still needs A underneath.
  - C. **Both** — auto-contain (A) so a container is never stranded, *and* a draggable group handle (B) to reposition the cluster. Best UX, largest build.
- **gogo recommends:** **A** — it removes the actual on-screen defect (stranded empty box) with data already present, zero new interaction risk, and is parity-guardable; B/C add real hit-testing + membership semantics and are closer to fresh scope. Pick B or C only if repositioning the whole cluster as a unit is a hard requirement now.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-05)
C — both: the container auto-contains/follows its children (never stranded) AND the box itself is a drag target that moves the whole cluster (the literal "move the warehouse"). Chosen at UAT round 1 re-acceptance.

## D7 — Manual edge editing (UAT round 1)
- **Phase:** plan (UAT re-plan)
- **Question:** The user "can't move the arrows / connection lines". This is exactly D1's deferred option B (manual per-anchor drag) + the plan's out-of-scope "manual edge waypoint editing" (a stated v0.4 candidate). The edge layer is intentionally `pointer-events:none` (`runtime.ts:118`) and every path is auto-routed from live node positions (D1=A). If the user wants manual control now, in what shape?
- **Options:**
  - A. **Per-anchor drag only** — grab an edge endpoint and pin its `{side,offset}` on the node border, overriding auto-distribute for that end only; persists in the layout sidecar; reset clears it; static SVG honors the override for parity. Directly answers "attach the line where I want" with the smallest new surface (endpoint hit-targets + one model override field). Medium effort.
  - B. **Waypoint editing** — grab a point along an edge to add/drag/remove a bend the orthogonal elbow threads through (the routing already threads fixed dagre detours; user waypoints extend that). More UI (add/remove/drag along a `pointer-events:none` path), persistence, and interaction with auto-routing. Larger effort.
  - C. **Both** — per-anchor drag + waypoints. Full manual control; largest build (closest to D1's option C, originally rejected as largest).
- **gogo recommends:** keep **deferred** (this is intended behaviour per D1=A); but if adopted now, **A** — it maps directly to the complaint, reuses the existing anchor model (`{side,offset}`), and is the most contained. All options carry a real cost: edge hit-testing (the layer is `pointer-events:none` today), a persisted override, static-SVG parity, and reset-layout integration.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-05)
A — per-anchor drag: grab an edge endpoint and pin its {side,offset} override on the node border; persisted; reset clears it; static-SVG parity. Waypoint editing stays deferred. Chosen at UAT round 1 re-acceptance.
