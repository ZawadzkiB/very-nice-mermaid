import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, "..");
export const artifactsDir = join(here, ".artifacts");
const cliPath = join(repoRoot, "dist", "cli", "index.js");

mkdirSync(artifactsDir, { recursive: true });

/** Read a fixture's raw DSL. */
export function fixtureDsl(fixture: string): string {
  return readFileSync(join(repoRoot, "fixtures", fixture), "utf8");
}

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
 * Same as {@link exportHtml} but threads `--style` (`clean` | `sketch`) — the
 * hand-drawn Excalidraw-style rendering mode. Used by the sketch-style e2e spec.
 */
export function exportHtmlStyled(
  fixture: string,
  style: "clean" | "sketch",
  theme = "light",
  name = "exported-styled.html",
): string {
  const out = join(artifactsDir, name);
  execFileSync("node", [
    cliPath,
    "render",
    join(repoRoot, "fixtures", fixture),
    "-o",
    out,
    "--theme",
    theme,
    "--style",
    style,
  ]);
  return pathToFileURL(out).href;
}

/**
 * Render raw ad-hoc DSL (not part of the committed fixtures/ corpus, so it
 * doesn't get swept into the parser/layout corpus-wide unit tests) to a
 * standalone HTML artifact via the built CLI — same path a real `vnm render
 * -o out.html` user gets. Useful for e2e-only diagrams (a hub node, a
 * subgraph + every shape) that exist purely to drive the browser.
 */
export function exportHtmlFromDsl(dsl: string, theme = "light", name = "exported-adhoc.html"): string {
  const dslPath = join(artifactsDir, name.replace(/\.html$/, ".mmd"));
  writeFileSync(dslPath, dsl, "utf8");
  const out = join(artifactsDir, name);
  execFileSync("node", [cliPath, "render", dslPath, "-o", out, "--theme", theme]);
  return pathToFileURL(out).href;
}

/**
 * Write a bare page with the built custom element **inlined** (Chromium blocks
 * external ES modules over file://, so the module source is embedded directly).
 * Pass raw `dsl` to control the diagram; the element exposes its live renderer
 * handle via `element.diagram`, which the interaction / handle tests read.
 */
export function customElementPage(theme = "dark", name = "element.html", dsl?: string): string {
  const elementSrc = readFileSync(join(repoRoot, "dist", "element.js"), "utf8");
  const body =
    dsl ??
    `flowchart LR
  A[Start] --> B{Choice}
  B --> C([Done])`;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}</style></head>
<body>
<very-nice-mermaid id="d" theme="${theme}" style="width:100vw;height:100vh;">
${body}
</very-nice-mermaid>
<script type="module">
${elementSrc}
</script>
</body></html>`;
  const out = join(artifactsDir, name);
  writeFileSync(out, html, "utf8");
  return pathToFileURL(out).href;
}

/** Same as {@link customElementPage} but seeded from a fixture file. */
export function customElementPageForFixture(
  fixture: string,
  theme = "light",
  name = "element-fixture.html",
): string {
  return customElementPage(theme, name, fixtureDsl(fixture));
}
