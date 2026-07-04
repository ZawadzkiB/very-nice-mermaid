# Report — feature `hybrid-diagram-engine`

- **feature:** hybrid diagram engine — a `detectType` router + mermaid.js fallback for every diagram type + our own themed, interactive renderers for flowchart / sequence / class / state, with transparent fallback diagnostics
- **status:** done
- **completed:** 2026-07-04
- **branch / commits:** `master` · 29 commits (`d36122c..HEAD`)

## Run status / gaps
All phases completed: plan → implement (6 rounds) → review (2 rounds) → test (2 rounds) → report. **No open findings.** Review found 8 issues (1 major security + 7 minor/nit), test found 8 (1 blocker, 5 major, 2 minor) — **all fixed and verified**, several hands-on in a real browser. Final gates: **266 unit + 33 e2e green**, build + typecheck clean. Two **intentional pre-publish follow-ups** remain (not gaps): **D7** (make `jsdom` an `optionalDependency`) and **D9** (an optional headless-Chromium CLI path for fallback types).

## Summary
`very-nice-mermaid` went from **flowchart-only** to **every Mermaid diagram type renders** — without reinventing Mermaid. A `detectType` **router** sends the DSL to one of three tiers: our v1 **flowchart** engine (own parser, sync, no dependency); **native re-skinned** renderers for **sequence, class, state** (mermaid parses/renders once, we read its SVG into a model and re-render with our themes + interactivity); and a **mermaid.js fallback** (render → SVG) for everything else. The library renders every type in the browser; the CLI renders the native tier + pie headlessly and — per the user's explicit ask — **loudly reports** any type it can't render headlessly rather than emitting broken output.

## Planned vs shipped
Shipped as planned, with decisions logged along the way:
- **Native tier trimmed from 5 to 4 types (D6):** user-journey dropped to fallback after the spike found it's a bespoke timeline that doesn't map to a node/edge renderer. Native = flowchart + sequence + class + state.
- **CLI fallback fidelity (D9, user-facing, default A):** mermaid renders every type in the *browser*; under the CLI's `jsdom`, layout-heavy types (gantt/ER/gitgraph/timeline/kanban) render degenerately, so the CLI **hard-fails them with a clear `fallback-render-unavailable` error** (honest failure). A Chromium path for full CLI fidelity is a deferred opt-in.
- **API is sync-for-flowchart, async-for-the-rest:** `renderSvg`/etc. stay sync for flowchart and throw a clear "use the async API" error on a non-flowchart string; `renderSvgAsync`/`mountAsync`/the element route every type (they load mermaid lazily).
- **jsdom is currently a full dep (D7);** to become optional before publishing.

## Implementation
The pipeline is **`DSL → classify() → {flowchart | native re-skin | mermaid fallback} → renderers`**. mermaid.js + jsdom are **lazy dynamic imports**, so the browser-safe core bundle is unchanged and flowchart-only users pay nothing. Native non-flowchart renderers **read structure from mermaid's rendered SVG** (robust, uniform) and **re-lay-out with our own dagre** for class/state (mermaid's headless geometry is degenerate). Class/state reuse the flowchart interactive runtime (full node-drag + live edge re-route); sequence gets a themed pan/zoom shell. Security: all user-derived text (labels, class members) is escaped at every SVG/HTML sink, and theme tokens are allowlist-sanitized before reaching mermaid's `themeVariables`.

### Changes (as-built)
| Area | Change | Note |
|---|---|---|
| `src/mermaid/` | added | `router.ts` (`classify` via `detectType` + lazy `loadMermaid`), `fallback.ts` (browser/jsdom render + degenerate detection), `jsdom-env.ts`, `theme-map.ts` (sanitized tokens→themeVariables) |
| `src/diagnostics/` | added | the FR5 structured channel (fallback / capability-unavailable / unsafe-theme / fallback-render-unavailable), greppable on CLI stderr |
| `src/native/sequence|class|state/` | added | per-type SVG→model reader + our layout + themed SVG (+ ASCII for sequence) + interactive; `src/native/read-util.ts` shared DOM helpers |
| `src/model/` | added | `sequence.ts` / `class.ts` / `state.ts` models (siblings to flowchart); `RoutedEdge.ports` (channel offsets + `labelShift`) |
| `src/geometry/`, `src/layout/` | modified | `computePortOffsets` spreads edges sharing a node border onto parallel channels + staggers labels (flowchart benefits too) |
| `src/render/route.ts` | added | the async routed entry points (`renderSvgAsync` etc.) |
| `src/render/dom/runtime.ts` | modified | consumes `ports` (channel offset + label stagger) live, incl. during drag — kept in parity with shared geometry |
| `src/render/svg.ts`, `render/style.ts` | modified | per-type SVG; `escapeXml`/`escapeXmlAttr` + shared `isSafeColor`/`sanitizeFontFamily`/`sanitizeFontSize` |
| `src/cli/run.ts`, `src/index.ts`, `src/element.ts` | modified | tier routing, `--quiet`/`--strict`, `ascii-unavailable`, honest fallback; async API surface; element awaits `mountAsync` |
| `package.json` | modified | + `mermaid`, `jsdom` (lazy/external) |
| `test/**`, `e2e/**`, `fixtures/**` | added | +99 tests over v1: readers, layout/ports, per-theme snapshots, `dom-runtime-parity` (now ports-aware), `interactive-ports` (executes exported HTML), CLI-integration, e2e drag+reroute |

