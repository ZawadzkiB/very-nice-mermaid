/**
 * `vnm render` — the CLI core. Kept separate from the bin shim so it is unit
 * testable. Returns a process exit code; never calls `process.exit` itself.
 */

import { Command, CommanderError } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { parse, ParseError } from "../parser/index.js";
import { layout, applyPositions } from "../layout/index.js";
import { resolveTheme, type Theme } from "../theme/index.js";
import { renderSvg } from "../render/svg.js";
import { renderMarkdown } from "../render/ascii.js";
import { renderHtml } from "../export/html.js";
import { renderPng, renderPngFromSvg } from "../export/png.js";
import { classify } from "../mermaid/router.js";
import { renderFallbackSvg } from "../mermaid/fallback.js";
import {
  readSequenceModel,
  layoutSequence,
  renderSequenceSvg,
  renderSequenceMarkdown,
  renderSequenceHtml,
} from "../native/sequence/index.js";
import { readClassModel, layoutClass, renderClassSvg } from "../native/class/index.js";
import { readStateModel, layoutState, renderStateSvg } from "../native/state/index.js";
import {
  Diagnostics,
  formatRenderDiagnostic,
  type RenderDiagnostic,
} from "../diagnostics/index.js";
import type { Diagnostic, PositionedModel } from "../model/index.js";

type Format = "html" | "svg" | "png" | "md";

const VERSION = "0.1.0";

interface RenderOpts {
  output?: string;
  format?: string;
  theme?: string;
  strict?: boolean;
  quiet?: boolean;
  layout?: string;
  scale?: string;
  background?: string;
  title?: string;
}

