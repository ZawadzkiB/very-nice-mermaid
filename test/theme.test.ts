import { describe, expect, it } from "vitest";
import { themes, defineTheme, resolveTheme, themeCssVars } from "../src/theme/index.js";

describe("themes", () => {
  it("ships light, dark, and fancy built-ins", () => {
    expect(Object.keys(themes).sort()).toEqual(["dark", "fancy", "light"]);
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
    expect(resolveTheme(undefined)).toBe(themes.light);
    expect(resolveTheme(themes.fancy)).toBe(themes.fancy);
    const fromJson = resolveTheme({ colors: { accent: "#123456" } });
    expect(fromJson.tokens.colors.accent).toBe("#123456");
  });
});
