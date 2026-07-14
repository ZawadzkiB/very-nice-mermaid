# UAT — feature `state-antiparallel-decramp`

<!-- The UAT gate log — the plan-gate symmetry at the END of the pipeline.
  Phase ⑤ (report) no longer ends at `done`; it ends at status: awaiting-uat, and you verify the work.
  There are exactly two ways forward, and both are recorded here (append-only, newest round at the bottom):

  1. ACCEPT — running `/gogo:done` IS the acceptance (no extra confirmation question, mirroring how
     accepting a plan unlocks `/gogo:go`). `/gogo:done` first appends the one-line accept verdict below,
     then ships as usual.
  2. ISSUES / QUESTIONS — you describe what's wrong or ask a question instead of shipping. The
     orchestrator hands your input to `gogo-analyst`, which analyses it against the current plan.md +
     decisions.md + THE CODE (code = source of truth) and appends an issues round below; adjustments.md
     logs the plan delta and plan.md is updated. You RE-ACCEPT the adjusted plan, then `/gogo:go` reruns
     ②→⑤ — the SAME work item, never a new one — landing back at awaiting-uat.

  Each round is numbered sequentially (round N). state.md's `iterations:` line gains `uat=N`, counting the
  re-plan loop-backs.

  Round format — an ISSUES round (analyst-authored):

    ## UAT round N — <YYYY-MM-DD>
    **Input (verbatim):** <the user's UAT feedback, quoted exactly as given>
    **Analysis:** <the analyst's read of it against the current plan.md + decisions.md + the actual code>
    **Proposed plan delta:** <what changes in plan.md; adjustments.md logs the same delta>
    **Disposition (per point):**
      - <point> — fix-needed
      - <point> — works-as-designed (explain why the current behaviour is correct)
      - <point> — new-scope (out of this item; note where it goes)
    **Verdict:** re-planned — awaiting re-acceptance
      (then, once accepted:) re-accepted (user, <YYYY-MM-DD>) → /gogo:go reruns ②→⑤
      ^ the analyst writes the round up to "awaiting re-acceptance" and STOPS; the
        orchestrator appends this second line to THIS round's Verdict when the user
        re-accepts (the same step it bumps iterations uat=N and emits uat-failed).

  Round format — an ACCEPT round (via /gogo:done, no analyst round needed):

    ## UAT round N — accepted (user, <YYYY-MM-DD>) — via /gogo:done
    <optional one line: what the user verified>
-->

## UAT round 1 - accepted (user, 2026-07-14) - via /gogo:done
Verified: the hard visual bar was met - fail/retry render as two clearly-separated arrows on all four elbow variants (clean-light, clean-dark, sketch-light, sketch-dark), no curve fallback needed.
