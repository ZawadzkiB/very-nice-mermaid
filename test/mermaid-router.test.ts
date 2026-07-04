import { describe, expect, it } from "vitest";
import { classify } from "../src/mermaid/router.js";

// mermaid is imported lazily on the first non-flowchart classify; give it room.
const T = 30_000;

describe("detectType router — classify (FR1)", () => {
  it("routes an explicit flowchart header to the native tier without loading mermaid", async () => {
    const c = await classify("flowchart TD\n A-->B");
    expect(c.tier).toBe("native");
    expect(c.renderer).toBe("flowchart");
    expect(c.type).toBe("flowchart");
  });

  it("routes `graph` to the native flowchart tier", async () => {
    const c = await classify("graph LR\n A-->B");
    expect(c.tier).toBe("native");
    expect(c.renderer).toBe("flowchart");
  });

  it(
    "routes a KNOWN non-flowchart type to fallback (silent-misparse bug fixed)",
    async () => {
      // Before the fix, these were force-fed to the flowchart parser → garbage.
      const pie = await classify('pie title P\n "A" : 1');
      expect(pie.tier).toBe("fallback");
      expect(pie.renderer).toBe("mermaid");
      expect(pie.detected).toBe("pie");

      const gantt = await classify("gantt\n title G\n section S\n Task :a1, 2024-01-01, 3d");
      expect(gantt.tier).toBe("fallback");
      expect(gantt.detected).toBe("gantt");
    },
    T,
  );

  it(
    "routes sequence to the NATIVE re-skinned renderer (no fallback tier)",
    async () => {
      const c = await classify("sequenceDiagram\n Alice->>Bob: hi");
      expect(c.tier).toBe("native");
      expect(c.renderer).toBe("sequence");
      expect(c.detected).toBe("sequence");
      expect(c.nativePlanned).toBe(false);
    },
    T,
  );

  it(
    "routes class + state to the NATIVE re-skinned renderers (no fallback tier)",
    async () => {
      const cls = await classify("classDiagram\n A <|-- B");
      expect(cls.tier).toBe("native");
      expect(cls.renderer).toBe("class");
      expect(cls.detected).toBe("class");
      expect(cls.nativePlanned).toBe(false);

      const st = await classify("stateDiagram-v2\n [*] --> A");
      expect(st.tier).toBe("native");
      expect(st.renderer).toBe("state");
      expect(st.detected).toBe("stateDiagram");
      expect(st.nativePlanned).toBe(false);
    },
    T,
  );

  it(
    "routes journey and other long-tail types to fallback, not native-planned",
    async () => {
      const j = await classify("journey\n title My day\n section A\n Task: 5: Me");
      expect(j.tier).toBe("fallback");
      expect(j.detected).toBe("journey");
      expect(j.nativePlanned).toBe(false);
    },
    T,
  );

  it(
    "treats a header-less flow (`A-->B`) as native flowchart (detectType can't classify it)",
    async () => {
      const c = await classify("A-->B");
      expect(c.tier).toBe("native");
      expect(c.renderer).toBe("flowchart");
      expect(c.detected).toBeNull();
    },
    T,
  );

  it(
    "treats undetectable garbage as native (flowchart parser then zero-nodes it — D6)",
    async () => {
      const c = await classify("!!!! ### ???");
      expect(c.tier).toBe("native");
      expect(c.detected).toBeNull();
    },
    T,
  );
});
