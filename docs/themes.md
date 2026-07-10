---
title: Themes & styles
nav_order: 5
---

# Themes & styles
{: .no_toc }

Two independent axes: the **theme** (palette + edge style) and the **style**
(clean vs. hand-drawn sketch). They compose freely.

1. TOC
{:toc}

---

## Built-in themes

| Theme | Look |
|---|---|
| `light` | Clean light palette, elbow edges. |
| `dark` | Dark palette, elbow edges. |
| `fancy` | Richer palette with **curved edges** and glow. |

```bash
vnm render diagram.mmd -o out.svg --theme fancy
```

```ts
renderSvg(dsl, { theme: "dark" });
```

## The sketch style

`--style sketch` (CLI) / `{ style: "sketch" }` (API) / the boolean `sketch`
attribute (web component) is a **separate axis** from the theme — a hand-drawn,
Excalidraw-like look: wobbly multi-stroke outlines, open arrowheads, and a bundled
handwriting font. It is **deterministic** (seeded roughness — same input, byte-
identical output) and **self-contained** (the font embeds as base64, so there's zero
network). It composes with any theme and works for flowchart / sequence / class /
state diagrams (the mermaid.js fallback types keep their own look).

```bash
vnm render diagram.mmd -o out.svg --style sketch --theme fancy
```

See every combination live in the [Gallery]({{ '/gallery' | relative_url }}).

## Custom themes

A theme is a **token set**: colors (including per-role node fills / strokes), radii,
font stacks, spacing, edge style (`elbow` | `curved`), and effects.

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

Only include the keys you want to change — the rest inherit from the `base`.

### CLI custom theme

Pass a JSON file of the same (partial) token shape:

```bash
vnm render d.mmd -o d.svg --theme ./my-theme.json
```

See
[`theme.example.json`](https://github.com/ZawadzkiB/very-nice-mermaid/blob/master/theme.example.json)
for an annotated, copy-paste starting point with every token. Only include the keys
you want to change — the rest inherit from `light`.

### CSS variables

The DOM renderer applies `theme.cssVars()` (`--vnm-*`) to its root, so you can
override colors from your own stylesheet:

```css
.my-diagram {
  --vnm-surface: #fff;
  --vnm-accent: #e91e63;
  --vnm-edge: #888;
}
```
