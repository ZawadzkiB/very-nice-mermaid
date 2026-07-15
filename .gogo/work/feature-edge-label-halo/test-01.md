# Test round 1 — `edge-label-halo` (v0.6.4)

**Verdict: ALL GREEN — advance to ⑤ report.** Build clean, 405/405 unit tests green
(incl. `dom-runtime-parity` 37/37), 85/85 e2e green (one stale test-only assertion
found and fixed in this round, see TEST-001 — not a product regression), CLI version
0.6.4, byte-deterministic renders, and hands-on visual verification against real
rendered PNGs confirms the hard acceptance bar: every routed-edge label sits off its
line so the line reads continuous, no label/node or label/label overlaps, sequence
labels tightened with clear arrows. The interactive/browser check ran successfully via
the bundled `gogo-playwright` MCP (not flaky this session) — no fallback needed.

## What was exercised

### 1. Suites (build → unit → e2e, in order, all required green before exploring)
- **Build:** `npm run build` — clean, no errors (tsup ESM + `.d.ts`, 3 entries).
- **Typecheck:** `npm run typecheck` — clean (bonus gate).
- **Unit:** `npx vitest run` — **405/405 passed**, 29 files, incl. `dom-runtime-parity.test.ts`
  (37/37 — the byte-for-byte static-vs-runtime label parity guard) and `geometry.test.ts`
  (52/52, incl. the 4 new REV-001 lock tests from implement round 2).
- **e2e:** `npm run test:e2e` (Playwright/Chromium) — **first run: 84/85** (1 failure,
  see TEST-001 below); after fixing the stale test correlation, **85/85 green**,
  including the FR3 "give up"-label-clears-parallel-run checks (light + dark) and the
  anti-parallel jog de-cramp check (now robust).
- **CLI version:** `node dist/cli/index.js --version` → `0.6.4`. ✓

### 2. Hands-on visual verification (the crux — real rendered PNGs)

**architecture.mmd** (user's real diagram; labels chat/reason/author rules/stream
context/proxy chat auth/REST/findings/errors on tree) at **clean+sketch × light+dark**:
- Every label sits clearly beside its former on-line position; the edge line runs
  continuously through/past where the label used to blank it (no opaque plate cutting
  the line) in all 4 combinations. Zoomed crops of the "chat"/"errors on tree" cluster,
  the "reason"/"author rules" fan-out, and the "findings" label near the diagram's
  right edge confirm: no clipping, no label-on-node or label-on-label overlap.
- **Determinism:** rendered `architecture.mmd` to SVG twice — `diff` reports byte-identical;
  rendered to PNG twice — identical SHA1 checksums. No clock/RNG leakage confirmed.

**Gallery** `examples/src/{flowchart,state,class}.mmd` (clean light/dark + sketch light):
- **Flowchart:** "yes"/"no"/"prod"/"staging" labels all read off-line, continuous lines,
  no overlaps.
- **State (dark):** the `fetch`/`2xx`/`fail`/`retry` cluster — specifically the
  `fail`/`retry` anti-parallel pair called out in the plan's as-built notes — is
  visibly separated with distinct jogs; no label/label or label/line overlap.
- **Class:** clean render, no edge labels in this fixture (inheritance-only), confirms
  no regression to the unlabeled path.

**Sequence** `examples/src/sequence.mmd` (clean light/dark/fancy):
- Labels ride above their message arrows (tightened `messageLabel` → shared
  `labelPlateSize`); arrows are not masked. `lookup user` sits clear of the Database
  lifeline (label plate doesn't reach the lifeline's x-position in this fixture, so no
  crossing at all here); the dashed lifelines render unbroken elsewhere.

### 3. Interactive/browser check — ran successfully (no fallback needed)
The bundled `gogo-playwright` MCP was **available and worked** this session (not
flaky). Exported `architecture.mmd` to a self-contained interactive HTML
(`vnm render ... -f html --theme light`), served it over a local static server
(the MCP blocks `file://`), navigated with `browser_navigate`, and read the live DOM:
- 7 nodes / 8 edges mounted correctly; one benign console entry (404 for
  `favicon.ico`, unrelated to the app).
- Extracted all 8 edge-label `<rect>`/`<text>` positions from the live
  `svg.vnm-edges` DOM and compared them to the matching static SVG
  (`vnm render ... -f svg --theme light`): every one of the 8 labels differs from its
  static counterpart by an **identical constant (Δx=4.75, Δy=18)** — exactly the
  static SVG's viewBox-origin shift, i.e. the interactive runtime's label-offset
  geometry is **byte-parity-equivalent** to the static SVG once that constant frame
  offset is accounted for. This independently confirms FR4 (parity preserved) in a
  genuinely-rendered browser, matching what `dom-runtime-parity` already asserts
  under jsdom.
- Took a full-page screenshot for the record; closed the browser and stopped the
  local server afterward. No stray artifacts left in the repo.

## New/extended tests
- **`e2e/state.spec.ts`** — rewrote the anti-parallel jog de-cramp test's path
  correlation (see TEST-001): now identifies the pause/resume paths by graph
  structure (which node each path's start/end anchors to), not by label proximity,
  so it stays valid now that labels intentionally sit off their own line. Same
  invariant asserted (`>20` px stagger), same `jogY()` measurement.

## Issues this round

| id | title | severity | status | notes |
|---|---|---|---|---|
| TEST-001 | e2e anti-parallel jog test correlated labels to paths by proximity, which the off-line label design breaks | minor | **fixed** | Test-file-only fix; re-verified (5/5, then 85/85 full e2e green). Not a product regression — the raw path geometry already staggers the jogs by 26px (>20 required); confirmed via the static SVG `d` attributes and the cropped render. |

No blockers, no majors, no open/new issues after the fix. See
`.gogo/work/feature-edge-label-halo/test/issues.json` for the full record.

## Done-bar check (per `test-strategy.md`)
Build clean **AND** all unit **AND** all e2e green **AND** hands-on exploration of the
actual change — all four met. No blocked hands-on checks this round (the interactive
MCP check ran; no fallback needed). **Advance to ⑤ report.**
