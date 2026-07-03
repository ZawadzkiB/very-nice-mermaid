# Code review — round 2 (re-review after fixes) · `mermaid-render-toolkit`

**Verdict: APPROVE.** All 5 round-1 findings are verified fixed — the blocker
(REV-001) and major (REV-002) security holes are genuinely closed at the source,
confirmed by re-running the exploits and probing the allowlist for bypasses.
One new **minor** (REV-006, pre-existing correctness gap) is filed for batching;
it does not block approval (no open/new blockers or majors). Advance to **test**.

- Reviewer: gogo-reviewer (fresh, skeptical eyes) · round 2
- Scope: the 4 fix commits `7962ede`, `0c8db89`, `c268f99`, `e14c5e0`
  (`src/parser/index.ts`, `src/render/svg.ts`, `src/render/dom/runtime.ts`,
  `src/render/dom/index.ts`, `README.md`, `src/export/html.ts` docstring, and
  the added/extended tests) plus a broad regression re-check.
- Gates re-run locally, all green: `npm run build`, `npm run typecheck`,
  `npm test` (**96** unit/integration tests, up from 89 — the 7 new ones cover
  these fixes; PNG rasterization included).

## Counts
| severity | verified (was open) | still open | new this round |
|---|---|---|---|
| blocker | 1 (REV-001) | 0 | 0 |
| major | 1 (REV-002) | 0 | 0 |
| minor | 3 (REV-003/004/005) | 0 | 1 (REV-006) |
| nit | 0 | 0 | 0 |
| **open/new blockers+majors** | | **0** | |

## Per-finding verification

### REV-001 · SVG attribute-breakout XSS — **VERIFIED (fixed)**
Root fix confirmed in `src/parser/index.ts`: `parseStyleProps()` now gates every
`fill`/`stroke`/`color`/`stroke-width`/`stroke-dasharray` value through
`isSafeStyleValue()` (allowlists `SAFE_COLOR`/`SAFE_WIDTH`/`SAFE_DASH`) and drops
anything else with an `unsafe-style-value` diagnostic. `src/render/svg.ts`
`renderNode()` additionally wraps `fill`/`stroke`/`stroke-width`/`color` in
`escAttr()` (defense in depth). Re-ran the exact exploit end-to-end (lib + CLI):
`style A fill:#fff" onmouseover="alert(document.domain)` and the same via
`classDef` — the emitted SVG contains **no** `onmouseover`/`alert`/`<script>`,
the hostile fill is dropped (node keeps the theme fill), and the SVG still parses
as valid XML. CLI `render -o hostile.svg` output is clean; stderr surfaces the
`warning [unsafe-style-value]` (not silently swallowed); `--strict` promotes it to
an error with a non-zero exit.

### REV-002 · CSS/`url()` network injection breaking FR8 zero-network — **VERIFIED (fixed)**
Closed by the same source sanitizer — no runtime change needed. `fill:url(...)`
fails `SAFE_COLOR` (parens/`url(`) and is dropped before serialization, so the
DOM runtime `cardStyle()` / HTML export never embed a remote reference. Re-ran
`renderHtml('… style A fill:url(http://evil.example/track.png)')` and the CLI HTML
export: **zero** occurrences of `evil.example` and **zero** fetchable/external
`url(` in the output. The added `test/export-html.test.ts` case guards this.

### REV-003 · runtime/shared-module drift, no parity guard — **VERIFIED (fixed)**
`src/render/dom/runtime.ts` `routePoints()` now applies a `simplify()` copy that
matches `src/geometry` `simplify()` (same 2-dp dedup + collinear removal), and
`styleForNode()`/`cardStyle()` now honor `stroke-width` (→ px CSS border) and
`stroke-dasharray` (→ dashed border), matching `resolveNodeStyle()` + `svg.ts`.
`test/dom-runtime-parity.test.ts` genuinely drives the **real** `vnmRuntime`
(imported from source, the same function `renderHtml` serializes via `toString()`)
through a minimal fake DOM and asserts (a) its edge `d` equals `geometry.routeEdge()`
— with an explicit check that `simplify()` collapsed the aligned route to a single
`L` segment, so a runtime that skipped `simplify()` would fail — and (b) its card
style equals `resolveNodeStyle()` (`border:4px dashed …`) point-for-point, with an
unstyled node keeping `1.5px solid`. It is a real drift guard, not a copy.

