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
  // dagre / commander / resvg stay external (peer install, optional dep, etc.)
  external: ["@dagrejs/dagre", "commander", "@resvg/resvg-js"],
});
