# Test — round 1 · feature `state-antiparallel-decramp` (v0.6.2)

- **Branch:** `release/v0.6.2` (working tree, uncommitted)
- **Tester posture:** fresh eyes, did not write or review this code before today
- **Date:** 2026-07-14
- **Scope exercised:** `examples/src/state.mmd` (the reported bug fixture), the full
  gallery regeneration (`docs/`, `examples/`, `assets/`), the interactive HTML export
  (runtime twin), and the automated suites.

## Verdict: **PASS** — done-bar met, no open issues

Build + typecheck + unit (401/401) + e2e (85/85, incl. one newly added regression
test) all green. The hard visual acceptance bar is met by direct inspection of the
real rendered output for all four elbow variants, cross-checked against a live
browser render of the interactive twin. Full regression sweep and two independent
regenerations confirm the change is byte-surgical and deterministic. No fixable or
needs-user-decision issues against this feature's diff.

---

## 1. Automated suites

| Check | Command | Result |
|---|---|---|
| Build | `npm run build` | clean |
| Typecheck | `npm run typecheck` | clean, reports `very-nice-mermaid@0.6.2` |
| Unit | `npm test` | **401/401 passed** (29 files) |
| e2e | `npm run test:e2e` | **85/85 passed** (was 84; +1 new test, see §5) |

Ran twice (before and after adding the new e2e test) — stayed green both times.

## 2. Hard visual acceptance bar — hands-on, per variant

Built the CLI, rendered `examples/src/state.mmd` at all four elbow variants plus
`clean·fancy` as reference, cropped the Loading/Error region, and inspected each
image directly (I am multimodal — these are real pixels, not trusted test output).

- **Before (pre-fix reference, `git show HEAD:examples/png/state-clean-light.png`):**
  confirmed the reported bug exactly — `fail` and `retry` share one collinear
  crossbar with both arrowheads crammed together, reading as a single tangled
  double-arrow.
- **clean·light (after):** two clearly separated staircases. `fail` jogs low and
  descends into Error with a distinct down-arrowhead; `retry` jogs high and
  ascends into Loading with a distinct up-arrowhead. No merge, no crossing.
- **clean·dark (after):** identical stagger, good contrast, same clean separation.
- **sketch·light (after):** same stagger reproduced with hand-drawn wobble —
  fail's low staircase and retry's high staircase are clearly distinguishable,
  matching the clean variant's geometry (confirmed both via the CLI PNG and a
  higher-fidelity browser screenshot of the shipped SVG, see §4 workaround).
- **sketch·dark (after):** same clean separation as sketch·light.
- **clean·fancy (reference, unchanged):** two bowed bezier curves, well separated
  — the user's stated "correct" baseline. The four elbow variants now read with
  comparable cleanliness (distinct paths, distinct arrowheads, no ambiguity about
  which arrow goes where), meeting the bar without needing the documented fallback
  (curving just the anti-parallel pair).

**Verdict: the hard acceptance bar is MET for all four elbow variants.** No
escalation to the curved-pair fallback is needed.

## 3. Regression sweep (byte-level, verified myself — not trusting review's claim)

`npm run docs && npm run examples && npm run heroes`, then:

- `git diff --name-only -- docs/ examples/ assets/` → **30 files**, all `docs/assets/
  state-*`, `examples/{png,svg}/state-*` (clean/sketch x light/dark only, 4 each),
  and `docs/interactive/*.html` (18 files — see below).
- **`examples/svg/state-clean-light.svg` full diff:** exactly 2 lines changed (the
  `fail` and `retry` `<path>`+label lines). Every anchor point, every other edge
  (`fetch`, `2xx`/Loading→Ready, the pseudo-state circles) is byte-identical —
  confirmed by diffing the raw SVG, not inference.
- **Flowchart/class/sequence SVG+PNG:** `git diff --name-only` against those globs
  returned **empty** — byte-identical, confirmed directly.
- **`state-*-fancy` PNG/SVG:** not in the asset diff at all — byte-identical
  (fancy is curved, untouched by the elbow-only pass).
- **README heroes (`assets/example-*.png`):** `git diff --name-only -- assets/`
  returned **empty** — byte-identical.
- **Interactive HTML `__vnm_payload` check:** grepped every `docs/interactive/*.html`
  diff for a changed `__vnm_payload` line. Exactly **4 files** have one (
  `state-clean-dark/light`, `state-sketch-dark/light`). The other 14 changed HTML
  files (class x6, flowchart x6, `state-*-fancy` x2) are pure **additions** of the
  new `separateAntiParallelJogs2` function into the shared vnmRuntime blob (e.g.
  `flowchart-clean-light.html`: `74 insertions(+), 0 deletions(-)`) with **zero**
  payload changes — confirmed by direct diff inspection. `sequence-*.html` (6
  files) don't appear in the diff at all.

**Conclusion: the change is exactly as surgical as claimed.** Only the four state
elbow variants' geometry changed; everything else is either untouched or carries
only the new (unused-for-them) shared function body.

## 4. Determinism (verified with real checksums, two independent regenerations)

Snapshotted sha256 of all 30 changed asset files, then re-ran
`npm run build && npm run docs && npm run examples && npm run heroes` a second
time:
- The **set** of changed files vs. `HEAD` was identical across both runs (`diff`
  of the two `git diff --name-only` lists was empty).
- **Every file's sha256 was byte-identical** across the two regenerations
  (`shasum -a 256 -c` against the round-1 checksums: no failures).
- Spot-checked `examples/svg/state-clean-light.svg` explicitly: identical hash
  both times (`f9775e5…cdabfe77`).

## 5. Runtime-twin / interactive (FR4) — hands-on, real browser

