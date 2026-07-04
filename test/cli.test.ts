import { beforeAll, describe, expect, it } from "vitest";
import { spawnSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { XMLValidator } from "fast-xml-parser";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const cliPath = join(repo, "dist", "cli", "index.js");
const fixtures = join(repo, "fixtures");

/** Every shipped fixture — the CLI must render each one without error. */
const ALL_FIXTURES = [
  "auth-flow.mmd",
  "ci-pipeline.mmd",
  "microservices.mmd",
  "nested-subgraphs.mmd",
  "shapes-gallery.mmd",
  "state-machine.mmd",
];

interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

function cli(args: string[], input?: string): CliResult {
  const res = spawnSync("node", [cliPath, ...args], { input, encoding: "utf8", cwd: repo });
  return { status: res.status ?? -1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/** SVG must be well-formed XML (not just "contains <svg>"). */
function svgIsWellFormed(svg: string): boolean {
  return XMLValidator.validate(svg) === true;
}

/** Decode a PNG's pixel dimensions from its IHDR chunk. */
function pngSize(buf: Buffer): { w: number; h: number } {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** The SVG's rendered width (from the root `<svg width="N">`) — its extent. */
function svgWidth(svg: string): number {
  const m = /<svg[^>]*\bwidth="([\d.]+)"/.exec(svg);
  return m ? parseFloat(m[1]!) : NaN;
}

/**
 * Whether an HTML document makes any external network request. The SVG
 * namespace URI (http://www.w3.org/2000/svg) is a namespace *identifier*, never
 * fetched, so a blanket https?:// check is wrong — look for real references
 * (fetchable src/href, remote CSS url(), @import).
 */
function hasExternalRequest(html: string): boolean {
  return (
    /\b(?:src|href)\s*=\s*["']https?:\/\//i.test(html) ||
    /url\(\s*["']?https?:\/\//i.test(html) ||
    /@import/i.test(html)
  );
}

describe("vnm CLI (child_process)", () => {
  let tmp: string;

  beforeAll(() => {
    // Ensure a fresh build so the test exercises the shipped bin.
    execSync("npm run build", { cwd: repo, stdio: "ignore" });
    tmp = mkdtempSync(join(tmpdir(), "vnm-cli-"));
  }, 120_000);

  it("renders SVG to stdout from a file", () => {
    const r = cli(["render", join(fixtures, "ci-pipeline.mmd"), "-f", "svg"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("<svg");
    expect(r.stdout).toContain("</svg>");
  });

  it("renders Markdown (ASCII fence) to stdout", () => {
    const r = cli(["render", join(fixtures, "state-machine.mmd"), "-f", "md"]);
    expect(r.status).toBe(0);
    expect(r.stdout.startsWith("```")).toBe(true);
    expect(r.stdout).toContain("Idle");
  });

  it("renders HTML, inferring the format from the -o extension", () => {
    const out = join(tmp, "diagram.html");
    const r = cli(["render", join(fixtures, "auth-flow.mmd"), "-o", out, "--theme", "dark"]);
    expect(r.status).toBe(0);
    const html = readFileSync(out, "utf8");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("var vnmRuntime =");
  });

  it("renders PNG to a file with --scale", () => {
    const out = join(tmp, "diagram.png");
    const r = cli(["render", join(fixtures, "shapes-gallery.mmd"), "-o", out, "--scale", "2"]);
    if (r.status !== 0 && /@resvg\/resvg-js/.test(r.stderr)) {
      // optional dependency not available in this environment
      return;
    }
    expect(r.status).toBe(0);
    expect(existsSync(out)).toBe(true);
    const buf = readFileSync(out);
    // PNG magic number
    expect(buf.subarray(0, 4).toString("hex")).toBe("89504e47");
  });

  it("reads DSL from stdin via -", () => {
    const r = cli(["render", "-", "-f", "svg"], "flowchart LR\n A-->B-->C");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("<svg");
  });

  it("emits parser warnings to stderr in lenient mode", () => {
    const r = cli(["render", "-", "-f", "svg"], "A-->B");
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("missing-header");
  });

  it("fails with a line/col diagnostic and non-zero exit on bad DSL (strict)", () => {
    const r = cli(["render", "-", "--strict", "-f", "svg"], "flowchart TD\n A[oops");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unterminated-shape/);
    expect(r.stderr).toMatch(/2:3/);
  });

  it("errors on an unreadable input file", () => {
    const r = cli(["render", join(tmp, "does-not-exist.mmd"), "-f", "svg"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("cannot read input");
  });

  // D6: rendering nothing is a silent failure. Input that yields zero renderable
  // nodes is a CLI error in both modes, even when the parser was only lenient.
  it("fails with a clear message on fully non-mermaid input that yields 0 nodes", () => {
    const r = cli(["render", "-", "-f", "svg"], "!!!! ### ???\n@@@ >>> <<<");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no diagram found (input produced 0 nodes)");
  });

  it("fails on empty input (0 nodes)", () => {
    const r = cli(["render", "-", "-f", "svg"], "");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no diagram found");
  });

  it("stays lenient for an unknown construct inside otherwise-valid mermaid (>=1 node)", () => {
    const r = cli(
      ["render", "-", "-f", "svg"],
      "flowchart TD\n A[Start] --> B\n click A callback",
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("<svg");
    // the unsupported `click` statement is surfaced as a warning, not an error
    expect(r.stderr).toContain("ignored-statement");
  });

  it("prints help and version", () => {
    expect(cli(["--version"]).stdout).toContain("0.1.0");
    expect(cli(["--help"]).stdout).toContain("render");
  });

  describe("output formats", () => {
    it("infers svg / png / md from the -o extension (not just html)", () => {
      const svg = join(tmp, "inferred.svg");
      expect(cli(["render", join(fixtures, "ci-pipeline.mmd"), "-o", svg]).status).toBe(0);
      expect(readFileSync(svg, "utf8")).toContain("<svg");

      const md = join(tmp, "inferred.md");
      expect(cli(["render", join(fixtures, "ci-pipeline.mmd"), "-o", md]).status).toBe(0);
      expect(readFileSync(md, "utf8").startsWith("```")).toBe(true);

      const png = join(tmp, "inferred.png");
      const r = cli(["render", join(fixtures, "ci-pipeline.mmd"), "-o", png]);
      if (!(r.status !== 0 && /@resvg\/resvg-js/.test(r.stderr))) {
        expect(r.status).toBe(0);
        expect(readFileSync(png).subarray(0, 4).toString("hex")).toBe("89504e47");
      }
    });

    it("produces well-formed XML SVG", () => {
      const r = cli(["render", join(fixtures, "microservices.mmd"), "-f", "svg"]);
      expect(r.status).toBe(0);
      expect(svgIsWellFormed(r.stdout)).toBe(true);
    });

    it("reads DSL from stdin for md and html too", () => {
      const dsl = "flowchart LR\n A[Start] --> B([Done])";
      const md = cli(["render", "-", "-f", "md"], dsl);
      expect(md.status).toBe(0);
      expect(md.stdout).toContain("Start");
      const html = cli(["render", "-", "-f", "html"], dsl);
      expect(html.status).toBe(0);
      expect(html.stdout).toContain("<!doctype html>");
    });
  });

  describe("every fixture renders", () => {
    it.each(ALL_FIXTURES)("%s → valid SVG (exit 0)", (fixture) => {
      const r = cli(["render", join(fixtures, fixture), "-f", "svg"]);
      expect(r.status).toBe(0);
      expect(svgIsWellFormed(r.stdout)).toBe(true);
    });

    it.each(ALL_FIXTURES)("%s → self-contained HTML with zero external requests", (fixture) => {
      const r = cli(["render", join(fixtures, fixture), "-f", "html"]);
      expect(r.status).toBe(0);
      const html = r.stdout;
      expect(html).toContain("<!doctype html>");
      // no network: no fetchable external src/href, remote url(), or @import.
      // (The inline SVG namespace URI is not a request.)
      expect(hasExternalRequest(html)).toBe(false);
    });
  });

  describe("PNG rasterization", () => {
    it("scales pixel dimensions with --scale", () => {
      const one = join(tmp, "s1.png");
      const two = join(tmp, "s2.png");
      const r1 = cli(["render", join(fixtures, "ci-pipeline.mmd"), "-o", one, "--scale", "1"]);
      if (r1.status !== 0 && /@resvg\/resvg-js/.test(r1.stderr)) return; // optional dep absent
      const r2 = cli(["render", join(fixtures, "ci-pipeline.mmd"), "-o", two, "--scale", "2"]);
      expect(r1.status).toBe(0);
      expect(r2.status).toBe(0);
      const a = pngSize(readFileSync(one));
      const b = pngSize(readFileSync(two));
      // scale 2 ≈ twice the pixels of scale 1 (allow rounding)
      expect(b.w).toBeGreaterThan(a.w * 1.8);
      expect(b.h).toBeGreaterThan(a.h * 1.8);
    });
  });

  describe("theming", () => {
    it("built-in light / dark / fancy produce distinct SVG", () => {
      const dsl = ["render", join(fixtures, "state-machine.mmd"), "-f", "svg"];
      const light = cli([...dsl, "--theme", "light"]).stdout;
      const dark = cli([...dsl, "--theme", "dark"]).stdout;
      const fancy = cli([...dsl, "--theme", "fancy"]).stdout;
      expect(light).not.toBe(dark);
      expect(light).not.toBe(fancy);
      expect(dark).not.toBe(fancy);
    });

    it("accepts a custom theme .json (partial token set) and applies its colors", () => {
      const themeFile = join(tmp, "custom-theme.json");
      writeFileSync(themeFile, JSON.stringify({ colors: { edge: "#ff00ff", background: "#080816" } }));
      const r = cli(["render", join(fixtures, "ci-pipeline.mmd"), "-f", "svg", "--theme", themeFile]);
      expect(r.status).toBe(0);
      // the static SVG inlines literal colors, so the custom edge color shows up
      expect(r.stdout.toLowerCase()).toContain("ff00ff");
      const light = cli(["render", join(fixtures, "ci-pipeline.mmd"), "-f", "svg"]).stdout;
      expect(r.stdout).not.toBe(light);
    });

    it("errors on a malformed theme .json", () => {
      const bad = join(tmp, "bad-theme.json");
      writeFileSync(bad, "{ not valid json ");
      const r = cli(["render", join(fixtures, "ci-pipeline.mmd"), "-f", "svg", "--theme", bad]);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/error:/);
    });
  });

  describe("options", () => {
    it("applies a --layout sidecar (node positions) and it changes the render", () => {
      const base = cli(["render", join(fixtures, "ci-pipeline.mmd"), "-f", "svg"]).stdout;
      const baseWidth = svgWidth(base);

      const layoutFile = join(tmp, "layout.json");
      writeFileSync(layoutFile, JSON.stringify({ positions: { start: { x: 5000, y: 5000 } } }));
      const r = cli([
        "render",
        join(fixtures, "ci-pipeline.mmd"),
        "-f",
        "svg",
        "--layout",
        layoutFile,
      ]);
      expect(r.status).toBe(0);
      expect(r.stdout).not.toBe(base);
      // moving a node out to x=5000 must balloon the diagram's rendered width
      expect(svgWidth(r.stdout)).toBeGreaterThan(baseWidth + 2000);
    });

    it("errors on an unreadable --layout file", () => {
      const r = cli([
        "render",
        join(fixtures, "ci-pipeline.mmd"),
        "-f",
        "svg",
        "--layout",
        join(tmp, "no-such-layout.json"),
      ]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("cannot apply layout");
    });

    it("--strict exits 0 on a clean diagram", () => {
      const r = cli(["render", "-", "--strict", "-f", "svg"], "flowchart LR\n A[Start] --> B[End]");
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("<svg");
    });

    it("--title sets the HTML document title", () => {
      const r = cli(
        ["render", join(fixtures, "ci-pipeline.mmd"), "-f", "html", "--title", "My Pipeline"],
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("<title>My Pipeline</title>");
    });

    it("--background changes the SVG output", () => {
      const def = cli(["render", join(fixtures, "ci-pipeline.mmd"), "-f", "svg"]).stdout;
      const bg = cli(
        ["render", join(fixtures, "ci-pipeline.mmd"), "-f", "svg", "--background", "#abcdef"],
      );
      expect(bg.status).toBe(0);
      expect(bg.stdout).not.toBe(def);
    });
  });

  describe("native sequence tier (FR2/FR4)", () => {
    const SEQ = join(fixtures, "order-sequence.mmd");

    it(
      "renders sequence to SVG natively (no fallback diagnostic)",
      () => {
        const r = cli(["render", SEQ, "-f", "svg"]);
        expect(r.status).toBe(0);
        expect(svgIsWellFormed(r.stdout)).toBe(true);
        // native re-skin markers: our arrow marker + participant labels
        expect(r.stdout).toContain('<marker id="vnm-arrow"');
        expect(r.stdout).toContain(">User<");
        // it is NATIVE — no fallback/degradation diagnostics on stderr
        expect(r.stderr).not.toContain("fallback-tier");
        expect(r.stderr).not.toContain("render-degraded");
      },
      60_000,
    );

    it(
      "renders sequence to Markdown ASCII natively (FR4 — sequence gets ASCII)",
      () => {
        const r = cli(["render", SEQ, "-f", "md"]);
        expect(r.status).toBe(0);
        expect(r.stdout.startsWith("```")).toBe(true);
        expect(r.stdout).toContain("User");
        expect(r.stdout).toContain("│"); // lifelines
        expect(r.stdout).toContain("▶"); // message arrow
        // ASCII is available for sequence, so no capability-unavailable notice
        expect(r.stderr).not.toContain("capability-unavailable");
        expect(r.stderr).not.toContain("fallback-tier");
      },
      60_000,
    );

    it(
      "renders sequence to a self-contained interactive HTML (zero external requests)",
      () => {
        const r = cli(["render", SEQ, "-f", "html", "--theme", "dark"]);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("<!doctype html>");
        expect(r.stdout).toContain("var seqRuntime =");
        expect(hasExternalRequest(r.stdout)).toBe(false);
        expect(r.stderr).not.toContain("fallback-tier");
      },
      60_000,
    );

    it(
      "themes sequence SVG (light/dark/fancy produce distinct output)",
      () => {
        const light = cli(["render", SEQ, "-f", "svg", "--theme", "light"]).stdout;
        const dark = cli(["render", SEQ, "-f", "svg", "--theme", "dark"]).stdout;
        const fancy = cli(["render", SEQ, "-f", "svg", "--theme", "fancy"]).stdout;
        expect(light).not.toBe(dark);
        expect(light).not.toBe(fancy);
        expect(dark).not.toBe(fancy);
      },
      60_000,
    );
  });

  describe("native class tier (FR2/FR4)", () => {
    const CLS = join(fixtures, "shop-class.mmd");

    it(
      "renders class to SVG natively with typed relation markers (no fallback diagnostic)",
      () => {
        const r = cli(["render", CLS, "-f", "svg"]);
        expect(r.status).toBe(0);
        expect(svgIsWellFormed(r.stdout)).toBe(true);
        // compartmented cards + the UML relation markers
        expect(r.stdout).toContain('id="vnm-cls-tri"'); // inheritance triangle
        expect(r.stdout).toContain('id="vnm-cls-diamond-solid"'); // composition
        expect(r.stdout).toContain("+String name");
        // native → no fallback/degradation diagnostics
        expect(r.stderr).not.toContain("fallback-tier");
        expect(r.stderr).not.toContain("render-degraded");
      },
      60_000,
    );

    it(
      "renders class to a self-contained interactive HTML via the flowchart runtime",
      () => {
        const r = cli(["render", CLS, "-f", "html", "--theme", "dark"]);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("<!doctype html>");
        expect(r.stdout).toContain("var vnmRuntime ="); // reuses the draggable runtime
        expect(hasExternalRequest(r.stdout)).toBe(false);
        expect(r.stderr).not.toContain("fallback-tier");
      },
      60_000,
    );

    it(
      "reports ASCII/Markdown as unavailable for class (FR4) — graceful, non-zero only under --strict",
      () => {
        const lenient = cli(["render", CLS, "-f", "md"]);
        expect(lenient.status).toBe(0);
        expect(lenient.stderr).toMatch(/capability-unavailable warn native capability=ascii/);
        expect(lenient.stderr).not.toContain("fallback-tier");

        const strict = cli(["render", CLS, "-f", "md", "--strict"]);
        expect(strict.status).toBe(1);
        expect(strict.stderr).toMatch(/capability-unavailable/);
      },
      60_000,
    );
  });

  describe("native state tier (FR2/FR4)", () => {
    const ST = join(fixtures, "order-state.mmd");

    it(
      "renders state to SVG natively (start/end circles, arrows; no fallback diagnostic)",
      () => {
        const r = cli(["render", ST, "-f", "svg"]);
        expect(r.status).toBe(0);
        expect(svgIsWellFormed(r.stdout)).toBe(true);
        expect(r.stdout).toContain('<marker id="vnm-arrow"');
        expect(r.stdout).toContain("<circle "); // start/end pseudo-states
        expect(r.stdout).toContain(">Idle<");
        expect(r.stderr).not.toContain("fallback-tier");
        expect(r.stderr).not.toContain("render-degraded");
      },
      60_000,
    );

    it(
      "renders state to a self-contained interactive HTML via the flowchart runtime",
      () => {
        const r = cli(["render", ST, "-f", "html"]);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("<!doctype html>");
        expect(r.stdout).toContain("var vnmRuntime =");
        expect(hasExternalRequest(r.stdout)).toBe(false);
        expect(r.stderr).not.toContain("fallback-tier");
      },
      60_000,
    );

    it(
      "reports ASCII/Markdown as unavailable for state (FR4)",
      () => {
        const r = cli(["render", ST, "-f", "md"]);
        expect(r.status).toBe(0);
        expect(r.stderr).toMatch(/capability-unavailable warn native capability=ascii/);
        expect(r.stderr).not.toContain("fallback-tier");
      },
      60_000,
    );
  });

  describe("fallback tier (mermaid.js)", () => {
    const PIE = 'pie title Pets\n "Dogs" : 386\n "Cats" : 85';
    // An ER diagram takes the mermaid.js fallback tier and its dagre/getBBox
    // bounds are degenerate/blank headless (spike-01.md) → per D9-A the CLI fails
    // honestly with a `fallback-render-unavailable` error rather than writing the
    // broken SVG. (class/state used to sit here but are now native re-skinned.)
    const ER = "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains";

    it(
      "renders a non-flowchart type to SVG AND logs that it took the fallback tier (FR5)",
      () => {
        const r = cli(["render", "-", "-f", "svg"], PIE);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("<svg");
        expect(svgIsWellFormed(r.stdout)).toBe(true);
        // greppable: `code severity tier … message`
        expect(r.stderr).toMatch(/fallback-tier info fallback/);
      },
      60_000,
    );

    it(
      "infers the fallback path from a .svg output file and writes the mermaid SVG",
      () => {
        const out = join(tmp, "pie.svg");
        const r = cli(["render", "-", "-o", out], PIE);
        expect(r.status).toBe(0);
        expect(readFileSync(out, "utf8")).toContain("<svg");
        expect(r.stderr).toContain("fallback-tier");
      },
      60_000,
    );

    it(
      "--quiet mutes the info-level fallback notice (still renders)",
      () => {
        const r = cli(["render", "-", "-f", "svg", "--quiet"], PIE);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("<svg");
        expect(r.stderr).not.toContain("fallback-tier");
      },
      60_000,
    );

    it(
      "hard-fails a degenerate headless fallback render — fallback-render-unavailable, non-zero, no file written (TEST-004/D9-A)",
      () => {
        const out = join(tmp, "degenerate-er.svg");
        // No --strict: a genuinely-blank render is a real failure, not a warning.
        const r = cli(["render", "-", "-o", out, "-f", "svg"], ER);
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/fallback-render-unavailable error fallback/);
        // …and the broken SVG is NOT written to disk (nor an HTML wrapper of it).
        expect(existsSync(out)).toBe(false);
      },
      60_000,
    );

    it(
      "reports ASCII/Markdown as unavailable for a fallback type (FR4) — graceful exit 0 by default, non-zero only under --strict (TEST-005/D8-A)",
      () => {
        const lenient = cli(["render", "-", "-f", "md"], PIE);
        expect(lenient.status).toBe(0);
        expect(lenient.stderr).toMatch(/capability-unavailable warn fallback capability=ascii/);

        const strict = cli(["render", "-", "-f", "md", "--strict"], PIE);
        expect(strict.status).toBe(1);
        expect(strict.stderr).toMatch(/capability-unavailable warn fallback capability=ascii/);
      },
      60_000,
    );

    it(
      "native + fallback ascii-unavailable exit codes are consistent by default (TEST-005)",
      () => {
        // Same warn-level `capability-unavailable` diagnostic on BOTH tiers must
        // exit 0 by default (only --strict escalates) — native (state) already did.
        const nativeMd = cli(["render", join(fixtures, "order-state.mmd"), "-f", "md"]);
        const fallbackMd = cli(["render", "-", "-f", "md"], PIE);
        expect(nativeMd.status).toBe(0);
        expect(fallbackMd.status).toBe(0);
      },
      60_000,
    );

    it(
      "keeps stderr to the structured FR5 channel on a hard-fail type — no raw jsdom trace (REV-002)",
      () => {
        // mindmap is cytoscape/canvas-backed → hard-fails headless. jsdom used to
        // dump a raw multi-line 'Not implemented: …getContext' stack trace before
        // our clean diagnostic; the virtualConsole now swallows it.
        const MINDMAP = "mindmap\n  root((go))\n    A\n    B";
        const r = cli(["render", "-", "-f", "svg"], MINDMAP);
        expect(r.status).toBe(1);
        // the clean, greppable diagnostic is still emitted
        expect(r.stderr).toMatch(/render-failed error fallback/);
        // …and the raw jsdom stack trace is NOT leaked to the FR5 channel
        expect(r.stderr).not.toMatch(/Not implemented/);
        expect(r.stderr).not.toMatch(/getContext/i);
        expect(r.stderr).not.toMatch(/at Object\.|at JSDOM|at new/);
      },
      60_000,
    );
  });
});
