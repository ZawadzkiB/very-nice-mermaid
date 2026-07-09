# Review 01 — feature `sketch-style` (phase ③)

Date: 2026-07-09 · Reviewer: gogo-reviewer (fresh eyes) · Round: 1

Scope reviewed: the `--style clean|sketch` axis — deterministic rough generator
(`src/rough/index.ts`), its inlined `vnmRuntime` twin, the bundled OFL font
(`src/render/sketch-font.ts`, base64 `@font-face`), flowchart sketch in
`src/render/svg.ts`, the shared native helper `src/render/sketch-svg.ts` +
sequence/class/state renderers, PNG font registration, HTML/interactive
threading, CLI/element/library wiring, and the new tests.

Verified locally: `vitest run` on `rough`, `dom-runtime-parity`,
`render-svg-sketch`, `render-native-sketch` → **48/48 green**, including the new
byte-parity guard (`toSvgString() == renderSvg` in sketch after drag+resize, and
a subgraph + every remaining shape).

## What holds up well

- **Determinism (hard rule) is clean.** No `Date.now`/`Math.random`/
  `performance.now` anywhere in a render path. Jitter is FNV-1a seed → mulberry32
  keyed on node/edge id (+ stable suffixes `#f`/`#o{n}`/`#e{n}`/`#a`/`#x{i}`/
  `@end`/`@start`). Same input → byte-identical output; tests assert it.
- **DOM-runtime parity.** `src/render/dom/runtime.ts` mirrors `src/rough`
  function-for-function; the `SK_*` constants equal `SKETCH.*`, `nAt` == `rn`
  (both round to 2 dp), and the RNG/stroke/arrowhead/shape-point bodies match.
  The parity test drives the real runtime in sketch mode and byte-compares, so
  drift is caught. Both copies carry the `ROUGH-PARITY` warning comments.
- **Security / zero-network.** The `@font-face` uses a same-document
  `url(data:font/woff2;base64,…)` — no fetch. User `style`/`classDef` values
  still flow through the existing allowlist + `escAttr` sinks (unchanged); the
  font is trusted, not user input. `export-html` + native-sketch tests assert
  no external `url(`, `<link>`, `@import`, or fetchable `http(s)`.
- **Browser-safety.** `Buffer` in `png.ts` is confined to `sketchFontBytes()`,
  reached only via the resvg (Node) path — not at module top-level. The tsup
  bundle boundary is unchanged (resvg still external + lazy-imported).
- **Clean-mode byte-identity.** Every clean branch is untouched; sketch is a
  strictly additive `if (sketch)` fork in each renderer. Existing snapshots pass.
- **Plan/decision fidelity.** D1 (separate axis), D2/D4 (multi-stroke seeded
  wobble), D3 (bundled Kalam OFL + resvg registration), D6=B (all native tiers)
  are all delivered; class relations keep UML head markers on a hand-drawn line;
  state pseudo-state dots stay clean.

## Findings (all minor / nit — no blockers, no majors)

| id | sev | pri | title |
|----|-----|-----|-------|
| REV-001 | minor | P2 | ~30KB base64 font ships in the browser-safe core for every consumer (intended per D3; flag + document) |
| REV-002 | nit | P3 | Dotted flowchart edges render dashed (fragmented) open arrowheads in sketch mode |
| REV-003 | minor | P2 | Fallback+sketch degradation note is CLI-only; library API + custom element ignore the style silently |

### REV-001 — font weight in the browser core (minor, P2)
`svg.ts` imports `sketch-font.ts` at top-level and `renderSvg` reaches the base64
const unconditionally, so it cannot be tree-shaken — clean-only consumers pay the
~30KB. This is the deliberate D3 tradeoff (embed for portability) but cuts against
D5's "keep the browser-safe-core bundle small" justification. Recommend accepting
and documenting the bundle delta, or a product decision on a lazy sketch subpath.

### REV-002 — dashed sketch arrowheads on dotted edges (nit, P3)
In `sketchEdgePath` (svg.ts ~L159) the `stroke-dasharray="2 5"` for dotted edges
is folded into the shared stroke attr applied to the arrowhead sub-paths too (and
matched in the runtime twin), fragmenting the short open V. Native sequence/state
already draw solid sketch arrowheads. Fix: omit `dash` on the arrowhead sub-path
in both copies; add a dotted-edge case to the sketch parity test.

### REV-003 — silent style drop off the CLI path (minor, P2)
The honest "note, not a no-op" for fallback-tier + sketch lives only in
`cli/run.ts`. `renderSvgAsync`/`renderHtmlAsync` and the `<very-nice-mermaid
sketch>` element forward/ignore the style with no diagnostic, contradicting the
as-built claim ("CLI/element emit a note") and the standing "library must route,
not just the CLI" gotcha. Impact is low (correct render, just silent). Fix: have
the element warn; clarify or wire a diagnostic for the string-returning API.

## Notes (not tracked as issues)
- Two hand-maintained rough copies (src/rough + runtime twin) are an inherent
  cost of the serialized-runtime architecture; the extended parity test is the
  right guard and now covers the sketch path (drag/resize + all shapes + subgraph).
- The soft rough fill (not hachure) is an accepted, plan-sanctioned deviation
  ("or soft solid" in FR2); reads as authentic. No action.

---

**Verdict: APPROVE** (no open blockers or majors; REV-001–003 are minor/nit follow-ups)
