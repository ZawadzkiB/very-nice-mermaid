---
title: Library
nav_order: 4
---

{%- assign cachebust = site.github.build_revision | default: site.version -%}

# Library API
{: .no_toc }

Import the renderers, the interactive `mount()`, or the `<very-nice-mermaid>` web
component. ESM-only, ships TypeScript types, works in Node and the browser.

1. TOC
{:toc}

---

## Install

```bash
npm install very-nice-mermaid
# PNG output is optional — install the native rasterizer only if you need it:
npm install @resvg/resvg-js
```

Requires **Node ≥ 20**.

## Renderers

```ts
import {
  parse, layout,
  renderSvg, renderAscii, renderMarkdown, renderHtml, renderPng,
  renderSvgAsync, renderHtmlAsync, renderMarkdownAsync, // type-routed (any diagram)
  mount, mountAsync, themes, defineTheme,
} from "very-nice-mermaid";

const dsl = `
flowchart LR
  A[Start] --> B{Choice}
  B -->|yes| C([Done])
  B -->|no| D[(Store)]
`;

// Pure string renderers (work in Node and the browser):
const svg = renderSvg(dsl, { theme: "dark" });      // → SVG string
const sketch = renderSvg(dsl, { style: "sketch" }); // → hand-drawn SVG (any theme)
const md  = renderMarkdown(dsl);                     // → ```-fenced ASCII
const html = renderHtml(dsl, { theme: "fancy", style: "sketch" }); // → standalone page
const png = await renderPng(dsl, { scale: 2, style: "sketch" });   // → Uint8Array

// Or work with the pipeline directly:
const model = parse(dsl, { strict: false });        // → DiagramModel (+ warnings)
const positioned = layout(model, { theme: themes.light });
```

Every renderer accepts a **DSL string**, a parsed **`DiagramModel`**, or an
already-positioned **`PositionedModel`**.

## Sync (flowchart) vs. async (any type)

`renderSvg` / `renderAscii` / `renderMarkdown` / `renderHtml` are **synchronous**
and handle the **flowchart family** (built-in, no-dependency parser + layout). Give
one a raw **non-flowchart** string and it throws a clear error rather than
misparsing it.

To render **any** Mermaid diagram type from a raw string, use the `…Async` twins.
They run Mermaid's `detectType` router: **flowchart** via the sync fast path,
**sequence / class / state** re-skinned into our themed engine, and **everything
else** via the bundled mermaid.js fallback. They are async because those tiers load
mermaid (and, in Node, a jsdom DOM) lazily — so flowchart-only users never pay for it.

```ts
import { renderSvgAsync, renderHtmlAsync, renderMarkdownAsync } from "very-nice-mermaid";

const svg  = await renderSvgAsync(`sequenceDiagram\n  A->>B: hi`);   // native sequence
const svg2 = await renderSvgAsync(`pie title P\n  "A": 1\n  "B": 2`); // mermaid fallback
const html = await renderHtmlAsync(`stateDiagram-v2\n  [*] --> On`);  // native state
```

`mount()` and the `<very-nice-mermaid>` element route **every** type automatically —
no need to pick sync vs. async yourself.

## Interactive `mount()`

```ts
import { mount } from "very-nice-mermaid";

const handle = mount(document.getElementById("diagram")!, dsl, {
  theme: "dark",
  minimap: true,        // default true
  persist: true,        // auto-save layout to localStorage (or pass a string key)
});

handle.fit();                       // fit-to-view
handle.zoomIn(); handle.zoomOut();
handle.resetLayout();               // discard manual moves + resizes + anchor pins
const layoutJson = handle.exportLayout();   // portable { positions, sizes, anchors, transform }
handle.importLayout(layoutJson);            // restore a saved layout
const svg = handle.toSvgString();           // the current edited diagram as themed SVG
handle.setTheme(themes.fancy, themes.fancy.cssVars());
handle.destroy();
```

Drag a node and its edges **re-route live** off the card borders; select a node and
drag a corner handle to **resize** it. Edges **auto-distribute around the whole node
perimeter** by the direction to their other end, so hubs stay readable. The
background pans, the wheel zooms at the cursor, and the layout — **positions *and*
sizes** — auto-persists (debounced) to `localStorage`. **Reset layout** (toolbar ⟲,
or `handle.resetLayout()`) discards every manual edit and returns to the computed
layout.

- **Subgraph containers are interactive.** A `subgraph` box auto-contains its
  members and hugs the cluster on every drag / resize; grab its dashed border or
  title band to drag the whole group.
- **Pin an edge** where you want it: select a node to reveal anchor handles at its
  edge endpoints, drag one along the border to pin that end to a `{ side, offset }`.
  Pins persist and are honored by the static SVG (parity).
- **Save the edited diagram**: the toolbar's **SVG** downloads the current model as
  themed SVG (identical to `vnm render -f svg` of the same state); **PNG** rasterizes
  it in-browser via `<canvas>` — no server, no headless browser.

`mount()` returns synchronously: a flowchart mounts immediately, while a raw
sequence / class / state / fallback string finishes rendering asynchronously (loads
mermaid, then swaps the render in). Prefer `await mountAsync(el, dsl, opts)` when you
need the settled handle.

> **Interactive vs. static shapes.** The interactive renderer (`mount()`, the web
> component, and the HTML export) draws every node as a **rounded card**, varying
> only the corner radius. The static **SVG / PNG** output draws each node's full
> shape silhouette (diamonds, hexagons, cylinders, …). Expect the interactive view
> to differ from `renderSvg` / PNG for non-rectangular shapes.

## Web component

The `<very-nice-mermaid>` element self-registers on import. It reads the diagram
from its inline text (or a `src` attribute), a theme from the `theme` attribute, and
the hand-drawn look from a boolean `sketch` attribute — zero wrapper code in React /
Angular / Vue / plain HTML.

```html
<script type="module">
  import "very-nice-mermaid/element";
</script>

<very-nice-mermaid theme="dark" style="height: 420px">
  flowchart LR
    A[Start] --> B{Choice} --> C([Done])
</very-nice-mermaid>

<!-- hand-drawn: the boolean `sketch` attribute (separate from the CSS `style` attr) -->
<very-nice-mermaid theme="light" sketch style="height: 420px">
  flowchart LR
    A[Start] --> B{Choice} --> C([Done])
</very-nice-mermaid>

<!-- or load the DSL from a file -->
<very-nice-mermaid theme="fancy" src="./pipeline.mmd" style="height: 420px"></very-nice-mermaid>
```

### Live demo
{: .no_toc }

The same element, running right here — it self-registers from the bundle and renders
[`pipeline.mmd`]({{ '/pipeline.mmd' | relative_url }}) live (drag a node, scroll to zoom):

<script type="module" src="{{ '/assets/vnm-element.js' | relative_url }}?v={{ cachebust }}"></script>

<very-nice-mermaid theme="fancy" src="{{ '/pipeline.mmd' | relative_url }}?v={{ cachebust }}" style="display:block; height:440px; margin:1rem 0; border:1px solid #30363d; border-radius:8px; overflow:hidden;"></very-nice-mermaid>
