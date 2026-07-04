import { afterEach, describe, expect, it } from "vitest";
import { needsHeadlessDom } from "../src/mermaid/router.js";

// REV-003: the headless jsdom must be installed on the *absence* of a usable
// DOM, not merely on being in Node — otherwise a hybrid runtime that already
// has a real DOM (Electron renderer, jsdom/happy-dom test env) gets its live
// DOM clobbered by our headless jsdom. This exercises the gate directly (no
// mermaid load, so globalThis stays under the test's control).
describe("headless-DOM gate — needsHeadlessDom (REV-003)", () => {
  const g = globalThis as { document?: unknown };
  const original = g.document;

  afterEach(() => {
    if (original === undefined) delete g.document;
    else g.document = original;
  });

  it("needs a headless DOM when no document exists (Node default)", () => {
    delete g.document;
    expect(needsHeadlessDom()).toBe(true);
  });

  it("does NOT clobber an existing real/host DOM (document.createElementNS present)", () => {
    g.document = { createElementNS: () => ({}) };
    expect(needsHeadlessDom()).toBe(false);
  });

  it("still needs one for a partial stub document lacking createElementNS", () => {
    g.document = {};
    expect(needsHeadlessDom()).toBe(true);
  });
});
