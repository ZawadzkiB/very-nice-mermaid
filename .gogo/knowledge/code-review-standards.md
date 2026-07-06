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

## Project-specific gotchas (verified — feature `interactive-editing`, 2026-07-05)
- **Parity guards must cover EVERY branch of a serialized twin.** The inlined
  `toSvgString()` duplicates `render/svg.ts`; a byte-parity test that only drives
  rect/diamond/stadium/cylinder leaves rounded/subroutine/circle/hexagon/
  parallelogram(-alt) and `svgSubgraph()` unguarded — the exact drift class that
  reopened twice before. Enumerate shapes + a titled subgraph, light AND fancy.
  (Was interactive REV-001, major.)
- **Never dodge a test guard — tighten it.** Product code calling
  `canvas["toDataURL"]` via bracket-notation to slip past the export's `/url\(/i`
  zero-network regex is guard-evasion; the fix is a sharper guard (require a
  non-identifier char before `url(`, flag only external `http(s)`/protocol-relative
  `src=`) so the plain call passes honestly. A same-document `data:` URI makes no
  network request and is fine. (Was interactive REV-002.)
- **Literal NUL bytes make a source file "binary".** Two `"\0"` delimiter literals
  shipped in v0.2.0 made git/grep treat `geometry/index.ts` AND `runtime.ts` as
  binary blobs (diffs unreviewable; one reviewer's viewer rendered NUL as a space
  and missed it). Use printable ID-safe delimiters (`|`) and keep twins lockstep.
  (Was interactive REV-005 — the premise itself was half-wrong until re-checked.)
- **A plan's cited mitigation must exist in code.** D2 justified "no re-layout on
  resize" with "the existing reset-layout control" — which didn't exist (only
  pan/zoom reset). Review/test must verify claimed escape hatches, not assume them.
  (Was interactive TEST-001 → D5.)
- **Companion UI elements must be wired into EVERY lifecycle path.** The edge-pin
  handles were rendered by drag/layout paths but `selectNode()`/`deselect()` never
  refreshed them — handles stayed hidden on a plain select and lingered as a
  floating dot after deselect. When adding a select-dependent element, audit every
  select/deselect/reset call site (mirror the existing resize-handle pattern), and
  demand a real-browser e2e for show/hide timing — a fake-DOM unit test masked this
  via an incidental layout call. (Was interactive TEST-002, major, v0.4.0.)
- **Index-keyed sidecar entries need identity validation on import.** `layout.json`
  anchors keyed by edge index silently mis-pin when the diagram is edited/reordered;
  the fix stores `from`/`to` node ids alongside and bounds-guards + re-maps on
  import (first-unclaimed match, stored-index preferred — parallel edges can't
  swap). Apply the same rule to any future index-keyed persistence. (Was
  interactive REV-007.)
