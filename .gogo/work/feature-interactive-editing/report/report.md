# Report — feature `interactive-editing`

- **feature:** interactive diagram editing — resize shapes, perimeter-distributed + pinnable edge anchors, draggable/self-hugging subgraphs, in-browser SVG/PNG export, reset layout (v0.4.0)
- **status:** awaiting-uat
- **completed:** 2026-07-05
- **branch / commits:** `master`, working tree on top of `e3f15dd` (v0.2.0) — **not yet committed**

## Run status / gaps

All phases completed, **twice through the loop**: the original run (plan → implement×3 → review×3 → test×2 → report, shipped v0.3.0 as-built) and a **UAT round 1 rerun** (re-plan → implement×3 → review×3 → test×2 → this report, adding FR6/FR7 as v0.4.0). **No open issues**: all 9 review findings and both test findings are `verified`; UAT round 1 is closed (re-accepted, delta delivered).

## Summary

The interactive HTML diagram is now **fully editable**. You can **resize nodes** with corner handles, **drag a whole subgraph** by its border or title band (and containers always **hug their children** — never a stranded empty box), and **pin edge endpoints** exactly where you want them on a node's border while unpinned ends keep auto-distributing around the perimeter. The edited result **saves as SVG or PNG straight from the browser**, every edit **persists** across reloads, and **⟲ Reset layout** returns to the computed layout. The static SVG renderer and the inlined runtime stay byte-identical, enforced by parity tests.

## Planned vs shipped

The original plan (FR1–FR5) shipped as accepted, then **UAT round 1 grew the scope** — the user couldn't move the Warehouse container or the edge lines. The re-accepted delta added FR6/FR7:

