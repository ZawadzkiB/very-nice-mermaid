# State — feature `mermaid-render-toolkit`

<!-- Files in this folder (.gogo/work/feature-<slug>/):
  - plan.md        — the accepted plan (the contract) + the feature's functional requirements
  - adjustments.md — log of changes / clarifications you asked for during planning
  - state.md       — THIS file: current phase / status / iterations; lets work resume
  - decisions.md   — forks that needed your call + gogo's recommendation + your answer
  - review/issues.json — living, typed review findings (the contract; see templates/contracts/)
  - review-NN.md   — each code-review round's rendered snapshot of issues.json
  - test/issues.json   — living, typed test findings (same contract)
  - test-NN.md     — each test round's rendered snapshot
  - report/        — the as-built bundle (written at phase ⑤): report.md + the UML set (.mmd) + report/before/ (the plan-time "before" set, copied in for before/after compare) + diagrams.html + result.json
  - charts/        — mermaid diagrams (.mmd) + charts/before/ (the plan-time as-is baseline) + manifest.json + an offline diagrams.html viewer
  (and at the .gogo/ level: .gogo/changelog/<YYYY-MM-DD>-<slug>/ — the shipped report bundle archived by /gogo:done)
-->

- **feature:** very-nice-mermaid — framework-agnostic mermaid DSL renderer: npm lib (interactive HTML component) + CLI (html/svg/png/ascii) with extensible themes
- **phase:** implement       <!-- plan | implement | review | test | knowledge | done -->
- **status:** implementing   <!-- awaiting-plan-acceptance | plan-accepted | implementing | reviewing | testing | waiting-for-user | done | shipped | aborted -->
- **created:** 2026-07-03
- **branch:** n/a (repo not yet a git repository)
- **iterations:** plan=1 · implement=2 · review=1 · test=0
- **resume:** implement round 2 (review-fix) complete — all 5 review-round-1
  findings fixed and marked `status: fixed` in review/issues.json with fix_summary
  + fixed_in_round + fixing commit. Green: `npm run build` + `npm run typecheck` +
  `npm test` (96 unit, +7) + `npm run test:e2e` (8 playwright). Committed one small
  increment per issue. Ready for re-review (round 2, same living list).
  - REV-001 (blocker) + REV-002 (major): single root fix — the parser now
    allowlist-sanitizes user `style`/`classDef` values (drops url()/quotes/`<>`/etc.,
    emits an `unsafe-style-value` diagnostic) so the XSS and the CSS network-fetch
    are closed at the source for SVG, DOM runtime, and HTML export alike; svg.ts
    also attribute-escapes as defense in depth. Commit 0c8db89.
  - REV-003: mirrored geometry.simplify() + stroke-width/stroke-dasharray into the
    inlined runtime and added test/dom-runtime-parity.test.ts (drives the real
    runtime through a fake DOM, compares paths/styles to the shared modules).
    Commit c268f99.
  - REV-004: documented rounded-card interactive rendering (README + docstrings),
    commit e14c5e0. REV-005: unterminated-subgraph diagnostic now reports the real
    line/col, commit 7962ede.
  - Round-1 notes still stand: @dagrejs/dagre is bundled into the browser entries;
    DOM cards are rounded-rect (full silhouettes in static SVG, now documented).
  - Per delegation scope: did not regenerate charts/ or write implement/result.json
    (left to the orchestrator); only state.md + review/issues.json touched under .gogo/.
- **open-decision:** none
