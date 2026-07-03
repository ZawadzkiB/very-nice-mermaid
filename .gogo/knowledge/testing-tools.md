# Testing tools

**Purpose:** the concrete tools the test phase uses and exactly how to invoke
them. (How to *use* them is in `test-strategy.md`.)

<!-- gogo:meta
Mode: proxy
Source: [ ../../.claude/settings.local.json ]
Confidence: low
Generated-by: /gogo:build (2026-07-03)
-->
> The tools + how to run them. Strategy lives in `test-strategy.md`.
> Only one weak signal exists: `.claude/settings.local.json` enables the
> `playwright-test` MCP server, so browser-driven e2e via Playwright MCP is
> the intended direction. No test framework is installed yet.

## Inventory
| Concern | Tool | How to run |
|---|---|---|
| unit / integration | none yet | — |
| e2e / browser | Playwright MCP (`playwright-test` server enabled; gogo also bundles `gogo-playwright`) | MCP `browser_*` tools |
| typecheck | none yet | — |
| lint | none yet | — |
| build / deploy check | none yet | — |

## Browser tooling
The gogo plugin bundles a Playwright MCP server (`gogo-playwright`). Drive the UI
via its `browser_*` tools. This project additionally enables the
`playwright-test` MCP server in `.claude/settings.local.json`. If neither is
available (e.g. no Node), fall back to API / CLI tests and write manual
UI-check steps into the test report.

## Where tests live
Nowhere yet — decide co-location vs `tests/` with the first feature; then
re-run `/gogo:build` to record it.

## gogo overrides
