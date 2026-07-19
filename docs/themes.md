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
| `arch` | **archify look** — near-black slate canvas, monospace type, jewel-tone [semantic roles](#semantic-node-roles). |
| `arch-light` | The archify look on a light background. |

```bash
vnm render diagram.mmd -o out.svg --theme fancy
```

```ts
renderSvg(dsl, { theme: "dark" });
```

## Semantic node roles

A **role** is a named node palette (fill + stroke + text) a node opts into from
the DSL — `A[Web App]:::frontend` or `class A frontend`. The `arch` / `arch-light`
themes ship the seven-type vocabulary that gives archify-style diagrams their
readable, colour-coded look, and — because a role vocabulary that only works in
one theme is a trap — the same seven resolve under **every** built-in theme:

| Role | Use for | Tone |
|---|---|---|
| `frontend` | Clients, UIs, browsers | cyan |
| `backend` | Services, APIs, workers | emerald |
| `database` | Stores, caches | violet |
| `cloud` | Managed infra, CDN/WAF | amber |
| `security` | Auth, secrets, policy | rose |
| `messagebus` | Kafka, queues, topics | orange |
| `external` | 3rd parties, users | slate |

Plus the generic `accent` / `success` / `warn` / `danger` every theme has always had.

```
flowchart LR
  user[User]:::external --> web[Web App]:::frontend --> api[API]:::backend
  api --> db[(Postgres)]:::database
  api --> auth[Auth]:::security
  api --> bus[Kafka]:::messagebus
```

```bash
vnm render app.mmd -o app.svg --theme arch
```

Define your own roles (or override these) in a [custom theme](#custom-themes) under
`colors.roles`.

## Archify-style sequence diagrams

Sequence diagrams pick up the same semantic vocabulary automatically — no `:::role`
needed, since Mermaid's sequence syntax has no place for it. Each participant is
**coloured by a role inferred from its name** (a `PostgreSQL` participant reads as a
store, `Redis` as a cache, `Auth Service` as security, `Kafka` as a bus, …), and that
colour flows through the whole diagram:

- **Type sub-label** under each name (`store`, `cache`, `gateway`, `auth`, …).
- **Role-coloured lifelines** — each lifeline takes its participant's colour.
- **Activation bars** — mermaid's `->>+` / `-->>-` (activate / deactivate) draw a
  coloured bar on the lifeline for as long as a participant is active (they **nest**).
- **Semantic message colours** — from the arrow style + label keywords: request
  (green), response (dashed, grey), cache (violet), async (orange), exception (red).
- A **legend** auto-built from the message kinds actually used.

```
sequenceDiagram
  participant U as User
  participant A as API Gateway
  participant D as PostgreSQL
  participant K as Kafka
  U->>+A: POST /login
  A->>+D: lookup user
  D-->>-A: user record
  A->>K: emit login event
  A-->>-U: 200 + JWT
```

```bash
vnm render login.mmd -o login.html --theme arch
```

It all works in the static SVG/PNG **and** the interactive HTML, in `clean` and
`sketch`. Participants whose names match nothing fall back to the plain surface box.

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
