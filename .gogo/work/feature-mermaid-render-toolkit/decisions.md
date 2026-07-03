# Decisions — feature `mermaid-render-toolkit`

Forks that needed a human call. gogo appends each as `D<n>` with options and a
recommendation, then records your answer as a `RESOLVED` block. This is the
audit trail that lets the pipeline pause and resume safely.

<!-- Template for each decision — copy and fill:

## D1 — <short title>
- **Phase:** <plan | implement | review | test>
- **Question:** <the fork, stated plainly>
- **Options:**
  - A. <option> — <trade-off>
  - B. <option> — <trade-off>
- **gogo recommends:** <A / B> — <one-line why>
- **Status:** OPEN        # OPEN | RESOLVED

### RESOLVED (user, <YYYY-MM-DD>)
<the decision, in the user's terms>
-->

## D1 — Parsing strategy: own parser vs embedded mermaid.js
- **Phase:** plan
- **Question:** How do we turn mermaid DSL into a diagram model?
- **Options:**
  - A. **Own parser** (mermaid-flowchart-compatible subset, corpus-tested) — small bundle, runs in Node *and* browser (CLI needs no headless Chromium), full control of the model; cost: we maintain a grammar and cover a subset that grows.
  - B. **Embed mermaid.js** (hybrid: let it parse+layout, scrape its SVG — the gogo-viewer approach) — full DSL coverage day one; cost: ~3 MB runtime in every consumer, browser-only (CLI would need puppeteer — the exact heavyweight tooling we're replacing), aesthetics constrained by scraping.
- **gogo recommends:** A — the entire point of the project is owning the output quality, and a Node CLI without a browser is a hard requirement.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-03)
Accepted with the plan ("Accept & go") — option A per gogo's recommendation.

## D2 — v1 diagram-kind scope
- **Phase:** plan
- **Question:** Which mermaid diagram kinds does v1 support?
- **Options:**
  - A. **Flowchart family only** (`flowchart`/`graph`) — the most-used kind; ships polished; the model/renderer seam is designed for adding kinds later.
  - B. Multiple kinds (sequence, state, class…) in v1 — broader coverage, but each kind needs its own grammar + renderer; v1 would ship shallow everywhere instead of excellent somewhere.
- **gogo recommends:** A — depth over breadth for the first release.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-03)
Accepted with the plan ("Accept & go") — option A per gogo's recommendation.

## D3 — PNG rendering approach
- **Phase:** plan
- **Question:** How does the CLI produce PNG?
- **Options:**
  - A. **@resvg/resvg-js** — native SVG rasterizer, no browser, CI-friendly; optional dependency, lazy-loaded.
  - B. Puppeteer/Playwright screenshot — pixel-perfect for anything a browser renders, but downloads Chromium and is slow — mermaid-cli's exact pain.
- **gogo recommends:** A — our SVG is self-contained by design, so resvg is sufficient and light.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-03)
Accepted with the plan ("Accept & go") — option A per gogo's recommendation.

## D4 — Distribution shape
- **Phase:** plan
- **Question:** One npm package or a monorepo of scoped packages?
- **Options:**
  - A. **Single package `very-nice-mermaid`** with subpath exports (`.`, `./element`) + `bin` (`vnm`) — simplest install story (`npm i very-nice-mermaid`, `npx vnm`), one version to manage.
  - B. Monorepo (`@vnm/core`, `@vnm/cli`, `@vnm/react`…) — cleaner separation, but overhead now for wrappers that don't exist yet.
- **gogo recommends:** A — split later only if framework wrappers materialize.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-03)
Accepted with the plan ("Accept & go") — option A per gogo's recommendation.

## D5 — TEST-003: edges paint behind node cards when nodes overlap
- **Phase:** test
- **Question:** When a node is dragged on top of a connected neighbor, the edge disappears behind the cards. Fix or accept?
- **Options:**
  - A. **Accept as-is** — edge layer under the node cards is standard diagram behavior (mermaid, xplan, most tools do this); the edge reappears when nodes are separated.
  - B. Raise edges above cards (or semi-transparent cards) — avoids the hide, but clutters the common non-overlapping case and fights the card aesthetic.
- **gogo recommends:** A — a benign, conventional trade-off, not a defect; not worth changing.
- **Status:** RESOLVED

### RESOLVED (orchestrator, 2026-07-03)
Decided A (accept as-is) without blocking the user — minor polish nit with a
sensible default; surfaced in the run summary for veto. No code change.

## D6 — TEST-004: fully non-Mermaid input exits 0 (lenient mode)
- **Phase:** test
- **Question:** In lenient mode, input that yields **zero renderable nodes** currently exits 0 with an empty diagram. Acceptable given the NFR default "no silent failures"?
- **Options:**
  - A. **Zero-nodes → non-zero exit + clear "no diagram found" message**, in both modes; unknown constructs *inside* otherwise-valid mermaid stay lenient (exit 0 + warnings). Honors both the plan's lenient contract and the no-silent-failures NFR.
  - B. Keep exit 0 always — strictly matches the documented "lenient by default" wording, but an empty render on garbage input is a silent failure.
- **gogo recommends:** A — rendering *nothing* is a failure worth signalling; lenient still tolerates partial/unknown constructs.
- **Status:** RESOLVED

### RESOLVED (orchestrator, 2026-07-03)
Decided A without blocking — higher-quality behavior, consistent with the NFR;
a small well-scoped contract refinement (empty output ≠ success). Folded into the
implement round-4 fix. Surfaced in the run summary for veto.
