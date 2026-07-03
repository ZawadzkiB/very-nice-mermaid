# Test strategy

**Purpose:** how to test a change — journeys, UI / design checks, e2e levels,
deployment checks, and the done-bar. (The tools themselves are in
`testing-tools.md`.)

<!-- gogo:meta
Mode: owned
Source: [ ]
Confidence: low
Generated-by: /gogo:build (scaffold)
-->
> How to test, level by level. Verify the bars in `non-functional-requirements.md`.

## Levels
- **Unit / integration** — none exist yet; the first feature must establish the
  framework and location (record them in `testing-tools.md`).
- **e2e** — Playwright MCP browser tooling is available (see
  `testing-tools.md`); use it once there is a UI to drive.

## How to test a change (per level it touches)
- **UI** → drive real clicks / flows with the browser tooling; assert the journey
  AND that it looks right (matches the design); explore edges, not just the happy path.
- **API** → hit endpoints (status, shape, errors).
- **CLI** → run the commands; assert stdout / exit code.

## Key user journeys (from v1, 2026-07-03)
- **CLI:** `vnm render <file|-> -f html|svg|png|md [--theme …] [--strict] [--scale N]`
  — verify all 4 formats from a file and stdin; format inferred from `-o` extension;
  bad DSL → line/col diagnostic + non-zero exit; zero-node input → "no diagram found".
- **Interactive component:** `mount()` and `<very-nice-mermaid>` — drag a node and
  confirm edges re-route live and stay border-anchored; pan / wheel-zoom-at-cursor /
  fit; minimap recenter; layout persists across reload (localStorage) + export/import;
  theme switch restyles. Drive with **real pointer events**, watch the console.
- **"Looks right":** diagrams must beat mermaid-cli — no edges through node boxes
  (overlap scan), readable labels, flush arrowheads, good theme contrast (light/dark/fancy).

## Deployment checks
Library, not a service: `npm run build` clean, `npm pack` ships `dist/` + types +
the `vnm` shebang bin, and the built `.` entry imports cleanly in Node.

## Done bar
Build clean AND all unit AND all e2e green, PLUS hands-on exploration of the
actual change (not just green tests).
