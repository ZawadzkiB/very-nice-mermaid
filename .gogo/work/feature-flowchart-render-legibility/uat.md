# UAT — feature `flowchart-render-legibility`

<!-- The UAT gate log — one round per user check after ⑤. Append-only, newest at the
  bottom. Analyst writes an ISSUES round up to "awaiting re-acceptance" and STOPS; the
  orchestrator appends the "re-accepted (user, <date>)" line when the user re-accepts. -->

## UAT round 1 — 2026-07-12

**Input (verbatim):**
> "there are still issues, see, those line are merging together I do not know which line
> is which… we need to keep those line separate…"

Attached: `uat-round1-annotated.png` — the acceptance repro (`scratchpad/repro.mmd`) rendered
via `vnm render`, with **three red boxes** marking the problem spots:
1. **Ingress's outgoing edges** bunch together right at the source (several near-parallel
   vertical stubs).
2. **The middle vertical channel** — "batch load", "feed" and a third edge dropping toward
   the hub run parallel and very close together in the same x-channel, visually merged.
3. **The Aggregator hub fan-in** — the 6 incoming edges' vertical approaches run parallel
   and close before their arrowheads.

**Analysis (against plan.md + decisions.md + THE CODE — code = source of truth):**

All three boxes are one class of defect: **near-parallel, near-collinear edge segments
sharing a channel** — long runs travelling side-by-side so close you cannot trace an
individual line. I confirmed this is real, and *distinct from every shipped FR*, by routing
the repro through `layout()` (`dist/index.js`) and measuring the vertical runs:

| Spot | Measured runs (x, y-span) | Adjacent gap |
|---|---|---|
| **Box 2 (middle channel)** | `IN→K1 \|batch load\|` @ x≈397 · `IN→HUB` @ x≈417 · `API→V1 \|feed\|` @ x≈437, all y 80–200 | **20px**, y-overlap **120px** |
| **Box 1 (Ingress out)** | exits at x = 150 · 176 · 202 · 228 (bottom border comb) | **26px** |
| **Box 3 (HUB fan-in)** | entries at x = 372 · 398 · 424 · 450 · 476 · 502 (top border comb) | **26px** |

Those gaps are **exactly `PORT_STEP=26`** (squeezed to 20 by `PORT_SPREAD_FRAC/(k-1)` on a
busy border). FR4 spreads the **anchors at the endpoints**, but the long parallel *runs*
between the spread endpoints stay one `PORT_STEP` apart for their whole length — a 1.5px
stroke inside a 20px lane, with a label sitting on it, is not individually traceable. That
matches the user's "I don't know which line is which."

This is **not** any shipped mechanism, and each was verified working-as-designed:
- **Not FR7 bridges.** `segmentsCross` (`src/geometry/index.ts:442`) returns `null` when
  `denom === 0` (parallel/collinear), so a bundle of parallel vertical runs produces **zero**
  crossings and never hops. Bridges are for point-crossings, not shared channels — correct.
- **Not FR6 labels.** `resolveLabelCollisions` (`geometry/index.ts:384`) de-collides label
  **plates**, not the edge **lines**. The lines still merge under legible labels.
- **Not FR4 anchor spread.** `computePerimeterPorts` (`geometry/index.ts:244`) only sets the
  border **offset**; the run between two spread borders is a straight elbow segment at that
  offset — never re-laned.

It is precisely the case plan.md **Out of scope** and report.md **Follow-ups** deferred:
> "Full lane/bus orthogonal routing so long parallel approaches never run merged … the
> collinear-overlap case (two edges sharing a channel) is this deferred work, not a crossing."

So the user is asking us to **take on that deferred lane-routing work now**. It is additive:
FR1–FR8 stay green (they fix different defects); FR9 adds line-separation on top.

