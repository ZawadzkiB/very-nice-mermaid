# Adjustments — feature `hybrid-diagram-engine`

Running log of user-requested changes / clarifications during planning.

- 2026-07-04: user confirmed **kanban** can be fallback-SVG only (not native re-skin).
- 2026-07-04: user requires the **CLI to log every fallback/degradation clearly** (what happened + why) so it is debuggable later.
- 2026-07-04 (post-spike, orchestrator): **user-journey dropped from the native tier → fallback** (D6). Spike found it's a bespoke smiley-timeline that doesn't map to our node/edge renderer; low re-skin value. Native round-2 scope = **sequence + class + state**.
- 2026-07-04 (post-spike, orchestrator): **jsdom → `optionalDependency`** (D7), deferred to a polish task before v2 publish, so browser/lib-only consumers don't install jsdom + 167 transitive packages. CLI emits an FR5 diagnostic to install it when a Node fallback render is attempted without it (mirrors the resvg pattern).
- 2026-07-04 (spike finding, must honor in round 2): stand up jsdom **before** the first `import("mermaid")` (its bundled DOMPurify freezes `.sanitize` at import time); use `htmlLabels:false` headless. class/state must **re-layout with our own dagre** — mermaid's headless geometry is degenerate.
