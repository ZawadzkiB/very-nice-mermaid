#!/usr/bin/env node
/**
 * Regenerate the assets the GitHub Pages docs site serves (docs/):
 *   - docs/interactive/<name>-<style>-<theme>.html  — self-contained INTERACTIVE
 *     exports (drag / resize / pan / zoom), embedded as iframes in gallery.md.
 *   - docs/assets/<name>-<style>-<theme>.png        — static thumbnails for the grid.
 *
 * Drives the built CLI (`dist/cli/index.js`), so `npm run build` first. Deterministic:
 * re-running only changes a file when the renderer changed. Run with `npm run docs`.
 *
 * The Pages site is served from docs/ (Jekyll). Files WITHOUT front matter — like the
 * interactive .html here — are copied through verbatim, so they stay fully interactive.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const cli = join(repo, "dist", "cli", "index.js");
const srcDir = join(repo, "examples", "src");
const htmlDir = join(repo, "docs", "interactive");
const pngDir = join(repo, "docs", "assets");
mkdirSync(htmlDir, { recursive: true });
mkdirSync(pngDir, { recursive: true });

// Vendor the self-contained <very-nice-mermaid> web-component bundle into docs/ so the
// Library page can run a LIVE demo offline (no CDN, no version drift) — loaded as
// /assets/vnm-element.js (cache-busted per deploy). It self-registers on import.
copyFileSync(join(repo, "dist", "element.js"), join(pngDir, "vnm-element.js"));

const STYLES = ["clean", "sketch"];
const THEMES = ["light", "dark", "fancy", "arch", "arch-light"];
const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sources = readdirSync(srcDir)
  .filter((f) => f.endsWith(".mmd"))
  .map((f) => ({ name: basename(f, ".mmd"), file: join(srcDir, f) }))
  .sort((a, b) => a.name.localeCompare(b.name));

const render = (file, style, theme, fmt, out, extra = []) =>
  execFileSync(
    "node",
    [cli, "render", file, "--style", style, "--theme", theme, "-f", fmt, "-o", out, ...extra],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

let count = 0;
const failures = [];
for (const s of sources) {
  for (const style of STYLES) {
    for (const theme of THEMES) {
      const key = `${s.name}-${style}-${theme}`;
      const label = `${title(s.name)} — ${style} / ${theme}`;
      try {
        render(s.file, style, theme, "html", join(htmlDir, `${key}.html`), ["--title", label]);
        render(s.file, style, theme, "png", join(pngDir, `${key}.png`), ["--scale", "2"]);
        count++;
      } catch (err) {
        failures.push(`${key}: ${String(err.stderr || err.message).split("\n")[0]}`);
      }
    }
  }
}

console.log(
  `docs: rendered ${count} × (interactive html + png) across ${sources.length} diagrams, ${STYLES.length} styles, ${THEMES.length} themes`,
);
if (failures.length) {
  console.error(`docs: ${failures.length} render(s) failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
