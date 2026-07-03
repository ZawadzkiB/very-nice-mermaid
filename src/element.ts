/**
 * The `<very-nice-mermaid>` custom element. Self-registers on import (browser
 * only). Reads the diagram from inline text content or a `src` attribute, and a
 * theme from the `theme` attribute.
 *
 * ```html
 * <very-nice-mermaid theme="dark">
 *   flowchart LR
 *     A[Start] --> B{Choice} --> C([Done])
 * </very-nice-mermaid>
 * ```
 */

import { mount, type RuntimeHandle } from "./render/dom/index.js";

export class VeryNiceMermaidElement extends HTMLElement {
  private handle: RuntimeHandle | null = null;
  private source = "";

  static get observedAttributes(): string[] {
    return ["theme", "src"];
  }

  connectedCallback(): void {
    // Capture inline DSL once, before we replace our own contents.
    if (!this.source) this.source = (this.textContent ?? "").trim();
    this.style.display = this.style.display || "block";
    if (!this.style.height && !this.style.minHeight) this.style.minHeight = "320px";
    this.style.position = this.style.position || "relative";
    void this.renderDiagram();
  }

  disconnectedCallback(): void {
    this.handle?.destroy();
    this.handle = null;
  }

  attributeChangedCallback(): void {
    if (this.isConnected) void this.renderDiagram();
  }

  private async renderDiagram(): Promise<void> {
    const theme = this.getAttribute("theme") ?? "light";
    const src = this.getAttribute("src");
    let dsl = this.source;
    if (src) {
      try {
        dsl = await fetch(src).then((r) => r.text());
      } catch {
        dsl = this.source;
      }
    }
    if (!dsl.trim()) return;
    this.handle?.destroy();
    this.textContent = "";
    this.handle = mount(this, dsl, { theme });
  }

  /** The live renderer handle (after mount). */
  get diagram(): RuntimeHandle | null {
    return this.handle;
  }
}

/** Register the element (idempotent, browser only). */
export function defineElement(tag = "very-nice-mermaid"): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(tag)) customElements.define(tag, VeryNiceMermaidElement);
}

defineElement();
