/**
 * SVG → model reader for native sequence diagrams (FR2 / D3).
 *
 * We render the sequence DSL **once** with mermaid.js (via the shared lazy
 * {@link loadMermaid} path — jsdom stood up before the first mermaid import, and
 * `htmlLabels:false` so labels are measurable SVG `<text>`; see spike-01.md),
 * then read a clean, structured {@link SequenceModel} straight from the SVG.
 * Sequence uses mermaid's **bespoke ordered layout** (not dagre), so its
 * headless geometry is sane and the ordering is trustworthy — but we keep only
 * the *structure* (participants + ordered messages) and re-layout with our own
 * deterministic, theme-driven layout so our spacing/themes apply.
 *
 * Browser-safe: no static mermaid/jsdom import here — mermaid is loaded through
 * {@link loadMermaid} (dynamic), and the SVG is parsed with `DOMParser`, a DOM
 * global present in the browser and in the jsdom the loader installs in Node.
 */

import type {
  SequenceModel,
  SequenceParticipant,
  SequenceMessage,
  SequenceArrowKind,
} from "../../model/sequence.js";
import { loadMermaid } from "../../mermaid/router.js";

/** A stable id keeps mermaid's internal ids deterministic across runs. */
const READ_ID = "vnm-seq-read";

/** Render the sequence DSL to an SVG string via mermaid (headless-safe config). */
async function renderMermaidSvg(dsl: string): Promise<string> {
  // In Node (no host DOM) this also stands up the persistent jsdom DOM before
  // mermaid loads; against a real/browser DOM it uses that DOM as-is.
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    deterministicIds: true,
    // SVG <text>/<tspan> labels, not HTML <foreignObject> — measurable under our
    // jsdom stubs and clean to read. See spike-01.md.
    htmlLabels: false,
    sequence: { htmlLabels: false },
  });
  const { svg } = await mermaid.render(READ_ID, dsl);
  return svg;
}

/** Does an element's `class` attribute contain a whitespace-delimited token? */
function hasClass(el: Element, token: string): boolean {
  const cls = el.getAttribute("class");
  if (!cls) return false;
  return cls.split(/\s+/).includes(token);
}

/**
 * Normalize a captured label: strip zero-width characters (mermaid emits a lone
 * U+200B as the "text" of an unlabeled message, which `String.trim()` does NOT
 * remove) so an unlabeled message carries `""` and no stray label plate is drawn
 * (REV-007).
 */
function cleanLabel(raw: string | null | undefined): string {
  // U+200B ZWSP · U+200C ZWNJ · U+200D ZWJ · U+FEFF BOM
  return (raw ?? "").replace(/[​‌‍﻿]/g, "").trim();
}

/** The numeric center x of each participant's lifeline, by participant id. */
function lifelineCenters(doc: Document): Map<string, number> {
  const centers = new Map<string, number>();
  for (const line of Array.from(doc.querySelectorAll('line[data-et="life-line"]'))) {
    const id = line.getAttribute("data-id");
    const x1 = parseFloat(line.getAttribute("x1") ?? "");
    if (id && Number.isFinite(x1)) centers.set(id, x1);
  }
  return centers;
}

/** Read participants from `g[data-et="participant"]`, ordered by lifeline x. */
function readParticipants(doc: Document, centers: Map<string, number>): SequenceParticipant[] {
  const seen = new Map<string, string>(); // id → label
  for (const g of Array.from(doc.querySelectorAll('[data-et="participant"]'))) {
    const id = g.getAttribute("data-id");
    if (!id || seen.has(id)) continue;
    // The display label is the actor-box <text> inside the group; fall back to id.
    const labelEl = g.querySelector("text");
    const label = (labelEl?.textContent ?? "").trim() || id;
    seen.set(id, label);
  }
  const participants = Array.from(seen, ([id, label]) => ({
    id,
    label,
    x: centers.get(id) ?? Number.POSITIVE_INFINITY,
  }));
  // Left-to-right by lifeline center; ids with no lifeline sort last, stably.
  participants.sort((a, b) => a.x - b.x);
  return participants.map((p, order) => ({ id: p.id, label: p.label, order }));
}

/**
 * Read ordered messages by walking the SVG in document order. mermaid emits each
 * message as its (optional) `text.messageText` immediately followed by the
 * message line/path (`data-et="message"` with `data-from`/`data-to`), so the
 * most-recent unconsumed message text is the current message's label.
 */
function readMessages(doc: Document, ids: Set<string>): SequenceMessage[] {
  const messages: SequenceMessage[] = [];
  let pendingLabel = "";
  let order = 0;
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    if (hasClass(el, "messageText")) {
      pendingLabel = cleanLabel(el.textContent);
      continue;
    }
    if (el.getAttribute("data-et") !== "message") continue;
    const from = el.getAttribute("data-from") ?? "";
    const to = el.getAttribute("data-to") ?? "";
    // Only keep messages whose endpoints are real participants.
    if (!ids.has(from) || !ids.has(to)) {
      pendingLabel = "";
      continue;
    }
    // messageLine1 is dashed (`-->`); messageLine0 is solid (`->`).
    const kind: SequenceArrowKind = hasClass(el, "messageLine1") ? "dashed" : "solid";
    messages.push({
      from,
      to,
      label: pendingLabel,
      kind,
      arrowEnd: el.hasAttribute("marker-end"),
      self: from === to,
      order: order++,
    });
    pendingLabel = "";
  }
  return messages;
}

/**
 * Read a {@link SequenceModel} from a sequence DSL string by rendering it with
 * mermaid and parsing the resulting SVG. Deterministic: the participants,
 * message order, direction and line style are all recovered from the DSL's
 * structure (not from mermaid's pixel geometry, which we discard).
 */
export async function readSequenceModel(dsl: string): Promise<SequenceModel> {
  const svg = await renderMermaidSvg(dsl);
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const centers = lifelineCenters(doc);
  const participants = readParticipants(doc, centers);
  const ids = new Set(participants.map((p) => p.id));
  const messages = readMessages(doc, ids);
  return { kind: "sequence", participants, messages };
}
