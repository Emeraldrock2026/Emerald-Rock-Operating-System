import { describe, expect, it } from "vitest";
import { contrastRatio, readableTextOn } from "./brand";

describe("tenant brand colour", () => {
  it("uses white text on dark brand colours", () => {
    expect(readableTextOn("#0F6B4F")).toBe("#FFFFFF");
    expect(readableTextOn("#1F4E79")).toBe("#FFFFFF");
  });
  it("uses dark text on light brand colours so contrast is preserved", () => {
    expect(readableTextOn("#F4D35E")).toBe("#1A1F1D");
  });
  it("the chosen text meets 4.5:1 contrast for typical brand colours", () => {
    for (const c of ["#0F6B4F", "#1F4E79", "#F4D35E", "#C0392B", "#7FDBCA"]) {
      expect(contrastRatio(c, readableTextOn(c))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
