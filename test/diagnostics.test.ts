import { describe, expect, it } from "vitest";
import { Diagnostics, formatRenderDiagnostic } from "../src/diagnostics/index.js";

describe("Diagnostics channel (FR5)", () => {
  it("records a fallback-tier notice as info", () => {
    const d = new Diagnostics();
    const rec = d.fallbackTier("pie");
    expect(rec.code).toBe("fallback-tier");
    expect(rec.severity).toBe("info");
    expect(rec.tier).toBe("fallback");
    expect(rec.reason).toBe("pie");
    expect(d.all()).toHaveLength(1);
    // an info-only channel is not a "loss" (so --strict does not escalate it)
    expect(d.hasLoss()).toBe(false);
    expect(d.hasError()).toBe(false);
  });

  it("records a capability-unavailable as a warn-level loss", () => {
    const d = new Diagnostics();
    d.capabilityUnavailable("ascii", "fallback", "no ASCII for pie");
    const rec = d.all()[0]!;
    expect(rec.code).toBe("capability-unavailable");
    expect(rec.severity).toBe("warn");
    expect(rec.capability).toBe("ascii");
    expect(d.hasLoss()).toBe(true);
    expect(d.hasError()).toBe(false);
  });

  it("records a degradation as a warn-level loss with a reason", () => {
    const d = new Diagnostics();
    d.degraded("geometry", "class", "approximate under jsdom");
    const rec = d.all()[0]!;
    expect(rec.code).toBe("render-degraded");
    expect(rec.severity).toBe("warn");
    expect(rec.capability).toBe("geometry");
    expect(rec.reason).toBe("class");
    expect(d.hasLoss()).toBe(true);
  });

  it("records a hard failure as an error", () => {
    const d = new Diagnostics();
    d.failed("mindmap", "needs a browser");
    expect(d.all()[0]!.code).toBe("render-failed");
    expect(d.all()[0]!.severity).toBe("error");
    expect(d.hasError()).toBe(true);
    expect(d.hasLoss()).toBe(true);
  });

  it("preserves emission order across mixed diagnostics", () => {
    const d = new Diagnostics();
    d.fallbackTier("er");
    d.degraded("geometry", "er", "approx");
    expect(d.all().map((x) => x.code)).toEqual(["fallback-tier", "render-degraded"]);
  });

  it("formats a greppable `code severity tier [capability=…] message` line", () => {
    expect(
      formatRenderDiagnostic({
        code: "fallback-tier",
        severity: "info",
        tier: "fallback",
        message: "took fallback",
      }),
    ).toBe("fallback-tier info fallback took fallback");

    expect(
      formatRenderDiagnostic({
        code: "render-degraded",
        severity: "warn",
        tier: "fallback",
        capability: "geometry",
        message: "approx",
      }),
    ).toBe("render-degraded warn fallback capability=geometry approx");
  });
});
