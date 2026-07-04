/**
 * Minimal ambient declaration for jsdom (no `@types/jsdom` dependency). jsdom is
 * only dynamic-imported on the Node fallback path; we treat its DOM as `any` and
 * shim the SVG primitives we need at runtime (see jsdom-env.ts).
 */
declare module "jsdom" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly window: any;
  }
}
