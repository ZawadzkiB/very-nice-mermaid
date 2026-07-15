Status: **done-bar MET**

# Test round 01 — subgraph-aware-routing (v0.6.6, defect #3)

**Branch:** `release/v0.6.6` (unchanged). **Build:** used the existing `dist/` (no source
changes made, so no rebuild was needed). No product code (`src/`) was touched. One test
file (`test/dom-runtime-parity.test.ts`) was temporarily instrumented with a debug probe to
verify REV-002's fix genuinely fires, then fully reverted (confirmed via `git diff` — zero
net change beyond the pre-existing round-2 addition).

## What I exercised

1. **Suites first (build → unit → e2e), before any exploration.**
2. **CLI** — rendered `architecture.mmd` to svg/png/html, light + dark, asserted exit 0 +
   valid output.
3. **Hard visual acceptance bar** — fresh PNGs (light + dark, `--scale 2`), read
   multimodally, judged independently against (a)/(b)/(c), then glanced at the existing
   reference PNGs for comparison only.
4. **No-regression sweep** — gate-scan, full fixture corpus, heroes/examples/docs
   regeneration, version bump, determinism.
5. **Interactive/hands-on** — exported to self-contained HTML, drove it with the bundled
   `gogo-playwright` MCP using **real pointer-driven drags** (Playwright's `dragTo`, which
   performs actual mouse down/move/up — matching this project's own e2e convention of
   `page.mouse.move/down/up`, not `element.click()`), dragged **both** `BE` (outside node)
   and `RULES` (inside node), inspected live SVG geometry, console.
6. **Unit/parity re-verification** — read the REV-001 (LR) and REV-002 (drag) test additions
   line-by-line and independently confirmed they exercise the real firing path (not
   tautological / false-confidence), including a temporary debug-probe check for REV-002.

## Level 1 — CLI

| Command | Result |
|---|---|
| `render architecture.mmd -f svg --theme light -o ...` | exit 0, valid XML (`XMLValidator.validate` → `true`) |
| `render architecture.mmd -f svg --theme dark -o ...` | exit 0, valid XML → `true` |
| `render architecture.mmd -f png --theme light --scale 2 -o ...` | exit 0, 140,460 bytes |
| `render architecture.mmd -f png --theme dark --scale 2 -o ...` | exit 0, 141,600 bytes |
| `render architecture.mmd -f html --theme light -o ...` | exit 0 |
| `render architecture.mmd -f html --theme dark -o ...` | exit 0 |
| `node dist/cli/index.js --version` | **`0.6.6`** ✓ |

## The hard acceptance bar — visual judgment on fresh PNGs (both themes)

Rendered fresh (not reused): `scratchpad/test-arch-light.png`, `scratchpad/test-arch-dark.png`
(`--scale 2`). Read both multimodally and judged independently; **then** compared byte-for-byte
against the pre-existing `scratchpad/arch-v066-{light,dark}.png` — both are **byte-identical**
to those references (`cmp` exit 0), which corroborates but does not substitute for my own
independent read.

- **(a) Do BE↔RULES route OUTSIDE the ENGINE container?** **Yes.** Cropped the container
  region and measured directly: `ENGINE` box right edge sits at `x≈815` (in a 950px-wide crop);
  the "findings" trunk sits at `x≈895` (clear ~80px gap, well outside) and "stream context"
  sits similarly outside on the right. In the live-drag SVG geometry (see Interactive section)
  the measured gap was a precise `15px`–`41px` beyond the container's right edge (consistent
  with `SUBGRAPH_AVOID_MARGIN=28` plus lane-separation spread) — not a rounding artifact.
- **(b) Is the container interior clean?** **Yes.** The only lines inside `ENGINE` are the
  two *legitimate* interior links (`MCP---RULES`, `CONSOLE -->|REST| RULES`, both members of
  the container) — no external trunk pierces through `MCP surface` / `Veris console`. Confirmed
  in both light and dark crops.