**Honest difficulty note (recorded for the re-acceptance gate).** This is the substantial
routing work the first plan deliberately deferred, for real reasons that still hold:
- **Keeping the elbow connected while offsetting a run is the crux.** An orthogonal path is
  alternating H/V segments; moving a vertical run in x must cascade to lengthen/shorten the
  horizontal segments on either side. That is tractable for **mid-segments** (box 2), but a
  fan's **first/last** segment (boxes 1 & 3) is anchored to the node border and bounded by
  **node width** — you cannot just widen the lanes (Ingress is ~90px; 4 lanes at 26px already
  ~fill it). Separating those needs a **staggered-depth comb** (each edge turns at a different
  depth so the bundle fans out), which adds jogs, can create **new crossings** (→ more FR7
  bridges), and pushes **bounds** outward.
- **Byte-parity doubles every line of it** — the whole pass must be re-implemented
  byte-identically in the `runtime.ts` twin and stay deterministic (no RNG/clock), or the
  `dom-runtime-parity` guard breaks. It also re-snapshots every flowchart/state/class example.

A **scoped** post-layout lane pass (separate the endpoint bundles + shared mid-channels to a
minimum lane gap, comb-stagger only where a bundle is wider than its node) reaches all three
annotated spots at meaningfully lower risk than a full orthogonal router. See plan.md **FR9**
+ **Approach E** and the OPEN forks **D6–D9** in decisions.md.

**Proposed plan delta:**
- **+FR9 — edge-lane separation.** A new deterministic post-layout pass in the shared geometry
  (`separateLanes`, run inside `finishEdges` before `applyBridges`) that detects bundles of
  near-parallel, near-collinear edge segments sharing a channel and offsets them into distinct
  parallel lanes (≥ a min lane gap), cascading each offset through the connected elbow so paths
  stay orthogonal and connected; endpoint fan bundles get a staggered-depth comb where node
  width can't hold the lanes. Reaches **flowchart + state + class** via `finishEdges` (D5,
  unchanged); **sequence excluded**. Mirrored byte-for-byte in the `runtime.ts` twin; runs
  before FR6 label de-collision + FR7 bridges so labels ride the re-laned midpoints and any new
  crossings get bridged. Gated by the same style rule as FR7 (clean elbow; curved/sketch
  deferred).
- **Move** "Full lane/bus orthogonal routing …" **from Out of scope into scope** (as FR9,
  scoped to the bundle/mid-channel cases; a fully-general "no two segments within N px anywhere"
  router stays out).
- **Keep FR1–FR8 as the Done baseline** — untouched.
- New tests: unit (no two near-parallel segments run within the min gap in a shared channel for
  the repro's fan/bundle fixtures; the pass is deterministic + idempotent); byte-parity guard
  extended with a lane fixture; snapshots; e2e/hands-on on the repro's 3 boxes.
- New OPEN forks **D6–D9** for re-acceptance (approach, aggressiveness, scope, worth-it/partial).

**Disposition (per point):**
- **Box 1 — Ingress outgoing fan (26px comb at the source)** — **fix-needed** · **new-scope**
  (deferred lane routing). Hardest case: bounded by node width → needs the comb-stagger, not
  pure widening.
- **Box 2 — middle batch-load / feed channel (20px gap, 120px overlap)** — **fix-needed** ·
  **new-scope**. The clearest, most tractable case: mid-segment lane offset with H-neighbour
  cascade. The primary acceptance target.
- **Box 3 — Aggregator hub fan-in (26px comb at the target)** — **fix-needed** · **new-scope**.
  Endpoint bundle, same shape as box 1.
- *(For the record — works-as-designed, not defects, just not this problem:)* FR4 endpoint
  spread, FR6 label de-collision, and FR7 point-crossing bridges are all behaving exactly as
  planned; FR9 is a genuinely different mechanism, additive on top of them, not a regression of
  any.

**Verdict:** re-planned — awaiting re-acceptance
→ re-accepted (user, 2026-07-13): "Full fix — all 3 boxes" (D6=A scoped pass · D7=A LANE_GAP≈15px · D8=A the 3 bundles · D9=A comb-stagger the fans) → /gogo:go reruns ②→⑤

## UAT round 2 - accepted (user, 2026-07-13) - via /gogo:done
