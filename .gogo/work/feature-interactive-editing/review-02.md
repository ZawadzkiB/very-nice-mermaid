# Code review — `interactive-editing` — round 02 (re-review after fixes)

_Snapshot of `review/issues.json` (the contract). Round 01 raised 1 major + 2 minor
+ 2 nit; implement fixed all 5 (fixed_in_round 1). This round verifies each fix
skeptically against the actual code + standards._

## Gates (verified independently)
- `npm run build` — **pass** (tsup, 0.3.0).
- `npm run typecheck` — **pass** (`tsc --noEmit`).
- `npm test` — **280 / 280 pass** (25 files); +2 vs round 01, exactly the new
  subgraph+shapes byte-parity loop (light + fancy). Confirms the developer's claim.
- **Both twins NUL-free:** `src/geometry/index.ts` = 0, `src/render/dom/runtime.ts`
  = 0. Confirmed the round-01 premise correction: `HEAD:src/render/dom/runtime.ts`
  held **2 NUL bytes on line 446** (`e.from + "\x00" + e.to`) — the runtime twin
  was a binary blob too, not just geometry. Now clean UTF-8 in both.

## Fix verification

| id | sev | status | verified? |
|----|-----|--------|-----------|
| REV-001 | major | verified | yes |
| REV-002 | minor | verified | yes |
| REV-003 | minor | verified | yes |
| REV-004 | nit | verified | yes |
| REV-005 | nit | verified | yes |

### REV-001 — parity guard coverage — **VERIFIED**
`test/dom-runtime-parity.test.ts:482-526` adds a second byte-parity loop (light +
fancy) over DSL that produces a **titled subgraph** (`Cluster One`) + all six
previously-uncovered shapes (rounded/subroutine/circle/hexagon/parallelogram/
parallelogram-alt). It (a) asserts each of those shapes and the subgraph title are
actually present in the parsed model (so the DSL can't silently stop exercising a
branch), (b) drags `Hx` + resizes `Pl` then asserts `handle.toSvgString()` ===
`renderSvgFromModel(editedModel, theme)` byte-for-byte, (c) `XMLValidator.validate`,
and (d) positively asserts the new branches rendered (`Cluster One`,
`stroke-dasharray="4 4"`, `<ellipse>`, `<polygon>`). This is exactly the guard the
finding asked for. Consistent with round-01's manual diff, it exposed no live drift.

### REV-002 — guard-evasion removed, NFR preserved — **VERIFIED**
`savePng` (runtime.ts:1318-1356) now uses plain `canvas.toDataURL("image/png")`
(runtime.ts:1346) and `img.src = "data:image/svg+xml…"` (runtime.ts:1355) — no
bracket cast, no `setAttribute` dodge. The guards in `test/export-html.test.ts` were
tightened, and I independently checked the two new regexes: the CSS-url guard
`/(^|[^\w-])url\(…/i` still catches `background:url(http://evil)` (preceded by `:`)
and `url(#vnm-arrow)` is still allowed, while `toDataURL(`/`createObjectURL(` no
longer false-positive; the src guard `/\bsrc\s*=\s*['"]?\s*(?:https?:)?\/\//i` still
catches `http(s)://` and protocol-relative `//`, and allows same-document `data:`
URIs. A `data:` URI triggers no network fetch, so the zero-network NFR is intact.
`<script src=>`/`<img>`/`<link>` still have their own dedicated guards (unchanged).

### REV-003 — no silent failures — **VERIFIED**
`savePng` now reports every miss via a guarded `win.console.error`: `img.onerror`
(runtime.ts:1353), an explicit null-`getContext` branch (1335-1338), and try/catch
around `toDataURL` (1345-1350). No silent no-op remains (NFR). Actual rasterize is
still jsdom-unrunnable — correctly deferred to phase ④ e2e.

### REV-004 — breaking change documented — **VERIFIED**
`README.md` carries a "0.3.0 breaking change (model API)" blockquote: `RoutedEdge.
ports.source/target` are now `{ side, offset }`; consumers reading them as numbers
must read `.offset`; `layout.json` sidecar unaffected. Repo has no `CHANGELOG.md`,
so README is the release-notes surface — reasonable.

### REV-005 — ID-safe delimiter, both twins clean — **VERIFIED**
Label-pair Map-key delimiter is now `|` in both twins (`src/geometry/index.ts:208`,
`src/render/dom/runtime.ts:540`), matching the existing side-key convention. `|`
cannot occur in a node id (parser identifiers / mermaid reserves `|` for edge
labels), so distinct unordered pairs never collide; the pair key is only used for
grouping (never sliced back), so `|` introduces no parsing ambiguity. Both files
are 0 NUL. Output unchanged — byte-parity across all 280 tests.

## Regression sanity
`git diff HEAD` remains the whole uncommitted feature diff; the round-02 delta is
confined to `test/dom-runtime-parity.test.ts`, `test/export-html.test.ts`,
`src/render/dom/runtime.ts` (savePng + delimiter), `src/geometry/index.ts`
(delimiter), and `README.md`. Build + typecheck + 280 tests green; no unrelated
behaviour changed.

## Notes for phase ④ (test) — carried forward
- **Save PNG for real** (jsdom can't rasterize): valid PNG downloads, sensible
  filename, no console errors, and data-URI-SVG → `<img>` → canvas → `toDataURL`
  does not throw `SecurityError` (canvas not tainted).
- **Save SVG/PNG on a diagram with subgraphs + varied shapes** (now unit-guarded by
  REV-001's loop, but exercise the real download/rasterize end-to-end).
- **Resize via real pointer events** (pointer capture) → card + edges update + stay
  distributed → reload keeps size **and** position (localStorage).
- **Standalone-HTML zero-network at runtime**: clicking PNG issues no network request.

## Verdict
**clean** — all 5 round-01 findings verified fixed; 0 open/new blockers or majors.
Build/typecheck green, 280/280 tests pass, FR1–FR5 met, NFRs upheld. Advancing to
phase ④ (test).
