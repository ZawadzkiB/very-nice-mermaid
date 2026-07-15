# Tech stack

**Purpose:** what the project is built with and the exact commands to build, run,
and test it — used by the plan, implement, and test phases.

<!-- gogo:meta
Mode: proxy
Source: [ ../../package.json, ../../tsup.config.ts, ../../tsconfig.json, ../../README.md ]
Confidence: high
Generated-by: /gogo:build (2026-07-03); refreshed by /gogo:report (2026-07-03)
-->
> Verified against the shipped code 2026-07-03. Source of truth: `package.json`
> (scripts/deps/exports/bin) + `tsup.config.ts` (bundling boundary).

## Stack
- Language: TypeScript (ESM-only, `"type": "module"`), Node ≥ 20
- Runtime deps: `@dagrejs/dagre` (layout), `commander` (CLI), **`mermaid`** (fallback
  engine + `detectType` router + native-reskin source, **lazy** `import()`), **`jsdom`**
  (Node DOM for headless mermaid render, **lazy**; D7: to become optional);
  `@resvg/resvg-js` is an **optionalDependency** (PNG, lazy)
- Build: **tsup** (ESM + `.d.ts`); typecheck via `tsc --noEmit`
- Package manager: npm

## API (v2 sync vs async)
- `renderSvg`/`renderAscii`/`renderMarkdown`/`renderHtml` are **sync, flowchart-only**
  (throw a clear error on a non-flowchart string).
- `renderSvgAsync`/`…Async` + `mountAsync` route **every** type (`detectType` →
  flowchart-sync / sequence·class·state native / mermaid fallback). `mount()` returns
  its handle sync and finishes non-flowchart renders async. The `<very-nice-mermaid>`
  element routes everything automatically.

## Commands (run from repo root)
- build:     `npm run build`     # tsup → dist/ (ESM + types)
- test:      `npm test`          # vitest run (unit)
- e2e:       `npm run test:e2e`  # playwright (needs `npx playwright install chromium`)
- typecheck: `npm run typecheck` # tsc --noEmit
- run (CLI): `node dist/cli/index.js render <file> …`  (or `npx vnm render …`)
- lint:      none configured (typecheck + tests are the gate)

## Package shape
- `exports`: `.` (main API) and `./element` (the `<very-nice-mermaid>` web component)
- `bin`: `vnm`, `very-nice-mermaid` → `dist/cli/index.js`
- Browser-safe core: nothing in the `.`/`./element` entries loads a Node built-in;
  `@dagrejs/dagre` is **bundled** into the browser entries, `commander`/resvg stay external.

## Services / runtime
Pure library + CLI — no server, DB, or ports. PNG needs the native `@resvg/resvg-js`
addon installed.

