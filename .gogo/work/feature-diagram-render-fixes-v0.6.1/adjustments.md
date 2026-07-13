# Adjustments — feature `diagram-render-fixes-v0.6.1`

Log of changes / clarifications requested during planning (and, later, at the UAT gate).

## 2026-07-13 — plan accepted (D1-D5 resolved)

- **D1 → A**, **D2 → A** (dark-parity light-edge contrast), **D3 → A** (fix both Issue-1
  sub-bugs). Accepted as recommended.
- **D4/D5 → A, simplified.** User clarified: the 4 state-diagram gallery variants
  (`clean·light` / `clean·dark` / `clean·fancy` / `sketch·light`) are **the same diagram
  rendered in different styles — there is NO separate DSL** for the sketch variant. So the
  `example-sketch.png` hero is just an existing fixture (state machine →
  `fixtures/state-machine.mmd`) rendered with `--style sketch`. **No byte-identical
  archaeology** — re-render it fresh with the current sketch renderer (a look refresh for
  that one hero is acceptable/desired). Add `scripts/generate-heroes.mjs` to capture all 4
  hero recipes so this provenance question can't recur.

No changes to the plan's technical approach (FR1-FR4) — the D4/D5 steer only simplifies the
sketch-hero handling already anticipated in Changes-checklist steps 6-7.
