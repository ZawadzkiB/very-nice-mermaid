# State — feature `subgraph-aware-routing`

- **feature:** Subgraph-aware edge routing — route long edges around containers, not through them (v0.6.6, defect #3)
- **phase:** done
- **status:** shipped
- **created:** 2026-07-15
- **branch:** release/v0.6.6 (based on v0.6.5 code; master gets v0.6.5 once PR #13 merges)
- **iterations:** plan=0 · implement=2 · review=1 · test=1
- **resume:** awaiting UAT — verify the work; `/gogo:done` accepts (ships to changelog), or describe issues to loop back into planning (SAME item)
- **open-decision:** none for v0.6.6. TEST-001 (D3) surfaced as an OPTIONAL, non-blocking, out-of-scope separate-defect decision (pre-existing parser membership bug) — does not gate this feature.
- **note:** ⑤ report-complete. avoidSubgraphs shipped (defect #3); acceptance bar met light+dark; heroes + snapshots byte-identical; 426 tests green; version 0.6.6. Changes left in the working tree (user handles git/ship).
- **open-decision:** none (D1 → A, D2 → A; resolved 2026-07-15)
- **shipped:** 2026-07-15 → .gogo/changelog/2026-07-15-subgraph-aware-routing/
