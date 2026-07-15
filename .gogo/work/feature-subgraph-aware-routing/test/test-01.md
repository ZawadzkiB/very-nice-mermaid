# Test — round 1 — feature `subgraph-aware-routing` (v0.6.6)

**Phase ④ verdict: PASS** (acceptance bar met, no regression) — 1 non-blocking, out-of-scope note (TEST-001).

Delegated to `gogo-tester` (fresh eyes + gogo-playwright MCP); finalized by the orchestrator after a transient API crash/resume. Independently corroborated by the orchestrator.

## Suites
- `npm test` → **426 passed** (29 files), incl. `dom-runtime-parity` (43) with the new avoidSubgraphs geometry (8), architecture parity (3), LR horizontal-branch parity (1), and drag parity (1) cases.
- `npm run typecheck` → clean.
- `node dist/cli/index.js --version` → **0.6.6**.

## Hard acceptance bar — real rendered PNGs, light AND dark (`scratchpad/architecture.mmd`)
Rendered fresh (`test-arch-light.png` / `test-arch-dark.png`, byte-identical to the reference `arch-v066-*.png`) and inspected multimodally:
1. **PASS** — the `BE↔RULES` edges ("stream context", "findings") no longer run down THROUGH the `Validation Engine (Veris)` container. Both trunks route down the **outside right** of the container; the interior (`MCP surface`, `Veris console`) reads **clean** — no impaling verticals. (Confirmed light + dark.)
2. **PASS** — the re-entry into `RULES` at the bottom is short/clean (a low horizontal approach hugging the endpoint, below `Veris console`).
No still-impaling-trunk finding. Bar met.

## No-regression (paramount)
- **Gate scan** (`scratchpad/gate-scan.mjs`): `avoidSubgraphs` fires on **only** `architecture.mmd`'s `BE↔RULES` (2 edges) corpus-wide; every fixture `fired=0`, all idempotent.
- **Subgraph heroes byte-identical:** `nested-subgraphs` (containers=2, real members, `fired=0`) is a genuine both-in no-op; `microservices` also byte-identical (see TEST-001 — trivially, no container ever existed). Regenerated `examples/` + `assets/` heroes: **0 changed files**.
- **Docs:** interactive HTML grows only by the inlined twin source; **0 rendered-path (`d="ML…"`) changes**. `docs/_config.yml` version cache-buster bump only.
- **Determinism:** architecture SVG/HTML rendered twice → byte-identical; asset regen stable.
- Prior invariants (v0.6.2 stagger, v0.6.4 label offsets, v0.6.5 convergence + deskewer, FR7 bridges) intact — all snapshot/parity suites green.

## Interactive (gogo-playwright MCP)
Exported `architecture.mmd` → self-contained HTML, opened in a real browser, dragged **both** `BE` and `RULES` with real pointer events: the live `avoidSubgraphs` re-routes on each drag, both trunks stay **outside** the re-hugged `ENGINE` container, **zero stranded edges** (no NaN path data), zero new console errors. FR5 (drag re-route) verified live.

## Findings
| id | severity | status | title |
|---|---|---|---|
| TEST-001 | minor | new (needs-user-decision) | `fixtures/microservices.mmd`'s 'Core services' subgraph box never renders — **pre-existing parser membership-order bug, unrelated to v0.6.6, out of scope** |

**TEST-001** does **not** block v0.6.6: it is byte-identical to `master` (fixture + `src/parser` both unchanged by this diff — verified), and the plan explicitly puts membership/container-computation changes out of scope. It merely means microservices' byte-identity holds trivially (no container) while `nested-subgraphs` supplies the genuine both-in no-op proof. Surfaced to the user as an optional separate-defect decision; no v0.6.6 action.
