# Code review standards

**Purpose:** what the review phase checks for. Be a skeptical staff engineer —
"would I approve this PR?"

<!-- gogo:meta
Mode: owned            # usually owned — rarely a separate doc
Source: [ ]
Confidence: medium
Generated-by: /gogo:build (scaffold)
-->
> The dimensions the review phase scores the diff against.

## Dimensions
- **Correctness & edge cases** — empty / missing data, off-by-one; matches the plan's intent.
- **Security** — input validation, authz, no secrets in logs, no injection / traversal.
  (Enforce the bars in `non-functional-requirements.md`.)
- **Error handling** — no silent failures; clear, actionable errors.
- **API / type design** — consistent shapes; no needless duplication.
- **Tests present** — new behaviour is covered; build + tests green.
- **Conventions** — matches `coding-rules.md`; no dead or mocked-out code.
- **Performance** — no needless re-fetch / render; hot paths sane (per the NFR bars).

## Severity
`blocker` (must fix before merge) · `major` · `minor` · `nit`.

## Project-specific gotchas (verified — feature `mermaid-render-toolkit`, 2026-07-03)
- **Style-value injection.** Any user-controlled `style`/`classDef` value reaching
  an SVG attribute, HTML-export CSS, or DOM innerHTML is an XSS / network-fetch
  vector (a well-formed `url(...)` is still hostile). Verify it's allowlist-dropped
  at the source, not just escaped at the sink. (Was REV-001 blocker + REV-002 major.)
- **Serialized-runtime drift.** `src/render/dom/runtime.ts` is inlined into HTML
  exports via `.toString()`, duplicating `src/geometry`/`src/render/style`. Confirm
  the parity test covers any routing/style path you changed, both elbow AND curved.
  (Was REV-003 + REV-007.)
- **Edges routing through nodes.** Naive point-to-point elbows cut through
  intervening node boxes on back/skip-level edges — use dagre's waypoints. An
  overlap scan across fixtures is the check. (Was TEST-001 major.)
- **Synthetic vs real clicks.** `element.click()` bypasses pointer capture; test
  interactive UI with real pointer events or a toolbar/pan bug hides. (Was TEST-002.)
- **Silent empty renders.** Input that yields zero nodes must error, not exit 0
  with an empty diagram. (Was TEST-004 / D6.)
