# Code review — round 1 · `mermaid-render-toolkit`

**Verdict: CHANGES (fix-then-approve).** One blocker + one major, both agent-fixable
and sharing a single root cause (user-supplied `style`/`classDef` values are neither
validated nor escaped). No user decision required. Route back to implement, then
re-review the same living list.

- Reviewer: gogo-reviewer (fresh eyes) · round 1
- Scope: entire greenfield tree (`0b024d2..7ff05f2`) — `src/**`, `test/**`, `e2e/**`,
  `fixtures/**`, `package.json`, `tsup.config.ts`, `README.md`
- Gates run clean locally: `npm run build`, `npm run typecheck`, `npm test`
  (89 unit + PNG rasterization) all green.

## Counts
| severity | count |
|---|---|
| blocker | 1 |
| major | 1 |
| minor | 3 |
| nit | 0 |
| **open/new total** | **5** |

## Blockers
### REV-001 · SVG output does not escape user style values → attribute-breakout XSS  (P0)
`src/render/svg.ts` interpolates the resolved `fill` / `stroke` / `stroke-width` /
text `color` straight into SVG attributes with no attribute escaping (`nodeShape`
~L162, `nodeText` ~L264). Those values come from the DSL `style` / `classDef`
statements. `strokeDasharray` *is* escaped (~L143), which shows the escaping was
known and simply missed on the others.

Verified: `style A fill:#fff" onmouseover="alert(document.domain)` renders
`<rect ... fill="#fff" onmouseover="alert(document.domain)" stroke=...>`. Opening
the CLI-produced `.svg` (or inlining it into HTML) executes the injected handler —
a stored XSS. This is the exact "must never break out" class the brief flags;
labels are handled, style values are not. Also reachable via `classDef` values.
**Fix:** run fill/stroke/stroke-width/color through `escAttr` (and preferably
validate style values at the source — that also closes REV-002).

## Majors
### REV-002 · DOM/HTML-export card style built from unsanitized values → CSS + network injection (breaks FR8)  (P1)
`src/render/dom/runtime.ts` `cardStyle` (~L372) concatenates `st.fill/stroke/text`
into a `setAttribute("style", …)` string. The statement splitter blocks `;`/`,`,
but a `url(...)` value contains neither. Verified: `style A fill:url(http://evil.example/track.png)`
survives into the standalone HTML export and renders `background:url(http://evil.example/track.png)`
— a live network fetch from a page whose headline guarantee (plan **FR8**) is
"zero network requests". The existing zero-network test only exercises benign
input, so it misses this (the same input trips that test's own external-url regex).
CSS-context, not script — hence major, not blocker — but it defeats an advertised
security property. Shares REV-001's root cause; a single value-sanitization fix
resolves both.

## Minors
- **REV-003 (P2)** — The inlined runtime's `mirrors src/geometry` / `mirrors render/style`
  copies have drifted with no parity test: `routePoints` omits the shared `simplify()`,
  and `styleForNode`/`cardStyle` ignore `stroke-width`/`stroke-dasharray` that the SVG
  path honors — so styled nodes render inconsistently between static SVG and the
  interactive/HTML view. Mirror the missing bits (or document them) and add a parity test.
- **REV-004 (P3)** — The interactive renderer + HTML export draw every shape as a
  rounded-rect card (in-scope simplification, flag 3) but this is undocumented in
  README; consumers will see a mismatch vs `renderSvg`/PNG. Add one doc line.
- **REV-005 (P2)** — `unterminated-subgraph` diagnostic hardcodes line 1 / col 1 instead
  of the subgraph's opening position (`src/parser/index.ts` ~L162). Record and report
  the real line/col.

## Verified clean (no finding)
- **Label escaping across all three sinks** — DSL labels flow safely: SVG uses `esc()`
  text content, the DOM uses `textContent`, and the HTML export escapes `<`/U+2028/U+2029
  in the embedded JSON. `</script>` and `<x>` in a label cannot break out (confirmed by
  test + manual check). The gap is *style values only* (REV-001/002), not labels.
- **Browser-safe core (FR11 / flag 2)** — built `dist/index.js` and `dist/element.js`
  contain no static Node built-in imports; `@resvg/resvg-js` appears only as a lazy
  `import()` inside `renderPng`, and `commander` is absent from both. `@dagrejs/dagre`
  is bundled in. Boundary holds.
- **Standalone HTML zero-network (FR8) for benign input** — no `<link>`, `<img>`,
  external `<script src>`, `@import`, or remote `url(...)`; only the inline runtime +
  system fonts + SVG namespace URIs. (Adversarial `url()` injection is REV-002.)
- **Parser robustness (flag 4/6)** — `A-->B` (no spaces), `graph TD`, trailing `;`,
  numeric ids, quoted + `<br/>` + unicode labels, `&` fan-in/out, middle-label and pipe
  edges, nested subgraphs, `classDef`/`class`/`:::`, `%%` comments and `%%{init}%%`
  directives all parse; the 6-file corpus parses with zero error-severity diagnostics.
  Diagnostics carry correct line/col (except REV-005). Exotic ends `o`/`x` and the
  `[A-Za-z0-9_]` id charset are documented simplifications.
- **Determinism (FR2)** — dagre layout keyed by stable insertion order + 2-decimal
  rounding; persistence key is a deterministic djb2 hash. Same input → same positions.
- **CLI (FR10)** — all four formats from file + stdin, format inference from extension,
  strict mode → line/col error + non-zero exit, unreadable-input error, PNG optional-dep
  hint. Exit codes correct.
- **Packaging (FR11 / npm pack)** — `files: [dist, README.md]`; `exports` (`.`,
  `./element`) and `bin` (`vnm`, `very-nice-mermaid`) all resolve to built `dist`
  artifacts; `dts` emits the referenced `.d.ts` files.

## Route
Back to **implement** with `--issues review/issues.json` (blocker + major), then
re-review (round 2, same living list). All findings are AGENT-FIXABLE; no decision gate.
