import { describe, expect, it } from "vitest";
import { themes, defineTheme, resolveTheme, themeCssVars } from "../src/theme/index.js";

const DOMAIN_ROLES = [
  "frontend",
  "backend",
  "database",
  "cloud",
  "security",
  "messagebus",
  "external",
] as const;

describe("themes", () => {
  it("ships light, dark, fancy and the archify arch built-ins", () => {
    expect(Object.keys(themes).sort()).toEqual([
      "arch",
      "arch-light",
      "dark",
      "fancy",
      "light",
    ]);
    expect(themes.fancy!.edgeStyle).toBe("curved");
    expect(themes.light!.edgeStyle).toBe("elbow");
  });

  it("cssVars() emits --vnm-* properties", () => {
    const css = themes.dark!.cssVars();
    expect(css).toContain("--vnm-surface:");
    expect(css).toContain("--vnm-edge:");
    expect(css).toContain(themes.dark!.tokens.colors.surface);
  });

  it("themeCssVars matches the theme method", () => {
    expect(themeCssVars(themes.light!.tokens)).toBe(themes.light!.cssVars());
  });
});

describe("archify arch themes", () => {
  it("expose the archify look: slate canvas + monospace type", () => {
    expect(themes.arch!.tokens.colors.background).toBe("#020617");
    expect(themes.arch!.tokens.font.family).toContain("JetBrains Mono");
    expect(themes["arch-light"]!.tokens.colors.background).toBe("#f8fafc");
    expect(themes["arch-light"]!.tokens.font.family).toContain("JetBrains Mono");
  });

  it("ship all 7 semantic domain roles in both variants", () => {
    for (const name of ["arch", "arch-light"] as const) {
      const roles = themes[name]!.tokens.colors.roles;
      for (const role of DOMAIN_ROLES) {
        expect(roles[role], `${name}/${role}`).toMatchObject({
          fill: expect.any(String),
          stroke: expect.any(String),
          text: expect.any(String),
        });
      }
    }
  });

  it("use archify's jewel-tone strokes (dark) so a :::backend node reads emerald", () => {
    expect(themes.arch!.tokens.colors.roles.backend!.stroke).toBe("#34d399");
    expect(themes.arch!.tokens.colors.roles.database!.stroke).toBe("#a78bfa");
    expect(themes.arch!.tokens.colors.roles.security!.stroke).toBe("#fb7185");
  });
});

describe("domain-role vocabulary is universal", () => {
  it("resolves under every built-in theme, not just arch", () => {
    for (const name of Object.keys(themes)) {
      const roles = themes[name]!.tokens.colors.roles;
      for (const role of DOMAIN_ROLES) {
        expect(roles[role], `${name}/${role}`).toBeDefined();
      }
    }
  });
});

describe("defineTheme deep-merges over a base", () => {
  it("overrides only the given tokens", () => {
    const custom = defineTheme(
      { colors: { accent: "#ff0000" }, edge: { style: "curved" } },
      { base: "dark", name: "mine" },
    );
    expect(custom.name).toBe("mine");
    expect(custom.tokens.colors.accent).toBe("#ff0000");
    // untouched tokens are inherited from the dark base
    expect(custom.tokens.colors.surface).toBe(themes.dark!.tokens.colors.surface);
    // edgeStyle follows the merged edge.style
    expect(custom.edgeStyle).toBe("curved");
  });

  it("does not mutate the base theme", () => {
    const before = themes.light!.tokens.colors.accent;
    defineTheme({ colors: { accent: "#000000" } });
    expect(themes.light!.tokens.colors.accent).toBe(before);
  });
});

describe("resolveTheme", () => {
  it("resolves names, objects, and raw token partials", () => {
    expect(resolveTheme("dark")).toBe(themes.dark);
    // The default theme (no name given) is arch-light - the project's signature look.
    expect(resolveTheme(undefined)).toBe(themes["arch-light"]);
    expect(resolveTheme(themes.fancy)).toBe(themes.fancy);
    const fromJson = resolveTheme({ colors: { accent: "#123456" } });
    expect(fromJson.tokens.colors.accent).toBe("#123456");
  });
});
