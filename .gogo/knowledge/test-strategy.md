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

## Key user journeys
None yet — define with the first shipped feature.

## Deployment checks
None yet — define once there is something to build/run.

## Done bar
Build clean AND all unit AND all e2e green, PLUS hands-on exploration of the
actual change (not just green tests).
