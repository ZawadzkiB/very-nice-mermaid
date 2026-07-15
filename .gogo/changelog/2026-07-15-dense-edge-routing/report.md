# dense-edge-routing — v0.6.5 (2026-07-15)

**Edges converging on a node no longer knot, and a straight-through node is no longer skewered.**

## What changed
On dense diagrams two routing defects showed up:
- **Convergence tangle** — when 3-4 edges enter the same node side, they all made
  their horizontal jog at the **same y-level**, crossing into one knot (seen at
  `Rules · Sets · Runs`).
- **Node skewer** — when a node has exactly one edge entering the top and one leaving
  the bottom, both landed on the **same x**, drawing a single straight line
  impaling the node (seen at `MCP surface`).

**v0.6.5 fixes both** with two small, gated, elbow-only geometry passes:
- **#1 — `separateConvergentJogs`** (new pass in `finishEdges`, after the v0.6.2
  anti-parallel pass): groups routed edges by **(node, entered side)** and, when ≥3
  collinear border-adjacent jogs pile onto one side, spreads them onto distinct lanes
  → a clean **staircase fan**, each edge with its own port and arrowhead.
- **#2 — deskewer** at the end of `computePerimeterPorts`: nudges a same-x
  in-top/out-bottom pair to distinct offsets so the in/out no longer align.

## Key outcomes (verified on real renders, light + dark)
- **`Rules · Sets · Runs`** — the four edges (`REST`, `MCP---RULES`, `stream context`,
  `findings`) now land on **four distinct y-levels (1112/1138/1164/1190)** — no knot;
  BE's 3-edge bottom bundle de-tangles too.
- **`MCP surface`** — `author rules` enters at **x=385.25**, offset from the
  `MCP---RULES` exit at **x=400.25** — no impaling line.
- **No regression:** the v0.6.2 `fail`/`retry` anti-parallel stagger and the v0.6.4
  label offsets are **byte-identical**; **zero** churn to SVG snapshots, `examples/`, or
  README heroes (the only doc diff is the version cache-buster + the inlined runtime-twin
  source in the interactive HTMLs — no changed rendered paths). Deterministic (2× re-render
  byte-identical).

## Scope decisions (one line each)
- **D1 → defer #3.** Long edges cutting through an unrelated subgraph container is a
  *large* change (subgraph boxes are computed post-layout and never fed into routing;
  needs genuine obstacle-aware routing) → its own future feature. **Confirmed still
  present, not a regression.**
- **D2 → include #2** (the MCP skewer nudge) — cosmetic but flagged; narrow gated rule.
- **D3 → new pass** (`separateConvergentJogs`) rather than re-keying the v0.6.2 pass — keeps
  each pass single-purpose; disjoint grouping keys, so the shipped stagger stays byte-identical.
- **As-built:** the convergence gate fires at **≥3** (≥2 would have churned 7 clean
  fixtures), and the fan anchors **away from the border** (a literal mean-centre would push a
  lane across the node border).

## Review / test verdict
- **Review:** APPROVE (0 blockers/majors). REV-001 (dead field) + REV-002 (wording) fixed.
- **Test:** ALL GREEN — **413** unit (incl. `dom-runtime-parity`), typecheck clean,
  `--version` → 0.6.5, plus hands-on real-PNG visual verification of both regions.

## Files (headline)
`src/geometry/index.ts` (new `separateConvergentJogs` + deskewer in `computePerimeterPorts`) ·
`src/layout/index.ts` (wired into `finishEdges`) · `src/render/dom/runtime.ts` (byte-for-byte
twin in both pipelines + `computePorts`) · `test/geometry.test.ts` + `test/dom-runtime-parity.test.ts` ·
version 0.6.4 → **0.6.5** · regenerated docs/examples/heroes.

## Deferred / follow-up
- **#3 subgraph-aware routing** — edges avoiding unrelated `subgraph` containers (large; own feature).
- Sequence-diagram lifeline masking behind labels — left as-is per user (v0.6.4 D2 accepted).

## Audit trail
Full detail in [`.gogo/work/feature-dense-edge-routing/`](../../work/feature-dense-edge-routing/):
[report.md](../../work/feature-dense-edge-routing/report/report.md) ·
[plan.md](../../work/feature-dense-edge-routing/plan.md) ·
[decisions.md](../../work/feature-dense-edge-routing/decisions.md).
Before → after diagram: `dense-edge-routing-flow.mmd` + `before/dense-edge-routing-flow.mmd`.
