# Spike-01 — native SVG re-skin feasibility (task-1)

**Date:** 2026-07-04 · **mermaid:** 11.16.0 · **jsdom:** 25.0.1 · **Node:** 24
**Question (D3):** for each native-target type (sequence, class, state,
user-journey), can we reliably read a clean structured model
(nodes/participants/edges/labels + positions) from mermaid's rendered SVG and
re-skin it with our renderer? And does `mermaid.render` work under jsdom here?

**Method:** rendered each type with mermaid.js under jsdom in this repo, parsed
the SVG with `DOMParser`, inspected tag/class structure, `data-*` hooks, and
geometry (viewBox + node transforms). All raw experiments were run against the
installed `mermaid@11.16.0`; the load/init/render path they exercised is now the
shipped `src/mermaid/` foundation.

---

## Headline verdict (per native type)

| Type | Verdict | Round-2? | Why (evidence) |
|---|---|---|---|
| **sequence** | **native-feasible** (strongest) | **YES** | Sane geometry even under jsdom (bespoke ordered layout, no dagre). Clean stable selectors + `data-et`/`data-id` hooks. ASCII already in scope (FR4). |
| **class** | **native-feasible** via structure-read + **our** layout | **YES** | Full logical model readable (`htmlLabels:false`); but mermaid's dagre geometry is unreliable headless — must re-layout with our own dagre. Medium effort. |
| **state** | **native-feasible**, same pattern as class | **YES** | Nodes/transitions/labels readable; geometry degenerate under jsdom → re-layout ourselves. Slightly simpler than class. |
| **user-journey** | **DROP TO FALLBACK** (honest rec) | **NO** | Renders fine, but it's a bespoke timeline (sections, smiley task dots, actor legend) that does **not** map to our node/edge card renderer. Low re-skin value, low interactivity. Keep as fallback SVG + pan/zoom. |

**Recommended round-2 native scope: sequence + class + state (3 types), not 4.**
Drop journey to the fallback tier (a plan refinement — the plan listed 4).

---

## Does `mermaid.render` work under jsdom in this repo? Yes — with three fixes.

`mermaid.detectType` needs **no DOM** (only `mermaid.initialize()` first, to
register detectors). `mermaid.render` needs a DOM plus three headless fixes we
now ship in `src/mermaid/jsdom-env.ts`:

1. **SVG geometry stubs** — jsdom lacks `getBBox` / `getComputedTextLength` /
   `getPointAtLength` / `getTotalLength` / `getScreenCTM`. Without them, layout
   collapses to 0. We stub text metrics as `len*8` (crude but non-zero).
2. **Constructable `CSSStyleSheet`** — mermaid does `new CSSStyleSheet()` +
   `insertRule`/`replaceSync`; jsdom's isn't constructable. We ship a shim.
3. **`window.screen`** — C4 (and a few others) read `screen`; stubbed 1920×1080.

**Critical gotcha (cost us the most): DOMPurify import-time window binding.**
mermaid does `import DOMPurify from "dompurify"`, and dompurify **freezes**
`.sanitize` against whatever `window` exists *at import time*. If mermaid is
imported with no DOM (e.g. by the cheap `classify` path), `DOMPurify.sanitize`
is missing for the **whole process** and every later render throws. Fix: in
Node, stand up a **persistent** jsdom DOM **before the first mermaid import**
(`loadMermaid` → `ensureNodeDom()` → `import("mermaid")`). One process-lifetime
DOM; no per-render teardown (tearing the window down also breaks the frozen
DOMPurify).

**`htmlLabels: false` is required headless.** class/state/flowchart default to
HTML `<foreignObject>` labels, which jsdom cannot measure at all. With
`htmlLabels:false` mermaid emits SVG `<text>`/`<tspan>` instead — measurable by
our stubs and far cleaner to re-skin. We set it for the fallback config.

---

## Per-type evidence

### sequence — native-feasible (do it first)
- **Geometry:** sane under jsdom — `viewBox="-50 -10 450 206"` (`htmlLabels:false`).
  Sequence uses its **own ordered layout**, not dagre, so the container-getBBox
  degeneracy (below) does **not** bite it.
- **Readable structure (stable selectors):**
  - participants: `rect.actor[name]` (+ `.actor-top` / `.actor-bottom`), each with
    `x`/`y`/`width`; participant group carries `data-et="participant" data-id="Bob"`.
  - lifelines: `line.actor-line[data-id]` with `data-et="life-line"`, `x1`.
  - messages: `text.messageText` (ordered by `y`) + `line.messageLine0`/`1`
    (solid/dotted); from/to recoverable by matching each message line's endpoint
    x to a lifeline x.
