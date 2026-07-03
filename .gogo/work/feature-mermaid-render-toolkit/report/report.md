# Report — feature `mermaid-render-toolkit`

- **feature:** very-nice-mermaid — framework-agnostic Mermaid flowchart renderer: npm library (interactive HTML component + web component) + `vnm` CLI (html/svg/png/ascii) with extensible themes
- **status:** done
- **completed:** 2026-07-03
- **branch / commits:** `n/a` (local repo, no branch) · commit range `0b024d2..48aff5b` (13 commits)

## Run status / gaps
All phases completed on a clean green run — plan → implement → review → test → report. **No open issues.** Review found 7 findings (1 blocker, 1 major, 5 minor/nit) across 3 rounds, all fixed and verified; test found 5 findings (2 major, 3 minor) across 2 rounds, all fixed/verified or accepted (1 `wontfix` by decision). Final gates: **110 unit tests + 10 e2e (Playwright/Chromium) green**, build + typecheck clean.

## Summary
Built **from an empty repo** into a shippable npm package that keeps Mermaid's DSL and **replaces everything after it** with an own parser, dagre auto-layout, and hand-written renderers — **no `mermaid.js` runtime and no headless browser**. The premise ("mermaid-cli output looks awful") is met: diagrams render as **token-styled node cards with orthogonal/curved edges that route around nodes**, are **interactive** (drag to reorganize, edges re-route live, pan/zoom/fit, minimap, persisted layout), embed **framework-agnostically** (vanilla `mount()` + a `<very-nice-mermaid>` web component), and export to **HTML / SVG / PNG / ASCII** from the `vnm` CLI. Three built-in themes (**light / dark / fancy**) plus user-defined themes.

## Planned vs shipped
Shipped **essentially as planned** — all 11 functional requirements delivered. Deviations, all intentional and small:

