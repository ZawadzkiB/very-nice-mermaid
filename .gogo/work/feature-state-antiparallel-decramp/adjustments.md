# Adjustments — feature `state-antiparallel-decramp`

Log of changes / clarifications asked for during planning and at the UAT gate.
Each entry: date · what changed · why.

## 2026-07-14 — plan accepted, D1 → A (elbow-only de-cramp)

User annotated the gallery thumbnails: **`clean·fancy` = the correct look** ("OK!"), and the
elbow variants (`clean·light`, `clean·dark`, `sketch·light`, plus `sketch·dark`) show
`fail`/`retry` **merging at one point** (red arrows) — which must not happen. User: "we either
need to do it as in fancy style or make those lines not crossing in other styles."

**Decision:** take the **"make the lines not cross"** path — the plan's elbow-stagger — rather
than converting clean/sketch to curved (that would erase the elbow-vs-curved style distinction
that *makes* fancy fancy). **Hard acceptance bar carried into implement/test:** the four elbow
variants must render `fail`/`retry` as two clearly-separated arrows, as clean as `clean·fancy`.
If elbow-stagger doesn't achieve that by eye, **escalate to curving only the anti-parallel pair**
(D1 option B, scoped to fail/retry). No change to the technical approach (FR1–FR5) otherwise.
