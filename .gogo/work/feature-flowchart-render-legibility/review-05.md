# Review round 5 — flowchart-render-legibility (UAT-round pivot: crossing GAPS + label-vs-edge)

**Scope:** the UAT-round-1 iteration only — (1) FR7's pivot from arc **hops** to crossing
**GAPS** (`applyEdgeBridges`/`gappedPath`, `GAP_RADIUS=4`, `… L x y M x y L …`), and (2) the new
**label-vs-edge** de-collision (`resolveLabelEdgeCollisions` + `nearestRunAxis`, `LABEL_NODE_PAD`
6→10), on top of the shipped-green FR1–FR9. Prior reviews (rounds 1–4) approved FR1–FR9; those are
**not** re-reviewed.

**Reviewed against:** `git diff master` (whole branch is an uncommitted working tree), `plan.md`
(FR6/FR7 + FR9), `decisions.md` **D11** (GAPS not arcs; label-over-line fix; left/right ports +
box-1 comb deferred), the reference images `uat-d11-gap-reference.png` + `uat-round1-annotated.png`,
`code-review-standards.md`, `coding-rules.md`.

**Gates (run this round):**
- `npx tsc --noEmit` — clean.
- `npx vitest run` — **385 passed / 29 files** (incl. `dom-runtime-parity` clean + sketch, with the
  crossing-gap + drag-re-route parity fixtures).
- `npm run build` — success (ESM + DTS).
- Determinism — rendered the crossing/label repro to SVG **twice** against the fresh build → **byte-identical**.

---

## Verdict: **APPROVE** — no open blockers or majors

One new finding, well below the changes bar: **REV-008** (nit, latent heuristic limit of the new
label-vs-edge pass, verified NOT to fail in the corpus). Two prior open items closed this round:
**REV-006** (docs) and **REV-007** (FR9 test coverage) both **verified**.

---

## What I verified clean (the focus areas)

### 1. Byte-parity of the runtime twins (highest risk) — PASS
`gappedPath`, `applyEdgeBridges`, `nearestRunAxis`, `resolveLabelEdgeCollisions` (and the
carried-over `resolveLabelNodeCollisions`) in `src/render/dom/runtime.ts` are byte-identical to
`src/geometry/index.ts`:
- **Constants:** `GAP_RADIUS=4` (runtime literal `4`), `2·GAP_RADIUS=8` (runtime literal `8`),
  `PORT_LABEL_PAD=6` (runtime literal `6`), `LABEL_NODE_PAD=10` (runtime literal `10`), the `0.5`
  orientation thresholds. `nAt(v)=Math.round(v*100)/100` ≡ geometry `n`.
- **Which-line rule (D3 pivot):** the **more-VERTICAL** crossing segment is broken (ducks under);
  `iGaps = horizI === horizJ ? true : !horizI` — same-orientation tie ⇒ the **lower edge index** is
  the one gapped. Identical in both twins.
- **`d` format incl. the M restart:** `M start … L (at − u·4) M (at + u·4) … L end`. The pen-up is a
  real `L`-then-`M`, byte-identical. Same overlap-guard `g.dist − lastGapDist < 2·GAP_RADIUS` and
  same sort-by-distance-from-segment-start.
- **`finishEdges` order matches in both static and twin:** `separateLanes` → `deCollideLabels`
  (label-label) → `deCollideLabelsFromEdges` (label-vs-edge) → `deCollideLabelsFromNodes`
  (label-vs-node) → `applyBridges`. The runtime `renderEdges` (live) and `buildSvg` (Save-SVG) both
  run the same five in the same order (lines 1673-1684, 2535-2549). *(Node clearance runs last so a
  label can never end up hidden behind a top-layer node card — the sensible priority.)*
- The `dom-runtime-parity` guard drives a diagram with **both** a de-collided label collision **and a
  genuine crossing gap** and byte-compares `toSvgString()` vs `renderSvgFromModel` after drag+resize,
  clean and sketch — green. The guard's gap fixture asserts a real pen-up (`/ L … M …/`) is present,
  so the changed path is actually exercised (not a trivially-empty match).

### 2. Gap correctness — PASS
- **Real pen-up:** a fresh-build render of a forced crossing yields
  `d="M 162.5 152 L 162.5 166.5 M 162.5 174.5 L 162.5 196.5 L 321 196.5 L 321 218"` — an 8px break
  (166.5→174.5) in the more-vertical under-line, background-independent (no fill/arc). Because it is a
  true pen-up, edge z-order is irrelevant: only the continuous over-line paints across the gap.
- **Guards hold:** corner-guard skips a crossing within `GAP_RADIUS` of the broken segment's ends
  (`dEntry/dExit < 4`); overlap-guard collapses two crossings <2·radius apart to one gap. Both tested
  (`test/geometry.test.ts` "skips a crossing within a gap radius of the under-line's end",
  "collapses two crossings … to a single gap (REV-005)").
- **Marker survives:** the gapped `d` always ends `L <final point>`, so `marker-end` stays on the
  final subpath — the arrowhead is preserved (verified in the rendered path above).
