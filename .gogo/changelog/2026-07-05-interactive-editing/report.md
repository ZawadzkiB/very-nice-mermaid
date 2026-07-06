# very-nice-mermaid — v0.4.0 · interactive diagram editing

**Shipped 2026-07-05.** The interactive HTML view grew from *draggable* to **fully
editable**: nodes **resize** with corner handles, edge anchors **auto-distribute around
each node's whole perimeter** (hubs stay legible) and can be **pinned by hand** to an
exact border spot, **subgraph containers hug their children and drag as a group**, and
the edited diagram **exports to SVG/PNG straight from the browser** — no server. Every
edit persists across reloads (localStorage + a portable `layout.json`), a **⟲ Reset
layout** control returns to the computed layout, and the static SVG renderer and the
inlined runtime stay **byte-identical** under an extended parity guard.

## What was changed / done

- **Resize (FR1)** — select a node → four corner handles; live resize with a 24×24
  min-clamp, opposite corner pinned; connected edges re-anchor each frame; sizes persist
  and the static SVG honors them.
- **Perimeter-distributed connectors (FR2, D1=A)** — shared geometry
  (`computePerimeterPorts` + aspect-aware `raySide`) fans a hub's edges across all four
  borders, spaced into legible lanes; implemented once, applied in both renderers.
- **In-browser export (FR3, D3/D4=A)** — **Save SVG** (live model → themed SVG,
  byte-equal to `vnm render -f svg` of the edited state) and **Save PNG** (SVG → canvas
  → `toDataURL`, failure-guarded); both ship inside the standalone HTML export, which
  still passes every zero-network guard.
- **Reset layout (D5=A, from testing)** — a ⟲ toolbar control discards manual moves,
  resizes, and pins; restores the computed layout; clears persistence; pan/zoom untouched.
- **Subgraphs (FR6, D6=C, from UAT round 1)** — containers **auto-contain/follow** their
  children (a child dragged out re-hugs the box — the stranded-empty-box defect is gone)
  **and** the border/title band is a **group-drag** target that moves the whole cluster;
  the open interior still pans; nested containers supported.
- **Pinnable edge anchors (FR7, D7=A, from UAT round 1)** — select a node → endpoint
  handles appear on its edges; drag one along the border to pin that end's
  `{side,offset}` while the other end keeps auto-distributing; pins persist with
  `from`/`to` identity (imports bounds-guard + re-map on edge reorder), reset clears them.
- **Versioning/docs** — v0.4.0; README documents all interactions; `RoutedEdge.ports`
  anchor shape called out as the one breaking model change (0.3.0); `layout.json` gained
  additive `sizes` + `anchors`.

## Key decisions (one-liners)

- **D1=A** auto-distribute anchors (manual control deferred → later pulled in as D7).
- **D2=A** resize never re-runs layout; ⟲ Reset is the escape hatch.
- **D3=A** browser PNG via canvas (`toDataURL`); resvg stays Node/CLI-only.
- **D4=A** Save SVG serializes the live model with an inlined, byte-parity-guarded twin.
- **D5=A** build the real reset-layout control the plan had (wrongly) cited as existing.
- **D6=C** subgraphs both auto-contain **and** drag as a group (user's literal ask).
- **D7=A** per-anchor drag only; waypoint editing stays deferred (v0.5 candidate).

## Review & test verdict

**Review: clean after 6 rounds** — 9 findings, all fixed and verified (highlights: the
`toSvgString` twin's parity guard extended to every shape + subgraphs; a guard-evasion
smell resolved by tightening the guard itself; hidden NUL bytes cleaned from both
serialized twins). **Test: green after 4 rounds** — **301 unit + 62 real-Chromium e2e**;
hands-on caught two real defects the unit suites missed (the phantom reset control →
D5; edge handles not tracking select/deselect → fixed + regression-guarded), and
verified both UAT complaints dead (warehouse drags, box never strands, arrows pin).

## Diagrams

- **flow** — the full editing loop: drag / resize / group-drag / pin → shared geometry →
  re-route → persist / export / reset.
- **sequence** — the five runtime interactions: resize · group-drag + auto-contain ·
  edge-pin · Save SVG/PNG · reset.
- **class** — the changed types: geometry (`subgraphBox`, overrides), `LayoutData.anchors`,
  `EdgeAnchor(+from/to)`, `RoutedEdge.ports`, `RuntimeHandle`.

(No `before/` set — no plan-time baseline was drawn for this feature.)

## Full audit trail

The accepted plan (+ UAT round 1 re-plan), all 6 implement / 6 review / 4 test rounds,
the UAT log, and every decision live in
[`.gogo/work/feature-interactive-editing/`](../../work/feature-interactive-editing/)
(`plan.md`, `report/report.md`, `uat.md`, `review-0N.md`, `test-0N.md`, `decisions.md`).