| Δ | What | Why |
|---|---|---|
| **added (UAT)** | **FR6** — subgraphs auto-contain their children AND are draggable groups (**D6=C**) | UAT round 1: the container was an inert background; dragging a child out stranded an empty box (the user's screenshot). User chose both halves |
| **added (UAT)** | **FR7** — pin an edge endpoint to a chosen `{side,offset}` (**D7=A**) | UAT round 1: "can't move the arrows" — D1's originally-deferred manual control, pulled in as per-anchor drag; waypoints stay deferred |
| **added (test)** | **⟲ Reset layout** control (**D5=A**) | Test round 01 found the plan's cited "existing reset-layout control" didn't exist; user chose to build it |
| **changed** | Save PNG via `canvas.toDataURL` (not `toBlob`) | Same PNG; plain call stays compatible with the tightened zero-network guard |
| **changed** | FR2 as direction-based side selection + within-side spread | Fans hubs across all four borders with zero snapshot churn; reviewer confirmed it satisfies FR2 |

## Implementation

One shared-geometry core, two renderers, byte-parity enforced. **`computePerimeterPorts()`** (+ aspect-aware **`raySide()`**) assigns each edge endpoint a `{side, offset}` border anchor spread around the node's whole perimeter — and since v0.4.0 accepts **overrides**: a pinned end is used verbatim and excluded from the auto-spread. **`subgraphBox()`/`computeSubgraphBoxes()`** (recursive, nested-safe) recompute every container to hug its members. Both are applied identically in `layout()`, `applyPositions()` (static SVG/CLI), and the live runtime — the parity hot path this project guards hardest.

- **Resize (FR1):** four corner handles on the selected node, min 24×24 clamp, opposite corner pinned; edges re-anchor live each frame.
- **Perimeter + pinning (FR2/FR7):** hubs fan out automatically; selecting a node shows **`.vnm-edge-handle`** grabs on its incident edges — drag one along the border to pin that end (re-clamped if a later resize shrinks the side; never detaches). Handles show/hide synchronously with select/deselect (TEST-002 fix).
- **Subgraphs (FR6):** the dashed **border frame or title band** is the group-drag target (open interior still pans); members move together, edges re-route, the box follows. Membership is static — dragging a child out never un-groups, the box just re-hugs.
- **Export (FR3/D4):** inlined **`toSvgString()`** serializes the live model (pins + hugged boxes included) byte-equal to `render/svg.ts`; **Save SVG** = data-URI download, **Save PNG** = `Image` → `<canvas>` → `toDataURL` with full failure handling. Ships in the standalone HTML; zero-network guards intact.
- **Persistence (FR4):** `{positions, sizes, anchors}` round-trip localStorage + portable `layout.json` + CLI `--layout`. Anchors are index-keyed **with `from`/`to` node-id identity** — imports bounds-guard, re-map on edge reorder, and drop dangling pins (parallel A→B edges can't swap).
- **Reset (D5):** restores computed positions/sizes, clears pins, re-hugs boxes, wipes the persisted entry; pan/zoom untouched; editing after reset persists again.

### Changes (as-built)

| File | Change | Note |
|---|---|---|
| `src/geometry/index.ts` | modified | `raySide`, `computePerimeterPorts(+overrides)`, `EdgeAnchor(+from/to)`, `subgraphBox`/`computeSubgraphBoxes`; NUL→`\|` cleanup |
| `src/model/index.ts` | modified | `RoutedEdge.ports` → anchors (**0.3.0 breaking**, README-noted) |
| `src/layout/index.ts` | modified | `applyPositions(sizes, anchors)`; `resolveAnchorOverrides()` (bounds + identity re-map); subgraph recompute |
| `src/native/state/layout.ts` | modified | port recompute for pseudo-state boxes |
| `src/render/dom/runtime.ts` | modified | resize handles; group-drag (`subgraphHit`); auto-contain (`renderSubgraphs`); edge-pin handles + `anchorFromPointer`; `toSvgString()`; Save SVG/PNG; `resetLayout()` + ⟲; sync handle lifecycle |
| `src/render/dom/index.ts` | modified | `DeferredHandle implements RuntimeHandle` (sequence-safe delegation) |
| `src/cli/run.ts` | modified | `--layout` accepts `{positions, sizes, anchors}`; VERSION 0.4.0 |
| `package.json`, `README.md` | modified | v0.4.0; interactions/export/reset/subgraph/pinning docs; breaking + `anchors` notes |
| `test/*` (6 files), `e2e/interactive-editing.spec.ts` (new), `e2e/helpers.ts` | added/extended | 301 unit / 62 e2e — see Test outcome |

## Decisions & rationale

All seven forks closed — see [decisions.md](../decisions.md).

| Decision | Choice | Reason |
|---|---|---|
| **D1** — connector attachment | **A: auto-distribute** | Solves hub readability with zero effort; manual control deferred (later pulled in as D7) |
| **D2** — resize vs layout | **A: never re-layout** | A resize is a manual edit; ⟲ Reset is the escape hatch |
| **D3** — browser PNG | **A: `<canvas>`** (as-built `toDataURL`) | No server, no native deps |
| **D4** — Save SVG source | **A: themed SVG from the live model** | Saved image ≡ CLI SVG of the edited state; byte-parity-guarded |
| **D5** — reset gap (TEST-001) | **A: build the real ⟲ control** | The plan promised it; without it no recovery from a mangled layout |
| **D6** — subgraph behaviour (UAT 1) | **C: auto-contain AND draggable group** | User's literal ask was "move the warehouse"; auto-contain alone kills the stranded box but doesn't let you grab it |
| **D7** — manual edge editing (UAT 1) | **A: per-anchor drag** | Maps directly to "move the arrows" with the smallest surface; waypoints stay deferred |

## Review outcome

**6 rounds → clean; 9 findings, all verified.** v0.3.0: 5 findings (parity-guard coverage, guard-evasion → guard tightened instead, silent-failure paths, breaking-change note, NUL-byte delimiters — both twins were secretly binary). v0.4.0 delta: REV-006 (major — FR7 pin had zero pointer-event coverage; closed unit-side in fix-round 3, real-browser side by test round 03), REV-007 (anchor import robustness → `from`/`to` identity + bounds-guard; parallel-edge swap explicitly disproven), REV-008 (nested-subgraph + pin-then-resize parity guards), REV-009 (stale comments, closed cross-track by the tester). See [review-01](../review-01.md)…[review-06](../review-06.md) · [issues.json](../review/issues.json).

## Test outcome

**4 rounds → green.** Real-Chromium e2e on standalone CLI exports: **build ✓ · typecheck ✓ · 301 unit · 62 e2e** (33 → 62 across the feature), stable on repeat runs.

- **Hands-on:** real pointer-event resize/drag/group-drag/pin (the small-handle hit-test class a fake DOM can't reach) · Warehouse title-band drag moves the cluster, interior pans, child-dragged-out **re-hugs instead of stranding** (the UAT screenshot defect, confirmed dead) · pin sticks/persists/reset-clears, other end stays auto · pin-then-resize re-clamps · nested subgraphs re-hug · real PNG rasterize (magic bytes, no taint) · stale/reordered/parallel-edge `layout.json` at the real CLI · sequence negative case · zero console errors + zero network throughout.
- **Findings:** TEST-001 (phantom reset control → D5, built, verified) · TEST-002 (edge handles didn't show on select / lingered after deselect — caught only in a real browser; fixed, regression-tested at unit + e2e). See [test-01](../test-01.md)…[test-04](../test-04.md) · [issues.json](../test/issues.json).

## Diagrams

Open **[diagrams.html](./diagrams.html)** (same folder, offline).

- `flow.mmd` — the full as-built interaction/data flow: drag / resize / group-drag / pin → shared geometry (perimeter + overrides + subgraph hug) → re-route → persist / export / reset
- `sequence.mmd` — the five runtime interactions: resize · group-drag + auto-contain · edge-pin · Save SVG/PNG · reset
- `class.mmd` — the changed types: geometry (+`subgraphBox`, overrides), `LayoutData.anchors`, `EdgeAnchor(+from/to)`, `RoutedEdge.ports`, `RuntimeHandle`

## Before / after comparison

No plan-time `charts/before/` baseline was drawn for this feature, so there is no before set — the as-built diagrams above stand alone. The plan's intended-design flowchart (in [plan.md](../plan.md)) is the closest before-intent artifact; the shipped flow matches it plus the reset-layout branch (D5) and the UAT round 1 additions (subgraph group-drag/auto-contain, edge-pin).

## Knowledge updates

- `code-review-standards.md` (owned) — v0.3.0 gotchas (parity-guard completeness, never dodge a guard, NUL bytes, cited-mitigations-must-exist) **+ v0.4.0 addition:** UI companion elements must be wired into every lifecycle path (select/deselect), and only real-browser e2e catches render-timing/hit-test gaps (TEST-002).
- `test-strategy.md` (owned) — the edit+export journey **+ v0.4.0 additions:** group-drag/pin journeys, the "fake-DOM `closest()` contract" unit pattern, and sidecar-robustness CLI cases.
- **Consider upstreaming:** nothing beyond what landed in README.

## Follow-ups & known limitations

- **Waypoint editing** (D7=B) — the remaining manual-edge control; natural v0.5 candidate.
- **Sequence participants** can't be resized (rigid layout); export/reset still work there.
- A pinned side that doesn't face its target routes circuitously — inherent to manual override (UX note, not a bug).
- `RoutedEdge.ports` (0.3.0) remains the one breaking model change; `anchors` (0.4.0) is additive/backward-compatible.
- The `toSvgString` twin is a deliberate duplicate of `render/svg.ts` — byte-parity tests are the fence.
- Work is **uncommitted** — commit/tag v0.4.0 when UAT passes.

## Summary (TL;DR)

- **Shipped (v0.4.0):** resize + perimeter-distributed AND pinnable edge anchors + draggable/self-hugging subgraphs + in-browser Save SVG/PNG + ⟲ Reset — persisted, parity-guarded, zero-network.
- **Review:** clean after 6 rounds — 9 findings, all fixed and verified.
- **Test:** green after 4 rounds — 301 unit + 62 real-browser e2e; both test findings (phantom reset, handle lifecycle) fixed and regression-guarded.
- **UAT round 1:** both complaints (immovable warehouse, immovable arrows) analysed, re-planned, built, and verified dead; **round 2 is yours** — follow-ups above are the v0.5 shortlist.
