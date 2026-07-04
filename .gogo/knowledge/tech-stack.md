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
