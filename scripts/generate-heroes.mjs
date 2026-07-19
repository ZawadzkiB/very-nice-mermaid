#!/usr/bin/env node
/**
 * Regenerate the README hero images (assets/example-*.png).
 *
 * These four heroes are the only asset set that used to be rendered by hand, which is
 * how their provenance drifted (the "sketch" hero's source DSL was never committed).
 * This script captures each hero's exact recipe so they regenerate deterministically,
 * exactly like `generate-docs.mjs` / `generate-examples.mjs` do for the galleries.
 *
 * Drives the built CLI (`dist/cli/index.js`), so `npm run build` first. Deterministic:
 * re-running only changes a file when the renderer changed. Run with `npm run heroes`.
 *
 * Sources (all committed under fixtures/):
 *   - example-dark   = state-machine · dark  · clean   (the graph-TD state machine)
 *   - example-light  = ci-pipeline   · light · clean
 *   - example-fancy  = microservices · fancy · clean   (the fancy microservices hero)
 *   - example-sketch = cache-lookup  · light · sketch  (reconstructed + committed; D6)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const cli = join(repo, "dist", "cli", "index.js");
const fixtures = join(repo, "fixtures");
const outDir = join(repo, "assets");
mkdirSync(outDir, { recursive: true });

/** Each README hero: output name → fixture + theme + style. All render at scale 2. */
const HEROES = [
  { out: "example-dark", src: "state-machine.mmd", theme: "dark", style: "clean" },
  { out: "example-light", src: "ci-pipeline.mmd", theme: "light", style: "clean" },
  { out: "example-fancy", src: "microservices.mmd", theme: "fancy", style: "clean" },
  { out: "example-sketch", src: "cache-lookup.mmd", theme: "light", style: "sketch" },
  // the README hero: archify look — arch theme + hand-drawn sketch, semantic role colours.
  { out: "example-arch", src: "arch-microservices.mmd", theme: "arch", style: "sketch" },
];

let count = 0;
const failures = [];
for (const h of HEROES) {
  try {
    execFileSync(
      "node",
      [
        cli, "render", join(fixtures, h.src),
        "--theme", h.theme, "--style", h.style,
        "-f", "png", "-o", join(outDir, `${h.out}.png`), "--scale", "2",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    count++;
  } catch (err) {
    failures.push(`${h.out}: ${String(err.stderr || err.message).split("\n")[0]}`);
  }
}

console.log(`heroes: rendered ${count}/${HEROES.length} README hero PNGs into assets/`);
if (failures.length) {
  console.error(`heroes: ${failures.length} render(s) failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
