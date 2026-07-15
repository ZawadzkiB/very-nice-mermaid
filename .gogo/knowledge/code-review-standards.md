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

## Project-specific gotchas (verified — feature `sketch-style`, 2026-07-09)
- **ROUGH-PARITY: `src/rough` has a byte-identical twin inside `vnmRuntime`.** The
  sketch generator (`src/rough/index.ts`) is re-implemented inline in
  `src/render/dom/runtime.ts` (it's `.toString()`-serialized into HTML, so it can't
  import). The two MUST match char-for-char in output — same `SK_*`==`SKETCH`
  constants, same `Math.hypot`/`Math.imul` ops, same 2-dp rounding — or `toSvgString()`
  diverges from `renderSvg` in sketch. The `dom-runtime-parity` sketch cases guard it
  (light AND fancy, incl. a dotted edge); extend them for any new sketch mark.
- **A per-edge dash must not bleed into the arrowhead.** Folding a dotted edge's
  `stroke-dasharray="2 5"` into the shared stroke fragmented the ~19px open `V`. Emit
  the arrowhead as a SEPARATE solid path (line dashed, head solid) — in the static
  SVG, `toSvgString`, AND the live runtime (a distinct `headPath` element, since the
  live line path carries the element dash). (Was REV-002.)
- **The library must route AND report, not just the CLI.** When sketch is dropped for
  a mermaid-fallback type, the CLI note isn't enough — the async renderers + the
  element must `console.warn` too, or the drop is invisible to library callers. (Was
  REV-003. A typed-enum bad-value, by contrast, is compile-catchable — the library
  need not runtime-validate it; TEST-002.)
- **Interactive class/state reuse the flowchart runtime — per-type static markers are
  lost there.** State `[*]` start/end dots (and class UML heads) live in the static
  native SVG, not the shared runtime. If a marker must survive into the interactive/
  exported (Save-SVG) view, carry it on the model node (e.g. `PositionedNode.stateMarker`,
  set by `layoutState`) so it rides serialization, and special-case it in the runtime
  — don't let the generic "every node is rough/card" loop swallow it. (Was TEST-001.)

## Project-specific gotchas (verified — feature `flowchart-render-legibility`, 2026-07-12)
- **Any geometry added to the static path needs a byte-identical runtime twin.** The
  FR6/FR7 passes (`resolveLabelCollisions`, `segmentsCross`/`applyEdgeBridges`/
  `bridgedPath`) are re-implemented inline in `vnmRuntime` — same constants (radius 5,
  control 10, gap 6, `2·radius=10`, `1e-6`/`1e-9`), same iteration order, same `d`
  format, same `n`≡`nAt` 2-dp rounding — or `toSvgString()` diverges. The
  `dom-runtime-parity` guard catches it (add a crossing + close-label fixture for any
  new geometry). A round-1 miss (runtime `computePorts` still on the old `PORT_STEP`)
  is exactly what the guard is for.
- **A layout de-collision is only real if every sink draws the size it assumed.**
  FR6 de-collided labels using the tight `labelPlateSize`, but the native class/state
  static SVG still drew the *old looser* plate — so long class/state labels could still
  overlap while flowchart was fine, and a test that sized plates with `labelPlateSize`
  on BOTH the de-collision AND the assertion went green anyway (false confidence).
  Lesson: assert the **emitted** rect against the shared size, and keep every tier's
  `edgeLabel` on the one `labelPlateSize`. (Was REV-002.)
- **Parity of a shifted value: de-collide from the ROUNDED centre, only reassign on a
  shift.** The static and runtime `labelPos` differ by sub-rounding; computing the
  nudge from `round(labelPos)`/`nAt(labelPos)` (the value both actually emit) and
  leaving an un-collided label untouched keeps a moved label byte-identical and a
  still one byte-unchanged. Same trick applies to any future "adjust then emit" pass.
- **A shared render option must reach EVERY entry, not just the CLI.** The `bridges`
  toggle was threaded through `renderSvg`/CLI/runtime but initially dropped by
  `renderSvgAsync` for class/state (`route.ts`) — the opt-out silently ignored on that
  public path. Grep every `layoutClass`/`layoutState`/`layout(` call site when adding
  an option. (Was REV-003.)
- **A port-ordering key computed from mixed sources stays parity-safe only if every
  source shifts by the SAME constant between the two spaces.** D12 orders a shared
  border's ports by each edge's heading — its first/last dagre bend when it has one,
  else the far node's centre. Geometry works in dagre space, the runtime in
  offset-removed space; the ordering is byte-identical only because within a border
  group *both* the bend-based and the centre-fallback `along` values shift by the same
  per-axis constant (waypoint−offset, box-centre−offset), and all coords are integers
  (no ULP tie flip). When adding any new ordering/comparison key, check that a group
  mixing two derivations can't reorder between the twins. (Was D12; verified by running
  `computePerimeterPorts` with-vs-without the new arg across the whole corpus → 0 diffs.)
- **When a new geometry arg is `undefined`-default, PROVE the no-op by running the
  corpus both ways.** D12's `bends` param falls back to old behaviour for edges with no
  detour — the review didn't trust "no snapshot changed," it re-ran the port computation
  with/without `bends` over every fixture (flowchart 42/171 edges carry bends → 0 port
  diffs; class 0 waypoints → provable no-op) to attribute an unrelated example delta to
  pre-existing FR4 drift, not the new arg.