### REV-004 · rounded-card simplification undocumented — **VERIFIED (fixed)**
`README.md` now carries an "Interactive vs. static rendering" note (the SVG/PNG
draws full silhouettes; the interactive renderer + HTML export draw every node as
a rounded card, only the corner radius varying). The note is mirrored into the
`mount()` docstring (`src/render/dom/index.ts`) and the `renderHtml()` docstring
(`src/export/html.ts`).

### REV-005 · `unterminated-subgraph` hardcoded 1:1 — **VERIFIED (fixed)**
`openSubgraph()` records each subgraph's opening line/col in a `subgraphOpenPos`
map and the diagnostic reports it (falling back to 1:1 only if absent). Verified:
`flowchart TD\n subgraph s\n A-->B` reports the diagnostic at **line 2, col 2**
(the `subgraph` keyword), and the extended parser test asserts exactly that.

## Exploit-probe results (adversarial, did any bypass survive?)
Ran two batteries against the built `dist/` — **0 bypasses survived**:

| probe | outcome |
|---|---|
| attr breakout `#fff" onmouseover=…` (via `style` and `classDef`) | dropped + warned; no handler in SVG/HTML |
| `url(…)`, uppercase `URL(…)`, `image-set(url(…))` | dropped; no `evil.example`, no fetchable `url(` |
| CSS-escape `\75rl(…)`, backslash | dropped (backslash not allowlisted) |
| paren/`;` comment inject `#fff)/**/;x:url(…)` | dropped |
| `var(--x)`, `expression(alert(1))` | dropped (parens not in the color grammar) |
| single-quote / angle-bracket `#fff'…`, `#fff><script>` | dropped |
| `stroke-width:2px" onload="…`, `stroke-dasharray:4 4" onclick="…` | dropped via `SAFE_WIDTH`/`SAFE_DASH` |
| JS `$`-before-trailing-`\n` anchor bypass (`red\nonmouseover=x`) | rejected — JS `$` (no `m` flag) does not match before `\n`, so no multiline anchor bypass exists |
| benign kept: `#abc`, `#aabbccdd`, `red`, `rgb(10 20 30)`, `rgb(10 20 30 / 50%)`, `hsl(200 50% 40%)`, `2.5px`, `6 3` | rendered, no false-positive warnings |

The allowlist is anchored (`^…$`), excludes every breakout character
(`" ' < > ( ) ; } \\` whitespace / control), and the SVG sink escapes as a second
layer. No hostile value reaches a render sink; benign colors/widths/dashes pass.

## New finding
### REV-006 (minor, P3) · comma-form `rgb()`/`hsl()` colors are fragmented, dropped, and mislabeled "unsafe" — AGENT-FIXABLE
`parseStyleProps()` splits the property list on `,` **before** validating, so a
valid `fill:rgb(10,20,30)` / `fill:hsl(200,50%,40%)` is fragmented into `rgb(10` /
`20` / `30)`; the first fragment fails `SAFE_COLOR` and is dropped with an
`unsafe-style-value` warning (verified: `style A fill:rgb(10,20,30)` → `style={}`
+ warning; `fill:rgb(10, 20, 30),stroke:#333` → keeps only `stroke`). This is
**pre-existing** (the splitter predates the sanitizer) and **not** a security
hole — the fragment is correctly rejected — but it is a genuine correctness gap
the sanitizer made visible: a legitimate color silently loses styling (only the
space-separated form survives), and a benign value is mislabeled "unsafe".
Fix: make the comma split paren-aware (split at paren depth 0) so `rgb(10,20,30)`
reaches the allowlist intact (`SAFE_COLOR` already accepts it); add a parser test;
or, if comma-form is out of scope for v1, reword the diagnostic. Non-blocking.

## Regression re-check (from these changes)
- **No legitimate styling path broken.** Hex, named colors, space-form `rgb`/`hsl`,
  `rgb(… / …)` alpha, numeric+unit widths and space-form dash arrays all pass the
  allowlist unchanged; the canonical `fill:#f9f,stroke:#333,stroke-width:2px` is
  untouched. The only benign values now dropped are comma-form `rgb`/`hsl` — which
  were already broken pre-fix (stored as the truncated `rgb(10`) — see REV-006.
- **Diagnostics surfaced, not swallowed.** `unsafe-style-value` flows into
  `model.warnings`, is printed by the CLI, and becomes a hard error under `--strict`.
- **Determinism / perf.** The sanitizer is a per-value regex test at parse time
  (bounded, no backtracking risk on the anchored classes); `simplify()` in the
  runtime is the same O(n) pass as the static path. No new re-fetch/re-render.

## Route
No open/new blockers or majors → **review done, advance to test (④)**. REV-006
(minor) is batched for a future implement pass or a v1 scope note; it does not gate
this approval.
