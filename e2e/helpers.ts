import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, "..");
export const artifactsDir = join(here, ".artifacts");
const cliPath = join(repoRoot, "dist", "cli", "index.js");

mkdirSync(artifactsDir, { recursive: true });

/** Render a fixture to a standalone HTML artifact via the built CLI. */
export function exportHtml(fixture: string, theme = "light", name = "exported.html"): string {
  const out = join(artifactsDir, name);
  execFileSync("node", [
    cliPath,
    "render",
    join(repoRoot, "fixtures", fixture),
    "-o",
    out,
    "--theme",
    theme,
  ]);
  return pathToFileURL(out).href;
}

/**
 * Write a bare page with the built custom element **inlined** (Chromium blocks
 * external ES modules over file://, so the module source is embedded directly).
 */
export function customElementPage(theme = "dark", name = "element.html"): string {
  const elementSrc = readFileSync(join(repoRoot, "dist", "element.js"), "utf8");
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}</style></head>
<body>
<very-nice-mermaid id="d" theme="${theme}" style="width:100vw;height:100vh;">
flowchart LR
  A[Start] --> B{Choice}
  B --> C([Done])
</very-nice-mermaid>
<script type="module">
${elementSrc}
</script>
</body></html>`;
  const out = join(artifactsDir, name);
  writeFileSync(out, html, "utf8");
  return pathToFileURL(out).href;
}
