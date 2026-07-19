---
title: Gallery
nav_order: 2
---

{%- comment -%}
Cache-buster for the interactive embeds + thumbnails: the per-deploy commit SHA so a
new release always forces browsers to re-fetch (iframes cache separately from the page);
falls back to the site version for local builds. Appended as ?v=… to every asset URL.
{%- endcomment -%}
{%- assign cachebust = site.github.build_revision | default: site.version -%}

# Live gallery
{: .no_toc }

Every diagram below is the **real interactive HTML export** — the exact file
`vnm render diagram.mmd -o out.html` produces, embedded in an `<iframe>`. It runs
entirely in your browser, no server involved.

> **Try it:** drag a node and its edges re-route live off the card borders. Scroll
> to **zoom** at the cursor, drag the empty background to **pan**, and use the
> toolbar to fit / reset / **Save SVG · PNG**. Grab a corner handle on a selected
> node to **resize** it.

Each section shows the DSL, one diagram live, and a grid of every **style × theme**
combination — click any thumbnail to open that one full-screen. These are
regenerated from the current renderer on every `npm run docs`, so they never drift.
{: .fs-3 }

1. TOC
{:toc}

---

## Flowchart

```mermaid
flowchart TD
  start([Push to main]) --> lint{Lint passes?}
  lint -->|yes| test[Run tests]
  lint -->|no| fail[(Report failure)]
  test --> deploy{{Deploy?}}
  deploy -->|prod| prod[/Ship to prod/]
  deploy -->|staging| stg[Ship to staging]
  prod --> done((Done))
  stg --> done
  fail --> done
```

<iframe class="vnm-embed" src="{{ '/interactive/flowchart-clean-dark.html' | relative_url }}?v={{ cachebust }}" title="Interactive flowchart (dark)" loading="lazy"></iframe>

[Open full-screen ↗]({{ '/interactive/flowchart-clean-dark.html' | relative_url }}?v={{ cachebust }}){: .btn .btn-outline }

<div class="vnm-thumbs" markdown="0">
  <a href="{{ '/interactive/flowchart-clean-light.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/flowchart-clean-light.png' | relative_url }}?v={{ cachebust }}" alt="flowchart clean light"><span class="cap">clean · light</span></a>
  <a href="{{ '/interactive/flowchart-clean-dark.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/flowchart-clean-dark.png' | relative_url }}?v={{ cachebust }}" alt="flowchart clean dark"><span class="cap">clean · dark</span></a>
  <a href="{{ '/interactive/flowchart-clean-fancy.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/flowchart-clean-fancy.png' | relative_url }}?v={{ cachebust }}" alt="flowchart clean fancy"><span class="cap">clean · fancy</span></a>
  <a href="{{ '/interactive/flowchart-sketch-light.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/flowchart-sketch-light.png' | relative_url }}?v={{ cachebust }}" alt="flowchart sketch light"><span class="cap">sketch · light</span></a>
  <a href="{{ '/interactive/flowchart-sketch-dark.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/flowchart-sketch-dark.png' | relative_url }}?v={{ cachebust }}" alt="flowchart sketch dark"><span class="cap">sketch · dark</span></a>
  <a href="{{ '/interactive/flowchart-sketch-fancy.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/flowchart-sketch-fancy.png' | relative_url }}?v={{ cachebust }}" alt="flowchart sketch fancy"><span class="cap">sketch · fancy</span></a>
</div>

---

## Architecture · arch theme

