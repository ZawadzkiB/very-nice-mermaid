# very-nice-mermaid

[![CI](https://github.com/ZawadzkiB/very-nice-mermaid/actions/workflows/ci.yml/badge.svg)](https://github.com/ZawadzkiB/very-nice-mermaid/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/very-nice-mermaid.svg)](https://www.npmjs.com/package/very-nice-mermaid)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](#install)

A framework-agnostic **Mermaid flowchart** renderer. It keeps Mermaid's DSL and
replaces everything after it with **our own parser, layout, and renderers** — so
you get **beautiful, interactive, themeable** diagrams with **no `mermaid.js`
runtime and no headless browser**.

<p align="center">
  <img src="./assets/example-fancy.png" alt="A microservices flowchart rendered in the fancy theme" width="600">
</p>

- **Library** — parse DSL and `mount()` an **interactive** diagram (drag nodes,
  edges re-route live, pan / wheel-zoom / fit, minimap, layout persistence) in
  any app, plus a `<very-nice-mermaid>` **web component**.
- **CLI** (`vnm`) — render a `.mmd` file (or stdin) to a **self-contained
  interactive HTML** file, a static **SVG**, a **PNG**, or **ASCII** in a
  markdown fence.
- **Themes** — `light` / `dark` / `fancy` built in; define your own as a token
  set (JSON for the CLI, an object or CSS variables for the library).

```
mermaid DSL ──parse──▶ DiagramModel ──dagre──▶ PositionedModel ──┬─▶ interactive DOM (lib / web component / HTML)
                                                                 ├─▶ SVG string ──resvg──▶ PNG
                                                                 └─▶ ASCII
```

## Quick start

**CLI** — no install needed, just `npx`:

```bash
# an interactive, self-contained HTML page you can open in any browser
npx very-nice-mermaid render diagram.mmd -o diagram.html --theme dark

# …or a static SVG / PNG / ASCII
npx very-nice-mermaid render diagram.mmd -o diagram.svg
echo 'flowchart LR; A[Hi] --> B([There])' | npx very-nice-mermaid render - -f md
```

**Library** — mount an interactive diagram in three lines:

```ts
import { mount } from "very-nice-mermaid";

mount(document.getElementById("diagram")!, `
  flowchart LR
    A[Start] --> B{Choice}
    B -->|yes| C([Done])
    B -->|no| D[Fix] --> A
`, { theme: "dark" });
```

**Web component** — zero wrapper code, works in any framework:

```html
<script type="module">import "very-nice-mermaid/element";</script>
<very-nice-mermaid theme="fancy" style="height: 420px">
  flowchart LR
    A[Start] --> B{Choice} --> C([Done])
</very-nice-mermaid>
```

## Gallery

| Light | Dark |
|---|---|
| <img src="./assets/example-light.png" alt="light theme" width="360"> | <img src="./assets/example-dark.png" alt="dark theme" width="360"> |

Drag nodes to reorganize (edges re-route live), scroll to zoom, and the layout
persists across reloads. `--theme fancy` adds curved edges and glow.

## Install

```bash
npm install very-nice-mermaid
# PNG output is optional — install the native rasterizer only if you need it:
npm install @resvg/resvg-js
```

Requires **Node ≥ 20**. ESM-only, with TypeScript types.

## Library API

```ts
import {
  parse, layout,
  renderSvg, renderAscii, renderMarkdown, renderHtml, renderPng,
  mount, themes, defineTheme,
} from "very-nice-mermaid";

const dsl = `
flowchart LR
  A[Start] --> B{Choice}
  B -->|yes| C([Done])
  B -->|no| D[(Store)]
`;

// Pure string renderers (work in Node and the browser):
const svg = renderSvg(dsl, { theme: "dark" });     // → SVG string
const md  = renderMarkdown(dsl);                    // → ```-fenced ASCII
const html = renderHtml(dsl, { theme: "fancy" });   // → standalone interactive page
const png = await renderPng(dsl, { scale: 2 });     // → Uint8Array (needs @resvg/resvg-js)

// Or work with the pipeline directly:
const model = parse(dsl, { strict: false });        // → DiagramModel (+ warnings)
const positioned = layout(model, { theme: themes.light });
```

Every renderer accepts a **DSL string**, a parsed **`DiagramModel`**, or an
already-positioned **`PositionedModel`**.

### Interactive `mount()`

```ts
import { mount } from "very-nice-mermaid";

const handle = mount(document.getElementById("diagram")!, dsl, {
  theme: "dark",
  minimap: true,        // default true
  persist: true,        // auto-save layout to localStorage (or pass a string key)
});

handle.fit();                       // fit-to-view
handle.zoomIn(); handle.zoomOut();
const layoutJson = handle.exportLayout();   // portable { positions, transform }
handle.importLayout(layoutJson);            // restore a saved layout
handle.setTheme(themes.fancy, themes.fancy.cssVars());
handle.destroy();
```

Drag a node and its edges re-route live off the card borders; the background
pans, the wheel zooms at the cursor, and the layout auto-persists (debounced).

## Web component

The `<very-nice-mermaid>` element self-registers on import. It reads the diagram
from its inline text (or a `src` attribute) and a theme from the `theme`
attribute — zero wrapper code in React / Angular / Vue / plain HTML.

```html
<script type="module">
  import "very-nice-mermaid/element";
</script>

<very-nice-mermaid theme="dark" style="height: 420px">
  flowchart LR
    A[Start] --> B{Choice} --> C([Done])
</very-nice-mermaid>

<!-- or load the DSL from a file -->
<very-nice-mermaid theme="fancy" src="./pipeline.mmd" style="height: 420px"></very-nice-mermaid>
```

## CLI

```bash
vnm render <file|-> [options]

  -o, --output <file>       output file (default: stdout)
  -f, --format <fmt>        html | svg | png | md   (inferred from -o if omitted)
  -t, --theme <name|path>   light | dark | fancy, or a theme .json file
      --strict              treat parser warnings as errors
      --layout <file>       apply a portable layout.json (node positions)
      --scale <n>           PNG scale factor (HiDPI)
      --background <color>  background color, or 'transparent'
      --title <title>       HTML document <title>
```

```bash
vnm render diagram.mmd -o diagram.html --theme dark   # interactive page
vnm render diagram.mmd -o diagram.svg                 # static SVG
vnm render diagram.mmd -o diagram.png --scale 2       # HiDPI PNG
cat diagram.mmd | vnm render - -f md                  # ASCII to stdout
```

Format is inferred from the `-o` extension; diagnostics go to **stderr** with
`line:col`; exit code is non-zero on error. Both `vnm` and `very-nice-mermaid`
are installed as bins.

## Supported DSL (v1)

Flowcharts only (`flowchart` / `graph`, directions `TB`/`TD`/`BT`/`LR`/`RL`):

- **Shapes** — rect `[]`, rounded `()`, stadium `([])`, subroutine `[[]]`,
  circle `(())`, diamond `{}`, hexagon `{{}}`, parallelograms `[/ /]` `[\ \]`,
  cylinder `[( )]`.
- **Edges** — solid `-->`, open `---`, dotted `-.->`, thick `==>`; labels via
  `-->|text|` or `-- text -->`; `&` fan-in/out chaining; `<`/`x`/`o` arrow ends.
- **Structure** — nested `subgraph … end`, `direction` inside a subgraph.
- **Styling** — `classDef`, `class`, inline `:::class`, `style`.
- **Misc** — `%%` comments, quoted labels, `<br/>` line breaks.

> **Interactive vs. static rendering** — the static **SVG** / **PNG** output
> draws each node's full shape silhouette (diamonds, hexagons, cylinders, …). The
> interactive renderer — `mount()`, the `<very-nice-mermaid>` element, and the
> standalone **HTML** export — draws every node as a **rounded card**, varying
> only the corner radius (stadium / circle → pill). Expect the interactive / HTML
> view to differ from `renderSvg` / PNG for non-rectangular shapes.

Parsing is **lenient** by default: unknown constructs degrade to a structured
warning carrying `line`/`col`. `--strict` (CLI) / `{ strict: true }` (API) turns
warnings into errors.

## Theming

A theme is a **token set**: colors (including per-role node fills/strokes),
radii, font stacks, spacing, edge style (`elbow` | `curved`), and effects.

```ts
import { defineTheme, themes } from "very-nice-mermaid";

const ocean = defineTheme(
  {
    colors: { background: "#04283b", surface: "#0b3b57", accent: "#39c0ed" },
    edge: { style: "curved" },
  },
  { base: "dark", name: "ocean" },
);

renderSvg(dsl, { theme: ocean });
```

- **CLI custom theme** — pass a JSON file of the same (partial) token shape:
  `vnm render d.mmd -o d.svg --theme ./my-theme.json`. See
  [`theme.example.json`](./theme.example.json) for an annotated, copy-paste
  starting point with every token. Only include the keys you want to change —
  the rest inherit from `light`.
- **CSS variables** — the DOM renderer applies `theme.cssVars()` (`--vnm-*`) to
  its root, so you can override colors from your own stylesheet:

  ```css
  .my-diagram { --vnm-surface: #fff; --vnm-accent: #e91e63; --vnm-edge: #888; }
  ```

## Development

```bash
npm run build       # tsup → dist/ (ESM + .d.ts)
npm run typecheck   # tsc --noEmit
npm run build && npm run test:all   # build, typecheck, all tests below
```

### Tests

Three layers, run independently:

```bash
npm run test:unit   # pure unit (parser, layout, geometry, svg, ascii, theme, html)
npm run test:cli    # CLI integration — spawns the built `vnm` bin end-to-end
npm run test:e2e    # Playwright — drives the real interactive renderer in Chromium
npm test            # unit + CLI integration together (vitest)
npm run test:all    # build + typecheck + vitest + Playwright
```

- **Unit** — the pure pipeline: DSL → model → layout → SVG/ASCII, theme merging,
  the HTML-export/runtime parity guard.
- **CLI integration** (`test/cli.test.ts`) — runs the actual built binary via
  `child_process`: all four formats to files and stdout, format inference, every
  fixture rendered (valid XML SVG, zero-network HTML), PNG scaling, built-in and
  custom-JSON themes, `--layout` / `--strict` / `--title` / `--background`, and
  the error paths (bad DSL with line/col, zero-node input, unreadable files).
- **e2e** (`e2e/*.spec.ts`) — the exported HTML and the `<very-nice-mermaid>`
  element in a real browser: drag-to-reroute, pan / wheel-zoom / fit / zoom
  buttons, minimap, layout persistence, the `exportLayout`/`importLayout` handle
  API, per-theme edge geometry, subgraph rendering, and a console-error-free
  interaction session. Needs `npx playwright install chromium`.

## License

MIT
