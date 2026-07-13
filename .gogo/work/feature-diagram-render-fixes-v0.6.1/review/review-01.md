# Review — round 1 — diagram-render-fixes-v0.6.1

**Scope reviewed (fresh eyes, adversarial):** `src/geometry/index.ts`,
`src/render/dom/runtime.ts`, `src/theme/index.ts`, `test/geometry.test.ts`,
`scripts/generate-heroes.mjs`, `fixtures/cache-lookup.mmd`, `package.json`, and a
spot-check of the regenerated `docs/` / `examples/` / `assets/` / `__snapshots__`
output. Reviewed against `plan.md` + `decisions.md` (incl. escalated D6) and the
project's code-review-standards / coding-rules / NFR docs.

**Baseline re-run locally (green):** `npm run typecheck` clean; `npx vitest run`
= **395 unit tests passed (29 files)**, incl. `dom-runtime-parity` (35) and
`geometry` (44). No `Date.now`/`Math.random`/`performance.now` in any changed
render path.

## What's solid (verified, not assumed)

- **FR1 is genuinely colour-only.** `light colors.edge #8a93a6 -> #69728a`. I
  normalised each of the 4 changed snapshots by the edge hex and confirmed they are
  **identical after normalisation** — every path `d`, every rect, every viewBox byte
  is unchanged across `render-svg`, `class-svg`, `sequence-svg`, `state-svg`. The
  ~4.5:1 contrast claim on `#f7f8fb` checks out numerically (computed 4.53:1),
  matching dark-parity. Sequence (out of scope for geometry) correctly changes only
  its edge colour.
- **FR2 / FR3 twins are byte-identical.** `perpendicularizeEntry` (geometry
  L1042-1054 vs runtime L974-984), `elbowThrough`'s call site, the naive-elbow call
  sites, and the FR3 parallel branches (geometry L611-644 vs runtime L1477-1506) match
  char-for-char modulo `n`≡`nAt` (both `Math.round(v*100)/100`) and
  `PORT_LABEL_PAD`≡literal `6`. `simplify` and the hi/lo accumulation + `+axis`
  tiebreak + rounded-centre writeback are unchanged and shared. FR2 leaves already-
  perpendicular routes untouched (`finalPerp` short-circuit) — confirmed by the fact
  that **no snapshot geometry byte moved**.
- **FR2 swap is orthogonality-safe.** The corner flip sets the opposite corner of the
  `a`–`end` bounding box; both resulting segments are axis-aligned (no diagonal), and
  the `swappable` guard (`a.y!==end.y` / `a.x!==end.x`) prevents a zero-length closing
  segment. Traced the `idle→Loading` test case by hand: `[200,60][150,60][150,180][100,180]`
  → swap → `[200,60][150,60][100,60][100,180]` → simplify → clean single-L vertical
  entry into the top. No backtrack in the naive case (mid-x is monotone between ends).
- **Acceptance visuals (spot-check).** `assets/example-dark.png`: the `idle→Loading`
  arrow now enters Loading's top with a downward arrowhead (no sideways stub), and
  `give up` reads as one un-bisected word in open space. `docs/assets/state-sketch-light.png`
  and the light gallery: edges/arrowheads legible (Issue 2/3 contrast fix landed).
- **D6 reconstruction (`fixtures/cache-lookup.mmd`)** renders a sensible cache-lookup
  flowchart, and `assets/example-sketch.png` matches it (sketch·light). `generate-heroes.mjs`
  is consistent with `generate-docs.mjs` (CLI-driven, `--scale 2`, failure accumulation
  + `exit 1`). `package.json heroes` script wired.
- **Plan fidelity.** FR1–FR4 + D5/D6 all delivered; dark/fancy geometry untouched;
  scope stayed minimal (no opportunistic refactors); determinism preserved.

## Findings

| id | sev | pri | status | title |
|----|-----|-----|--------|-------|
| REV-001 | minor | P2 | new | `dom-runtime-parity` guard **not extended** for the FR2 corner-swap / FR3 parallel-escape — plan promised it; twins verified byte-identical, so a coverage gap, not a live drift |
| REV-002 | nit | P3 | new | `perpendicularizeEntry` assumes the pre-corner point is **outside** the entered border — no exterior guard; latent, not observed in the corpus |
| REV-003 | nit | P3 | new | FR3 parallel-escape slide target is **not clamped to the label's own-run extent** — a long co-extensive parallel run could over-slide the label (continuation of prior REV-008; not observed) |

### REV-001 (minor, P2) — the one worth acting on before merge
`test/dom-runtime-parity.test.ts` is unchanged vs master, yet plan.md step 4/Tests
committed to "extend dom-runtime-parity coverage" for these twins, and this is the
project's most-reopened trap (REV-003/007/009, hybrid TEST-003). The new geometry unit
tests exercise only the **geometry** side. Because FR2/FR3 changed **zero** snapshot
bytes (all colour-only), the fixes' real output changes live only in the un-snapshotted
gallery/hero PNGs, so **no static-vs-runtime byte-compare locks in either new branch**.
No live divergence exists today (I verified the twins char-for-char), but a future edit
to either twin could drift the interactive/HTML export silently. Fix is a small,
agent-fixable parity fixture that genuinely fires both branches and byte-compares
runtime==static (bite-verified by reverting one twin) — mirroring how REV-009 was closed.

### REV-002 / REV-003 (nits, P3) — latent, unobserved; no change needed to ship
Both are code-grounded robustness limits of the two new mechanisms that the review
brief asked me to probe (through-node on a swap; fling a label off a co-extensive
parallel run). I **verified neither materialises** on any fixture/snapshot or in the
eyeballed heroes. They mirror the prior feature's nit style (REV-004/005/008) and are
optional hardening / documented follow-ups.

## Verdict

**APPROVE** — no open blockers or majors. FR1–FR4 + D5/D6 are correctly implemented,
the twins are byte-identical, tests+typecheck are green, and the acceptance visuals
check out. REV-001 (P2) is a real, plan-promised parity-coverage gap on the project's
recurring trap and should be closed soon (ideally before merge), but with the twins
verified byte-identical it is not a shipping blocker; REV-002/REV-003 are latent,
unobserved nits.
