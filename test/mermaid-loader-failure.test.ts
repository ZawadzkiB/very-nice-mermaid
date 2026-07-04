import { describe, expect, it, vi } from "vitest";
import { classify } from "../src/mermaid/router.js";

// REV-004: simulate the D7 world where the mermaid load can fail (jsdom made
// optional, or an import error). classify must treat a loader failure like an
// undetectable input and still route to the native flowchart tier — the native
// (no-mermaid) path must never depend on mermaid being loadable. Mocking the
// module to throw on import makes loadMermaid() reject.
vi.mock("mermaid", () => {
  throw new Error("simulated mermaid load failure");
});

describe("router resilience to a mermaid loader failure (REV-004)", () => {
  it("routes a KNOWN non-flowchart input to native flowchart when mermaid fails to load", async () => {
    // Without the fix, the loadMermaid rejection escaped classify() and crashed
    // routing. Now it falls through to the flowchart parser like garbage does.
    const c = await classify("sequenceDiagram\n A->>B: hi");
    expect(c.tier).toBe("native");
    expect(c.renderer).toBe("flowchart");
    expect(c.detected).toBeNull();
  });

  it("still short-circuits an explicit flowchart header without touching the loader", async () => {
    const c = await classify("flowchart TD\n A-->B");
    expect(c.tier).toBe("native");
    expect(c.detected).toBe("flowchart");
  });
});
