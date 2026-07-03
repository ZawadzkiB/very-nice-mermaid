import { beforeAll, describe, expect, it } from "vitest";
import { spawnSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const cliPath = join(repo, "dist", "cli", "index.js");
const fixtures = join(repo, "fixtures");

interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

function cli(args: string[], input?: string): CliResult {
  const res = spawnSync("node", [cliPath, ...args], { input, encoding: "utf8", cwd: repo });
  return { status: res.status ?? -1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
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

  it("prints help and version", () => {
    expect(cli(["--version"]).stdout).toContain("0.1.0");
    expect(cli(["--help"]).stdout).toContain("render");
  });
});
