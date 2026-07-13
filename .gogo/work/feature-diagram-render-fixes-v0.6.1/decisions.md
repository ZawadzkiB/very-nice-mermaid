# Decisions — feature `diagram-render-fixes-v0.6.1`

Forks that needed a human call. gogo appends each as `D<n>` with options and a
recommendation, then records your answer as a `RESOLVED` block.

## D1 — Fix strategy for Issues 2 & 3 (Report-failure + state light thumbnails)
- **Phase:** plan
- **Question:** Both issues only appear in `light`/`sketch·light` and their `dark`/`fancy`
  siblings (with **identical geometry**) "look clean." Fix as a contrast problem, or change
  the routing?
- **Options:**
  - A. **Light-theme contrast fix** — darken the light `edge` token; colour-only, zero
    geometry change, dark/fancy untouched, no snapshot churn.
  - B. **Geometry de-cramp** — spread the `fail`/`retry`/Report-failure runs. Helps all
    themes but **changes the now-good dark/fancy geometry** the user likes (regression risk),
    and doesn't explain the light-vs-dark discrepancy.
- **gogo recommends:** A — the light-vs-dark discrepancy on identical geometry is logically
  forced to be contrast; lowest regression risk. Keep B as a deferred follow-up only if a
  residual cramp survives A (confirmed by re-render).
- **Status:** RESOLVED (user, 2026-07-13) → **A**. Fix Issues 2+3 as the shared
  light-theme contrast fix (colour-only). B kept as a deferred follow-up only if a residual
  cramp survives the re-render.

## D2 — Blast radius + strength of the light edge-contrast change
- **Phase:** plan
- **Question:** Darkening `light` `colors.edge` re-renders the appearance of **every** light
  diagram (all `*-clean-light`, `*-sketch-light` thumbnails + interactive HTML + the
  `example-light` / ci-pipeline hero). Accept that, and how dark should it go?
- **Options:**
  - A. **Darken to ~dark-parity contrast** (a slate in the `#5c6478`/`#6b7488`-for-light
    family), tuned by eye; accept that all light diagrams change (an improvement, not a
    regression).
  - B. **Minimal darkening** just enough for `sketch·light` legibility, keeping light closer
    to today's airy look.
- **gogo recommends:** A — matches the crisp read the user wants and equalises with dark;
  the change is uniformly an improvement. Exact hex tuned during implement against
  `clean·light` + `sketch·light`.
- **Status:** RESOLVED (user, 2026-07-13) → **A**. Darken to ~dark-parity contrast; user
  accepts that all light diagrams change (an improvement). Exact hex tuned by eye during
  implement.

## D3 — Scope of the Issue-1 flowchart-geometry fix
- **Phase:** plan
- **Question:** Issue 1 has two sub-bugs in shared flowchart geometry (which the
  `flowchart-render-legibility` feature owns and byte-parity-guards). Fix both?
- **Options:**
  - A. **Fix both** 1a (Loading top-port arrowhead stub) and 1b (`give up` label on a
    parallel run) in `src/geometry/index.ts` + the byte-identical runtime twin; keep
    clean-routing edges byte-identical; regenerate + re-verify to protect the prior feature.
  - B. **Fix only 1a** (arrowhead) and treat `give up` as acceptable/contrast.
- **gogo recommends:** A — both are things the user explicitly reported; the label sits on a
  line even in high-contrast dark, so it's a real placement bug, not contrast.
- **Status:** RESOLVED (user, 2026-07-13) → **A**. Fix both 1a and 1b in shared flowchart
  geometry + the runtime twin; keep clean-routing edges byte-identical; regenerate +
  re-verify to protect the `flowchart-render-legibility` feature.

## D4 — Unknown `example-sketch.png` hero source
- **Phase:** plan
- **Question:** `example-sketch.png` did not reproduce from any `fixtures/`/`examples/src/`
  source at scale 1-3 (sketch). Its exact source/command is unidentified, so we can't
  cleanly regenerate that one hero after the contrast change.
- **Options:**
  - A. **Identify it during implement** (git archaeology / confirm with you which `.mmd` +
    theme/style/scale it is), then regenerate it like the others.
  - B. **Re-author the sketch hero** from a known source (e.g. `state-machine` sketch light)
    and update the README reference — accepts a look change for that one image.
- **gogo recommends:** A — keep the existing hero; just recover its recipe. Not blocking the
  3 issues.
