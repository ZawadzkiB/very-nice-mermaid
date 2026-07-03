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
import { renderPng } from "../export/png.js";
import type { Diagnostic, PositionedModel } from "../model/index.js";

type Format = "html" | "svg" | "png" | "md";

const VERSION = "0.1.0";

interface RenderOpts {
  output?: string;
  format?: string;
  theme?: string;
  strict?: boolean;
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
    .description("Render Mermaid flowcharts to HTML / SVG / PNG / Markdown (ASCII).")
    .version(VERSION)
    .configureOutput({ writeErr: (s) => process.stderr.write(s) })
    .exitOverride();

  let exitCode = 0;

  program
    .command("render")
    .argument("<input>", "input .mmd file, or - for stdin")
    .description("render a flowchart")
    .option("-o, --output <file>", "output file (default: stdout)")
    .option("-f, --format <fmt>", "html | svg | png | md (inferred from -o if omitted)")
    .option("-t, --theme <name|path>", "theme name (light|dark|fancy) or path to a theme .json", "light")
    .option("--strict", "treat parser warnings as errors")
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

  // 4. parse (diagnostics → stderr; strict throws)
  let model;
  try {
    model = parse(dsl, { strict: opts.strict === true });
  } catch (err) {
    if (err instanceof ParseError) {
      printDiagnostics(err.diagnostics);
      return 1;
    }
    throw err;
  }
  printDiagnostics(model.warnings);

  // 5. layout (+ optional sidecar)
  let positioned: PositionedModel = layout(model, { theme });

  // D6: rendering nothing is a silent failure. Input that yields zero renderable
  // nodes is a CLI error in both lenient and strict modes — even when the parser
  // only emitted warnings. (Unknown constructs *within* otherwise-valid mermaid
  // still produce ≥1 node and stay lenient. The library API itself stays
  // lenient: it returns the empty model without throwing; only the CLI escalates
  // an empty render to a non-zero exit.)
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

  // 6. render + write
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

function printDiagnostics(diags: Diagnostic[]): void {
  for (const d of diags) {
    process.stderr.write(`${d.severity} [${d.code}] ${d.line}:${d.col} ${d.message}\n`);
  }
}
