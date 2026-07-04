# very-nice-mermaid — v0.2.0 · hybrid diagram engine

**Shipped 2026-07-04.** Grew `very-nice-mermaid` from **flowchart-only** to
**every Mermaid diagram type renders** — without reinventing Mermaid. A
`detectType` **router** sends each DSL to one of three tiers: our v1 **flowchart**
engine (own parser, sync, no dependency); **native re-skinned** renderers for
**sequence, class, state** (mermaid parses/renders once, we read its SVG into a
model and re-render with our themes + interactivity); and a **mermaid.js
fallback** (render → SVG) for **everything else** (pie, gantt, ER, gitgraph,
mindmap, kanban, timeline, …). The old **silent-misparse bug is gone**, and every
CLI fallback/degradation is **loudly reported** rather than emitting broken output.

## What was changed / done
- **Router + tiers** — `src/mermaid/router` (`classify` via `mermaid.detectType`,
  lazy `loadMermaid`); flowchart stays on the v1 sync path (no mermaid loaded).
- **Native re-skin** — `src/native/{sequence,class,state}`: read structure from
  mermaid's rendered SVG, re-layout (class/state via our own dagre — mermaid's
  headless geometry is degenerate), re-render with our themes. Class/state get
  **full interactivity** (draggable nodes + live edge re-route via the flowchart
  runtime); sequence gets themed pan/zoom. ASCII kept for flowchart + sequence.
- **Fallback engine** — `src/mermaid/fallback` (mermaid → SVG; browser renders all,
  CLI/jsdom renders native + pie).
- **Transparent diagnostics (the user's core ask)** — `src/diagnostics` (FR5):
  every fallback / capability-unavailable / unsafe-theme-value / degenerate render
  surfaces a clear, greppable reason on the CLI's stderr; `--strict` escalates,
  `--quiet` mutes info. A type that can't render headlessly **hard-fails with a
  clear message** instead of emitting garbage.
- **API** — sync `renderSvg`/etc. stay flowchart-fast (throw a clear error on a
  non-flowchart string); new async twins `renderSvgAsync`/`mountAsync` route every
  type; the `<very-nice-mermaid>` element routes automatically. mermaid + jsdom are
  **lazy**, so the browser-safe core bundle is unchanged.
- **Shared edge routing** — parallel channels + label staggering so anti-parallel
  and fan-out edges stay distinct and legible (flowchart benefits too).

## Key decisions
- **Native tier = flowchart + sequence + class + state**; **user-journey → fallback**
  (bespoke timeline, doesn't fit a node/edge renderer).
- **Browser-first**: mermaid needs only a DOM; the CLI uses jsdom (no Chromium) and
  **honestly reports** the types it can't render headlessly. A Chromium path is a
  deferred opt-in.
- **mermaid + jsdom are lazy dependencies** so flowchart-only users pay nothing.
- Theme values are **allowlist-sanitized** before reaching mermaid's `themeVariables`.

## Review & test verdict
**Green.** Two review rounds (APPROVE) caught and fixed a **theme-injection security
bug** (re-verified against the live exploit — 0 breakouts) and a hostile-label probe
passed clean. Two hands-on test rounds (real Chromium) caught what 260 automated tests
missed: a **blocker** (the *library* API wasn't routing raw DSL — only the CLI was) and
a **static-vs-runtime edge-routing divergence** (reopened once, then closed with a
parity guard + a test that executes the exported HTML). Final: **266 unit + 33 e2e
green**; the anti-parallel/fan fixes hands-on-verified in a real browser.

## Diagrams
- **flow** — the router → three tiers → outputs + diagnostics.
- **class** — router, native readers/models, geometry (ports), renderers, diagnostics.
- **sequence** — runtime routing incl. the honest-failure branch.
- **before/** — the v1 flowchart-only pipeline, for the before/after compare.

## Follow-ups (pre-publish)
- **D7**: make `jsdom` an `optionalDependency` (+ graceful "install jsdom" diagnostic).
- **D9** (opt-in): an optional headless-Chromium CLI path for full-fidelity fallback.

## Full audit trail
The accepted plan, all 6 implement / 2 review / 2 test rounds, the spike, every
decision, and the screenshots live in
[`.gogo/work/feature-hybrid-diagram-engine/`](../../work/feature-hybrid-diagram-engine/)
(`plan.md`, `report/report.md`, `spike-01.md`, `review-0N.md`, `test-0N.md`, `decisions.md`).
