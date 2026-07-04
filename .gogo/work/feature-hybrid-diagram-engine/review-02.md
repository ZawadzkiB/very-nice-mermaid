# Review — round 2 · feature `hybrid-diagram-engine`

**Scope:** the three NEW native re-skinned renderers — **sequence**, **class**,
**state** — added over commits `0545453..HEAD` (9 commits). Fresh skeptical
staff-engineer eyes. The foundation/router/diagnostics/fallback (round 1) was
re-checked only where the native code touches it.

**Verdict: APPROVE** — no open blockers or majors. 3 new findings, all **minor/nit**
and AGENT-FIXABLE (batch them into the test phase or a quick follow-up).

Gates: `build` ✅ · `typecheck` ✅ · `test` **227/227** ✅ · `e2e` **33/33** (Chromium) ✅.

---

## Severity counts (this round's NEW findings)

| Severity | Count | Ids |
|---|---|---|
| blocker | 0 | — |
| major | 0 | — |
| minor | 2 | REV-005, REV-006 |
| nit | 1 | REV-007 |

Prior round-1 findings **REV-001 (major), REV-002, REV-003, REV-004** → re-verified
**closed** (`verified`) this round: their regression tests pass on the current
build and the native readers reuse the same fixed helpers/paths.

---

## New findings

### REV-005 — minor · P2 · `new`
**State reader misclassifies a user state named `start`/`end` (or `*_start`/`*_end`) as a `[*]` pseudo-state — drops its label and renders it as a marker.**
`classifyState()` (`src/native/state/read.ts:62-66`) keys on the state NAME via
`/(^|_)start$/` / `/(^|_)end$/`. Verified against the built CLI: a diagram with
states `process_start` and `session_end` renders both as a start-disc / end-ring
with their **labels dropped** (readNodes blanks the label of any non-normal kind).
Dumping mermaid's real node structure shows the genuine pseudo-states are
distinguishable *structurally* (start = `circle.state-start`; end = class
`default` + empty text; a normal state — even one named `end` — is class
`statediagram-state` with non-empty text), so the name regex only adds false
positives. Uncovered by tests (state-read uses PascalCase; state-svg feeds
pre-classified nodes).
**Fix (AGENT-FIXABLE):** classify purely on structural signals; drop the name
regex (or gate it behind the `default` class). Add a regression test with
`process_start`/`session_end`/`end` staying `kind:normal` with labels intact.

### REV-006 — minor · P2 · `new`
**Class relation endpoint recovery can silently mis-pair on ambiguous underscore splits.**
`splitEnds()` (`src/native/class/read.ts:118-129`) chooses the leftmost valid
underscore split of mermaid's undelimited `id_<From>_<To>_<n>`. Verified: with
classes `A`, `A_B`, `B_C`, `C` present, the real relation `A_B --> C` is recovered
as `A --> B_C` — a **silent wrong-relation** with `warnings: []`. Low likelihood
(needs colliding underscore names) but silent-wrong-data, uncatchable by eye.
**Fix (AGENT-FIXABLE):** disambiguate with the edge path's endpoint geometry
(nearest node center — the state reader already does this), or emit the existing
`class-relation-unrecoverable` warning when more than one split is valid and
geometry can't decide. Add the collision regression test.

### REV-007 — nit · P3 · `new`
**Unlabeled sequence messages keep mermaid's U+200B placeholder as their label, drawing a stray label plate.**
`readMessages()` (`src/native/sequence/read.ts`) uses `.trim()`, which does not
strip U+200B; mermaid emits a lone zero-width space for an empty label, so an
unlabeled message ends up with `label === "​"` (truthy). Every sink guards on
`if (m.label)`, so an effectively-empty label still renders a ~18px
edge-label-background `<rect>` + invisible `<text>` and nudges the column gap.
Common case (unlabeled reply/return arrows); cosmetic only.
**Fix (AGENT-FIXABLE):** strip zero-width chars and treat whitespace-only as
empty so unlabeled messages carry `""` and draw no plate.

---

