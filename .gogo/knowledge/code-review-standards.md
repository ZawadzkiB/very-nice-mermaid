# Code review standards

**Purpose:** what the review phase checks for. Be a skeptical staff engineer —
"would I approve this PR?"

<!-- gogo:meta
Mode: owned            # usually owned — rarely a separate doc
Source: [ ]
Confidence: medium
Generated-by: /gogo:build (scaffold)
-->
> The dimensions the review phase scores the diff against.

## Dimensions
- **Correctness & edge cases** — empty / missing data, off-by-one; matches the plan's intent.
- **Security** — input validation, authz, no secrets in logs, no injection / traversal.
  (Enforce the bars in `non-functional-requirements.md`.)
- **Error handling** — no silent failures; clear, actionable errors.
- **API / type design** — consistent shapes; no needless duplication.
- **Tests present** — new behaviour is covered; build + tests green.
- **Conventions** — matches `coding-rules.md`; no dead or mocked-out code.
- **Performance** — no needless re-fetch / render; hot paths sane (per the NFR bars).

## Severity
`blocker` (must fix before merge) · `major` · `minor` · `nit`.

## Project-specific gotchas (verified)
<filled in over time by the report phase as the pipeline learns them>