- **Each geometry CALL SITE that feeds the runtime needs its own parity guard, not just
  transitive coverage.** `native/state/layout.ts` re-routes against shrunk pseudo-state
  boxes — a distinct `computePerimeterPorts` call site. It was only covered transitively
  by the flowchart parity fixture until REV-009 added a dedicated `order-state` guard
  (baked `renderStateSvg` vs live `mountState`, offset-invariant relative geometry;
  bite-verified by reverting the wiring). (Was REV-009.)

## Project-specific gotchas (verified — feature `state-antiparallel-decramp`, 2026-07-14)
- **A new `finishEdges` post-pass needs its byte-identical runtime twin AND a faithful
  parity reference.** v0.6.2 added `separateAntiParallelJogs` (de-cramps a collinear
  anti-parallel `A→B`/`B→A` elbow pair the `separateLanes` overlap gate skips) in
  `src/geometry` and mirrored it in `vnmRuntime` at BOTH call sites (`renderEdges` +
  `buildSvg`). Confirm the twin matches in OUTPUT, not source shape: same `JOG_GAP=26`,
  same interior-run detection (`i>=1 && i+2<len`, 0.5/1 thresholds), same collinear
  tolerance (`<1`), same target-perpendicular sort with the `edge`-index tie-break, same
  `n`≡`nAt` rounding and `toPath`≡`pathPoly`. `from`/`to` may be threaded differently
  (geometry reads `edges[i].from`; the twin reads the index-aligned `edgeEls[i]`) as long
  as indices align.
- **A parity helper that bypasses `finishEdges` masks twin drift.** `dom-runtime-parity`'s
  `expectedPaths` used to route each edge with `routeEdge` only — it passed on every
  fixture solely because `separateLanes`/bridges happened to be no-ops there, so it could
  NOT have caught a `separateLanes` OR a new-pass drift. The fix routed `expectedPaths`
  through the REAL `finishEdges` (a faithful mirror); this both revealed the new pass and
  proved the twin byte-identical. Lesson: a parity reference must run the same pipeline
  the runtime does, not a partial re-route.
- **Prove a gated geometry pass fires where you think — and no-ops everywhere else — with
  the RENDERED output, not the unit test alone.** The `state-svg.test.ts` inline model
  (`Idle↔Running`) routes as straight 2-point verticals on 30px-offset ports (no interior
  jog), so the pass correctly no-ops and NO snapshot moved — the plan wrongly predicted a
  refresh. The pass genuinely fires on `examples/src/state.mmd` (`Loading↔Error`, 306→
  293/319) and `order-state` (`Paused↔Running`). Always visually verify the actual
  `fail`/`retry` PNG region (multimodal Read of the render), and byte-diff the gallery so
  only the intended variants changed — a green unit test is not proof the visual bar is met.

## Project-specific gotchas (verified — feature `dense-edge-routing`, 2026-07-15)
- **A new `finishEdges` post-pass needs its byte-identical twin at BOTH runtime call sites
  AND a real parity fixture that fires it.** v0.6.5 added `separateConvergentJogs`
  (de-tangles ≥3 collinear border-adjacent jogs converging on one node side) and a deskewer
  in `computePerimeterPorts`, mirrored in `vnmRuntime` (`separateConvergentJogs` called in
  BOTH `renderEdges`≈1854 + `buildSvg`≈2724; the deskewer in `computePorts`). Confirm the
  twin matches in OUTPUT: same `JOG_GAP=26`/`CONVERGE_MIN=3`/`PORT_STEP=30`/`PORT_MARGIN=6`,
  same border-run pick (`len-3` for a target / `1` for a source), same `i>=1 && i+2<=len`,
  `n`≡`nAt`, `toPath`≡`pathPoly`, identical bucket key + sort keys/tie-breaks, and the identical
  closed-form lane `mean + (s-(k-1)/2 - toward*(k-1)/2)*JOG_GAP`. The `dom-runtime-parity` guard
  must have a fixture that actually FIRES the pass (a small DSL may not reproduce the convergence
  — the real `architecture.mmd` structure ranks BE above RULES to force the 4-way top bundle) and
  must route `expectedPaths` through the REAL `finishEdges`, else the guard passes on a no-op.
- **Gate a new gated pass on the RENDERED corpus, not just intuition.** The convergence gate is
  `≥3` (not the plan's `≥2`) precisely because a corpus scan showed **zero** ≥3 bundles but seven
  2-edge ones — firing on ≥2 would churn seven *clean* fixtures. Instrument every fixture through
  `parse→layout` and count firings BEFORE choosing a threshold; the byte-identity bar ("clean
  diagrams byte-identical") is a hard constraint that can override a plan's literal wording.
- **A "collinear ports" skewer rule must gate on the FAR NODE, not the port heading.** dagre often
  routes a node's in/out edges straight down its centre column, so the immediate bend heading reads
  a false "aligned"; and a genuine straight `A→B→C` pass-through is *also* offset-0-collinear. Only
  the far-node direction (opposite sides of the node centre) distinguishes a true skewer (nudge it)
  from clean straight flow (leave it byte-identical). This is the difference between 0 corpus firings
  and churning every vertical chain.
- **Docs-interactive HTML churn on a pure-geometry change is expected + benign** IF it is only the
  inlined `vnmRuntime` SOURCE growing. A geometry change that adds a twin function makes every
  `docs/interactive/*.html` grow by that function's serialized length (e.g. +97 lines) with the
  rendered payload (edge `d="..."`) byte-identical. Verify by grepping the HTML diff for `d="[ML]`
  (zero rendered-path changes) — do NOT mistake the source growth for a geometry regression, and do
  NOT expect zero HTML churn.