/** Run the CLI. Returns an exit code (0 ok, 1 error, 2 usage). */
export async function run(argv: string[]): Promise<number> {
  const program = new Command();
  program
    .name("vnm")
    .description("Render Mermaid diagrams to HTML / SVG / PNG / Markdown (ASCII).")
    .version(VERSION)
    .configureOutput({ writeErr: (s) => process.stderr.write(s) })
    .exitOverride();

  let exitCode = 0;

  program
    .command("render")
    .argument("<input>", "input .mmd file, or - for stdin")
    .description("render a diagram (native flowchart/sequence/class/state, or the mermaid.js fallback tier)")
    .option("-o, --output <file>", "output file (default: stdout)")
    .option("-f, --format <fmt>", "html | svg | png | md (inferred from -o if omitted)")
    .option("-t, --theme <name|path>", "theme name (light|dark|fancy) or path to a theme .json", "light")
    .option("--strict", "treat parser warnings AND fallback degradations as errors")
    .option("--quiet", "mute info-level diagnostics (fallback notices) on stderr")
    .option("--layout <file>", "apply a portable layout.json (node positions)")
    .option("--scale <n>", "PNG scale factor (HiDPI)")
    .option("--background <color>", "background color, or 'transparent'")
    .option("--title <title>", "HTML document title")
    .action(async (input: string, opts: RenderOpts) => {
      exitCode = await doRender(input, opts);
    });

  try {
    await program.parseAsync(argv);
  } catch (err) {
    if (err instanceof CommanderError) {
      // --help / --version exit cleanly; usage errors are code 2
      if (err.code === "commander.helpDisplayed" || err.code === "commander.version") return 0;
      return err.exitCode || 2;
    }
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
  return exitCode;
}

async function doRender(input: string, opts: RenderOpts): Promise<number> {
  // 1. read input
  let dsl: string;
  try {
    dsl = input === "-" ? readFileSync(0, "utf8") : readFileSync(input, "utf8");
  } catch {
    process.stderr.write(`error: cannot read input '${input}'\n`);
    return 1;
  }

  // 2. resolve format
  const format = resolveFormat(opts.format, opts.output);
  if (!format) {
    process.stderr.write(`error: unknown format; use -f html|svg|png|md\n`);
    return 1;
  }

  // 3. resolve theme (name or JSON file)
  let theme: Theme;
  try {
    theme = resolveThemeArg(opts.theme);
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }

  // 4. route by diagram type (fixes the silent-misparse bug: a known
  //    non-flowchart type goes to the mermaid.js fallback tier, not the
  //    flowchart parser). Header-less / garbage falls through to native, where
  //    the flowchart parser + the zero-node check (D6) still apply.
  const classification = await classify(dsl);
  if (classification.tier === "fallback") {
    return doFallbackRender(dsl, classification.detected ?? classification.type, format, opts, theme);
  }

  // Native sequence: re-skinned from mermaid's SVG into our themed engine (no
  // fallback diagnostic — it renders natively, with ASCII support per FR4).
  if (classification.renderer === "sequence") {
    return doSequenceRender(dsl, format, opts, theme);
  }
  // Native class + state: node-graphs re-skinned from mermaid's SVG, re-laid out
  // with our own dagre. Visual-only (FR4 excludes ASCII for them).
  if (classification.renderer === "class") {
    return doClassRender(dsl, format, opts, theme);
  }
  if (classification.renderer === "state") {
    return doStateRender(dsl, format, opts, theme);
  }

  return doNativeRender(dsl, format, opts, theme);
}

/**
 * Report ASCII/Markdown as unavailable for a native visual-only type (class /
 * state — FR4 keeps ASCII to flowchart + sequence). Reuses the FR5
 * capability-unavailable diagnostic. Graceful (exit 0) unless `--strict`, which
 * escalates the capability loss to a non-zero exit.
 */
function reportAsciiUnavailable(type: string, opts: RenderOpts): number {
  const diagnostics = new Diagnostics();
  diagnostics.capabilityUnavailable(
    "ascii",
    "native",
    `ASCII/Markdown output is unavailable for '${type}' (only flowchart + sequence render as ASCII); use -f svg|html|png`,
  );
  printRenderDiagnostics(diagnostics.all(), opts.quiet === true);
  return opts.strict === true ? 1 : 0;
}

/**
 * Native class path — read the structure from mermaid's SVG, re-lay it out with
 * our own dagre, and render SVG / HTML / PNG. No fallback tier is involved; `-f
 * md` reports `ascii-unavailable` (FR4). Draggable-node interactivity + HTML
 * export reuse the flowchart vnmRuntime path (the ClassLayout carries a
 * flowchart PositionedModel).
 */
async function doClassRender(
  dsl: string,
  format: Format,
  opts: RenderOpts,
  theme: Theme,
): Promise<number> {
  let cls;
  try {
    const model = await readClassModel(dsl);
    if (model.classes.length === 0) {
      process.stderr.write("error: no diagram found (input produced 0 classes)\n");
      return 1;
    }
    printParseDiagnostics(model.warnings);
    cls = layoutClass(model, { theme });
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }

  if (format === "md") return reportAsciiUnavailable("class", opts);

  try {
    if (format === "png") {
      const scale = opts.scale ? Number(opts.scale) : 1;
      const bytes = await renderPngFromSvg(renderClassSvg(cls, theme, opts.background), scale);
      if (opts.output) writeFileSync(opts.output, bytes);
      else process.stdout.write(Buffer.from(bytes));
      return 0;
    }
    const out =
      format === "html"
        ? renderHtml(cls.model, { theme, title: opts.title })
        : renderClassSvg(cls, theme, opts.background);
    if (opts.output) writeFileSync(opts.output, out, "utf8");
    else process.stdout.write(out.endsWith("\n") ? out : out + "\n");
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
}

/**
 * Native state path — mirrors {@link doClassRender}: read structure, re-lay out
 * with our dagre, render SVG / HTML / PNG; `-f md` reports `ascii-unavailable`.
 */
async function doStateRender(
  dsl: string,
  format: Format,
  opts: RenderOpts,
  theme: Theme,
): Promise<number> {
  let st;
  try {
    const model = await readStateModel(dsl);
    if (model.states.length === 0) {
      process.stderr.write("error: no diagram found (input produced 0 states)\n");
      return 1;
    }
    printParseDiagnostics(model.warnings);
    st = layoutState(model, { theme });
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }

  if (format === "md") return reportAsciiUnavailable("state", opts);

  try {
    if (format === "png") {
      const scale = opts.scale ? Number(opts.scale) : 1;
      const bytes = await renderPngFromSvg(renderStateSvg(st, theme, opts.background), scale);
      if (opts.output) writeFileSync(opts.output, bytes);
      else process.stdout.write(Buffer.from(bytes));
      return 0;
    }
    const out =
      format === "html"
        ? renderHtml(st.model, { theme, title: opts.title })
        : renderStateSvg(st, theme, opts.background);
    if (opts.output) writeFileSync(opts.output, out, "utf8");
    else process.stdout.write(out.endsWith("\n") ? out : out + "\n");
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
}

/**
 * Native sequence path — read the structure from mermaid's SVG, lay it out with
 * our own deterministic themed layout, and render SVG / ASCII / HTML / PNG. No
 * fallback tier is involved, so no fallback/degradation diagnostic is emitted.
 */
async function doSequenceRender(
  dsl: string,
  format: Format,
  opts: RenderOpts,
  theme: Theme,
): Promise<number> {
  let layout;
  try {
    const model = await readSequenceModel(dsl);
    if (model.participants.length === 0) {
      process.stderr.write("error: no diagram found (input produced 0 participants)\n");
      return 1;
    }
    layout = layoutSequence(model, { theme });
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }

  try {
    if (format === "png") {
      const scale = opts.scale ? Number(opts.scale) : 1;
      const svg = renderSequenceSvg(layout, theme, opts.background);
      const bytes = await renderPngFromSvg(svg, scale);
      if (opts.output) writeFileSync(opts.output, bytes);
      else process.stdout.write(Buffer.from(bytes));
      return 0;
    }
    let out: string;
    if (format === "html") out = renderSequenceHtml(layout, theme, { title: opts.title });
    else if (format === "md") out = renderSequenceMarkdown(layout);
    else out = renderSequenceSvg(layout, theme, opts.background);
    if (opts.output) writeFileSync(opts.output, out, "utf8");
    else process.stdout.write(out.endsWith("\n") ? out : out + "\n");
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
}

/** Native flowchart path — unchanged behavior from v1. */
async function doNativeRender(
  dsl: string,
  format: Format,
  opts: RenderOpts,
  theme: Theme,
): Promise<number> {
  // parse (diagnostics → stderr; strict throws)
  let model;
  try {
    model = parse(dsl, { strict: opts.strict === true });
  } catch (err) {
    if (err instanceof ParseError) {
      printParseDiagnostics(err.diagnostics);
      return 1;
    }
    throw err;
  }
  printParseDiagnostics(model.warnings);

  let positioned: PositionedModel = layout(model, { theme });

  // D6: rendering nothing is a silent failure. Input that yields zero renderable
  // nodes is a CLI error in both lenient and strict modes.
  if (positioned.nodes.length === 0) {
    process.stderr.write("error: no diagram found (input produced 0 nodes)\n");
    return 1;
  }

  if (opts.layout) {
    try {
      const data = JSON.parse(readFileSync(opts.layout, "utf8")) as {
        positions?: Record<string, { x: number; y: number }>;
      };
      const positions = data.positions ?? (data as Record<string, { x: number; y: number }>);
      positioned = applyPositions(positioned, positions, { theme });
    } catch (err) {
      process.stderr.write(`error: cannot apply layout '${opts.layout}': ${(err as Error).message}\n`);
      return 1;
    }
  }

  try {
    if (format === "png") {
      const scale = opts.scale ? Number(opts.scale) : 1;
      const bytes = await renderPng(positioned, { theme, scale, background: opts.background });
      if (opts.output) writeFileSync(opts.output, bytes);
      else process.stdout.write(Buffer.from(bytes));
      return 0;
    }
    let out: string;
    if (format === "html") out = renderHtml(positioned, { theme, title: opts.title });
    else if (format === "md") out = renderMarkdown(positioned, { theme });
    else out = renderSvg(positioned, { theme, background: opts.background });
    if (opts.output) writeFileSync(opts.output, out, "utf8");
    else process.stdout.write(out.endsWith("\n") ? out : out + "\n");
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
}

/**
 * Fallback tier — mermaid.js renders the SVG; we surface a loud, greppable
 * diagnostic that we took the fallback (FR5). `--quiet` mutes info; `--strict`
 * escalates any degradation/capability loss to a non-zero exit.
 */
async function doFallbackRender(
  dsl: string,
  detected: string,
  format: Format,
  opts: RenderOpts,
  theme: Theme,
): Promise<number> {
  const quiet = opts.quiet === true;
  const strict = opts.strict === true;
  const diagnostics = new Diagnostics();

  diagnostics.fallbackTier(detected);

  // FR4: ASCII/Markdown is only meaningful for flowchart + sequence.
  if (format === "md") {
    diagnostics.capabilityUnavailable(
      "ascii",
      "fallback",
      `ASCII/Markdown output is unavailable for '${detected}' (only flowchart + sequence render as ASCII); use -f svg|html|png`,
    );
    printRenderDiagnostics(diagnostics.all(), quiet);
    return 1;
  }

  let svg: string;
  try {
    const result = await renderFallbackSvg(dsl, { theme, diagnostics, detected });
    svg = result.svg;
  } catch (err) {
    printRenderDiagnostics(diagnostics.all(), quiet);
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }

  try {
    if (format === "png") {
      const scale = opts.scale ? Number(opts.scale) : 1;
      const bytes = await renderPngFromSvg(svg, scale);
      if (opts.output) writeFileSync(opts.output, bytes);
      else process.stdout.write(Buffer.from(bytes));
    } else {
      const out = format === "html" ? wrapFallbackHtml(svg, opts.title ?? detected) : svg;
      if (opts.output) writeFileSync(opts.output, out, "utf8");
      else process.stdout.write(out.endsWith("\n") ? out : out + "\n");
    }
  } catch (err) {
    printRenderDiagnostics(diagnostics.all(), quiet);
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }

  printRenderDiagnostics(diagnostics.all(), quiet);

  // --strict escalates a degradation / lost capability (warn+) to a non-zero exit.
  if (strict && diagnostics.hasLoss()) return 1;
  return 0;
}

/**
 * Wrap a fallback SVG in a minimal, self-contained HTML document. (The richer
 * pan/zoom/fit interactive shell is a later round; this keeps HTML output
 * complete and dependency-free for round 1.)
 */
function wrapFallbackHtml(svg: string, title: string): string {
  const safeTitle = title.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>html,body{margin:0;height:100%}body{display:grid;place-items:center;background:#fff}svg{max-width:100%;max-height:100%;height:auto}</style>
</head>
<body>
${svg}
</body>
</html>
`;
}

function resolveFormat(explicit: string | undefined, output: string | undefined): Format | null {
  const norm = (f: string): Format | null =>
    f === "html" || f === "svg" || f === "png" || f === "md" ? f : null;
  if (explicit) return norm(explicit.toLowerCase());
  if (output) {
    const ext = extname(output).slice(1).toLowerCase();
    if (ext === "html" || ext === "htm") return "html";
    if (ext === "svg") return "svg";
    if (ext === "png") return "png";
    if (ext === "md" || ext === "markdown" || ext === "txt") return "md";
  }
  return "svg";
}

function resolveThemeArg(value: string | undefined): Theme {
  if (!value) return resolveTheme("light");
  const builtin = value === "light" || value === "dark" || value === "fancy";
  if (!builtin && (value.endsWith(".json") || existsSync(value))) {
    const tokens = JSON.parse(readFileSync(value, "utf8"));
    return resolveTheme(tokens);
  }
  return resolveTheme(value);
}

/** Parser diagnostics (line/col form) — unchanged shape from v1. */
function printParseDiagnostics(diags: Diagnostic[]): void {
  for (const d of diags) {
    process.stderr.write(`${d.severity} [${d.code}] ${d.line}:${d.col} ${d.message}\n`);
  }
}

/** Render/fallback diagnostics (FR5) — greppable `code severity tier … message`. */
function printRenderDiagnostics(diags: readonly RenderDiagnostic[], quiet: boolean): void {
  for (const d of diags) {
    if (quiet && d.severity === "info") continue;
    process.stderr.write(`vnm: ${formatRenderDiagnostic(d)}\n`);
  }
}
