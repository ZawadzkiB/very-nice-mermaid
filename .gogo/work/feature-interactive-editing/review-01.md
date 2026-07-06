# Code review — `interactive-editing` — round 01

_Snapshot of `review/issues.json` (the contract). Fresh-eyes review against
`plan.md` (FR1–FR5), `code-review-standards.md`, `coding-rules.md`,
`non-functional-requirements.md`._

## Gates (verified independently)
- `npm run build` — **pass** (tsup, 0.3.0).
- `npm run typecheck` — **pass** (`tsc --noEmit`).
- `npm test` — **278 / 278 pass** (25 files). Confirms the developer's claim.
- Geometry NUL-byte claim — **confirmed**: HEAD `src/geometry/index.ts` held 2 NUL
  bytes on the label-pair key line; the working file is clean UTF-8 (0 NUL).

## Plan fidelity
- **FR1 resize** — resize handles + live re-anchor + min clamp + size persistence
  (`exportLayout` sizes, `applyPositions` sizes, CLI `--layout` sizes): present and
  unit-covered. OK.
- **FR2 perimeter distribution** — realized as `raySide` (direction-based,
  aspect-aware side selection) + within-side channel spread, shared in
  `src/geometry` and mirrored in the runtime. This matches the plan's own FR2
  wording ("chosen by the direction to its other endpoint … spread around the
  border, not clustered on one side") and D1=A; it is **not** continuous arclength,
  which the plan never required. Hub tests show 4 distinct sides (symmetric hub)
  and ≥3 sides (5-edge hub). **Satisfied per the plan.**
- **FR3 export** — Save SVG (data-URI) + Save PNG (`<canvas>` rasterize) toolbar
  buttons ship in the runtime (hence in the standalone HTML). `toSvgString()` is
  byte-parity-guarded vs `renderSvg` after drag+resize (light+fancy). OK, with the
  coverage caveat in REV-001 and the PNG error-handling gap in REV-003.
- **FR4 persistence** — positions + sizes round-trip `exportLayout`→JSON→
  `importLayout` and localStorage; only resized nodes persisted. Unit-covered. OK.
- **FR5 parity & determinism** — no `Date.now`/`random` in the paths touched;
  parity guard extended for hub distribution, resize re-route, size round-trip, and
  `toSvgString` byte-parity. Strong — but see REV-001 (shape/subgraph coverage).
- Out-of-scope (manual anchor drag, sequence resize, label editing) respected.

## Findings

| id | sev | pri | status | title |
|----|-----|-----|--------|-------|
| REV-001 | major | P1 | new | `toSvgString` byte-parity guard omits subgraphs and 6/10 node shapes |
| REV-002 | minor | P2 | new | Save PNG evades the zero-network `url(` guard via bracket-notation `toDataURL` + `setAttribute("src")` |
| REV-003 | minor | P3 | new | `savePng` has no error handling — silent failure on rasterize |
| REV-004 | nit | P3 | new | `RoutedEdge.ports` shape changed — breaking for external model consumers |
| REV-005 | nit | P3 | new | Drive-by NUL→space delimiter in the label-pair key slightly weakens collision-safety |

### REV-001 — `toSvgString` byte-parity guard omits subgraphs and 6/10 node shapes — **major / P1** — AGENT-FIXABLE
`runtime.ts` `buildSvg`/`svgShape`/`svgSubgraph`/`svgNodeText`/`svgEdgeLabel`
(~200 lines) inline-duplicate `src/render/svg.ts`. The byte-parity test
(`test/dom-runtime-parity.test.ts:451-473`) drives one model exercising only
**rect / diamond / stadium / cylinder** and **no subgraphs**. The inlined branches
for `rounded, subroutine, circle, hexagon, parallelogram, parallelogram-alt` and
the whole `svgSubgraph()` are unguarded. I diffed both files: **no live drift
today**, and bounds parity holds (both pad 20, both include subgraph boxes) — this
is a guard-coverage gap, not a live bug. But this is the exact "serialized-runtime
drift" class the project's standards + twice-reopened history flag as highest-risk,
on a brand-new serializer whose D4/"parity-guarded" design depends on this test.
**Fix:** extend the byte-parity test with a titled subgraph + each remaining shape,
for light and fancy.

### REV-002 — Save PNG evades the zero-network `url(` guard — **minor / P2** — AGENT-FIXABLE
`savePng` (runtime.ts:1315-1335) uses `(canvas)["toDataURL"]("image/png")` and
`img.setAttribute("src", dataURI)` **specifically** to pass the export-html guards
(`/url\(…/i` and `/src\s*=/i`), documented in a code comment. Functionally benign
(data-URI, no network) — the guard's *intent* holds — but obfuscating a call to
slip past a privacy guard is a fragile, self-documented escape hatch; the real
defect is the guard's coarse regex false-positiving on `toDataURL(`. **Fix:**
tighten the regex to match only a CSS `url(` token (exclude an identifier char
before it) and use the plain call, or switch to the planned `toBlob` +
`URL.createObjectURL` (D3), which trips neither guard.

### REV-003 — `savePng` has no error handling — **minor / P3** — AGENT-FIXABLE
No `img.onerror` (a failed SVG load silently yields no download), silent
`if (!ctx) return`, and no guard around `toDataURL` (a tainted canvas throws
uncaught). Violates NFR "no silent failures — surface errors clearly." Rasterize
path is unit-uncovered (jsdom can't rasterize) — expected; phase ④ owns the e2e.
**Fix:** add `onerror` + null-ctx diagnostics and wrap `toDataURL` in try/catch.

### REV-004 — `RoutedEdge.ports` shape changed — **nit / P3** — AGENT-FIXABLE
`{source:number,target:number}` → `{source:{side,offset},target:{side,offset}}` on
the public `RoutedEdge`. Breaking for external consumers of `edge.ports`;
`layout.json` sidecar is unaffected. Acceptable under 0.x + the 0.3.0 bump, but
call it out in the changelog.

### REV-005 — NUL→space delimiter drive-by — **nit / P3** — AGENT-FIXABLE
Label-pair key `e.from + " " + e.to` (was `"\x00"`). Removing the NUL is the right
call (it made the blob binary), but a space is a weaker delimiter — distinct pairs
could collide *if* an ID ever contained a space (cosmetic label mis-stagger only;
IDs are space-free today). Runtime + geometry share the delimiter, so parity holds.
**Fix:** use an ID-safe delimiter (e.g. `|`) or note IDs are space-free.

## Notes for phase ④ (test) to exercise
- **Save PNG for real** (jsdom can't): a valid PNG downloads, sensible filename,
  **no console errors**, and the data-URI SVG → `<img>` → canvas → `toDataURL` does
  **not** throw a `SecurityError` (canvas not tainted).
- **Save SVG/PNG on a diagram with subgraphs + varied shapes** (hexagon,
  parallelogram, subroutine, circle, rounded) to catch any `toSvgString` drift the
  unit parity test does not cover (REV-001).
- **Resize via real pointer events** (pointer capture) → card + edges update + stay
  distributed → **reload keeps size *and* position** (localStorage).
- **Standalone-HTML zero-network at runtime**: clicking PNG issues **no** network
  request (the `toDataURL` path).

## Verdict
**CHANGES** — 1 open major (REV-001: parity guard coverage gap on the new
`toSvgString` serializer). Build/typecheck/tests are green and all FRs are met, but
the project's own hard rule (cover the inlined runtime's changed/new render path)
is not fully satisfied. The 2 minors + 2 nits can batch with the fix.
