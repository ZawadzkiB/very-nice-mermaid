import { describe, expect, it } from "vitest";
import { renderHtml } from "../src/export/html.js";
import { vnmRuntime } from "../src/render/dom/runtime.js";

const SAMPLE = [
  "flowchart LR",
  '  A["Start </script> & <x>"] --> B{Choice}',
  "  B -->|yes| C([Done])",
  "  B -->|no| D[(Store)]",
].join("\n");

describe("renderHtml: self-contained", () => {
  const html = renderHtml(SAMPLE, { theme: "dark", title: "My Diagram" });

  it("is a full HTML document with an inline runtime + payload", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>My Diagram</title>");
    expect(html).toContain("var vnmRuntime =");
    expect(html).toContain("var __vnm_payload =");
    expect(html).toContain("vnmRuntime(document.getElementById(\"vnm-root\")");
  });

  it("makes ZERO external requests", () => {
    // The SVG/XML namespace URIs are identifiers browsers never fetch — strip
    // them, then assert no *fetchable* http(s) URL remains anywhere.
    const withoutNs = html.replace(/https?:\/\/www\.w3\.org\/[^"' )]*/g, "");
    expect(withoutNs).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/src\s*=/i);
    expect(html).not.toMatch(/@import/i);
    // internal SVG fragment refs like url(#vnm-arrow) are fine; external ones are not
    expect(html).not.toMatch(/url\(\s*['"]?[^#'")]/i);
    // no external <script src>; only the inline module
    expect(html).not.toMatch(/<script[^>]+src=/i);
  });

  it("does not let user labels break out of the script tag", () => {
    // the literal </script> from the label must be escaped
    expect(html).not.toContain("</script> & <x>");
    expect(html).toContain("\\u003c/script>");
  });

  it("embeds a valid-JS runtime (reconstructable as a function)", () => {
    const src = vnmRuntime.toString();
    expect(() => new Function("return (" + src + ")")()).not.toThrow();
  });

  it("round-trips the embedded model", () => {
    const m = /var __vnm_payload = ([\s\S]*?);\nvnmRuntime/.exec(html);
    expect(m).not.toBeNull();
    const payload = JSON.parse(m![1]!);
    expect(payload.model.nodes.map((nd: { id: string }) => nd.id).sort()).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
    expect(payload.theme.name).toBe("dark");
    expect(payload.model.bounds.width).toBeGreaterThan(0);
  });
});