## gogo overrides
<!-- Preserved across re-runs. -->
- Entry points: `src/index.ts` (API), `src/element.ts` (web component), `src/cli/index.ts` (CLI bin).
- **Current version: v0.6.6** (`package.json` + `src/cli/run.ts` VERSION; asserted in `test/cli.test.ts`;
  `docs/_config.yml` `version` is the gallery cache-buster fallback — bump all four together).
  v0.6.6 (`subgraph-aware-routing`, defect #3) adds one gated, elbow-only post-route pass
  `avoidSubgraphs` run FIRST in `finishEdges`: for an edge whose long axis-aligned interior trunk
  pierces a `subgraph` container box that does NOT hold BOTH endpoints, it pushes the trunk just
  outside the container's nearest side + `SUBGRAPH_AVOID_MARGIN`(28) (via the existing `moveLane`) and
  `lowerReentry`s the re-entry corner to a short `APPROACH`(30) near the interior endpoint (using the
  edge's own border anchor — `computePerimeterPorts` UNTOUCHED, D2=A). Gate: `along` strictly inside the
  container cross-span AND parallel overlap ≥ `MIN_CROSS`(120); both-endpoints-inside skipped; an
  approach-into-a-member run skipped (idempotency). `computeAvoidContainers` (= `computeSubgraphBoxes`
  box + `resolveMemberNodes` members) is threaded through a new optional 5th `finishEdges` param from
  `layout()`/`applyPositions()`; native/state+class pass none (no-op). Mirrored byte-for-byte in the
  `vnmRuntime` twin (`avoidSubgraphs` + `avoidContainersFrom`, first in both `renderEdges` via
  `subgraphWorldBox` and `buildSvg` via `subgraphAbsBox`). Proven to fire ONLY on `architecture.mmd`'s
  `BE↔RULES` corpus-wide → both subgraph heroes + all snapshots byte-identical (docs interactive HTML
  grows only by the inlined twin source). Full obstacle-aware routing + diagonal/nested/multi-obstacle
  crossings stay DEFERRED.
  v0.6.5 (`dense-edge-routing`) adds two gated, elbow-only edge-routing passes for dense diagrams,
  each mirrored byte-for-byte in the `vnmRuntime` twin (`dom-runtime-parity`): (1) a NEW
  `separateConvergentJogs` in `finishEdges` (after `separateAntiParallelJogs`) de-tangles **≥3**
  (`CONVERGE_MIN`) collinear border-adjacent jogs converging on one node side into a distinct fan
  (JOG_GAP=26 lanes, anchored so the fan opens away from the border) — generalizes the v0.6.2 pass
  from a node PAIR to a node SIDE; (2) a NEW deskewer in `computePerimeterPorts` nudges a lone-in +
  lone-out pair whose FAR NODES head opposite ways apart by PORT_STEP/2. Both gated to no-op on the
  whole current fixture corpus → **zero** snapshot/example/hero churn (docs interactive HTML grows only
  by the inlined twin source). Subgraph-aware routing (long edges through an unrelated container)
  SHIPPED in v0.6.6 above (`avoidSubgraphs` threads `computeSubgraphBoxes` boxes into `finishEdges` as
  routing obstacles — the scoped re-route only; full obstacle routing still deferred).
  v0.6.4 (`edge-label-halo`) lifts routed-edge labels (flowchart/class/state) **off their own line** so
  the edge reads continuous: a `resolveLabelLineOffsets` pass folded FIRST into `finishEdges` shifts
  each label perpendicular to its home segment by the plate's half-extent facing the line (half-width →
  right for a vertical run, half-height → up for a horizontal one), the existing de-collision chain then
  runs on the offset centres (with a final `deCollideLabels` last), off-line plate corners feed
  `contentBounds` (`labelPlateCorners`) so labels never clip, and sequence `messageLabel` is unified on
  the shared tightened `labelPlateSize`. Mirrored byte-for-byte in the `vnmRuntime` twin
  (`dom-runtime-parity`). Snapshot churn is label-only (nodes/edges unchanged).
  v0.6.2 added `separateAntiParallelJogs` in `finishEdges` (de-cramps a collinear anti-parallel
  elbow pair; mirrored in the `vnmRuntime` twin) — elbow-only, so only the state diagram's elbow
  variants change; fancy (curved) and all other tiers stay byte-identical.
- **Asset regeneration scripts** (all drive the built CLI; `npm run build` first): `npm run docs`
  (gallery `docs/`), `npm run examples` (`examples/` png+svg), and **`npm run heroes`** (v0.6.1:
  `scripts/generate-heroes.mjs` — the 4 README `assets/example-*.png` heroes, previously rendered
  by hand). Hero sources: `state-machine`·dark, `ci-pipeline`·light, `microservices`·fancy, and
  `cache-lookup`·light·sketch (`fixtures/cache-lookup.mmd`, added v0.6.1 to capture the sketch
  hero's source). All renders are byte-deterministic (no clock/RNG in render paths).
- **v0.5.0 sketch style:** CLI `-s, --style <clean|sketch>` (flowchart + native tiers).
  Bundled asset: `assets/fonts/Kalam-Regular.woff2` (OFL 1.1, `assets/fonts/OFL.txt`),
  embedded as base64 in `src/render/sketch-font.ts` (browser-safe; also fed to resvg
  for PNG). The ~22KB font ships in the browser-safe core (reachable from `.` via
  `svg.ts`) — a known bundle-size tradeoff for zero-network portability.
