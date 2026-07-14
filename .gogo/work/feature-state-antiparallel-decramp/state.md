# State — feature `state-antiparallel-decramp`

- **feature:** State anti-parallel jog de-cramp (v0.6.2) — stagger a collinear A→B/B→A elbow pair's jogs onto distinct lanes
- **phase:** done            <!-- plan | implement | review | test | knowledge | done -->
- **status:** shipped        <!-- awaiting-plan-acceptance | plan-accepted | implementing | reviewing | testing | waiting-for-user | awaiting-uat | done | shipped | aborted -->
- **created:** 2026-07-14
- **accepted:** 2026-07-14
- **completed:** 2026-07-14
- **branch:** release/v0.6.2
- **iterations:** plan=0 · implement=1 · review=1 · test=1
- **resume:** none - shipped to .gogo/changelog/2026-07-14-state-antiparallel-decramp/
- **review:** APPROVE (fresh-eyes, 2026-07-14) — no blockers/majors; one non-blocking nit REV-001 (latent: a staggered jog could in principle form a new near-collinear overlap with an unrelated 3rd edge; verified NOT observed across the full gallery).
- **test:** PASS (fresh-eyes, 2026-07-14) — hard visual bar MET on all 4 elbow variants (fail/retry cleanly separated, no curve fallback); 401 unit + 85 e2e green; byte-level regression sweep clean (only the 4 state elbow variants changed); deterministic; live runtime twin confirmed; REV-001 not observed.
- **report:** report/report.md + report/diagrams.html written; knowledge updated (code-review-standards, tech-stack); v0.6.2.
- **open-decision:** none (D1 → A elbow-only de-cramp, resolved 2026-07-14)
- **hard acceptance bar (user):** in `clean·light`, `clean·dark`, `sketch·light`, `sketch·dark` the `fail`/`retry` arrows must NOT merge/cross at one point — they must read as two clearly separated arrows, as clean as `clean·fancy` (the user's stated "correct" reference). If the elbow-stagger doesn't achieve that by eye, escalate to curving just the anti-parallel pair. Visual verification against the real render is mandatory, not optional.
