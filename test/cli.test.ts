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

  describe("fallback tier (mermaid.js)", () => {
    const PIE = 'pie title Pets\n "Dogs" : 386\n "Cats" : 85';
    const CLASS = "classDiagram\n Animal <|-- Dog";

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
      "--strict escalates a degraded fallback render to a non-zero exit",
      () => {
        const r = cli(["render", "-", "-f", "svg", "--strict"], CLASS);
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/render-degraded warn fallback/);
      },
      60_000,
    );

    it(
      "reports ASCII/Markdown as unavailable for a fallback type (FR4)",
      () => {
        const r = cli(["render", "-", "-f", "md"], PIE);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain("capability-unavailable");
        expect(r.stderr).toMatch(/capability=ascii/);
      },
      60_000,
    );
  });
});