- **Model:** ordered participants + ordered messages reads cleanly and directly
  from geometry. No re-layout needed (mermaid's positions are usable).
- **Bonus:** ASCII is already in scope for sequence (FR4).

### class — native-feasible via structure-read + our own layout (medium)
- **Geometry:** **degenerate** headless — `viewBox="-8 -8 44360 32"` (width ~44k).
  This is a *container getBBox* artifact: individual node transforms are locally
  **fine** (`translate(13,16)`, `translate(13,98)` — a clean vertical stack), only
  mermaid's final bounds explode because it derives them from `getBBox()` on the
  root group, which our text-metric stub can't compute.
- **Readable structure (`htmlLabels:false`, foreignObject count 0):**
  - class boxes: `g.node` whose `id` encodes the class name
    (`…-classId-Animal-0`); node text content = concatenated members + methods
    (`Animal +String name +int age +makeSound() : void`); `.members-group`,
    `.methods-group`, `.divider` subgroups.
  - relations: `g.edgePaths path` with semantic classes `.extension`,
    `.composition`, `.aggregation`, `.dependency`, `.lollipop`.
- **Recommendation:** read the **logical model** (class → name + members +
  methods; typed relations) from the SVG, then run **our** dagre layout (we
  already have it) — do **not** trust mermaid's headless geometry.
- **Gotcha:** the edge `path` doesn't name source/target; recover the
  `(from, to, relationType)` triple from marker classes + endpoint→node matching.
  Tractable, but the trickiest part of round 2.

### state — native-feasible, same pattern as class (medium, a bit simpler)
- **Geometry:** degenerate headless (`viewBox="-8 -8 42488 32"`); node transforms
  locally sane (vertical stack `translate(56, 16/98/180/262)`).
- **Readable structure (`htmlLabels:false`):** `g.node` id encodes the state name
  (`…-state-Idle-2`, text `"Idle"`); transitions as `path.transition`; edge labels
  `g.edgeLabel` read cleanly (`"start"`, `"stop"`). Pseudo-nodes: `state-start`
  (`[*]` start) and `…root_end` (end).
- **Recommendation:** identical to class — read structure, re-layout with our
  dagre. Simpler than class (no member/method compartments). Composite/nested
  states would add work; basic machines map directly to our node-graph.

### user-journey — drop to fallback (recommendation)
- **Geometry:** sane (`viewBox="0 -25 900 540"`), text-based (no foreignObject).
- **Readable structure:** `.journey-section`, `.task` (+ `.task-type-N`),
  `.actor-N`, task faces (`.face`/`.mouth`), a legend.
- **Why drop:** the visual is a **bespoke horizontal timeline** with scored task
  dots and smiley faces — it does not map onto our node/edge card renderer, so
  "re-skin" would mean reimplementing mermaid's journey visual from scratch for
  little gain and little interactivity. Best value: keep it fallback (mermaid SVG
  + our pan/zoom shell), like pie.

---

## Which fallback types degrade headless (drives FR5 diagnostics)

Same jsdom render, fallback set:

| Type | Headless result |
|---|---|
| pie, quadrantChart, xychart-beta | **OK** — self-sizing geometry, exact |
| gantt | width collapses to 0 (text-metric dependent) — degraded |
| er, gitGraph, timeline, **kanban** (D2), sankey-beta | **degenerate viewBox** (dagre/getBBox bounds explode) — content present, bounds wrong |
| C4 | needs `window.screen` — **now works** with our shim (832×437) |
| mindmap, architecture | **hard fail** — cytoscape needs a real canvas (`HTMLCanvasElement.getContext`); not renderable under jsdom without the native `canvas` package |

**Implication:** in the **browser**, every fallback type renders correctly (real
DOM). In the **CLI/jsdom**, several degrade (geometry) or hard-fail
(cytoscape) — exactly the cases FR5 must report. The foundation now emits:
`render-degraded` (warn) when the viewBox is degenerate (width/height ≤ 0 or
> 8000), and `render-failed` (error) with a clear "needs a browser" message on a
hard fail. `kanban` (the D2 designated fallback) is among the degraded-headless
set — worth noting for its round-2 pan/zoom shell (render in browser for exact
layout, or accept degraded CLI bounds + the emitted diagnostic).

---

## Router / silent-misparse findings

- `mermaid.initialize({startOnLoad:false})` + `detectType` work with **no DOM** —
  so `classify` is cheap; only actual fallback **render** needs jsdom.
- `detectType` canonical outputs: `flowchart TD`→`flowchart-v2`, `graph LR`→
  `flowchart`, `sequenceDiagram`→`sequence`, `classDiagram`→`class`,
  `stateDiagram-v2`→`stateDiagram`, `journey`→`journey`, `pie`→`pie`.
- `detectType` **throws** on header-less `A-->B`, on empty, and on garbage. The
  router treats a throw as "hand to the flowchart parser" — which renders the
  legitimate header-less flow and zero-nodes genuine garbage (→ the D6 CLI
  error). A *known* non-flowchart type routes to fallback with an info
  diagnostic — never the flowchart parser. **This is the silent-misparse fix.**

---

## Round-2 recommendation (gating output of this spike)

1. **Build native sequence** — highest value, sane headless geometry, ASCII in
   scope. Read participants/lifelines/messages straight from the SVG.
2. **Build native class + state** — read the **logical** model from the SVG
   (`htmlLabels:false`), then **re-layout with our own dagre** (do not reuse
   mermaid's headless positions). Budget the class relation `(from,to,type)`
   recovery as the hard part.
3. **Drop user-journey to fallback** — reclassify it in the router's tier table
   and keep it on the mermaid SVG + pan/zoom path (a plan refinement to log).
4. Keep the **htmlLabels:false + persistent-jsdom-before-mermaid-import** rules —
   they are load-bearing for every headless render.
