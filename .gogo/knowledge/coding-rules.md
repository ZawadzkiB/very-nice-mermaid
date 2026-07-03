# Coding rules

**Purpose:** the conventions the implement and review phases must follow.

<!-- gogo:meta
Mode: owned            # no project CLAUDE.md / CONTRIBUTING / lint config exists yet
Source: [ ]
Confidence: low
Generated-by: /gogo:build (2026-07-03)
-->
> Conventions the implementation must follow. No project-level rules doc or
> lint config exists yet — the General rules below apply until code lands.

## General
- Match surrounding code (naming, idiom, comment density).
- Smallest correct change; stay scoped to the plan; no opportunistic refactors.
- Keep build + tests green; commit in safe increments (only when asked to commit).

## Project-specific
None yet (empty repo — no lint/format config, no existing code to match). The
first implemented feature sets the idiom; add rules here or in a `CLAUDE.md`
as they emerge, then re-run `/gogo:build`.

## gogo overrides
<!-- Preserved across re-runs. -->

### Knowledge file line budget
- Keep each `.gogo/knowledge/*.md` body **lean**: OK `<200` lines · WARN
  `200-400` · OVER `>400` (defaults; `/gogo:skills --warn N --max N` overrides).
  Big always-read context makes the LLM pipeline workers wander and lose
  determinism — measure the **gogo-owned body** only (for a proxy, never the
  linked upstream).
- When a file goes over budget, extract cohesive, situational sections into
  **on-demand skills** with `/gogo:skills` (the parent keeps a `**Load when:**`
  pointer). `/gogo:build` prints a nudge once a file passes the warn line.
- **Write rule + its one exception.** Default writes stay under `.gogo/`. The
  **only** sanctioned write outside `.gogo/` is an extracted **standalone** skill's
  `.claude/skills/<slug>/` dir — and only when the user approves that candidate as
  standalone (never automatic). Everything else still honors `.gogo/`-only.
