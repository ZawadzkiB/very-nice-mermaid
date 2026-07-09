# Decisions — feature `sketch-style`

Forks that needed a human call. gogo appends each as `D<n>` with options and a
recommendation, then records your answer as a `RESOLVED` block. This is the
audit trail that lets the pipeline pause and resume safely.

<!-- Template for each decision — copy and fill:

## D1 — <short title>
- **Phase:** <plan | implement | review | test>
- **Question:** <the fork, stated plainly>
- **Options:**
  - A. <option> — <trade-off>
  - B. <option> — <trade-off>
- **gogo recommends:** <A / B> — <one-line why>
- **Status:** OPEN        # OPEN | RESOLVED

### RESOLVED (user, <YYYY-MM-DD>)
<the decision, in the user's terms>
-->

## D1 — Style as a separate axis vs a new theme
- **Options:** A. **`--style clean|sketch` axis** orthogonal to `--theme` (sketch × light/dark/fancy). B. A new `sketch` theme (bundles a look + colors).
- **gogo recommends:** A — composes with any palette and with `edge.style`; more flexible.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-09)
A — sketch is a separate `--style` axis, orthogonal to `--theme`. (Plan accepted as-is.)

## D2 — How hand-drawn (user-facing, defaulted while away)
- **Options:** A. **Full rough.js-style sketch** — multi-stroke wobble, hachure fills, sketchy arrows (authentic Excalidraw). B. Light hand-drawn feel — single imperfect stroke + casual font.
- **gogo recommends:** A — the user explicitly loves the Excalidraw look and showed the reference image.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-09)
A — **full rough** (multi-stroke wobble, hachure fills, open sketchy arrowheads). User confirmed the default at the acceptance gate.

## D3 — Handwriting font
- **Options:** A. **Bundle an OFL font + embed** (base64 @font-face in SVG/HTML, register with resvg) — portable, no network, PNG works. B. System casual font fallback — zero bundle, but inconsistent/absent on many machines and unavailable to resvg.
- **gogo recommends:** A.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-09)
A — bundle an OFL hand font + embed (base64 @font-face; register with resvg). (Plan accepted as-is.)

## D4 — Deterministic roughness
- **Options:** A. **Seeded from a stable key** (node/edge id + vertex) — reproducible; snapshots + parity hold. B. Random jitter — non-deterministic, breaks snapshots/parity.
- **gogo recommends:** A (mandatory given the codebase's determinism rule).
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-09)
A — deterministic, seeded from a stable key (node/edge id + vertex index). (Plan accepted as-is.)

## D6 — Tier scope: flowchart-only (as-built) vs all native tiers (FR6)
- **Phase:** implement
- **Question:** The plan's FR6 says sketch "applies to the native tiers (flowchart/sequence/class/state)". As built, sketch covers the **flowchart** tier fully (SVG/PNG/HTML/interactive, byte-parity). Sequence/class/state + the mermaid fallback keep their own look (the CLI/element emit a *note*, not a silent skip). Extend now, or ship flowchart-only for v0.5.0?
- **Options:**
  - A. **Ship flowchart-only for v0.5.0** — proceed to review/test now; sequence/class/state sketch tracked as a follow-up. Delivers the demonstrated need (the rect→circle flowchart reference) with the full Excalidraw look.
  - B. **Expand to sequence/class/state now** — re-enter implement to add rough rendering to `renderSequenceSvg`/`renderClassSvg`/`renderStateSvg` (each is a separate renderer); larger effort before review.
- **gogo recommends:** A — the user's reference + core value is the flowchart look; the other native renderers are separate surfaces best done as a scoped follow-up. Non-flowchart `--style sketch` already degrades honestly (a note, not a no-op).
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-09)
B — **expand sketch to all native tiers now.** Re-enter implement to add rough rendering to sequence/class/state (renderSequenceSvg / renderClassSvg / renderStateSvg + their PNG/HTML/interactive paths) before review. Full FR6 coverage in v0.5.0.
- **Options:** A. **Own tiny generator** (`src/rough/`) — small, no new runtime dep, inlinable into the serialized runtime (parity), deterministic by construction. B. Depend on `rough.js` — battle-tested, but a new dep, harder to inline/keep in parity, and its RNG needs taming for determinism.
- **gogo recommends:** A.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-09)
A — our own tiny rough generator (`src/rough/`), inlinable into the serialized runtime for parity; no `rough.js` dependency. (Plan accepted as-is.)
