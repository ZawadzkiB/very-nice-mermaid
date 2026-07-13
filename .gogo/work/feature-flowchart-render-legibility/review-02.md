# Review round 02 — flowchart-render-legibility (FR6/FR7 + `bridges` toggle)

- **Feature (round 2 delta):** FR6 all-pairs edge-label plate de-collision
  (`resolveLabelCollisions`, fixes TEST-001) + FR7 edge-crossing bridge hops
  (`segmentsCross` / `applyEdgeBridges` / `bridgedPath`, arc overpass, D3) gated by
  the D4 `bridges` config toggle, across flowchart + state + class (D5; sequence out),
  mirrored byte-for-byte in the inlined DOM runtime.
- **Diff reviewed:** `git diff master` — `src/geometry/index.ts`, `src/layout/index.ts`,
  `src/render/svg.ts`, `src/render/dom/runtime.ts`, `src/render/{prepare,dom/payload}.ts`,
  `src/cli/run.ts`, `src/native/{class,state}/layout.ts`, tests + regenerated
  snapshots/examples.
- **Gates:** `npm run build` green · `npx vitest run` green (**371 passed / 29 files**),
  incl. the `dom-runtime-parity` byte guard extended with an FR6+FR7 crossing/de-collision
  case (clean and after a drag re-route).

## Verdict: **CHANGES** (1 open major)

FR6/FR7 are well-built and the byte-parity story holds up under scrutiny, but the FR6
"no two plates overlap" guarantee is **not actually enforced for the class/state tiers**
(the de-collision sizes plates with the tight formula while those tiers draw the older
looser plate), and the guarding test masks it. One major, one minor, two nits.

---

## Findings

| id | sev | pri | status | title | tag |
|----|-----|-----|--------|-------|-----|
| REV-001 | nit | P3 | wontfix | Shared `PORT_STEP`/`PORT_SPREAD_FRAC` bump ripples into class/state spread | NEEDS-USER-DECISION |
| REV-002 | **major** | P1 | open | FR6 de-collides class/state with the tight plate but those tiers DRAW the looser plate → overlap not enforced for 2/3 D5 tiers | AGENT-FIXABLE |
| REV-003 | minor | P2 | open | `renderSvgAsync` drops `opts.bridges` for class/state (public API opt-out ignored) | AGENT-FIXABLE |
| REV-004 | nit | P3 | open | Bounds/viewBox exclude label plates → potential perimeter clip (not observed) | NEEDS-USER-DECISION |
| REV-005 | nit | P3 | open | Two crossings <2·radius on one segment splice a backward-L hop (valid SVG, not observed) | AGENT-FIXABLE |

### REV-002 — FR6 not enforced for class/state (major)
FR6 (`plan.md`: "no two edge-label plates may overlap"), scoped by **D5** to flowchart +
state + class. For **flowchart** it holds: `deCollideLabels` (`src/layout/index.ts`) sizes
plates via `labelPlateSize` = `0.6·size+6 / lines·lh+2`, and the flowchart sink
`src/render/svg.ts edgeLabel` draws exactly that. But the **native class/state** static
renderers draw with their own local `edgeLabel` on the *pre-FR3 looser* formula —
`src/native/class/svg.ts:154` and `src/native/state/svg.ts:104` both use
`w = label.length * size * 0.62 + 10` (`h = lineHeight + 4`). So FR6 separates plates
assuming the **tight** size while class/state paint the **wider** plate at the same centres
→ they can still overlap.

**Verified** with the shipped `resolveLabelCollisions`: two colliding tight plates (labels
`commit to durable storage` / `escalate to operator now`, size 14) are cleared to the 6px
reserved gap on x, but the loose plates class/state actually draw **still overlap by
~4.86px on x** (18px on y) at the de-collided centres. Impact scales with label length:
short state/class labels (≤ ~5 chars, e.g. `fail`/`retry`) stay clear (loose-vs-tight delta
< `PORT_LABEL_PAD=6`), so this only bites longer class/state labels that genuinely collide
on the x-axis.

The FR6 tests (`test/layout.test.ts` "no two edge-label plates overlap" + the fixture
invariant) size plates with `labelPlateSize` (tight) on **both** the de-collision and the
assertion, so they go green while the actually-rendered class/state plates can overlap — a
**false-confidence guard** for those tiers. Note the interactive class/state view (flowchart
`vnmRuntime`, `plateSizeOf`) already draws **tight**, so the native *static* class/state SVG
is the lone outlier (static loose vs interactive tight vs de-collision tight).

**Fix (agent):** unify the native class/state `edgeLabel` with `labelPlateSize`
(`0.6·size+6 / lines·lh+2`, `maxChars` over split lines — ideally reuse the one function),
then regenerate the class/state snapshots + `examples/{svg,png}/{class,state}-*`. This also
resolves REV-001's cosmetic inconsistency and aligns static class/state SVG with its own
interactive export.

### REV-003 — async class/state SVG ignores `bridges:false` (minor)
`renderSvgAsync` (`src/render/route.ts`) renders static class/state via
`renderClassSvg(layoutClass(model, { theme }), …)` / `renderStateSvg(layoutState(model, {
theme }), …)` — neither forwards `opts.bridges`. With the `bridges ?? true` default, a
library caller doing `renderSvgAsync(classOrStateDsl, { bridges: false })` still gets bridges
baked in (the opt-out is dropped; the safe ON default is preserved). CLI, flowchart, and all
interactive/HTML paths honour the toggle correctly; sequence is correctly excluded.
**Fix (agent):** pass `{ theme, bridges: opts.bridges }` into both layout calls (as the CLI's
`doClassRender`/`doStateRender` already do).

