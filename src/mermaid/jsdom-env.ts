/**
 * Node-only jsdom environment for the mermaid fallback tier (D1: jsdom, never
 * Chromium). mermaid.render needs a DOM; in Node we stand up a minimal one and
 * shim the SVG layout primitives jsdom lacks (getBBox / getComputedTextLength /
 * a constructable CSSStyleSheet / window.screen). Text-measuring layouts still
 * degrade (the caller reports that per FR5), but the render succeeds.
 *
 * This module is **dynamic-imported only from the Node branch** of the mermaid
 * loader, so it never enters the browser-safe core.
 *
 * The DOM is installed **persistently and once** (idempotent). This matters:
 * mermaid's bundled DOMPurify captures `window` at its *import* moment, so a
 * real `window` must exist on `globalThis` before mermaid is ever imported —
 * otherwise `DOMPurify.sanitize` is frozen missing for the whole process. The
 * loader therefore calls {@link ensureNodeDom} *before* importing mermaid.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A constructable CSSStyleSheet — jsdom's isn't; mermaid does `new CSSStyleSheet()`. */
class CSSStyleSheetShim {
  cssRules: Array<{ cssText: string }> = [];
  insertRule(rule: string, index = this.cssRules.length): number {
    this.cssRules.splice(index, 0, { cssText: String(rule) });
    return index;
  }
  replaceSync(text: string): void {
    this.cssRules = [{ cssText: String(text) }];
  }
}

const SCREEN_STUB = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1080 };

/** Install the SVG geometry stubs jsdom is missing onto an SVGElement prototype. */
function installSvgStubs(proto: any): void {
  proto.getBBox = function getBBox(this: any) {
    const text: string = this.textContent || "";
    return { x: 0, y: 0, width: Math.max(10, text.length * 8), height: 16 };
  };
  proto.getComputedTextLength = function getComputedTextLength(this: any) {
    return Math.max(10, (this.textContent || "").length * 8);
  };
  proto.getPointAtLength = function getPointAtLength() {
    return { x: 0, y: 0 };
  };
  proto.getTotalLength = function getTotalLength() {
    return 100;
  };
  proto.getScreenCTM = function getScreenCTM() {
    return { a: 1, b: 0, c: 1, d: 1, e: 0, f: 0, inverse: () => ({}) };
  };
}

const GLOBAL_KEYS = [
  "window",
  "document",
  "navigator",
  "SVGElement",
  "Element",
  "Node",
  "HTMLElement",
  "DOMParser",
  "XMLSerializer",
  "Event",
  "CustomEvent",
  "MutationObserver",
  "NodeList",
  "DocumentFragment",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "CSSStyleSheet",
  "screen",
] as const;

/** Best-effort set of a possibly read-only global. */
function defineGlobal(key: string, value: unknown): void {
  if (value === undefined) return;
  try {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  } catch {
    // getter-only global we can't override (rare); best-effort.
  }
}

let installed = false;

/**
 * Install a persistent jsdom DOM on the process globals (idempotent). Must run
 * before mermaid is first imported (see the DOMPurify note above). No teardown:
 * the DOM lives for the process, so DOMPurify stays valid across renders. Only
 * reached on the Node fallback path — the native flowchart path never calls it.
 */
export async function ensureNodeDom(): Promise<void> {
  if (installed) return;
  const { JSDOM } = (await import("jsdom")) as any;
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    pretendToBeVisual: true,
  });
  const { window } = dom;

  installSvgStubs(window.SVGElement.prototype);
  window.CSSStyleSheet = CSSStyleSheetShim as any;

  const values: Record<string, unknown> = {
    window,
    document: window.document,
    navigator: window.navigator,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
    CSSStyleSheet: CSSStyleSheetShim,
    screen: SCREEN_STUB,
  };
  for (const key of GLOBAL_KEYS) {
    const v = key in values ? values[key] : (window as any)[key];
    defineGlobal(key, v);
  }
  installed = true;
}
