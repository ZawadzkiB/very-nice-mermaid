---
title: CLI
nav_order: 3
---

# CLI reference
{: .no_toc }

The `vnm` binary renders a `.mmd` file (or stdin) to interactive HTML, static SVG,
PNG, or ASCII. Both `vnm` and `very-nice-mermaid` are installed as bins.

1. TOC
{:toc}

---

## Usage

```bash
vnm render <file|-> [options]

  -o, --output <file>       output file (default: stdout)
  -f, --format <fmt>        html | svg | png | md   (inferred from -o if omitted)
  -t, --theme <name|path>   light | dark | fancy, or a theme .json file
  -s, --style <clean|sketch> drawing style: clean (default) or hand-drawn sketch
      --strict              treat parser warnings as errors
      --layout <file>       apply a portable layout.json (node positions + sizes)
      --scale <n>           PNG scale factor (HiDPI)
      --background <color>  background color, or 'transparent'
      --title <title>       HTML document <title>
```

Pass `-` as the file to read the DSL from **stdin**.

## Examples

```bash
vnm render diagram.mmd -o diagram.html --theme dark   # interactive page
vnm render diagram.mmd -o diagram.svg                 # static SVG
vnm render diagram.mmd -o sketch.svg --style sketch   # hand-drawn look
vnm render diagram.mmd -o diagram.png --scale 2       # HiDPI PNG
cat diagram.mmd | vnm render - -f md                  # ASCII to stdout
```

No install required — `npx` runs the published binary:

```bash
npx very-nice-mermaid render diagram.mmd -o diagram.html --theme dark
```

## Output formats

| Format | Flag / extension | What it is |
|---|---|---|
| **HTML** | `-f html` / `.html` | A **self-contained interactive** page — drag / resize / pan / zoom, Save SVG · PNG, zero network. Open in any browser. |
| **SVG** | `-f svg` / `.svg` | A static, themed SVG string. Draws each node's full shape silhouette. |
| **PNG** | `-f png` / `.png` | The SVG rasterized via `@resvg/resvg-js` (optional dep). Use `--scale 2` for HiDPI. |
| **Markdown / ASCII** | `-f md` / `.md` | An ASCII rendering in a ```` ``` ````-fenced block. Flowchart + sequence only. |

Format is inferred from the `-o` extension when `-f` is omitted. Diagnostics go to
**stderr** with `line:col`; the exit code is non-zero on error.

> **PNG needs the rasterizer.** Install the optional native dependency only if you
> want PNG output: `npm install @resvg/resvg-js`.

## Styles vs. themes

`--style` and `--theme` are **two independent axes**:

- `--theme light|dark|fancy` (or a JSON file) picks the **palette** + edge style.
- `--style clean|sketch` picks the **drawing style** — `sketch` is a hand-drawn,
  Excalidraw-like look with wobbly outlines, open arrowheads, and a bundled
  handwriting font. It is **deterministic and self-contained** (the font embeds as
  base64 — zero network).

They compose: `--style sketch --theme fancy` is a hand-drawn diagram in the fancy
palette. Sketch works for flowchart / sequence / class / state diagrams; the
mermaid.js fallback types keep their own look. See
[Themes & styles]({{ '/themes' | relative_url }}).

## Diagram types

The CLI routes **every** Mermaid diagram type automatically:

- **flowchart** — the built-in, dependency-free parser + layout (the fast path).
- **sequence / class / state** — re-skinned into the same themed engine.
- **everything else** (pie, gantt, ER, gitgraph, mindmap, …) — the bundled
  **mermaid.js fallback** engine.

> **Headless note:** in Node, layout-heavy fallback types (gantt / ER / gitgraph / …)
> render degenerately under jsdom, so the CLI reports a clear
> `fallback-render-unavailable` error for them — they render correctly in a real
> browser. Pie and the native tiers (flowchart / sequence / class / state) are
> unaffected.

## Portable layouts

`--layout <file>` applies a previously exported `layout.json` (node positions +
sizes + edge anchor pins) to a static render, so a hand-arranged diagram reproduces
exactly. Export one from the interactive view via `handle.exportLayout()` or the
standalone HTML export — see the [Library API]({{ '/library' | relative_url }}#interactive-mount).
