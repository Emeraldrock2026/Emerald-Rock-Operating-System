import { describe, expect, it } from "vitest";
import { brandFor, brandingWarnings, contrastRatio, logoFileError, resolveAppearance, SURFACE } from "./brand";

describe("appearance", () => {
  it("personal choice overrides the business default", () => {
    expect(resolveAppearance("dark", "light", false)).toBe("dark");
    expect(resolveAppearance("light", "dark", true)).toBe("light");
  });
  it("falls back to the business default, then the device", () => {
    expect(resolveAppearance(null, "dark", false)).toBe("dark");
    expect(resolveAppearance(null, null, true)).toBe("dark");
    expect(resolveAppearance("system", "light", true)).toBe("dark");
  });
});

describe("brand colour per mode", () => {
  it("keeps a readable brand colour unchanged", () => {
    expect(brandFor("#2F8C6C", "light")).toBe("#2F8C6C");
  });
  it("lightens dark brand colours in dark mode and darkens pale ones in light mode", () => {
    expect(contrastRatio(brandFor("#0B2B22", "dark"), SURFACE.dark)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(brandFor("#F4D35E", "light"), SURFACE.light)).toBeGreaterThanOrEqual(3);
  });
  it("warns about low-contrast accents", () => {
    expect(brandingWarnings("#2F8C6C", "#0B2B22")).toEqual([]);
    expect(brandingWarnings("#2F8C6C", "#888888").length).toBe(1);
    expect(brandingWarnings("nope", "#000000")).toHaveLength(1);
  });
});

describe("logo uploads", () => {
  it("accepts PNG/JPG/WebP up to 2 MB", () => {
    expect(logoFileError({ type: "image/png", size: 1000 })).toBeNull();
    expect(logoFileError({ type: "image/svg+xml", size: 1000 })).not.toBeNull();
    expect(logoFileError({ type: "image/png", size: 3 * 1024 * 1024 })).not.toBeNull();
    expect(logoFileError({ type: "image/png", size: 10 }, { width: 20, height: 20 })).not.toBeNull();
  });
});
