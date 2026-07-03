# Testing tools

**Purpose:** the concrete tools the test phase uses and exactly how to invoke
them. (How to *use* them is in `test-strategy.md`.)

<!-- gogo:meta
Mode: proxy
Source: [ ../../vitest.config.ts, ../../playwright.config.ts, ../../package.json ]
Confidence: high
Generated-by: /gogo:build (2026-07-03); refreshed by /gogo:report (2026-07-03)
-->
> The tools + how to run them. Strategy lives in `test-strategy.md`.
> Verified against the shipped test suite 2026-07-03.

## Inventory
| Concern | Tool | How to run |
|---|---|---|
| unit / integration | **vitest** | `npm test` (`vitest run`) / `npm run test:watch` |
| e2e / browser | **Playwright** (Chromium) | `npm run test:e2e` (first: `npx playwright install chromium`); interactive drive via the bundled `gogo-playwright` MCP `browser_*` tools |
| typecheck | tsc | `npm run typecheck` |
| build check | tsup | `npm run build` |

## Browser tooling
The gogo plugin bundles a Playwright MCP server (`gogo-playwright`); this project
also enables `playwright-test`. Drive the interactive renderer via `browser_*`
tools — use **real pointer events**, not `element.click()` (a synthetic click
masked the TEST-002 toolbar bug). If browsers are unavailable, fall back to
CLI/API tests and write manual UI-check steps into the report.

## Where tests live
- `test/*.test.ts` — unit (parser, layout, geometry, svg, ascii, theme, html, cli,
  dom-runtime-parity); snapshots under `test/__snapshots__/`.
- `e2e/*.spec.ts` — Playwright specs for the exported HTML + the custom element.
- `fixtures/*.mmd` — the real-world mermaid corpus the parser/layout tests run over.

## gogo overrides
- Current suite size (2026-07-03): **110 unit + 10 e2e**, all green.
- The **dom-runtime-parity** test drives the *real* serialized `vnmRuntime` through
  a fake DOM and asserts its edge paths/styles equal the shared `src/geometry` +
  `src/render/style` — it's the guard against the HTML-export runtime drifting from
  the library. Keep it covering both elbow and curved themes.
