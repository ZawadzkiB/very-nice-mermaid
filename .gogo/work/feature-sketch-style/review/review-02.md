# Review — round 2 (fix snapshot)

Rendered from `review/issues.json`. Round 1 verdict was **APPROVE** (no blockers/majors);
this round records the disposition of the three minor/nit findings.

| id | severity | status | disposition |
|---|---|---|---|
| REV-001 | minor | **wontfix** | Accepted — the ~22KB woff2 (~30KB base64) in the browser core is the D3 zero-network tradeoff. Documented (plan deviations + report/release notes). No code change. |
| REV-002 | nit | **fixed** | Dotted-edge open arrowheads are now SOLID (dash on the wavy line only). Fixed in `svg.ts`, the runtime `svgEdge` sketch branch (toSvgString parity), and the live view (separate solid `headPath`). New dotted-edge sketch parity test. |
| REV-003 | minor | **fixed** | Fallback+sketch drop now surfaced by the library too — `warnSketchFallback()` in `renderSvgAsync`/`renderHtmlAsync` + a `console.warn` in `mountAsync`'s fallback branch (covers the element). CLI note unchanged. |

**Verification after fixes:** typecheck ✅ · tsup build ✅ · **338 unit tests green** ✅
(incl. the extended sketch byte-parity guard + the new dotted-edge case). Clean-mode
output remains byte-identical.

**Verdict: APPROVED — advancing to ④ test.**