## Decisions & rationale
See [decisions.md](../decisions.md).

| Decision | Choice | Reason |
|---|---|---|
| D1 CLI target | Browser-first (jsdom, no Chromium) | mermaid needs only a DOM; keeps the CLI light; degraded cases reported |
| D2 kanban | fallback-SVG | user-confirmed; low value to hand-reskin |
| D3 native data source | re-skin from mermaid's SVG | spike showed the internal DB is fragile; SVG-read is one uniform path |
| D4 mermaid | lazy dependency | flowchart-only users pay nothing |
| D5 diagnostics | always report, never silent | user's explicit transparency requirement |
| D6 user-journey | → fallback | bespoke timeline, doesn't fit node/edge renderer |
| D7 jsdom | → optionalDependency (deferred) | don't ship 167 pkgs to browser-only users |
| D8 ascii exit code | 0 default both tiers, non-zero on `--strict` | a warning shouldn't fail the command |
| D9 CLI fallback | honest-failure now, Chromium later (opt-in) | jsdom can't render most types; report clearly instead of emitting garbage |

## Review outcome
Two rounds ([review-01](../review-01.md) foundation, [review-02](../review-02.md) native), living [review/issues.json](../review/issues.json). Foundation review caught **REV-001 (major)** — theme-token CSS/`url()` injection into the fallback `themeVariables` sink — fixed at the source with a shared allowlist and **hands-on re-verified against the live exploit** (0 breakouts). Native review's hostile-label probe passed with **0 breakouts**. Minors (state pseudo-state misclassification, underscore relation mis-split, jsdom console noise, real-DOM clobber, U+200B labels) all fixed. Both rounds ended **APPROVE**.

## Test outcome
Two hands-on rounds in real Chromium ([test-01](../test-01.md), [test-02](../test-02.md)), living [test/issues.json](../test/issues.json). **Aesthetic verdict:** flowchart + sequence "looks good"; class + state good after the edge-routing fixes. Testing caught what the unit/e2e suites missed:
- **TEST-001 (blocker)** — the public library API + element didn't route raw DSL (fell through to the v1 flowchart parser). Fixed (sync/async API) and **confirmed in a real bundled browser** (Vite harness over http://).
- **TEST-002/003 (major)** — class relation markers bleeding onto sibling edges; state anti-parallel transitions fully occluding. Fixed via parallel-channel routing — and TEST-003 **reopened once** because the fix reached the static SVG but not the interactive runtime (the recurring static-vs-runtime drift), then fixed in the runtime with an extended parity guard + a test that executes the exported HTML. **Orchestrator hands-on-verified** the final state in a real browser (distinct channels, all labels legible — screenshot `test/screenshots/round6-state-antiparallel-verified.png`).
- **TEST-004 (major)** — degenerate fallback SVG now hard-fails with a clear diagnostic. **TEST-005/006** fixed.

## Diagrams
As-built set — open [diagrams.html](./diagrams.html):
- **flow** (`flow.mmd`) — the router → three tiers → outputs + diagnostics.
- **class** (`class.mmd`) — router, native readers/models, geometry (ports), renderers, diagnostics, theme-map.
- **sequence** (`sequence.mmd`) — the routing decision at runtime, incl. the honest-failure branch.

## Before / after comparison
**Before** — `charts/before/` (copied to [`report/before/flow.mmd`](./before/flow.mmd)): one own parser, **flowchart-only**; any other diagram type was **silently misparsed** into a garbage flowchart.

**After** — `flow.mmd` above: a `detectType` router with three tiers — flowchart (unchanged v1), native re-skin (sequence/class/state), and mermaid fallback (everything else) — plus a diagnostics channel that makes every fallback/degradation visible.

*What changed:* the pipeline gained a routing front-end and two whole new rendering paths (native re-skin, mermaid fallback); the silent-misparse dead-end became an explicit, diagnosed route. The flowchart path itself is unchanged except that it now also benefits from the shared parallel-channel edge routing.

## Knowledge updates
Refreshed the gogo-owned docs (`.gogo/knowledge/`): tech-stack (mermaid + jsdom deps, the sync/async API split), project-knowledge (the tiered architecture), testing-tools/test-strategy (the real-bundled-browser harness pattern for library routing; execute-the-exported-HTML coverage), code-review-standards (two hard-won gotchas: **theme-token injection at the mermaid `themeVariables` sink**, and **the inlined runtime silently diverging from shared geometry** — the parity guard must cover ports/multi-edge cases).

## Follow-ups & known limitations
- **D7:** make `jsdom` an `optionalDependency` (+ graceful "install jsdom" diagnostic) before v2 publish.
- **D9 (opt-in):** an optional headless-Chromium CLI path if full-fidelity CLI rasterization of every type is wanted.
- CLI can't render layout-heavy fallback types headlessly (jsdom limit) — reported clearly; they render in the browser/library.
- Interactive DOM uses generic cards; rich per-type UML markers (class compartments, relation diamonds) are in the **static SVG/PNG** only.
- Native read scope excludes sequence notes/activations/fragments and class/state advanced constructs (rendered best-effort; not modeled).