- **No spurious gaps:** the gallery flowcharts have **0** mid-path `M` (no crossings ⇒ no gaps); the
  render-svg test "a diagram with no crossings is byte-identical with or without bridges" passes.
- **Toggle + styles:** `bridges:false` / `--no-bridges` removes every gap (unit + e2e); curved (fancy)
  is left un-gapped (gate is `edgeStyle === "elbow"`); sketch draws from `points`, never `path`.

### 3. `resolveLabelEdgeCollisions` determinism + safety — PASS (with a latent nit → REV-008)
- Fixed iteration order (pass → i → j → segment), no RNG/clock, 4 bounded passes → deterministic;
  parity-safe (de-collides from the **rounded** centre, only writes back on a real shift).
- It slides the label **only along its own edge's nearest-run axis**, and only for **perpendicular**
  foreign runs that pass through the plate — a parallel graze is deliberately left alone (an
  along-axis move can't clear it). In one pass it jumps clear of **all** currently-hitting foreign
  runs on the nearer side (`hiTarget = max`, `loTarget = min` accumulation), so it never parks the
  plate *between* two lines.
- **The `gRPC stream` target is verified clean** in the shipped pipeline: 0 foreign edge segments
  overlap its plate (`test/layout.test.ts:397`) **and** 0 node-box overlap (`:366`), simultaneously.
- **REV-008 (latent):** the slide target is not clamped to the own-run interval, and the label
  passes don't jointly re-converge — heuristic limits that could, in pathological dense geometry,
  leave a label off its own line or grazing a parallel neighbour. Verified NOT to occur across the
  corpus/repro; logged as a nit, not a defect.

### 4. Determinism + churn — PASS
- Repro SVG byte-identical across two fresh-build renders.
- Snapshot/example regen is the intended set: the render-svg / state-svg snapshots and the
  flowchart/class/state examples reflect the label-plate + label-move deltas (and the accumulated
  FR3/FR4/FR9 look); no spurious content. The `Q`-arc→gap flip landed only where FR7 fires; the
  remaining ` Q ` assertions in tests are all sketch/rough-stroke or rounded-corner cases (not
  bridges). No dead arc code remains (`bridgedPath`/`BRIDGE_RADIUS` fully renamed to
  `gappedPath`/`GAP_RADIUS`).

### 5. Scope — PASS
- FR9 lanes, FR6 label-label, label-vs-node, and the hub `PORT_STEP=30`/border-fill spread are all
  intact and untouched by this round (separateLanes / resolveLabelNodeCollisions unchanged beyond the
  `LABEL_NODE_PAD` 6→10 constant, mirrored in both twins).
- **Sequence untouched:** `git diff master src/native/sequence` = 0 lines; no sequence example changed.
- **Correctly NOT attempted:** no comb-stagger, no left/right-side port attachment code
  (grep of `src/` finds none) — matching D11's deferral of box-1 comb + left/right ports as a
  follow-up.

---

## New finding

### REV-008 — nit (heuristic limit of the new label-vs-edge pass) · NEEDS-USER-DECISION · open
`resolveLabelEdgeCollisions` slides a label along its own run to clear perpendicular foreign lines.
Two real, code-grounded limits: (1) the slide target is **not clamped to the own-run extent**, so in
dense geometry it could in principle push a plate past the end of its own edge (or outward past the
viewBox — see REV-004); (2) the label passes run once each in sequence and **don't re-converge**, so
label-vs-node (last) could nudge a plate back toward a foreign line. It also, by design, leaves
**parallel** grazes alone (the state.md-disclosed "batch load grazes 1 parallel neighbour"). All
verified **not** to materialise as a defect (gRPC target clears both foreign edges and the Ingress
box; every regenerated example keeps its labels on-line and in-bounds). No change needed to ship; a
future hard guarantee = clamp the slide to `[lo+hw, hi−hw]` (twin-mirrored) and/or fold plates into
`contentBounds` (REV-004). The parallel-graze residual is the deferred lane/left-right-port follow-up.

---

## Prior findings — status this round
- **REV-001** (nit) wontfix — shared-geometry ripple; untouched (only `LABEL_NODE_PAD` 6→10 added, a
  label-vs-node constant, not an anchor).
- **REV-002** (major) verified — native class/state draw `labelPlateSize`; the new label-vs-edge pass
  sizes with the same shared `labelPlateSize`, so the drift class is not reopened.
- **REV-003** (minor) verified — `route.ts` threads `bridges`; the arc→gap pivot kept the same gate.
- **REV-004** (nit) wontfix — viewBox excludes label plates; the new label-vs-edge slide shares the
  same still-unobserved outward-nudge surface.
- **REV-005** (nit) verified — the same-segment overlap skip carried over into `gappedPath`
  byte-identically (`< 2·GAP_RADIUS` / `< 8`); the REV-005 test was flipped to gaps and passes.
- **REV-006** (nit) **verified this round** — `decisions.md` now carries the D10 reversal block.
- **REV-007** (minor) **verified this round** — the re-laning shape now has real orthogonality +
  `edgeThroughNodeCount==0` geometry guards (`layout.test.ts:202`, `geometry.test.ts:271`).

---

**Verdict: APPROVE**
