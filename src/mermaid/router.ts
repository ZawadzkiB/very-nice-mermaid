/**
 * `detectType`-based router (FR1). Classifies a Mermaid DSL string and dispatches
 * it to the right renderer tier:
 *   - **native** — our own themed/interactive engine. Today: the flowchart family.
 *   - **fallback** — the mermaid.js engine (render → SVG). Everything else.
 *
 * This is where the historical *silent-misparse* bug is fixed: a KNOWN
 * non-flowchart type (sequence, pie, gantt, …) is routed to the fallback tier
 * instead of being force-fed to the flowchart parser and turned into garbage.
 * A truly undetectable input is handed to the flowchart parser, which handles
 * the legitimate header-less form (`A-->B`) and, for genuine garbage, yields
 * zero nodes → the CLI's clear "no diagram found" error (D6).
 *
 * mermaid is imported **lazily** (dynamic `import()`) and only when the cheap
 * flowchart short-circuit misses, so flowchart-only paths never pay its cost.
 */

/** The renderer tier a diagram is dispatched to. */
export type DiagramTier = "native" | "fallback";

/** Which engine renders the diagram. */
export type RendererId = "flowchart" | "mermaid";

/** The result of classifying a DSL string. */
export interface Classification {
  /** mermaid's `detectType` result, or `null` when it couldn't detect one. */
  detected: string | null;
  /** Normalized type name (`flowchart` for the whole flow family). */
  type: string;
  tier: DiagramTier;
  renderer: RendererId;
  /**
   * True when this type is *planned* to become a native re-skinned renderer
   * (per the task-1 spike) but currently still routes to fallback. Lets the CLI
   * word its diagnostic honestly ("native pending" vs "fallback by design").
   */
  nativePlanned: boolean;
}

/** mermaid's `detectType` values for the flowchart family (all render natively). */
const FLOWCHART_TYPES = new Set(["flowchart", "flowchart-v2", "graph"]);

/**
 * Types the task-1 spike found *feasible* to re-skin natively in a later round
 * (they still fall back for now). Journey is intentionally excluded — the spike
 * recommends it stays fallback (bespoke timeline visual, low re-skin value).
 */
const NATIVE_PLANNED = new Set(["sequence", "class", "stateDiagram", "state"]);

let mermaidPromise: Promise<MermaidLike> | undefined;

/** The slice of the mermaid API we use. */
export interface MermaidLike {
  initialize(config: Record<string, unknown>): void;
  detectType(text: string, config?: Record<string, unknown>): string;
  render(
    id: string,
    text: string,
    container?: unknown,
  ): Promise<{ svg: string; diagram?: unknown }>;
}

/** Running under Node (as opposed to a real browser)? */
export function inNodeRuntime(): boolean {
  return typeof process !== "undefined" && !!process.versions?.node;
}

/**
 * Do we need to stand up our own headless jsdom DOM? Only when there is **no
 * usable DOM already** (REV-003). Keying jsdom setup on the *absence* of a DOM
 * rather than merely on being in Node means a hybrid runtime that already has a
 * real DOM — an Electron renderer, or a jsdom/happy-dom test env — is used as-is
 * and never clobbered by a headless jsdom (which would overwrite window/document
 * and shim SVGElement.prototype process-wide). A plain browser already returns
 * false here (real `document`); combined with {@link inNodeRuntime} at the call
 * site, jsdom is imported only when it's both needed and available.
 */
export function needsHeadlessDom(): boolean {
  return (
    typeof document === "undefined" ||
    typeof (globalThis as { document?: { createElementNS?: unknown } }).document
      ?.createElementNS !== "function"
  );
}

let headlessDomInstalled = false;

/**
 * True once we have installed our own headless jsdom (vs. rendering against a
 * host/browser DOM). Drives the "geometry is approximate under jsdom" diagnostic
 * (FR5): a host DOM measures text for real, so its geometry is not degraded.
 */
export function usedHeadlessDom(): boolean {
  return headlessDomInstalled;
}

/**
 * Lazily import mermaid and register its built-in diagram detectors exactly once.
 * `detectType` throws until `initialize` has run, so we always initialize here.
 *
 * In Node we install the persistent jsdom DOM **before** importing mermaid — its
 * bundled DOMPurify binds `window` at import time, so the DOM must already exist
 * or `DOMPurify.sanitize` is frozen missing for the whole process (this is why
 * even the cheap `classify` path seeds the DOM once a non-flowchart type loads
 * mermaid). The native flowchart path short-circuits and never reaches here.
 */
export async function loadMermaid(): Promise<MermaidLike> {
  if (!mermaidPromise) {
    mermaidPromise = (async () => {
      // Install jsdom only when in Node AND there is no usable DOM already —
      // never overwrite a real/host DOM (REV-003). jsdom is Node-only, so the
      // inNodeRuntime guard also keeps its import off the browser/worker path.
      if (inNodeRuntime() && needsHeadlessDom()) {
        await (await import("./jsdom-env.js")).ensureNodeDom();
        headlessDomInstalled = true;
      }
      const mod = (await import("mermaid")) as unknown as { default: MermaidLike };
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        deterministicIds: true,
      });
      return mermaid;
    })();
  }
  return mermaidPromise;
}

/** First non-empty, non-comment, non-directive keyword of a DSL, lowercased. */
function leadingKeyword(dsl: string): string | null {
  for (const raw of dsl.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    if (line.startsWith("%%")) continue; // comment / init directive
    if (line === "---") return null; // YAML frontmatter — let mermaid handle it
    const m = /^([A-Za-z][A-Za-z0-9-]*)/.exec(line);
    return m ? m[1]!.toLowerCase() : null;
  }
  return null;
}

/** Classify a flow-family detected type / short-circuit hit into a Classification. */
function nativeFlowchart(detected: string | null): Classification {
  return {
    detected,
    type: "flowchart",
    tier: "native",
    renderer: "flowchart",
    nativePlanned: false,
  };
}

/**
 * Classify a DSL string into a tier + renderer. Async because a non-flowchart
 * input lazily loads mermaid to run `detectType`.
 */
export async function classify(dsl: string): Promise<Classification> {
  // Cheap short-circuit: an explicit flowchart/graph header never needs mermaid.
  const head = leadingKeyword(dsl);
  if (head === "flowchart" || head === "graph") return nativeFlowchart(head);

  const mermaid = await loadMermaid();
  let detected: string;
  try {
    detected = mermaid.detectType(dsl);
  } catch {
    // Undetectable: header-less flowchart (`A-->B`) or genuine garbage. Hand to
    // the flowchart parser — it renders the former and zero-nodes the latter.
    return nativeFlowchart(null);
  }

  if (FLOWCHART_TYPES.has(detected)) return nativeFlowchart(detected);

  return {
    detected,
    type: detected,
    tier: "fallback",
    renderer: "mermaid",
    nativePlanned: NATIVE_PLANNED.has(detected),
  };
}
