# Decisions — feature `state-antiparallel-decramp`

Forks that needed a human call. gogo appends each as `D<n>` with options and a
recommendation, then records your answer as a `RESOLVED` block. This is the
audit trail that lets the pipeline pause and resume safely.

## D1 — Elbow-only fix, or also de-tangle curved (fancy) anti-parallel pairs?
- **Phase:** plan
- **Question:** The task premise says "dark/fancy state geometry WILL change here too."
  Verified against `src/theme/index.ts:193`: `light`/`dark` use `edge.style: "elbow"`, but
  **`fancy` uses `"curved"`** (beziers). The existing `separateLanes` and the proposed
  `separateAntiParallelJogs` are **elbow-only**, so an elbow-only fix changes clean·light,
  clean·dark, sketch·light and sketch·dark state - but leaves **fancy byte-identical**. Ship
  elbow-only, or also spread curved anti-parallel beziers?
- **Options:**
  - A. **Elbow-only (recommended).** Fix the four elbow variants; fancy (curved) stays
    byte-identical. Consistent with *all* prior FR9 lane work (elbow-only, D4 of the
    legibility feature); smallest change; lowest regression risk. Fancy's beziers already bow
    apart between the spread ports, so the anti-parallel tangle is genuinely milder there
    (no shared collinear crossbar).
  - B. **Also de-tangle curved pairs.** Add a bezier control-point spread for anti-parallel
    curved edges too - a separate, larger routing change with its own parity mirror and its
    own snapshot churn (fancy state assets), higher risk.
- **gogo recommends:** **A** - matches the established elbow-only scope of every lane pass,
  keeps the change surgical, and the curved tangle is milder. B can be a later follow-up if
  fancy still reads cramped after re-render. *Why the simpler A suffices:* the reported/worst
  cases (clean·light, sketch·light, and their dark siblings) are all elbow; fancy's curves do
  not form the collinear crossbar that A targets.
- **Status:** RESOLVED (user, 2026-07-14) → **A (elbow-only de-cramp).** The user annotated the
  gallery: **`clean·fancy` is the "correct" reference** (its curves separate cleanly), and
  **`clean·light` / `clean·dark` / `sketch·light` (and `sketch·dark`) have `fail`/`retry`
  merging at one point, which must stop.** They offered two acceptable paths: "do it as in
  fancy style" (curve the elbow variants) OR "make those lines not crossing in other styles."
  Chosen: **make the elbow lines not cross** (this pass), NOT converting clean/sketch to
  curves — because clean/sketch are *defined* by elbow edges and curving them would erase the
  distinction from fancy. **Hard bar:** the elbow-stagger must render the four elbow variants
  as cleanly-separated as fancy (no merge/cross); if it does not read that clean by eye,
  **escalate to option B for the anti-parallel pair only** (curve just fail/retry). Fancy stays
  byte-identical (already correct).