### REV-004 — bounds exclude label plates (nit)
`contentBounds` builds the viewBox from node boxes + raw edge points only; a de-collided
label nudged outward near the perimeter could extend past the viewBox (resvg hard-clips PNG).
**Verified it does NOT currently occur** — no label plate exceeds its viewBox across every
`/fixtures` diagram or the TEST-001 repro (`BOUNDS_PADDING=20` absorbs it). Latent risk only.

### REV-005 — dense same-segment hops (nit)
`bridgedPath`'s corner-guard skips crossings near a *segment end* but not two crossings near
*each other*; two crossings <2·`BRIDGE_RADIUS` (10u) apart on one segment splice a backward
`L`. Output is still **valid, deterministic, byte-parity-safe** SVG (only a small visual
overlap of bumps). **Verified not present** in any current fixture/snapshot.

---

## Dimension-by-dimension (skeptic's pass on the flagged focus areas)

**1. Byte-parity (FR8) — CLEAN.** `n()` (geometry) and `nAt()` (runtime) are identical
(`Math.round(v*100)/100`). `resolveLabelCollisions`, `segmentsCross`, `applyEdgeBridges`,
and `bridgedPath` are char-for-char equivalent between `src/geometry/index.ts` and the
`runtime.ts` twins — same constants (radius **5**, control **2·r=10**, pad **6**, passes
**8**, `1e-6` crossing eps, `1e-9` perpendicular tie), same `d` format (`M x y` / ` L x y` /
` L ex ey Q cx cy xx xy`), same iteration order (edge `i<j`, `si`, `sj`; hops sorted by
`dist`). The FR6 "de-collide from the **rounded** centre" contract is sound: static
`deCollideLabels` builds plates from `round(labelPos)`, runtime from `nAt(labelPos)` (equal),
with identical plate sizes (`labelPlateSize` == `plateSizeOf`), so shifts are byte-identical;
the "only reassign on shift" path leaves un-collided labels emitting the raw `labelPos`
exactly as before (`n`/`nAt` at the sink) — no drift. Elbow paths use `toPath` (sharp
`M L L`), so `bridgedPath`'s non-hop segments are byte-consistent with the unbridged format
(no lost rounded corners; `roundedPath` is curved-only). `buildSvg` bridges **before**
emitting (`bridgedB[i] ?? r.path`) and `svgEdge`'s sketch branch draws from `points`, so
sketch ignores the bridged path. The parity suite now drives a real de-collision **and** a
real crossing (`toContain(" Q ")`) in clean + after-drag, byte-comparing `toSvgString()` to
`renderSvgFromModel`.

**2. Determinism — CLEAN.** No `Date.now`/`Math.random`/`performance.now` in the new code;
fixed pair/segment/edge-index order; bounded `MAX_PASSES=8`. Convergence: the fixture-
invariant FR6 test passes for the whole corpus, so 8 passes suffice in practice; a
non-converged dense cluster would degrade gracefully (still deterministic, parity-safe).

**3. FR7 correctness — CLEAN.** `segmentsCross` excludes shared endpoints and near-endpoint
touches via strict `(EPS, 1-EPS)` on **both** params (a node-anchor fan is not a crossing)
and returns `null` for parallel/collinear (`denom===0`, exact after 2dp rounding). The
corner-guard uses the **hopping** segment's own ends, preventing overshoot at elbow corners.
The perpendicular orientation (`toward −y`, vertical tie `−x`) is deterministic and side-
consistent regardless of travel direction. Unit tests cover crossing/endpoint/parallel/
extension, single-hop-into-more-horizontal (D3), disabled, and the corner-guard. (Dense
same-segment double-hop = REV-005, verified benign.)

**4. Config-toggle threading — MOSTLY CLEAN (see REV-003).** `bridges` is plumbed through
`SvgRenderOptions`→`prepare`→`LayoutOptions`, CLI `--no-bridges`, `RuntimePayload`
(`payload.ts`→`opt.bridges`), and all three tiers' layouts. commander `--no-bridges` yields
`bridges:true` when absent, which is identical to `undefined` under the `?? true` gate.
`renderHtml` not forwarding `bridges` to its internal `prepare()` is a **no-op** (the runtime
recomputes paths and bridges from `opt.bridges`; the prepared model's `edge.path` is unused
by the export). The one real gap is `renderSvgAsync` for class/state (REV-003).

**5. D5 scope — CLEAN.** state re-applies `finishEdges` after its pseudo-state re-route;
class gets it via `layout()`. `src/layout/measure.ts` (`charW = size*0.62`) and the native
label *positions* are unchanged; sequence (`src/native/sequence/*`) is untouched. (The native
class/state label *plate size* mismatch is REV-002.)

**6. Regression surface — CLEAN, one latent nit.** FR6 moves a label only far enough to
clear an overlap along the least-penetration axis; label-vs-node de-collision is out of
scope (unchanged from plan). Bounds still exclude label plates (REV-004, not observed to
clip). No out-of-scope product file was newly touched beyond the shared geometry.

**Tests — strong, with one blind spot.** New coverage genuinely exercises intent: FR6 unit
(TEST-001 shape, cluster-of-3 determinism, undefined holes) + fixture invariant; FR7 unit
(cross/endpoint/parallel, single overpass hop, disabled, corner-guard); render-svg (hop
present, `bridges:false` removes hops, curved/no-crossing byte-identical); parity (FR6+FR7
crossing + drag). **Blind spot:** the FR6 no-overlap tests use `labelPlateSize` (tight) for
both de-collision and assertion, so they cannot catch the class/state drawn-plate overlap
(REV-002) — a test that sizes plates with the *native* class/state `edgeLabel` formula would.
