# Decisions — feature `edge-label-halo`

Forks that needed a human call. gogo appends each as `D<n>` with options and a
recommendation, then records your answer as a `RESOLVED` block. This is the
audit trail that lets the pipeline pause and resume safely.

## D1 — Routed-edge fix strategy (flowchart / class / state)
- **Phase:** plan
- **Question:** How do we stop the opaque label plate from masking the edge line? A
  label cannot be both centered on the line AND leave the line continuous.
- **Options:**
  - A. **Perpendicular offset (option d)** — move the label off its own line (up for
     horizontal segments, right for vertical), so the line stays **continuous**. New
     `offsetLabelsOffLine` pass folded into `finishEdges` FIRST, so the existing FR6 /
     label-vs-node / label-vs-crossing-edge passes de-collide the offset positions and
     stay coherent; mirrored byte-for-byte in the runtime twin. Trade-off: **fully fixes
     the reported bug**, but shifts every label → broad (reviewed) snapshot churn, full
     twin re-mirror, and a re-verify of the collision invariants under the offset.
  - B. **Tighten-only (option a)** — drop the plate padding to a true minimal bbox.
     Trade-off: **safe, low churn**, positions barely move so FR6 holds trivially — but
     the gap only shrinks ~6px, so **the line still visibly breaks** (does not satisfy FR1).
- **gogo recommends:** **A** — it is the only option that makes the line continuous (the
  actual reported symptom); scoped to a single choke point to bound the risk. B is the
  honest fallback if you'd rather not perturb the label subsystem in a patch.
- **Status:** RESOLVED (user, 2026-07-15) → **A (perpendicular offset / option d).** Move
  each routed-edge label off its own line (above horizontal segments, beside vertical) so
  the line stays continuous, via `offsetLabelsOffLine` folded into `finishEdges` FIRST (so
  FR6 / label-vs-node / label-vs-crossing-edge de-collide the offset positions), mirrored
  byte-for-byte in the runtime twin. User accepts the broad reviewed snapshot churn.
  **Hard bar:** the edge line must read continuous under each label (no paint-over gap), and
  no label may overlap a node or another label after the offset.

## D2 — Sequence tier treatment
- **Phase:** plan
- **Question:** Sequence labels already ride 12px above their arrow; the residual issue
  is the opaque plate blanking crossing vertical dashed lifelines. How far do we go?
- **Options:**
  - A. **Tighten + accept** — unify `messageLabel` to the shared `labelPlateSize` (drop
     the wider `0.62·size+10`); accept the thin-dashed-lifeline crossing behind the
     tightened plate (standard; mermaid does the same). Trade-off: simple, low risk;
     lifeline crossing is reduced but not eliminated.
  - B. **Heavier treatment** — e.g. increase `LABEL_RISE`, or a lighter/semi-transparent
     plate so the dashed lifeline shows through. Trade-off: more layout/theme surface for
     a marginal gain.
- **gogo recommends:** **A** — pragmatic and standard; a thin dashed lifeline behind a
  tight label reads fine.
- **Status:** RESOLVED (user follows recommendation, 2026-07-15) → **A.** Unify
  `messageLabel` to the shared tightened `labelPlateSize`; accept the thin dashed lifeline
  crossing behind the tightened plate (standard).

## D3 — Additive CLI levers (option b)
- **Phase:** plan
- **Question:** Ship opt-in `--no-label-halo` (and/or `--label-padding <px>`) escape
  hatches alongside the default-look fix?
- **Options:**
  - A. **Defer** — keep the patch scoped to the default-look fix (D1 + D2), which is the
     bug fix. Trade-off: no escape hatch, but minimal scope.
  - B. **Ship `--no-label-halo`** now via the `--no-bridges`/`opts.bridges` plumbing
     pattern. Trade-off: additive option surface across library → element → CLI → runtime
     payload for a patch release.
- **gogo recommends:** **A** — additive levers are scope creep for a bug-fix patch; the
  default fix removes the reason to reach for them.
- **Status:** RESOLVED (user, 2026-07-15) → **A (defer).** No `--no-label-halo` /
  `--label-padding` in this patch; the offset fix removes the reason to reach for them.
