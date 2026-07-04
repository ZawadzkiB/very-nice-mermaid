/**
 * Library-surface routing (TEST-001). The public renderers, `mount()` and the
 * <very-nice-mermaid> element must route a RAW non-flowchart DSL through
 * detectType — native for sequence/class/state, the mermaid.js fallback for the
 * rest — instead of force-feeding it to the v1 flowchart parser (the historical
 * silent-misparse bug). e2e only ever drove CLI-precomputed HTML, so this is the
 * mandatory regression coverage for the library/element surface.
 *
 * Runs in the default (node) environment: the first `loadMermaid()` stands up the
 * properly-stubbed jsdom (getBBox/etc.) and installs the DOM globals, so mount()
 * and the element can render into a real DOM here — the same path the browser
 * takes with its own DOM.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { renderSvgAsync, renderHtmlAsync, renderMarkdownAsync } from "../src/render/route.js";
import { mount, mountAsync } from "../src/render/dom/index.js";
import { renderSvg } from "../src/render/svg.js";
import { renderMarkdown } from "../src/render/ascii.js";
import { loadMermaid } from "../src/mermaid/router.js";

const T = 40_000;

const SEQ = "sequenceDiagram\n participant U as User\n participant S as Server\n U->>S: ask\n S-->>U: ok";
const CLS = "classDiagram\n class Dog {\n +bark() void\n }\n class Collar\n Dog *-- Collar : has";
const STATE = "stateDiagram-v2\n [*] --> Running\n Running --> Paused : pause\n Paused --> Running : resume";
const PIE = 'pie title Pets\n "Dogs" : 386\n "Cats" : 85';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

let ElementCtor: { new (): HTMLElement } | null = null;

async function waitFor(cond: () => boolean, timeout = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timed out waiting for the diagram to render");
}

beforeAll(async () => {
  // Stand up the jsdom DOM + install globals (document/window/HTMLElement/DOMParser).
  await loadMermaid();
  const w = (globalThis as Any).window;
  if (w && !(globalThis as Any).customElements) (globalThis as Any).customElements = w.customElements;
  // Import the element only AFTER HTMLElement exists (it `extends HTMLElement`).
  const mod = (await import("../src/element.js")) as Any;
  ElementCtor = mod.VeryNiceMermaidElement;
}, T);

describe("sync renderers refuse a raw non-flowchart string (no silent misparse — FR1/TEST-001)", () => {
  it("renderSvg throws a clear 'use the async API' error for a sequence DSL", () => {
    expect(() => renderSvg(SEQ)).toThrow(/synchronous/i);
    expect(() => renderSvg(PIE)).toThrow(/renderSvgAsync/);
  });
  it("renderMarkdown throws for a class DSL rather than producing garbage", () => {
    expect(() => renderMarkdown(CLS)).toThrow(/renderMarkdownAsync/);
  });
  it("still renders a flowchart string synchronously (unchanged)", () => {
    expect(renderSvg("flowchart TD\n A-->B").startsWith("<svg")).toBe(true);
  });
});

describe("renderSvgAsync routes every type by detectType (TEST-001)", () => {
  it("renders a raw sequence DSL as a native sequence SVG (not a flowchart)", async () => {
    const svg = await renderSvgAsync(SEQ);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('<marker id="vnm-arrow"'); // native re-skin marker
    expect(svg).toContain(">User<");
    expect(svg).not.toContain(">sequenceDiagram<"); // header keyword is NOT a node
  }, T);

  it("renders a raw class DSL as a native class SVG with typed markers", async () => {
    const svg = await renderSvgAsync(CLS);
    expect(svg).toContain('id="vnm-cls-diamond-solid"'); // composition marker
    expect(svg).toContain(">Dog<");
  }, T);

  it("renders a raw state DSL as a native state SVG (start disc + arrows)", async () => {
    const svg = await renderSvgAsync(STATE);
    expect(svg).toContain('<marker id="vnm-arrow"');
    expect(svg).toContain(">Running<");
    expect(svg).not.toContain(">stateDiagram<");
  }, T);

  it("renders a fallback (pie) DSL via the mermaid.js engine", async () => {
    const svg = await renderSvgAsync(PIE);
    expect(svg).toContain("<svg");
    // mermaid's own pie output (legend labels + roledescription), not our engine
    expect(svg.toLowerCase()).toContain('aria-roledescription="pie"');
    expect(svg).toContain("Dogs");
  }, T);
});

describe("renderHtmlAsync / renderMarkdownAsync route too (TEST-001/FR4)", () => {
  it("wraps a fallback pie into a self-contained HTML doc", async () => {
    const html = await renderHtmlAsync(PIE);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Dogs");
  }, T);
  it("renders a sequence to ASCII but refuses ASCII for class (FR4)", async () => {
    const md = await renderMarkdownAsync(SEQ);
    expect(md.startsWith("```")).toBe(true);
    expect(md).toContain("User");
    await expect(renderMarkdownAsync(CLS)).rejects.toThrow(/unavailable/i);
  }, T);
});

describe("mountAsync renders native shapes, not garbage flowchart cards (TEST-001)", () => {
  it("mounts a raw sequence into the pan/zoom shell (no flowchart .vnm-node cards)", async () => {
    const el = document.createElement("div");
    await mountAsync(el, SEQ);
    expect(el.querySelector(".vnm-viewport")).not.toBeNull();
    expect(el.querySelectorAll(".vnm-node").length).toBe(0); // sequence ≠ flowchart cards
    expect(el.innerHTML).toContain("User");
    expect(el.innerHTML).not.toContain("sequenceDiagram");
  }, T);

  it("mounts a raw class into draggable cards for the real classes", async () => {
    const el = document.createElement("div");
    await mountAsync(el, CLS);
    expect(el.querySelectorAll(".vnm-node").length).toBeGreaterThan(0);
    expect(el.innerHTML).toContain("Dog");
    expect(el.innerHTML).toContain("Collar");
    expect(el.innerHTML).not.toContain("classDiagram"); // header not fabricated as a node
  }, T);

  it("mounts a raw state into cards for the real states", async () => {
    const el = document.createElement("div");
    await mountAsync(el, STATE);
    expect(el.innerHTML).toContain("Running");
    expect(el.innerHTML).toContain("Paused");
    expect(el.innerHTML).not.toContain("stateDiagram");
  }, T);

  it("mounts a fallback (pie) into the pan/zoom shell with the mermaid SVG", async () => {
    const el = document.createElement("div");
    await mountAsync(el, PIE);
    expect(el.querySelector(".vnm-viewport")).not.toBeNull();
    expect(el.querySelectorAll(".vnm-node").length).toBe(0);
    expect(el.innerHTML).toContain("Dogs"); // mermaid pie content, not flowchart garbage
  }, T);
});

describe("mount() returns synchronously and finishes a non-flowchart render async (TEST-001)", () => {
  it("returns a usable handle immediately and renders the sequence shortly after", async () => {
    const el = document.createElement("div");
    const handle = mount(el, SEQ);
    expect(typeof handle.fit).toBe("function");
    expect(typeof handle.destroy).toBe("function");
    await waitFor(() => el.querySelector(".vnm-viewport") !== null);
    expect(el.innerHTML).toContain("User");
    expect(el.querySelectorAll(".vnm-node").length).toBe(0);
  }, T);

  it("renders a flowchart string synchronously (unchanged sync fast path)", () => {
    const el = document.createElement("div");
    mount(el, "flowchart TD\n A[Start]-->B[End]");
    expect(el.querySelector(".vnm-viewport")).not.toBeNull();
    expect(el.querySelectorAll(".vnm-node").length).toBeGreaterThan(0);
  });
});

describe("the <very-nice-mermaid> element routes raw DSL by type (TEST-001)", () => {
  async function renderElement(dsl: string, theme = "light"): Promise<HTMLElement> {
    const el = new ElementCtor!() as Any;
    el.setAttribute("theme", theme);
    el.source = dsl; // what connectedCallback would capture from inline text
    await el.renderDiagram(); // drive the element's own routing path directly
    return el as HTMLElement;
  }

  it("renders an inline sequence natively (not flowchart-shaped garbage)", async () => {
    const el = await renderElement(SEQ);
    expect(el.querySelector(".vnm-viewport")).not.toBeNull();
    expect(el.querySelectorAll(".vnm-node").length).toBe(0);
    expect(el.innerHTML).toContain("User");
  }, T);

  it("renders an inline state natively (cards for the real states)", async () => {
    const el = await renderElement(STATE);
    expect(el.innerHTML).toContain("Running");
    expect(el.innerHTML).not.toContain("stateDiagram");
  }, T);

  it("renders an inline pie via the mermaid.js fallback shell", async () => {
    const el = await renderElement(PIE);
    expect(el.querySelector(".vnm-viewport")).not.toBeNull();
    expect(el.innerHTML).toContain("Dogs");
  }, T);

  it("still renders an inline flowchart (unchanged)", async () => {
    const el = await renderElement("flowchart LR\n A-->B-->C");
    expect(el.querySelectorAll(".vnm-node").length).toBeGreaterThan(1);
  }, T);
});