- **(c) Is the re-entry connector into RULES acceptable?** **Yes.** Cropped the bottom of the
  container: `stream context` enters `RULES` via a short 1-segment jog-then-drop-arrow near the
  top of the box — same visual idiom as the diagram's other elbow jogs (e.g. `chat`,
  `errors on tree` at the top of the diagram). Not janky, consistent with the rest of the
  render's style. `findings` exits near the same corner with no arrowhead (correct — its
  arrowhead is at `BE`, far away).

**Verdict: both themes meet the hard acceptance bar.** No impaling-trunk blocker found.

## No-regression sweep

| Check | Result |
|---|---|
| `node scratchpad/gate-scan.mjs` | `fired=0` on **every** fixture except `scratchpad/architecture.mmd` (`fired=2`: `BE->RULES`, `RULES->BE`); `idempotent=true` on all 11 fixtures + the repro |
| `fixtures/microservices.mmd`, `fixtures/nested-subgraphs.mmd` | byte-identical to v0.6.5 (no source/DSL diff; `containers=0` / `containers=2` respectively, both `fired=0`) — see TEST-001 below for a nuance on *why* microservices.mmd shows `containers=0` |
| `npm run examples && npm run heroes && npm run docs` | ran all three; `git status --short examples/ assets/` → **zero output** (no changes) |
| `git diff docs/ \| grep -E 'd="[ML]' \| grep -v '^[+-][+-]' \| wc -l` | **0** — no rendered-PATH changes; the only `docs/` diff is 18 interactive HTML files each growing by exactly 89 lines (inlined `avoidSubgraphs` twin source) + the version bump in `docs/_config.yml` |
| Version bump (4 sites) | `package.json`→`0.6.6`, `src/cli/run.ts` `VERSION`→`0.6.6`, `test/cli.test.ts`→`0.6.6`, `docs/_config.yml`→`0.6.6` — all confirmed |
| Determinism | rendered `architecture.mmd` to PNG twice (light + dark, same scale) — `cmp` byte-identical both times |

## Suite results

- **`npm test` (vitest):** **29 files / 426 tests, all green.**
- **`npm run typecheck`:** clean, exit 0.
- **`npm run test:e2e` (Playwright):** **85/85 passed.**

## Unit/parity coverage for REV-001 / REV-002 (re-verified, not just trusted)

Both review findings were marked `fixed` in round 2 of implement. I re-read the actual test
code (not just `fix_summary`) and additionally probed one of them at runtime:

