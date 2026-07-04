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

## Project-specific gotchas (verified — feature `hybrid-diagram-engine`, 2026-07-04)
- **Theme-token injection at the mermaid `themeVariables` sink.** User theme values
  (font.family/size, colors) interpolated raw into mermaid's `themeVariables` break
  out of the fallback SVG `<style>` (CSS rule + `url()` fetch). Sanitize theme values
  at the source (shared `isSafeColor`/`sanitizeFontFamily`/`sanitizeFontSize`), same
  rule as DSL style values. (Was hybrid REV-001, major.)
- **The inlined `vnmRuntime` silently diverges from shared geometry.** `src/render/dom/
  runtime.ts` re-implements edge routing (it's `.toString()`-serialized into HTML
  exports). A geometry fix (e.g. edge port channels) that lands in `src/geometry`/
  `src/layout` but not the runtime ships a broken interactive/HTML-export view while
  static SVG snapshots pass. The `dom-runtime-parity` guard MUST cover the changed
  path (multi-edge/anti-parallel/ports), and there must be coverage that **executes
  the exported HTML**, not just the static SVG. (Was hybrid TEST-003, reopened once.)
- **The library surface must route, not just the CLI.** Public `mount`/`render*`/the
  element must run `classify()` for raw DSL — a fix wired only into `cli/run.ts` leaves
  the library misparsing non-flowchart DSL. Test `mount()`/the element with raw DSL in
  a real bundled browser (mermaid can't `import()` over `file://`). (Was hybrid
  TEST-001, blocker that evaded 260 tests.)
- **jsdom is not a full browser.** Layout-heavy mermaid types render degenerately
  headless — detect (zero/negative dims) and hard-fail with a clear diagnostic; never
  emit broken SVG. (Was hybrid TEST-004.)
