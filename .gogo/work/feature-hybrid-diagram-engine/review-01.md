# Review — round 1 · feature `hybrid-diagram-engine`

**Verdict: CHANGES** — 1 open **major** (theme-value injection into the fallback
SVG `<style>`). Everything else is minor/nit. The foundation is otherwise solid:
the browser-safe-core boundary, the jsdom→mermaid ordering, router correctness,
and the FR5 diagnostics channel all hold up under adversarial probing.

Scope: 4 commits `165e8ab..241bb7b` — deps (mermaid + jsdom, external/lazy),
diagnostics channel, `src/mermaid/` (router · fallback · jsdom-env · theme-map),
`src/export/png.ts` (`renderPngFromSvg`), CLI tier routing + `--strict`/`--quiet`.
Build ✅ · typecheck ✅ · 157/157 tests ✅ (verified locally).

Deferred items D7 (jsdom still a full dep) and e2e-not-run are known and NOT
re-filed here.

---

## Findings

### major

- **REV-001 · P1 · new · [AGENT-FIXABLE]** — *Theme token values reach mermaid
  `themeVariables` unsanitized → CSS breakout + `url()` network-fetch in the
  fallback SVG `<style>`.*
  `toMermaidTheme()` (`src/mermaid/theme-map.ts:27-59`) copies `font.family`,
  `font.size` and every `colors.*` verbatim into mermaid's config; mermaid emits
  them into the SVG `<style>`, and `resolveTheme()` deep-merges raw `--theme`
  JSON with **no** allowlisting. Proven end-to-end: a theme with
  `font.family = "sans; } body { display:none } .z { x:url(http://evil/y)"`
  yields an SVG whose `<style>` contains `font-family:sans;} body{display:none}
  .z{ … url(http://evil/y)}` — a top-level injected rule + a network fetch.
  `wrapFallbackHtml()` inlines that SVG into the page `<body>`, so the unscoped
  rules hit the whole document. Colors are only *incidentally* guarded (mermaid
  throws → a hard `render-failed`, not the graceful source-drop the rule wants);
  `font-family`/`font-size` are unguarded. Violates `coding-rules.md`
  ("Sanitize user style values at the source … Never interpolate them raw") and
  the style-value-injection gotcha in `code-review-standards.md` (prior REV-001
  blocker / REV-002 major). Both `toMermaidTheme` and `renderFallbackSvg` are
  public `.` exports. *(Major, not blocker: the primary attacker surface — DSL
  labels — is safe here via `htmlLabels:false`; this is the theme/config
  surface.)*
  **Fix:** allowlist/validate tokens in `toMermaidTheme` (color regex; font-name
  charset dropping `; { } ( ) < > : url`; numeric `font.size`) and emit an FR5
  theme-token-dropped diagnostic — do not rely on mermaid throwing.

### minor

- **REV-002 · P2 · new · [AGENT-FIXABLE]** — jsdom `virtualConsole` leaks raw
  "Not implemented: HTMLCanvasElement…getContext" stack traces to stderr on
  hard-fail types (mindmap/architecture), printed *before* the clean
  `render-failed` diagnostic — polluting the structured FR5 channel.
  `src/mermaid/jsdom-env.ts:98-103` builds `new JSDOM(...)` with no
  `virtualConsole`. Render still fails cleanly (exit 1) — cosmetic, not
  functional. **Fix:** pass a `VirtualConsole` that swallows/routes `jsdomError`.

- **REV-003 · P2 · new · [AGENT-FIXABLE]** — Node detection
  (`inNodeRuntime()`, `router.ts:64-66`) keys only on `process.versions.node`,
  so in an Electron renderer or a jsdom/happy-dom test env (Node + a *real*
  window/document) a single fallback render replaces the live DOM with headless
  jsdom and mutates globals + `SVGElement.prototype` process-wide. Plain browser
  is safe (no `process`). **Fix:** gate jsdom setup on the *absence* of a usable
  DOM (`typeof window === "undefined" || !globalThis.document?.createElementNS`).

### nit

- **REV-004 · P3 · new · [AGENT-FIXABLE]** — `classify()` (`router.ts:130`) runs
  `await loadMermaid()` outside the try/catch that guards only `detectType`, so a
  loader rejection would abort even inputs that route to the native (no-mermaid)
  tier (header-less `A-->B`, garbage). Latent today (mermaid+jsdom are full
  deps); bites once the loader can fail (the D7 direction). **Fix:** treat a
  loader failure like an undetectable type → `nativeFlowchart(null)`.

---

## What I verified clean (the 6 load-bearing risks)

1. **Browser-safe-core boundary (FR8) — CLEAN.** Built output checked, not just
   source: `dist/index.js` and `dist/element.js` carry **zero** static external
   imports; the only external references are dynamic `import('mermaid')`,
   `import('jsdom')`, `import('@resvg/resvg-js')`. `dist/element.js` has no
   dynamic imports at all. Importing `dist/index.js` in Node pulls no
   mermaid/jsdom/Node-builtin. mermaid + jsdom marked external in `tsup.config.ts`.
2. **jsdom-before-mermaid ordering — CLEAN.** The sole `import("mermaid")` in the
   codebase lives in `loadMermaid()` *after* an awaited `ensureNodeDom()`;
   memoized once; no static mermaid import anywhere. (Two edge cases around the
   "corrupt a real DOM" sub-question spun off as REV-003.)
3. **Router / silent-misparse fix (FR1) — CLEAN.** Explicit `flowchart`/`graph`
   short-circuits with no mermaid load; known non-flowchart → fallback; garbage →
   clear "no diagram found (input produced 0 nodes)" error + exit 1 (not a garbage
   flowchart, not a crash); `detectType` throw handled. Verified via CLI on
   pie/flowchart/garbage.
4. **Diagnostics (FR5/D5) — CLEAN.** Structured + greppable
   (`code severity tier [capability=…] message`); `fallback-tier`,
   `capability-unavailable(ascii)`, `render-degraded`, `render-failed` all
   emitted on the real paths; `--strict` escalates a warn+ loss to exit 1;
   `--quiet` mutes info. (One cosmetic pollution issue → REV-002.)
5. **Security posthook — MOSTLY CLEAN.** DSL-label path safe: `htmlLabels:false`
   escapes user label text (`<script>`/`<img onerror>` render inert, no live
   handler attributes). v1 flowchart style-sanitization + zero-network HTML
   guarantees intact (export-html/render-svg tests green). **Exception:** the
   theme-map → mermaid `<style>` sink is NOT sanitized → REV-001.
6. **Determinism / error-handling / API / tests — MOSTLY CLEAN.**
   `deterministicIds:true` + stable `RENDER_ID`; no `Date.now`/`Math.random` in
   new `src/` paths. New tests are meaningful (assert routing + `nativePlanned`,
   XML-well-formed SVG, `degraded` flags, diagnostic codes/severities,
   `--strict`/`--quiet` exit behavior, `capability=ascii`) — not smoke. One
   error-handling nit → REV-004.
