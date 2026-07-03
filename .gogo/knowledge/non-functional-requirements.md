# Non-functional requirements

**Purpose:** the project's *standing* quality bars — performance, security,
accessibility, reliability, compliance, limits. The plan phase designs within
them, review enforces them, and test verifies them. (A feature's *functional*
requirements live in its `plan.md`, not here.)

<!-- gogo:meta
Mode: owned            # usually owned — most projects lack a formal NFR doc
Source: [ ]            # only if a real requirements/NFR doc exists
Confidence: low
Generated-by: /gogo:build (2026-07-03)
-->
> Standing non-functional requirements for the whole project. The repo is
> greenfield — no explicit targets exist yet; sensible defaults below.

## Performance
No explicit target yet.

## Security
No explicit model yet. Defaults until stated otherwise: no secrets committed
or logged; validate external input.

## Accessibility & UX
No explicit standard yet; if a UI emerges, default to WCAG 2.1 AA.

## Reliability & operability
No explicit target yet. Default: no silent failures — surface errors clearly.

## Compliance & limits
None known.

## gogo overrides
<!-- Preserved across re-runs. -->

### Knowledge determinism budget
- Knowledge files are **always-read context**; oversized always-read context makes
  the LLM pipeline workers wander and err. Hold each `.gogo/knowledge/*.md` body to
  OK `<200` · WARN `200-400` · OVER `>400` lines (measure the gogo-owned body
  only). Extract over-budget situational detail into **on-demand skills** with
  `/gogo:skills` so it loads only when relevant — that is the determinism win.
- **Safety exception (user-gated).** Writes stay confined to `.gogo/`; the single
  sanctioned write outside it is an **approved standalone** skill's
  `.claude/skills/<slug>/` dir — per-candidate, never automatic.
