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
- **phase:** done            <!-- plan | implement | review | test | knowledge | done -->
- **status:** done           <!-- awaiting-plan-acceptance | plan-accepted | implementing | reviewing | testing | waiting-for-user | done | shipped | aborted -->
- **created:** 2026-07-03
- **branch:** n/a (repo not yet a git repository)
- **iterations:** plan=1 · implement=5 · review=3 · test=2 · report=1
- **resume:** none — report ⑤ complete (report/report.md + flow/class/sequence diagrams + refreshed knowledge docs); all phases green, 0 open issues. Run `/gogo:done` to ship to the changelog.
- **prior-resume:** implement round 5 (test-only hardening) complete — the single open
  finding from review round 3, REV-007 (nit / test-coverage gap), is closed and
  marked `status: fixed` in review/issues.json (fixed_in_round: 5, fix_summary +
  fixing commit). **NO product code changed — test-only.** Extended
  test/dom-runtime-parity.test.ts with a CURVED/fancy-theme parity case over the
  skip-level shape (`flowchart TD / A-->B-->C / A-->C`, prepared with
  theme:'fancy' → edgeStyle:'curved'): it drives the real inlined runtime through
  the fake DOM and asserts its edge `d` equals the shared
  geometry.routeEdge(..., 'curved', wps) for every edge, so the
  roundedPath↔pathRounded twin (the A->C waypoint detour, `Q` rounded corners)
  and the plain bezier twin (A->B, B->C, `C` command) stay in lockstep. Verified
  the guard genuinely fails on drift (perturbed the runtime's curved branch to
  pathPoly → the A->C `Q`-cornered expectation no longer matched the straight
  output; reverted, src/ byte-identical). The existing elbow parity assertions
  and the REV-001/REV-002/REV-006 security suites are untouched and still pass.
  Green: `npm run build` + `npm run typecheck` + `npm test` (110 unit, +1 over
  109) + `npm run test:e2e` (10 chromium). Ready for re-review (④).
  - REV-007 (nit / review r3): the REV-003 parity guard only exercised the
    light/elbow theme, leaving the curved+waypoint path (added by the TEST-001
    fix, commit 2aa0eb9) unguarded against future drift of the .toString()-
    serialized runtime copy. Added a fancy-theme case; the two implementations
    were already line-for-line equivalent + NaN-free, so this is pure coverage so
    a FUTURE divergence fails loudly. Commit 279456a.
  - Per delegation scope: touched only test/dom-runtime-parity.test.ts, state.md,
    and review/issues.json; no src/ change, no charts/ regen, no
    implement/result.json (left to the orchestrator).
- **prior-resume:** implement round 4 (test-fix) complete — all four actionable test
  findings from test round 1 are fixed and written back in test/issues.json
  (`status: fixed`, `fixed_in_round: 4`, per-issue `fix_summary` + fixing commit);
  TEST-003 is marked `wontfix` per decisions.md D5 (no code change). Green:
  `npm run build` + `npm run typecheck` + `npm test` (109 unit, up from 99: +5
  routing/parity/cli, +2 ascii-corner) + `npm run test:e2e` (10 chromium — the
  tester's previously-failing TEST-002 regression now passes). Security
  (REV-001/REV-002) + REV-006 tests still pass. Committed one small increment per
  issue. Ready for re-test (④).
  - TEST-001 (major/geometry): multi-rank & back edges now reuse dagre's own
    interior routing waypoints (layout threads them for edges with >3 dagre
    points; geometry orthogonalizes/rounds them; the model carries them so the
    DOM runtime re-routes the same detour on drag → static SVG + interactive stay
    in parity). Adjacent edges + all snapshots unchanged. 0 edge-through-node
    overlaps across every fixture + skip/cycle constructed cases. Commit 2aa0eb9.
  - TEST-002 (major/UI): viewport onPointerDown early-returns on a `.vnm-toolbar`
    target, so fit/zoom buttons' clicks are no longer swallowed by pan capture.
    Commit 5d466e7.
  - TEST-005 (minor/ascii): elbow turns render as corner glyphs (┌┐└┘); `┼`
    reserved for genuine two-edge crossings. Fixed in code (not documented as a
    limitation). Commit d69c14a.
  - TEST-004 / D6 (nit→decided): CLI exits non-zero with "no diagram found
    (input produced 0 nodes)" on a zero-node render (both modes); library API
    unchanged. Commit c51ce39.
  - TEST-003 (minor): wontfix per D5 (edges under cards is conventional).
  - Per delegation scope: did not regenerate charts/ or write implement/result.json
    (left to the orchestrator); only state.md + test/issues.json touched under
    .gogo/. plan.md/decisions.md D6 refinements were the orchestrator's; left as-is.
  - Prior rounds' notes (below) still stand.
- **prior-resume:** implement round 3 (small review-fix) complete — the one open
  finding from re-review, REV-006 (minor/correctness), is fixed and marked
  `status: fixed` in review/issues.json (fixed_in_round: 3, fixed_in_commit
  429e832, fix_summary). Green then: 99 unit + 8 e2e. REV-001/REV-002 exploit test
  still passes.
  - REV-006: parseStyleProps() property splitter is now paren-aware
    (splitTopLevelCommas splits commas only at paren depth 0), so comma-form
    `rgb()`/`hsl()` colors reach isSafeStyleValue() intact and are kept without a
    spurious `unsafe-style-value` warning. No allowlist reject rule changed; the
    `;` declaration separator is still split upstream, so a hostile value trailing
    a valid rgb() is still dropped + warned (REV-001/REV-002 hold). Commit 429e832.
  - Prior rounds' notes (below) still stand.
- **prior-resume:** implement round 2 (review-fix) complete — all 5 review-round-1
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