## What I verified clean

- **SECURITY — user text from mermaid's SVG into our sinks: SAFE.** Hostile-label
  probe (participant/message labels, class names + member/method rows + relation
  labels, state names + transition labels) with payloads `<script>alert()</script>`,
  `"><script>`, `]]>`, `onerror="…"`, `List~script~`, `& < >`:
  - **SVG** (all three types): every `<`/`>`/`&` escaped at the sink via
    `escapeXml`/`escapeXmlAttr`; the only live `onerror="` seen was **text content**
    of a `<text>` element (inert, valid XML), not an attribute. 0 breakouts.
  - **Interactive DOM** (class/state reuse `vnmRuntime`): node labels + compartment
    text set via `inner.textContent` and edge labels via `text.textContent` — inert.
  - **HTML export**: `embedJson` escapes `<` → `<` (no `</script>` breakout);
    class/state payloads carry escaped labels; the sequence `seqRuntime`
    `world.innerHTML = payload.svg` receives an already-escaped SVG. 0 live
    `<script>alert`, 0 live `<img`/`onerror` outside a JS string.
  - **v1 style-value sanitization + zero-network HTML still hold**: REV-001
    injection + `url()` regressions (`mermaid-fallback.test.ts`) and
    `export-html.test.ts` zero-network/style tests pass.
- **Read-fidelity (the correct cases):** class relation `(from,to,head,type)`
  recovery is correct for all six UML types — inheritance `A <|-- B` puts the
  triangle on **A** (`head:"from"` → `marker-start`), tested + asserted at the SVG
  marker level; empty class, 1-participant + self-message sequence, and mermaid's
  auto-declared relation target all degrade gracefully (exit 0, no throw). The
  `-state-`/`-classId-` node-id anchoring fix is correct (no sibling issue in class).
- **Determinism (FR2/NFR):** rendered each fixture twice → **byte-identical** SVG
  for sequence, class and state. No `Date.now`/`Math.random`/`performance.now` in
  the new code (only a comment).
- **Browser-safe core (FR8):** built `dist/index.js` and `dist/element.js` carry
  **no** static Node/mermaid/jsdom/resvg imports — every sensitive reference is a
  lazy `await import('mermaid'|'jsdom'|'@resvg/resvg-js')`; the class/state readers
  use the same `needsHeadlessDom()`-gated `loadMermaid` path (no new DOM setup).
- **Reuse correctness:** class/state reuse `layout()` + `buildPayload` + `vnmRuntime`
  with no shared mutable state; `dom-runtime-parity` guard green (runtime not
  forked). `seq-runtime.ts` is self-contained and serialized/escaped safely
  (`embedJson`), no parity drift with the flowchart runtime.
- **FR4/FR5 contract:** `-f md` on class/state emits `capability-unavailable warn
  native capability=ascii` and **exits 0** (exit **1** only under `--strict`);
  `--quiet` mutes info but keeps the warn (correct). Sequence ASCII present +
  fenced. No native type emits a spurious fallback diagnostic.
- **Tests meaningful:** per-theme (light/dark/fancy) snapshots, XML-validity,
  arrowhead-marker-per-type, XML-escaping, and label-pairing-with-unlabeled-edges
  are all asserted (not smoke). e2e covers drag→re-route + pan/zoom + zero console
  errors for class/state/sequence.

## Hostile-label security probe — outcome

**PASS / 0 breakouts.** Crafted class/state/sequence `.mmd` inputs with
`<script>`, `"><script>`, `]]>`, `onerror="…"`, `List~script~`, `& < >` in every
user-derived position and rendered them through the built CLI to SVG and HTML.
All special characters are escaped at every SVG text/attribute sink, the
interactive DOM path uses `textContent`, and the HTML JSON payload escapes `<` to
`<`. No executable injection reached any output.

---

*JSON contract: `review/issues.json` (round 2). Route: no open blockers/majors →
advance to test; batch REV-005/006/007 (all AGENT-FIXABLE) into the hands-on
test pass or a quick follow-up.*