- **Interactive renderer draws rounded-rect cards**, not full shape polygons; the **static SVG** renders the full shape set (diamond/hexagon/cylinder/…). Documented in README + docstrings. (Matches the xplan reference; DOM shape fidelity is a noted follow-up.)
- **Zero-node input now errors** in both lenient and strict modes (**decision D6**, a refinement of the plan's "lenient exits 0"): rendering *nothing* is a silent failure, which the NFR default forbids. Unknown constructs inside otherwise-valid mermaid stay lenient. The plan's FR1 was updated to record this.
- **`@dagrejs/dagre` is bundled** into the browser entries (the web component parses + lays out client-side); `commander` + `@resvg/resvg-js` stay external — this preserves the browser-safe-core guarantee (FR11) and was caught by e2e during implementation.

## Implementation
The architecture is a single pipeline — **`DSL → parse → DiagramModel → layout(dagre) → PositionedModel → renderers`** — where every output format is a renderer over the same positioned model. Browser-safe core: nothing in the `.` / `./element` entries touches a Node built-in; PNG's resvg is a lazy `import()`, the CLI lives behind the `vnm` bin.

Key mechanics: the **parser** is a hand-written tokenizer + flowchart grammar producing typed diagnostics (line/col); **layout** wraps dagre (compound subgraph clusters, direction) and, for multi-rank/back edges, **threads dagre's own routing waypoints** into the model so edges detour *around* intervening nodes; **geometry** owns border-anchoring + orthogonal-elbow / curved routing; the **DOM runtime** (`vnmRuntime`) is `.toString()`-serializable so the **standalone HTML export** inlines it with zero external requests, and it re-routes edges every frame while a node is dragged. **Security:** user `style`/`classDef` values pass a source-level allowlist (colors/widths/dashes only) that drops `url(...)`, quotes, and angle-brackets and emits an `unsafe-style-value` diagnostic — closing an XSS and a CSS-network-fetch vector at the single source that feeds SVG, DOM, and HTML alike.

### Changes (as-built)
| File | Change | Note |
|---|---|---|
| `package.json`, `tsup.config.ts`, `tsconfig.json` | added | ESM package, subpath `exports` (`.`/`./element`), `bin` (`vnm`), Node ≥ 20; tsup bundles dagre into browser entries |
| `src/model/index.ts` | added | `DiagramModel` / `PositionedModel`; `RoutedEdge.waypoints`; serialize/deserialize |
| `src/parser/index.ts` | added | flowchart tokenizer + grammar; lenient/strict diagnostics; **style-value allowlist** (security); paren-aware `,` split (comma-form `rgb()`) |
| `src/layout/index.ts`, `src/layout/measure.ts` | added | dagre adapter, subgraph clusters, **multi-rank waypoint threading**, node measurement |
| `src/geometry/index.ts` | added | border anchor, `elbowThrough` / `roundedPath` / `snapWaypoints`, content bounds |
| `src/theme/index.ts` | added | tokens, `light`/`dark`/`fancy`, `defineTheme`, CSS vars |
| `src/render/svg.ts`, `src/render/style.ts`, `src/render/prepare.ts` | added | pure SVG renderer + shared style resolution; attribute-escaping defense-in-depth |
| `src/render/ascii.ts` | added | unicode box-drawing renderer; corner glyphs (`┌┐└┘`) vs `┼` crossings |
| `src/render/dom/*` | added | interactive runtime (cards, live-rerouted edge layer, pan/zoom/fit, minimap, drag, persistence), `mount()`, serializable payload |
| `src/export/html.ts`, `src/export/png.ts` | added | self-contained interactive HTML (zero-network); resvg PNG (lazy optional dep) |
| `src/element.ts` | added | self-registering `<very-nice-mermaid>` custom element |
| `src/cli/index.ts`, `src/cli/run.ts` | added | `vnm render` — format inference, stdin/stdout, `--theme/--strict/--layout/--scale`, zero-node error exit |
| `test/**`, `e2e/**`, `fixtures/**` | added | 110 unit (vitest) + 10 e2e (playwright) + a 6-file mermaid corpus |
| `README.md` | added | library / web-component / CLI / theming guide |

## Decisions & rationale
See [decisions.md](../decisions.md).

| Decision | Choice | Reason |
|---|---|---|
| D1 — parsing strategy | Own parser (not embed mermaid.js) | Small bundle, runs in Node + browser (no headless Chromium), full control of output quality — the project's whole point |
| D2 — v1 scope | Flowchart family only | Depth over breadth; the model/renderer seam leaves sequence/state/class as later additions |
| D3 — PNG | `@resvg/resvg-js` (not puppeteer) | Native rasterizer, no browser download, CI-friendly; our SVG is self-contained |
| D4 — distribution | Single package + subpath exports + `bin` | Simplest install (`npm i` / `npx vnm`), one version; split later only if wrappers appear |
| D5 — edges behind cards (TEST-003) | Accept as-is | Standard diagram behavior; edge reappears when nodes separate — not a defect |
| D6 — zero-node input (TEST-004) | Error in both modes | Rendering nothing is a silent failure (NFR); lenient still tolerates partial/unknown constructs |

## Review outcome
Three review rounds on the living [review/issues.json](../review/issues.json) ([review-01](../review-01.md) · [review-02](../review-02.md) · [review-03](../review-03.md)):
- **REV-001 (blocker)** — SVG attribute-breakout XSS via unescaped `style`/`classDef` values → fixed at source with an allowlist; verified by re-running the exploit and 18+ bypass attempts (none survived).
- **REV-002 (major)** — same root cause leaking `url(...)` into the HTML export's CSS, breaking FR8 zero-network → closed by the same sanitizer.
- **REV-003 / REV-007 (minor/nit)** — the inline serialized runtime can drift from shared geometry → re-aligned + a parity test that drives the real runtime, extended to the curved theme.
- **REV-004/005/006 (minor)** — undocumented rounded-card rendering; hardcoded diagnostic position; comma-form `rgb()` wrongly dropped — all fixed. Final verdict **APPROVE**.

## Test outcome
Two hands-on test rounds ([test-01](../test-01.md) · [test-02](../test-02.md), living [test/issues.json](../test/issues.json)) — CLI (all 4 formats, stdin, themes, `--strict`/`--scale`, malformed input), the interactive component driven in **real Chromium via Playwright MCP**, an aesthetic pass, and adversarial inputs (empty, cycles, unicode, 100-node graphs):
- **TEST-001 (major)** — edges routed *through* node boxes (visible in the shipped `state-machine` fixture) → fixed via dagre waypoint threading; an independent overlap scan across 5 graphs went from **21 crossings to 0**.
- **TEST-002 (major)** — toolbar fit/zoom buttons dead to real clicks (viewport swallowed the pointer) → fixed with a toolbar guard; confirmed with real CDP pointer events.
- **TEST-004/005 (minor)** fixed; **TEST-003 (minor)** accepted (D5). Done-bar met in full; **0 open issues**.

## Diagrams
As-built UML set — open [diagrams.html](./diagrams.html) (same folder):
- **flow** (`flow.mmd`) — DSL → parse → layout(dagre) → SVG/ASCII/DOM → html/png/element/CLI.
- **class** (`class.mmd`) — the shipped modules and types: `DiagramModel`, `PositionedModel`/`RoutedEdge`, geometry, renderers, exports.
- **sequence** (`sequence.mmd`) — the interactive runtime: mount → drag node → live edge re-route → persist/restore layout.

## Before / after comparison
**No before set** — the repository was greenfield, so plan ① drew no `charts/before/` as-is baseline (there was no existing flow to capture). Only the after set above applies.

## Knowledge updates
Refreshed the gogo-owned knowledge docs from the shipped code (all under `.gogo/knowledge/`, no upstream files touched):
- **tech-stack.md** — now a real proxy of `package.json`/README with the exact build/test/run commands and the stack (TypeScript, tsup, dagre, resvg, commander).
- **testing-tools.md** — vitest + Playwright, how to run them, where tests live.
- **project-knowledge.md** — the pipeline architecture and module map (no longer "empty repo").
- **coding-rules.md** — ESM/browser-safe-core + style-sanitization conventions learned here.
- **code-review-standards.md** — added verified gotchas (style-value injection; inline-runtime parity).
- **test-strategy.md** — the real journeys (CLI formats, interactive drag/persist, theme switch).

**Consider upstreaming:** once the repo gets a `CLAUDE.md`/`CONTRIBUTING.md`, the "browser-safe core boundary" and "sanitize user style values at the source" rules are worth recording there so they survive independently of gogo.

## Follow-ups & known limitations
- **Non-flowchart kinds** (sequence/state/class/ER/gantt) — out of scope for v1; the model/renderer seam is ready for them.
- **DOM shape fidelity** — the interactive renderer draws rounded cards; full silhouettes only in static SVG.
- **Manual edge-waypoint / label editing** — drag-reorganize with auto re-routing ships; hand-bending individual lines and editing labels are deferred.
- **Comma-form `rgb()` in `%%{init}%%` directives** and the full directive surface are parsed-then-ignored with a warning.
- Not yet published to npm; `npm pack` contents verified (dist + types + shebang bin).
