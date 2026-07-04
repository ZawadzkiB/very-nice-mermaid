---
name: very-nice-mermaid
description: >-
  Render Mermaid diagrams from DSL into beautiful HTML / SVG / PNG / ASCII using
  the `very-nice-mermaid` CLI (`vnm`). Use whenever the user has Mermaid DSL (a
  flowchart, sequence, class, state, ER, gantt, pie, gitgraph, mindmap, …) and
  wants to render it, view it, export it, or embed it — instead of just showing
  the raw text. Renders every Mermaid diagram type; flowchart/sequence/class/state
  get a polished native, themeable, interactive treatment, the rest go through a
  bundled mermaid.js fallback. No mermaid.js runtime and no headless browser for
  the native types.
---

# very-nice-mermaid — render & view Mermaid diagrams

`very-nice-mermaid` turns Mermaid DSL into good-looking diagrams in four formats.
Reach for it whenever the user wants to *see* a diagram, not just read its source.

## Running it — no install needed

The CLI is published on npm; run it with `npx` (Node ≥ 20):

```bash
npx --yes very-nice-mermaid@latest render <input> [options]
```

`<input>` is a `.mmd` file **or** `-` to read DSL from stdin. Both `vnm` and
`very-nice-mermaid` are the command names once installed; via `npx` use the
package name as above. If it's already installed (globally or in the project),
just use `vnm render …`.

## Options

```
-o, --output <file>       output file (default: stdout). Format inferred from its extension.
-f, --format <fmt>        html | svg | png | md   (md = ASCII in a fenced code block)
-t, --theme <name|path>   light | dark | fancy, or a path to a theme .json
    --strict              treat warnings as errors (non-zero exit)
    --scale <n>           PNG scale factor (HiDPI), e.g. 2
    --background <color>  background color, or 'transparent'
    --title <title>       HTML document <title>
```

## Choosing a format — this is the important part

Pick the format by what you're trying to do:

- **Show the diagram inline in the conversation / a markdown file → `-f md`** (ASCII).
  It prints a fenced code block you can paste straight into your reply or a `.md`.
  Best for flowcharts and sequence diagrams.
  ```bash
  echo 'flowchart LR; A[Start] --> B{OK?}; B -->|yes| C([Done]); B -->|no| A' \
    | npx --yes very-nice-mermaid@latest render - -f md
  ```

- **Verify how it actually looks (and let Claude see it) → render a PNG, then Read it.**
  ```bash
  npx --yes very-nice-mermaid@latest render diagram.mmd -f png --theme dark --scale 2 -o /tmp/diagram.png
  ```
  Then open/Read `/tmp/diagram.png` to view it. Use this to confirm a diagram is
  correct before presenting it.

- **Give the user something interactive → render HTML, then open it.**
  ```bash
  npx --yes very-nice-mermaid@latest render diagram.mmd -f html --theme fancy -o diagram.html
  ```
  The HTML is fully self-contained (no network). For flowchart/sequence/class/state
  it's interactive — drag nodes, edges re-route live, pan / zoom / fit / minimap.
  Open it with the platform opener (`open` on macOS, `xdg-open` on Linux) or tell
  the user the path.

- **Embed in a doc / site → `-f svg`** (or `.svg` output extension). Static, themeable, scalable.

## Themes

`--theme light | dark | fancy`. `fancy` adds curved edges and a bit of glow. For a
custom look, pass a JSON file of theme tokens (`--theme ./my-theme.json`): colors
(incl. per-role node fills/strokes), radii, fonts, `edge.style` (`elbow`|`curved`),
spacing, effects. Only the keys you set override the built-in `light` base.

## What renders how

- **Native (polished, themeable, interactive in HTML):** `flowchart`/`graph`,
  `sequenceDiagram`, `classDiagram`, `stateDiagram-v2`.
- **ASCII (`-f md`):** flowchart + sequence (the two where box-art reads).
- **Fallback (via bundled mermaid.js):** every other type — `erDiagram`, `gantt`,
  `pie`, `gitGraph`, `mindmap`, `journey`, `timeline`, `kanban`, C4, … These render
  in the **browser/HTML** fine. From the **CLI**, layout-heavy ones can't render
  headlessly and the CLI will say so with a clear `fallback-render-unavailable`
  message rather than producing a broken file — that's expected, not a bug.

## Diagnostics

The CLI writes structured notes to **stderr** (the diagram still goes to stdout /
the output file): parser warnings with `line:col`, `capability-unavailable` (e.g.
ASCII for a non-ASCII type), unsafe-theme-value drops, and the fallback notices
above. `--strict` turns warnings into a non-zero exit; add `--quiet` to mute info.

## Typical flow for Claude

1. The user provides or asks for a Mermaid diagram.
2. Decide the format from intent (inline → `md`; "show me / does it look right" →
   `png` then Read it; "let me play with it" → `html` then open; "for my docs" → `svg`).
3. Run `npx --yes very-nice-mermaid@latest render …`.
4. For PNG, Read the file to view it; for HTML, open it or give the path; for
   ASCII, paste the fenced block into your reply.
5. If stderr reports a fallback/degradation, relay it plainly (e.g. "gantt can't
   render from the CLI headlessly — here's the interactive HTML instead, open it
   in a browser").
