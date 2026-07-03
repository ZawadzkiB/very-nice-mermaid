# very-nice-mermaid

A framework-agnostic **Mermaid flowchart** renderer. It keeps Mermaid's DSL and
replaces everything after it with **our own parser, layout, and renderers** — so
you get **beautiful, interactive, themeable** diagrams with **no `mermaid.js`
runtime and no headless browser**.

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
  `vnm render d.mmd -o d.svg --theme ./ocean.json`.
- **CSS variables** — the DOM renderer applies `theme.cssVars()` (`--vnm-*`) to
  its root, so you can override colors from your own stylesheet:

  ```css
  .my-diagram { --vnm-surface: #fff; --vnm-accent: #e91e63; --vnm-edge: #888; }
  ```

## Development

```bash
npm run build       # tsup → dist/ (ESM + .d.ts)
npm run typecheck   # tsc --noEmit
npm test            # vitest unit tests
npm run test:e2e    # playwright (needs: npx playwright install chromium)
```

## License

MIT
