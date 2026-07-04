import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    element: "src/element.ts",
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "neutral",
  dts: true,
  clean: true,
  sourcemap: false,
  splitting: false,
  treeshake: true,
  // dagre is pure JS and must run in the browser (mount + custom element need
  // parse→layout), so bundle it into every entry. commander is CLI-only and
  // @resvg/resvg-js is a native, lazily dynamic-imported optional dep — keep
  // both external so they are never pulled into the browser-safe core. mermaid
  // and jsdom are the fallback tier: dynamic-imported only in the render/export
  // path (D4/FR8), so keep them external too — never in the browser-safe core.
  noExternal: ["@dagrejs/dagre"],
  external: ["commander", "@resvg/resvg-js", "mermaid", "jsdom"],
});
