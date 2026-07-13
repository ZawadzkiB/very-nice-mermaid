# Review round 01 — flowchart-render-legibility

- **Feature:** flowchart render legibility (5-layer draw order, opaque subgraph title
  plate, tighter label plate, wider fan-in spread; static SVG + inlined DOM runtime).
- **Diff reviewed:** `git diff master` — `src/geometry/index.ts`, `src/layout/index.ts`,
  `src/render/svg.ts`, `src/render/dom/runtime.ts`, tests + regenerated snapshots/examples.
- **Gates:** `npm run build` green · `npm test` green (**346 passed / 29 files**),
  including the `dom-runtime-parity` byte guard (titled subgraph across all three themes).

## Verdict: **APPROVE** (clean — no open blockers/majors)

One `nit` filed (REV-001, needs-user-decision, non-blocking). Everything else verified clean.

---

## Findings

| id | sev | pri | status | title | tag |
|----|-----|-----|--------|-------|-----|
| REV-001 | nit | P3 | new | Shared `PORT_STEP`/`PORT_SPREAD_FRAC` bump ripples into out-of-scope class/state edge spread | NEEDS-USER-DECISION |

### REV-001 — shared-geometry ripple into class/state (nit)
FR4 bumped `PORT_STEP` 20->26 and `PORT_SPREAD_FRAC` 0.7->0.85 in the **shared**
`src/geometry/index.ts`. Because class/state layouts route through the same
`computePerimeterPorts`, their edge anchors shifted (regenerated `class-svg`/`state-svg`
snapshots + `examples/svg/{class,state}-*`), even though the plan lists class/state as
out of scope. **Verified non-breaking:** the `anchorBound` corner clamp (`PORT_MARGIN=6`,
unchanged) still protects short sides, all snapshots/examples were regenerated, and the
suite is green. The plan's Approach D explicitly bumps this constant "shared by both
renderers", so the ripple is anticipated. Also: FR3's tighter plate was correctly **not**
applied to the native class/state/sequence `edgeLabel` (they keep `0.62*size+10`), so
flowchart labels are now tighter than class/state labels — a cosmetic cross-type
inconsistency, not a defect. **Decision needed:** confirm the class/state visuals are
acceptable (they are refreshed in `examples/`); optionally unify the native label plates
in a later scoped pass.

---

## Dimension-by-dimension (skeptic's pass on the flagged focus areas)

**1. Parity + byte-parity (FR5) — CLEAN.** `n()` (geometry) and `nAt()` (runtime) are
byte-identical (`Math.round(v*100)/100`, both return numbers), so the double-apply pattern
`n(x + 12 - pad)` over an already-rounded `x` behaves identically in both sinks. The title
plate (`x+12-pad`, `y+18-fs+1`, `pw = title.length*fs*0.6 + pad*2`, `height fs+4`,
`rx=radii.label`, `fill=subgraphFill`) and the label plate (`0.6*size+6 / lines*lh+2`) are
char-for-char identical between `src/render/svg.ts` (`renderSubgraphTitle`/`edgeLabel`) and
`runtime.ts buildSvg` (`svgSubgraphTitle`/`svgEdgeLabel`). The 5-layer emit order (boxes ->
edge paths -> edge labels -> titles -> nodes) matches in both. The `dom-runtime-parity`
suite drives a **titled** subgraph across light/dark/fancy and byte-compares — covers the
new `svgSubgraphTitle` branch (the exact drift class flagged in code-review-standards).

**2. Determinism / browser-safety — CLEAN.** No `Date.now`/`Math.random`/`performance.now`
and no Node built-in / `import()` introduced anywhere in the `src/` diff.

**3. Opaque title plate (FR2) — CLEAN.** All three built-in themes use fully **opaque** hex
`subgraphFill` (light `#eef1f6`, dark `#161b25`, fancy `#111834`), so a crossing edge is
truly hidden behind the plate. Geometry check: `top = SUBGRAPH_PADDING(14) +
SUBGRAPH_TITLE_BAND(22) = 36`, so the top member sits 36px below the container top; the
plate spans `top+6 .. top+23` (height 17) — a **13px clearance**, so no plate touches the
node ("title band clears the top member").

**4. Label-plate clipping (FR3) — acceptable.** Width basis is `maxChars*size*0.6+6` while
text draws at `size-1`. Against the project's own char-width model (`layout/measure.ts`
`charW = size*0.62`, unchanged), plate width minus text-width estimate =
`maxChars*(0.6*size - 0.62*(size-1)) + 6` = `maxChars*0.34 + 6` at size 14 — positive for
all label lengths, i.e. non-clipping. `test/layout.test.ts` asserts the exact formula and
that it still exceeds the drawn-text basis. A pathological all-caps label (W/M glyphs ~0.75)
could touch the plate edge, but text is centre-anchored (spills symmetrically over a
background rect, no clip region) and the plan explicitly tuned/accepted this minimum — within
tolerance, not raised.

**5. Shared-geometry side effect — see REV-001 (nit).** Real, verified, benign, anticipated
by the plan.

**6. Layer-group DOM restructure — CLEAN.** Edge paths now nest in `g.vnm-edge-layer`; all
`appendChild` sinks were redirected to the correct layer group and every old
`svg.insertBefore(..., svg.firstChild)` / `svg.appendChild` was removed. The only consumer
of the former flat structure — the `interactive-ports` test helper — was updated to read
`g.vnm-edge-layer`. No product/consumer code reads `svg.children`/`svg.firstChild` for edges.

**7. Scope discipline — CLEAN.** `native/{class,state,sequence}` label formulas and
`src/layout/measure.ts` (`charW = size*0.62`) are **unchanged**. No out-of-scope product file
was touched; only the shared geometry constants rippled (REV-001).

**Tests — adequate.** New coverage genuinely exercises intent: FR1 layer order (edge paths
before every label/title, node `<g>` last), FR2 opaque plate (`fill=subgraphFill/><text`),
FR3 exact tightened formula + non-clipping, FR4 5-edge fan min pairwise gap >= 24 with 5
distinct anchors + the 22px title band. TEST-006's local plate formula was synced to FR3.