- **Status:** RESOLVED (user, 2026-07-13) → **A, simplified per user steer.** The user
  clarified the 4 gallery variants (`clean·light`/`clean·dark`/`clean·fancy`/`sketch·light`)
  are **the same diagram in different styles — there is NO separate DSL** for the sketch one;
  "just render it with sketchy style." So `example-sketch.png` is an existing fixture (the
  content is the state machine → `fixtures/state-machine.mmd`) rendered with `--style sketch`.
  **No byte-identical archaeology needed** — during implement, confirm the theme (light/dark)
  by eye and **re-render fresh with the current sketch renderer** (a look refresh for that one
  hero is acceptable, and desired, since it also picks up the sketch-style improvements).

## D6 — `example-sketch.png` is a *cache-lookup flowchart*, not the state machine (D4 premise was wrong)
- **Phase:** implement
- **Question:** While implementing D4/D5 I opened the actual `assets/example-sketch.png`
  (and its v0.5.0 predecessor). It is **not** the state machine — it is a **cache-lookup
  flowchart** ("User request → Cache hit? → Return cached / Query DB → Build response →
  Return / Write cache"), rendered **sketch · light**. Its DSL exists **nowhere** in the
  repo (grep for "Cache hit"/"Write cache" = 0 hits; not in `fixtures/` or `examples/src/`).
  So the D4 conclusion ("re-render as `state-machine --style sketch`") would **swap the
  README hero to a different diagram**. I reconstructed the DSL from the image and rendered
  it `sketch·light` — a **pixel-perfect match** to the committed hero. How should the hero
  regenerate?
- **Options:**
  - A. **Reconstruct faithfully (recommended).** Commit the verified DSL as
    `fixtures/cache-lookup.mmd` and regenerate `example-sketch.png` from it (light · sketch,
    scale 2) via the new `generate-heroes.mjs`. Keeps the existing hero's content, picks up
    the FR1 light-edge contrast fix, and **truly** resolves the D4/D5 provenance gap. Verified
    to match pixel-for-pixel.
  - B. **Follow D4 literally.** Regenerate as `state-machine --style sketch --theme light` —
    matches the letter of D4 but **replaces** the README hero with a different diagram (the
    state machine). Almost certainly not intended.
  - C. **Leave `example-sketch.png` untouched.** Keep the committed bytes; but this is a
    *light* hero, so it keeps the OLD faint edges while the rest of the light gallery gets the
    FR1 contrast fix → visually inconsistent.
- **gogo recommends:** **A.** The user's D4/D5 intent was clearly "keep the sketch hero, make
  it reproducible, refresh its look" — best served by capturing the **actual** diagram, not by
  swapping in the state machine (B) or leaving it stale (C). *Why the simpler options don't
  suffice:* B changes what the hero depicts; C leaves it inconsistent. A is verified pixel-exact
  and permanently fixes provenance.
- **Status:** RESOLVED (user, 2026-07-13) → **A**. Commit the reconstructed DSL as
  `fixtures/cache-lookup.mmd` and regenerate `example-sketch.png` from it (light · sketch,
  scale 2) via `generate-heroes.mjs`. This supersedes D4's "state-machine" assumption for the
  sketch hero; the other 3 hero recipes (D4) are unchanged.

## D5 — Add a hero-generation script?
- **Phase:** plan
- **Question:** Heroes are currently regenerated by **hand** (no script), which is how the
  D4 provenance uncertainty arose. Add a small script?
- **Options:**
  - A. **Add `scripts/generate-heroes.mjs`** capturing the 4 recovered commands (like
    `generate-docs.mjs`) — deterministic future regen; permanently resolves D4.
  - B. **Keep manual** — just re-run the recovered commands this once (smaller change,
    stays in scope).
- **gogo recommends:** A — small, robust, and it captures provenance so heroes never drift
  ambiguously again; but B is a legitimate "stay minimal" choice.
- **Status:** RESOLVED (user, 2026-07-13) → **A**. Add a small `scripts/generate-heroes.mjs`
  (mirroring `generate-docs.mjs`) capturing all 4 hero recipes — including
  `example-sketch = state-machine --style sketch` per D4. *Why the simpler "re-run by hand"
  version does not suffice:* hand-rendered heroes are exactly what produced the D4 provenance
  gap; a ~20-line script consistent with the project's existing generation scripts makes
  heroes deterministically reproducible for good. Heroes are currently the only asset set
  without a generation script.