- **REV-001 (LR/horizontal branch untested).** `test/geometry.test.ts` L912 adds a real LR
  pierce case asserting the trunk moved to `nearest-side + MARGIN` and the re-entry corner
  lowered on `x` — genuine geometric assertions, not tautological. `test/dom-runtime-parity.test.ts`
  L997 adds an `archAvoidLrDsl` (`flowchart LR`) fixture with its own assertion
  (`horizOutside` computed directly from `model.edges`/`model.subgraphs`, independent of the
  pass's own output) plus `edgePaths(root) == expectedPaths(...)` and `toSvgString() ==
  renderSvg` for both themes. **Promoted `fixed` → `verified`** in `review/issues.json`.
- **REV-002 (drag path untested).** `test/dom-runtime-parity.test.ts` L1026 drags `BE` and
  asserts determinism + `toSvgString()` parity. To confirm this genuinely exercises the
  *firing* path (not a silent no-op — the exact false-confidence trap the review warned
  about), I temporarily added a debug probe inside the test that recomputed whether the
  post-drag `BE→RULES` trunk sits outside the edited model's `ENGINE` box, ran it in isolation
  (`npx vitest run test/dom-runtime-parity.test.ts -t "avoidSubgraphs stays deterministic"`),
  and observed `TEST-01-PROBE firedOutside= true`. The probe was then fully reverted (`git
  diff test/dom-runtime-parity.test.ts` shows only the pre-existing round-2 addition, zero
  residual probe code). Also independently re-confirmed live in the browser (see below).
  **Promoted `fixed` → `verified`** in `review/issues.json`.

## Interactive / hands-on (NOT blocked — completed with a minor workaround)

The bundled `gogo-playwright` MCP works in this environment, but its `browser_navigate` blocks
the `file:` protocol, so I served the exported HTML from a throwaway local
`python3 -m http.server` in `scratchpad/` (stopped afterward) rather than opening the file
directly. This is a trivial, fully-resolved workaround, not a blocked check — no
needs-user-decision issue filed for it.

- Exported `architecture.mmd -f html` and opened it.
- **Console:** 1 pre-existing benign error throughout (`favicon.ico` 404) — **zero** app-caused
  console errors, before or after either drag.
- **Dragged `BE`** (outside node) by ~(+26,-14): confirmed via live SVG inspection that the
  `stream context` trunk (`x=596.5`) and `findings` trunk (`x=622.5`) both sit outside
  `ENGINE`'s live right edge (`x=581.5`) — margins of 15px / 41px, both clean.
- **Dragged `RULES`** (inside node) further down-right: confirmed the container **re-hugs**
  (FR6) to the node's new position (`w` grew 365.5→416.5, `h` grew 572→640.96), and
  `avoidSubgraphs` re-fired against the **new** box — both trunks (`x=647.5`, `x=673.5`) stayed
  outside the **new** right edge (`x=632.5`). **No stranded edges** (checked all 9 edge `path`
  `d` attributes for `NaN`/`undefined` — none found). Screenshot saved at
  `scratchpad/test-out/arch-after-drag.png` and visually confirms a clean result, matching the
  static PNG assessment.
- **Zero new console errors** across both drags.

**Conclusion: the live re-route pass fires deterministically under drag, in both directions
(outside-node and inside-node), and never strands an edge.** This satisfies the plan's
Interactive/drag test requirement in full — no fallback to static-only was needed.

## Issues filed

One issue, filed in `test/issues.json` (round 1):

- **TEST-001** (minor, priority P3, **needs-user-decision**, status `new`) —
  `fixtures/microservices.mmd`'s "Core services" subgraph box never renders at all, due to a
  **pre-existing** parser membership-order bug (nodes referenced by an edge *before* being
  declared inside a `subgraph` block never get attached as members — confirmed unrelated to
  this feature: `fixtures/microservices.mmd` and `src/parser/index.ts` are both byte-identical
  to `master`). This means the plan's "both subgraph heroes are both-in → no-op" claim is only
  *genuinely* demonstrated by `fixtures/nested-subgraphs.mmd` (`containers=2`, `fired=0`, real
  members); `microservices.mmd`'s byte-identity holds trivially (no container ever existed).
  **Not a regression from v0.6.6, not a blocker** — fixing it is a parser change, explicitly
  out of scope for this feature. Filed as needs-user-decision because opening a separate
  defect for it is a product call, not mine to make.

No blocker or major findings. No product-code issues found — the `avoidSubgraphs` pass, its
twin mirror, and its threading through `finishEdges`/`layout()`/`applyPositions()` all behave
exactly as designed under both static rendering and live interaction.

## review/issues.json update

Per the task instructions, promoted both prior review findings from `fixed` to **`verified`**
in `.gogo/work/feature-subgraph-aware-routing/review/issues.json` (with a `verification_note`
on each explaining exactly how I re-confirmed them — see above). Neither reverted to `open`;
both fixes hold.

## Verdict against the done-bar

**MET.** Build clean (dist current, no rebuild needed) + unit (426/426) + e2e (85/85) green,
PLUS hands-on exploration completed at every relevant level (CLI, static-visual, and live
interactive drag — not blocked, no fallback needed). The hard visual acceptance bar is met in
both themes, independently judged. Byte-identity holds for both subgraph heroes and the entire
non-firing fixture corpus; the only firing is `architecture.mmd`'s `e5`/`e6`, exactly as
designed. Version is `0.6.6`. Determinism confirmed. One minor, out-of-scope,
needs-user-decision issue filed (TEST-001) — it does not affect this feature's acceptance.

**Recommendation:** advance to ⑤ report.
