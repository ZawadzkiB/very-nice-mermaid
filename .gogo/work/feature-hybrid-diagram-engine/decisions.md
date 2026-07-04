# Decisions — feature `hybrid-diagram-engine`

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

## D1 — CLI rendering target for fallback types
- **Phase:** plan
- **Question:** Where must the mermaid.js fallback types render?
- **Options:**
  - A. **Browser-first** — mermaid renders every type in the lib/HTML (DOM is free); the CLI uses **jsdom** for fallback types (no Chromium), reporting any degraded case (FR5).
  - B. **CLI-renders-all** — the CLI shells out to mermaid-cli (Puppeteer/Chromium) for full-fidelity PNG of every type, at ~300MB browser + slower runs.
- **gogo recommends:** A — keeps the CLI browser-free for the core path; the spike confirms `mermaid.render` needs only a DOM. Degraded CLI cases are *reported*, not hidden (user's transparency requirement).
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-04)
Accepted with the plan ("Accept & implement") — option A per gogo's recommendation.

## D2 — Kanban tier
- **Phase:** plan
- **Question:** Is kanban a native re-skinned renderer or fallback-SVG?
- **Options:**
  - A. **Fallback-SVG** (mermaid renders it) — user-confirmed acceptable; kanban is new and column/card layout is low-value to hand-reskin now.
  - B. Native re-skin — more work for a niche, newest diagram type.
- **gogo recommends:** A.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-04)
"it is ok for kanban if this is only rendered svg one" — option A.

## D3 — How native non-flowchart types get structured data
- **Phase:** plan
- **Question:** For sequence/class/state/journey, where does the model come from?
- **Options:**
  - A. **Re-skin from mermaid's rendered SVG** — mermaid renders, we read node/edge/label geometry, then re-render with our themes. Uniform across types, robust; needs a DOM.
  - B. **Tap mermaid's internal diagram DB** — cleaner structured data, but unstable deep imports, per-type, version-coupled; also needs a DOM.
  - C. Hand-write parsers per type — no DOM, but reinvents mermaid × 4.
- **gogo recommends:** A — the spike showed the internal DB (B) is fragile/unstable and the clean `@mermaid-js/parser` doesn't cover these types; SVG re-skin is one uniform path.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-04)
Accepted with the plan ("Accept & implement") — option A per gogo's recommendation.

## D4 — mermaid.js as a dependency
- **Phase:** plan
- **Question:** How do we take on mermaid?
- **Options:**
  - A. **Dependency (ideally lazy/optional import)** — flowchart-only users don't pay the bundle cost until a fallback/native-reskin path needs it.
  - B. Vendor a copy — control but heavy maintenance.
  - C. Own parsers for all types — the reinvent-Mermaid trap (rejected earlier).
- **gogo recommends:** A.
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-04)
Accepted with the plan ("Accept & implement") — option A per gogo's recommendation.

## D5 — Transparent fallback diagnostics (user-requested, FR5)
- **Phase:** plan
- **Question:** How loud is a fallback / degradation?
- **Options:**
  - A. **Always report** — structured diagnostic (tier · reason · missing capability) to stderr; `--strict` escalates degradations to non-zero exit; `--quiet` mutes info. Never silent.
  - B. Silent fallback — simpler, but the exact debugging pain the user called out.
- **gogo recommends:** A — the user explicitly asked to "log this info properly ... so [we] won't need to debug it later."
- **Status:** RESOLVED

### RESOLVED (user, 2026-07-04)
"make sure when we try to use CLI to prepare something that is not possible and we run into fallback to log this info properly and show what happened" — option A.

## D6 — user-journey tier (post-spike refinement)
- **Phase:** implement (spike)
- **Question:** Is user-journey a native re-skin or fallback?
- **Options:**
  - A. **Fallback** — the spike found it's a bespoke smiley-timeline that doesn't map to our node/edge renderer; low interactivity value.
  - B. Native — significant bespoke renderer for a low-value type.
- **gogo recommends:** A.
- **Status:** RESOLVED

### RESOLVED (orchestrator, 2026-07-04)
Accepted the spike's recommendation — journey → fallback. Native round-2 scope = sequence + class + state. Logged in adjustments.md; plan FR2 refined.

## D7 — jsdom packaging
- **Phase:** implement (round 1)
- **Question:** Is jsdom a full runtime dependency or optional?
- **Options:**
  - A. **optionalDependency** (like resvg) — browser/lib-only consumers don't install jsdom + 167 transitive pkgs; CLI emits an FR5 "install jsdom" diagnostic when a Node fallback render needs it. Deferred to a polish task before v2 publish.
  - B. Full dependency — CLI fallback works out-of-box, but everyone installs ~87MB they may never use.
- **gogo recommends:** A.
- **Status:** RESOLVED

### RESOLVED (orchestrator, 2026-07-04)
Decided A (optional), **deferred** — round 1 shipped it as a full dep so the CLI works now; convert to optional + graceful-absence diagnostic before v2 publishes. Not blocking review.

## D8 — capability-unavailable exit code consistency (TEST-005)
- **Phase:** test
- **Question:** Should a `capability-unavailable` warning (e.g. ascii on a non-ASCII type) exit non-zero?
- **Options:**
  - A. **Exit 0 by default for BOTH native and fallback tiers; `--strict` escalates** — a warning shouldn't fail the command; consistent across tiers.
  - B. Keep the current split (fallback non-zero, native zero) — inconsistent for the same severity.
- **gogo recommends:** A.
- **Status:** RESOLVED

### RESOLVED (orchestrator, 2026-07-04)
Decided A — normalize to exit 0 by default, non-zero only under `--strict`, uniformly.

## D9 — CLI rendering of fallback types that degrade headless (TEST-004) — USER-FACING
- **Phase:** test
- **Question:** The CLI's jsdom can't render most non-pie fallback types (blank/degenerate SVG); the browser/lib renders them all. What should the CLI do?
- **Options:**
  - A. **Honest-failure now (do this round), Chromium path later if wanted** — detect degenerate output → clear error diagnostic ("renders in a browser"); never emit broken SVG. Ship v2 as: CLI = native types + pie + honest report for the rest; browser/lib = every type. (Matches D1 Browser-first + the user's transparency ask.)
  - B. **Flip D1 → add a Chromium/mermaid-cli path** so the CLI renders EVERY fallback type at full fidelity. Heavier (Chromium), a separate future round.
- **gogo recommends:** A now; B only if the user needs perfect CLI rasterization of every exotic type.
- **Status:** OPEN — honest-failure (A's fix) proceeds this round regardless; the A-vs-B choice for the CLI's long-term capability is the user's (asked separately, non-blocking).
