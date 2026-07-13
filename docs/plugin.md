---
title: Claude Code plugin
nav_order: 6
---

# Claude Code plugin
{: .no_toc }

very-nice-mermaid ships a **Claude Code plugin** that bundles one **skill** -
also called `very-nice-mermaid`. It teaches Claude Code to *render* Mermaid
diagrams with the `vnm` CLI instead of just printing the raw DSL: ASCII inline,
a PNG it can look at to check the result, an interactive HTML page, or an SVG for
your docs.

1. TOC
{:toc}

---

## Install

In Claude Code, add this repo as a plugin marketplace, then install the plugin:

```
/plugin marketplace add ZawadzkiB/very-nice-mermaid
/plugin install very-nice-mermaid@very-nice-mermaid
```

That's it. The skill activates **automatically** whenever you ask Claude to render,
view, or export a Mermaid diagram - no command to remember. Just ask:

> "Render this flowchart so I can see it" · "Turn this sequence diagram into an
> interactive HTML page" · "Export that state machine as an SVG for my docs"

**Requirements:** [Claude Code](https://claude.com/claude-code) and **Node ≥ 20**
(the skill runs the published CLI via `npx very-nice-mermaid`, so there's nothing
else to install).

## What the skill does

It picks the right output format for what you're doing:

| You want to… | The skill uses | Result |
|---|---|---|
| See it inline in chat / a markdown file | `-f md` | ASCII in a fenced block, pasted into the reply |
| Check it actually looks right | `-f png` then reads the image | Claude renders a PNG and looks at it before presenting |
| Play with it | `-f html` then opens it | A self-contained interactive page (drag / zoom / pan) |
| Embed it in docs | `-f svg` | A static, themeable, scalable SVG |

It also relays diagnostics plainly - e.g. if a layout-heavy fallback type (gantt,
ER, …) can't render headlessly from the CLI, it tells you and offers the
interactive HTML instead. See the [CLI reference]({{ '/cli' | relative_url }}) for
the full option set the skill drives.

## Updating

`/plugin install` reads a **local copy** of the marketplace, so reinstalling on its
own won't pull a newer version. Refresh the marketplace first:

```
/plugin marketplace update very-nice-mermaid
/plugin install very-nice-mermaid@very-nice-mermaid
/reload-plugins
```

## Local development

Hacking on the skill itself? Add your local clone as the marketplace instead of the
GitHub one (they share the name `very-nice-mermaid`, so use one or the other):

```
/plugin marketplace add /path/to/very-nice-mermaid
/plugin install very-nice-mermaid@very-nice-mermaid
```

After each change, bump `version` in `.claude-plugin/plugin.json` (a reload only
picks up a new version), then:

```
/plugin marketplace update very-nice-mermaid
/plugin install very-nice-mermaid@very-nice-mermaid
/reload-plugins
```

The skill's source of truth is
[`skills/very-nice-mermaid/SKILL.md`](https://github.com/ZawadzkiB/very-nice-mermaid/blob/master/skills/very-nice-mermaid/SKILL.md).
