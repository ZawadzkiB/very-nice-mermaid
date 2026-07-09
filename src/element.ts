/**
 * The `<very-nice-mermaid>` custom element. Self-registers on import (browser
 * only). Reads the diagram from inline text content or a `src` attribute, a
 * theme from the `theme` attribute, and the hand-drawn drawing style from a
 * boolean `sketch` attribute (a separate name from the reserved DOM `style`
 * attribute; flowchart tier).
 *
 * ```html
 * <very-nice-mermaid theme="dark" sketch>
 *   flowchart LR
 *     A[Start] --> B{Choice} --> C([Done])
 * </very-nice-mermaid>
 * ```
 */

import { mountAsync, type AnyRuntimeHandle } from "./render/dom/index.js";

export class VeryNiceMermaidElement extends HTMLElement {
  private handle: AnyRuntimeHandle | null = null;
  private source = "";
  /** Guards against overlapping async renders (attribute changes during a render). */
  private renderToken = 0;

  static get observedAttributes(): string[] {
    return ["theme", "src", "sketch"];
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
    // Boolean `sketch` attribute → hand-drawn style (any value except "false").
    const style = this.hasAttribute("sketch") && this.getAttribute("sketch") !== "false" ? "sketch" : "clean";
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
    // Route EVERY diagram type through the async router (mountAsync), not just
    // flowchart — a raw sequence/class/state renders natively and any other type
    // via the mermaid.js fallback, instead of being misparsed as a flowchart.
    const token = ++this.renderToken;
    this.handle?.destroy();
    this.handle = null;
    this.textContent = "";
    try {
      const handle = await mountAsync(this, dsl, { theme, style });
      if (token !== this.renderToken) {
        handle.destroy(); // a newer render superseded this one
        return;
      }
      this.handle = handle;
    } catch (err) {
      if (typeof console !== "undefined") {
        console.error("very-nice-mermaid:", (err as Error)?.message ?? err);
      }
    }
  }

  /** The live renderer handle (after mount). */
  get diagram(): AnyRuntimeHandle | null {
    return this.handle;
  }
}

/** Register the element (idempotent, browser only). */
export function defineElement(tag = "very-nice-mermaid"): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(tag)) customElements.define(tag, VeryNiceMermaidElement);
}

defineElement();