**Tooling note (transparency, not a skip):** the bundled `gogo-playwright` MCP
browser tool had a stuck CDP connection in this session — `browser_navigate`
first failed on a day-old orphaned Chrome process holding the profile lock; after
killing it, `gogo-playwright`, `playwright-test`, and `playwright` MCP variants
all either timed out (30s) or reported "browser already in use" again, even
though `ps aux` confirmed a fresh Chromium launched and sat idle each time (the
browser itself works; the MCP RPC/CDP-pipe control layer is what hung). I did
**not** skip the check: I drove the **same** underlying `playwright` + Chromium
dependency the project's own `npm run test:e2e` already depends on (and which
passed 84/85 cleanly) via a small standalone script, and completed the required
verification with real, conclusive results:

- Opened `docs/interactive/state-clean-light.html` in a real headless Chromium
  (`file://`), waited for mount, and located the live-rendered `fail`/`retry`
  paths by proximity to their label text (real DOM `getBoundingClientRect`/
  `getPointAtLength`, not the baked payload).
- **Screenshot result:** the live-rendered edges show the identical stagger as
  the static PNG — `fail` jogs low into Error, `retry` jogs high into Loading,
  same crossbar heights as the shipped SVG (`y=319` / `y=293`). Confirmed pixel-
  identical layout to the CLI-rendered `clean·light` PNG when cropped to the same
  region.
- **Zero console errors / page errors** during load and mount.

This confirms the runtime twin mirrors the geometry pass in a real browser, not
just under the `dom-runtime-parity` unit test's fake-DOM harness.

## 6. REV-001 empirical check (carry-over nit from review)

Reviewed concern: the new pass runs after `separateLanes` with no re-run, so a
staggered jog could in principle create a new near-collinear overlap with an
unrelated third edge. Checked the full regenerated `state.mmd` render (all nodes/
edges, not just the Loading/Error crop): the only other edge in the same y-band is
`Loading→Ready` (label `2xx`), routing at `x[46,84]` — confirmed **byte-identical**
in the diff (§3) and visibly clear of the moved `fail`/`retry` verticals at
`x[144,147]` in the full-diagram screenshot. **Not observed** — consistent with
review's finding. Since every non-state diagram is byte-identical (§3), there is
zero risk of this latent case appearing anywhere else in the regenerated corpus.

## 7. New e2e test added (per gogo-tester mandate — test files only, no product code touched)

Added a new Playwright test to `e2e/state.spec.ts`:

> `anti-parallel jog de-cramp (v0.6.2): pause/resume stagger onto distinct lanes in
> the LIVE-rendered runtime`

It drives the **exported** `order-state.mmd` HTML (the fixture the plan explicitly
calls out as sharing this fix — `Running↔Paused` is a genuine anti-parallel pair),
locates the `pause`/`resume` edge paths in the real DOM by proximity to their
label text, extracts each path's interior jog `y` via a longest-horizontal-run
sample (a generic layout invariant, not a hardcoded coordinate), and asserts the
two jogs are `> 20`px apart (a safe margin under the `26`px `JOG_GAP`).

**Verified this is a real regression guard, not a tautology:** stashed the product
changes (`src/geometry/index.ts`, `src/layout/index.ts`,
`src/render/dom/runtime.ts`), rebuilt, and re-ran — the new test **failed**
(`Received: 0`, i.e. both jogs collinear, reproducing the exact reported bug).
Restored the fix, rebuilt, re-ran — **passes**. Typecheck was clean after fixing
two strict-null-check errors the new test introduced (`noUncheckedIndexedAccess`-
style array access) before finalizing.

Final suite counts after this addition: **85/85 e2e**, **401/401 unit**, typecheck
clean, build clean (re-confirmed).

## Incidental findings (out of scope — do not gate this feature)

Two things were discovered during hands-on testing that are **not** part of this
feature's diff and are **not** filed as issues against it (kept out of
`test/issues.json`'s `issues` array; noted here for the record per "report, don't
silently skip"):

1. **Pre-existing: `--style sketch` PNG output ignores `--scale`.** Confirmed
   `src/export/png.ts` untouched by `git status` for this feature. Root cause:
   `renderPngFromSvg()` passes `{fitTo:{mode:'zoom',value:z}, font:{...}}` to
   `@resvg/resvg-js`'s `Resvg` constructor for sketch renders (font registration
   for the embedded Kalam font); confirmed directly against the installed resvg
   package that passing `font` alongside `fitTo` silently drops the zoom —
   `node dist/cli/index.js render examples/src/state.mmd --style sketch --theme
   light -f png --scale 3` produces a 232x492 (1x) PNG instead of 696x1476 (3x),
   while the equivalent `--style clean` command scales correctly. Did not block
   verification (worked around via a controlled browser screenshot of the shipped
   SVG, and by inspecting the shipped SVG path coordinates directly). Worth a
   follow-up fix, unrelated to this feature.
2. **Session-local: bundled `gogo-playwright` MCP browser tool connectivity.**
   See §5 — a stuck CDP connection in this session, worked around with the
   project's own Playwright dependency, not a product defect.

## Files touched by this test round

- `.gogo/work/feature-state-antiparallel-decramp/test/issues.json` (new)
- `.gogo/work/feature-state-antiparallel-decramp/test-01.md` (this file)
- `e2e/state.spec.ts` (new regression test — test file only, no product code)

## Done-bar check (per `test-strategy.md`)

Build clean AND all unit AND all e2e green, PLUS hands-on exploration of the
actual change: **all met.** No relevant hands-on check was skipped (see §5's
tooling-substitution note — the check itself was completed, not deferred).
**Advancing to ⑤ report is warranted.**