The [archify](https://github.com/tt-a1i/archify) look — a slate canvas, monospace type,
per-type [semantic role](../themes/#semantic-node-roles) colours, and clean routing that
keeps a reserved gap around every shape and detours around obstacles.

```mermaid
flowchart LR
  user[User Browser]:::external
  subgraph edge [Edge]
    cdn[CDN / WAF]:::cloud
    web[Web App]:::frontend
  end
  subgraph services [Services]
    api[API Gateway]:::backend
    auth[Auth Service]:::security
    worker[Worker]:::backend
  end
  subgraph data [Data]
    db[(PostgreSQL)]:::database
    cache[(Redis)]:::database
    bus[Kafka]:::messagebus
  end
  user --> cdn --> web --> api
  api -->|verify JWT| auth
  api --> db
  api --> cache
  api --> bus --> worker --> db
```

<iframe class="vnm-embed" src="{{ '/interactive/architecture-clean-arch.html' | relative_url }}?v={{ cachebust }}" title="Interactive architecture (arch)" loading="lazy"></iframe>

[Open full-screen ↗]({{ '/interactive/architecture-clean-arch.html' | relative_url }}?v={{ cachebust }}){: .btn .btn-outline }

<div class="vnm-thumbs" markdown="0">
  <a href="{{ '/interactive/architecture-clean-arch.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/architecture-clean-arch.png' | relative_url }}?v={{ cachebust }}" alt="architecture clean arch"><span class="cap">clean · arch</span></a>
  <a href="{{ '/interactive/architecture-clean-arch-light.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/architecture-clean-arch-light.png' | relative_url }}?v={{ cachebust }}" alt="architecture clean arch-light"><span class="cap">clean · arch-light</span></a>
  <a href="{{ '/interactive/architecture-clean-dark.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/architecture-clean-dark.png' | relative_url }}?v={{ cachebust }}" alt="architecture clean dark"><span class="cap">clean · dark</span></a>
  <a href="{{ '/interactive/architecture-clean-fancy.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/architecture-clean-fancy.png' | relative_url }}?v={{ cachebust }}" alt="architecture clean fancy"><span class="cap">clean · fancy</span></a>
  <a href="{{ '/interactive/architecture-sketch-arch.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/architecture-sketch-arch.png' | relative_url }}?v={{ cachebust }}" alt="architecture sketch arch"><span class="cap">sketch · arch</span></a>
  <a href="{{ '/interactive/architecture-sketch-fancy.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/architecture-sketch-fancy.png' | relative_url }}?v={{ cachebust }}" alt="architecture sketch fancy"><span class="cap">sketch · fancy</span></a>
</div>

---

## Sequence

```mermaid
sequenceDiagram
  participant U as User
  participant A as API
  participant DB as Database
  U->>A: POST /login
  A->>DB: lookup user
  DB-->>A: user record
  A->>A: verify password
  A-->>U: 200 + JWT
```

<iframe class="vnm-embed" src="{{ '/interactive/sequence-clean-dark.html' | relative_url }}?v={{ cachebust }}" title="Interactive sequence diagram (dark)" loading="lazy"></iframe>

[Open full-screen ↗]({{ '/interactive/sequence-clean-dark.html' | relative_url }}?v={{ cachebust }}){: .btn .btn-outline }

<div class="vnm-thumbs" markdown="0">
  <a href="{{ '/interactive/sequence-clean-light.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/sequence-clean-light.png' | relative_url }}?v={{ cachebust }}" alt="sequence clean light"><span class="cap">clean · light</span></a>
  <a href="{{ '/interactive/sequence-clean-dark.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/sequence-clean-dark.png' | relative_url }}?v={{ cachebust }}" alt="sequence clean dark"><span class="cap">clean · dark</span></a>
  <a href="{{ '/interactive/sequence-clean-fancy.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/sequence-clean-fancy.png' | relative_url }}?v={{ cachebust }}" alt="sequence clean fancy"><span class="cap">clean · fancy</span></a>
  <a href="{{ '/interactive/sequence-sketch-light.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/sequence-sketch-light.png' | relative_url }}?v={{ cachebust }}" alt="sequence sketch light"><span class="cap">sketch · light</span></a>
  <a href="{{ '/interactive/sequence-sketch-dark.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/sequence-sketch-dark.png' | relative_url }}?v={{ cachebust }}" alt="sequence sketch dark"><span class="cap">sketch · dark</span></a>
  <a href="{{ '/interactive/sequence-sketch-fancy.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/sequence-sketch-fancy.png' | relative_url }}?v={{ cachebust }}" alt="sequence sketch fancy"><span class="cap">sketch · fancy</span></a>
</div>

---

## Auth flow · archify sequence

Participants auto-colour by an inferred role, with a **type sub-label**, **role-coloured
lifelines**, **activation bars** (`->>+` / `-->>-`), **semantic message colours** (request
/ response / cache / async) and an auto-legend.

```mermaid
sequenceDiagram
  participant U as User
  participant W as Web App
  participant A as API Gateway
  participant S as Auth Service
  participant C as Redis
  participant D as PostgreSQL
  participant K as Kafka
  U->>+W: click "Log in"
  W->>+A: POST /login
  A->>+S: verify credentials
  S->>+D: lookup user
  D-->>-S: user record
  S->>S: sign JWT
  S-->>-A: 200 + JWT
  A->>C: cache session
  A->>K: emit login event
  A-->>-W: Set-Cookie: jwt
  W-->>-U: render dashboard
```

<iframe class="vnm-embed" src="{{ '/interactive/auth-sequence-clean-arch.html' | relative_url }}?v={{ cachebust }}" title="Interactive auth-flow sequence (arch)" loading="lazy"></iframe>

[Open full-screen ↗]({{ '/interactive/auth-sequence-clean-arch.html' | relative_url }}?v={{ cachebust }}){: .btn .btn-outline }

<div class="vnm-thumbs" markdown="0">
  <a href="{{ '/interactive/auth-sequence-clean-arch.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/auth-sequence-clean-arch.png' | relative_url }}?v={{ cachebust }}" alt="auth-sequence clean arch"><span class="cap">clean · arch</span></a>
  <a href="{{ '/interactive/auth-sequence-clean-arch-light.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/auth-sequence-clean-arch-light.png' | relative_url }}?v={{ cachebust }}" alt="auth-sequence clean arch-light"><span class="cap">clean · arch-light</span></a>
  <a href="{{ '/interactive/auth-sequence-clean-dark.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/auth-sequence-clean-dark.png' | relative_url }}?v={{ cachebust }}" alt="auth-sequence clean dark"><span class="cap">clean · dark</span></a>
  <a href="{{ '/interactive/auth-sequence-sketch-arch.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/auth-sequence-sketch-arch.png' | relative_url }}?v={{ cachebust }}" alt="auth-sequence sketch arch"><span class="cap">sketch · arch</span></a>
  <a href="{{ '/interactive/auth-sequence-sketch-fancy.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/auth-sequence-sketch-fancy.png' | relative_url }}?v={{ cachebust }}" alt="auth-sequence sketch fancy"><span class="cap">sketch · fancy</span></a>
</div>

---

## Class

```mermaid
classDiagram
  Animal <|-- Dog
  Animal <|-- Cat
  Animal : +int age
  Animal : +makeSound()
  class Dog { +bark() }
  class Cat { +meow() }
```

<iframe class="vnm-embed" src="{{ '/interactive/class-clean-light.html' | relative_url }}?v={{ cachebust }}" title="Interactive class diagram (light)" loading="lazy"></iframe>

[Open full-screen ↗]({{ '/interactive/class-clean-light.html' | relative_url }}?v={{ cachebust }}){: .btn .btn-outline }

<div class="vnm-thumbs" markdown="0">
  <a href="{{ '/interactive/class-clean-light.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/class-clean-light.png' | relative_url }}?v={{ cachebust }}" alt="class clean light"><span class="cap">clean · light</span></a>
  <a href="{{ '/interactive/class-clean-dark.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/class-clean-dark.png' | relative_url }}?v={{ cachebust }}" alt="class clean dark"><span class="cap">clean · dark</span></a>
  <a href="{{ '/interactive/class-clean-fancy.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/class-clean-fancy.png' | relative_url }}?v={{ cachebust }}" alt="class clean fancy"><span class="cap">clean · fancy</span></a>
  <a href="{{ '/interactive/class-sketch-light.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/class-sketch-light.png' | relative_url }}?v={{ cachebust }}" alt="class sketch light"><span class="cap">sketch · light</span></a>
  <a href="{{ '/interactive/class-sketch-dark.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/class-sketch-dark.png' | relative_url }}?v={{ cachebust }}" alt="class sketch dark"><span class="cap">sketch · dark</span></a>
  <a href="{{ '/interactive/class-sketch-fancy.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/class-sketch-fancy.png' | relative_url }}?v={{ cachebust }}" alt="class sketch fancy"><span class="cap">sketch · fancy</span></a>
</div>

---

## State

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Loading : fetch
  Loading --> Ready : 2xx
  Loading --> Error : fail
  Error --> Loading : retry
  Ready --> [*]
```

<iframe class="vnm-embed" src="{{ '/interactive/state-clean-fancy.html' | relative_url }}?v={{ cachebust }}" title="Interactive state diagram (fancy)" loading="lazy"></iframe>

[Open full-screen ↗]({{ '/interactive/state-clean-fancy.html' | relative_url }}?v={{ cachebust }}){: .btn .btn-outline }

<div class="vnm-thumbs" markdown="0">
  <a href="{{ '/interactive/state-clean-light.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/state-clean-light.png' | relative_url }}?v={{ cachebust }}" alt="state clean light"><span class="cap">clean · light</span></a>
  <a href="{{ '/interactive/state-clean-dark.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/state-clean-dark.png' | relative_url }}?v={{ cachebust }}" alt="state clean dark"><span class="cap">clean · dark</span></a>
  <a href="{{ '/interactive/state-clean-fancy.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/state-clean-fancy.png' | relative_url }}?v={{ cachebust }}" alt="state clean fancy"><span class="cap">clean · fancy</span></a>
  <a href="{{ '/interactive/state-sketch-light.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/state-sketch-light.png' | relative_url }}?v={{ cachebust }}" alt="state sketch light"><span class="cap">sketch · light</span></a>
  <a href="{{ '/interactive/state-sketch-dark.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/state-sketch-dark.png' | relative_url }}?v={{ cachebust }}" alt="state sketch dark"><span class="cap">sketch · dark</span></a>
  <a href="{{ '/interactive/state-sketch-fancy.html' | relative_url }}?v={{ cachebust }}" target="_blank"><img loading="lazy" src="{{ '/assets/state-sketch-fancy.png' | relative_url }}?v={{ cachebust }}" alt="state sketch fancy"><span class="cap">sketch · fancy</span></a>
</div>

---

## Reproduce these

Every asset on this page is generated by the built CLI:

```bash
npm install -g very-nice-mermaid

# the interactive HTML embedded above:
vnm render flowchart.mmd -o flowchart.html --theme dark
vnm render flowchart.mmd -o sketch.html   --theme light --style sketch

# the static thumbnails:
vnm render flowchart.mmd -o flowchart.png --theme dark --scale 2
```

In this repo, `npm run docs` regenerates the whole gallery from
[`examples/src/*.mmd`](https://github.com/ZawadzkiB/very-nice-mermaid/tree/master/examples/src).
